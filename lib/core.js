/**
 * dsh-skills-ext — pure filesystem core.
 *
 * Owns three things and nothing else:
 *   1. the plugin-private config directory (`<dshHome>/skills-ext`) holding the
 *      preset path list;
 *   2. discovery of skills inside every preset directory (one level deep,
 *      `<preset>/<name>/SKILL.md`, matching the shipped filesystem provider);
 *   3. directory-junction link/unlink between a discovered skill and the user
 *      skill root (`<dshHome>/skills`), which the shipped provider scans.
 *
 * Every helper returns plain JSON so the same value can cross the Remote wire.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";

/** A skill directory name the shipped provider accepts (kebab-case). */
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Describe one failure with a stable code.
 * @param {string} code - stable failure code.
 * @param {string} message - human diagnostic.
 * @returns {{ ok: false, error: { code: string, message: string } }}
 */
function fail(code, message) {
  return { ok: false, error: { code, message } };
}

/**
 * Render an unknown error as text.
 * @param {unknown} error - caught value.
 * @returns {string}
 */
function textOf(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Resolve the harness config root.
 * @param {Record<string, string | undefined>} [env] - environment source.
 * @param {string} [home] - fallback home directory.
 * @returns {string} absolute, normalized `dshHome`.
 */
export function resolveDshHome(env = process.env, home = homedir()) {
  const configured = typeof env.DSH_HOME === "string" ? env.DSH_HOME.trim() : "";
  if (configured !== "") return normalize(resolve(configured));
  return join(home, ".dsh");
}

/**
 * The three paths this plugin works with.
 * @param {Record<string, string | undefined>} [env] - environment source.
 * @param {string} [home] - fallback home directory.
 * @returns {{ dshHome: string, skillsRoot: string, configDir: string, presetsFile: string }}
 */
export function resolveLayout(env = process.env, home = homedir()) {
  const dshHome = resolveDshHome(env, home);
  const configDir = join(dshHome, "skills-ext");
  return {
    dshHome,
    skillsRoot: join(dshHome, "skills"),
    configDir,
    presetsFile: join(configDir, "presets.json"),
  };
}

/**
 * Trim a user-entered path: drop quotes and trailing separators.
 * @param {unknown} value - raw input.
 * @returns {string} the trimmed path, or "" when unusable.
 */
export function cleanPath(value) {
  if (typeof value !== "string") return "";
  let path = value.trim();
  if (path.length >= 2) {
    const quoted =
      (path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'"));
    if (quoted) path = path.slice(1, -1).trim();
  }
  while (path.length > 3 && (path.endsWith(sep) || path.endsWith("/"))) path = path.slice(0, -1);
  return path;
}

/**
 * Compare two paths the way the running platform's filesystem does: separator
 * folding and case-insensitivity apply only where the platform has them (a
 * backslash is an ordinary character in a POSIX file name).
 * @param {string} left - first path.
 * @param {string} right - second path.
 * @returns {boolean}
 */
function samePath(left, right) {
  const windows = sep === "\\";
  const normalizeOne = (value) => {
    let path = String(value ?? "");
    if (path.startsWith("\\\\?\\")) path = path.slice(4);
    const unified = windows
      ? path.replace(/[\\/]+/g, "\\")
      : path.replace(/\\/g, "/").replace(/\/+/g, "/");
    const trimmed = unified.replace(windows ? /\\$/ : /\/$/, "");
    const comparable = trimmed === "" ? unified : trimmed;
    return windows ? comparable.toLowerCase() : comparable;
  };
  return normalizeOne(left) === normalizeOne(right);
}

/**
 * Read one path's directory metadata without throwing.
 * @param {string} path - absolute path.
 * @returns {import('node:fs').Stats | undefined}
 */
function statOf(path) {
  try {
    return statSync(path);
  } catch {
    return undefined;
  }
}

/**
 * Read one path's link metadata without throwing.
 * @param {string} path - absolute path.
 * @returns {import('node:fs').Stats | undefined}
 */
function lstatOf(path) {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

/**
 * Parse the YAML frontmatter of a SKILL.md as flat string fields.
 * @param {string} text - file body.
 * @returns {Record<string, string>} frontmatter fields.
 */
export function parseFrontmatter(text) {
  const body = String(text ?? "").replace(/^\uFEFF/, "");
  const lines = body.split(/\r?\n/);
  if (lines.length === 0 || !/^---\s*$/.test(lines[0] ?? "")) return {};
  const fields = {};
  let key = null;
  let buffer = [];
  const flush = () => {
    if (key === null) return;
    fields[key] = unquote(buffer.join(" ").trim());
    key = null;
    buffer = [];
  };
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^---\s*$/.test(line)) break;
    const match = /^([A-Za-z0-9_-]+)\s*:(.*)$/.exec(line);
    if (match && !/^\s/.test(line)) {
      flush();
      key = match[1];
      buffer = [match[2]];
      continue;
    }
    if (key !== null && /^\s/.test(line)) buffer.push(line.trim());
  }
  flush();
  return fields;
}

/**
 * Strip one layer of matching quotes.
 * @param {string} value - raw scalar.
 * @returns {string}
 */
function unquote(value) {
  let scalar = String(value ?? "").trim();
  if (scalar.length >= 2) {
    const quoted =
      (scalar.startsWith('"') && scalar.endsWith('"')) ||
      (scalar.startsWith("'") && scalar.endsWith("'"));
    if (quoted) scalar = scalar.slice(1, -1);
  }
  return scalar;
}

/**
 * Read the preset list from the plugin config directory.
 * @param {string} presetsFile - absolute path of `presets.json`.
 * @returns {{ presets: string[], warning?: string }}
 */
export function readPresets(presetsFile) {
  if (!existsSync(presetsFile)) return { presets: [] };
  try {
    const parsed = JSON.parse(readFileSync(presetsFile, "utf8"));
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.presets) ? parsed.presets : [];
    const presets = [];
    const seen = new Set();
    for (const item of list) {
      const value = cleanPath(typeof item === "string" ? item : item?.path);
      if (value === "") continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      presets.push(value);
    }
    return { presets };
  } catch (error) {
    return { presets: [], warning: `预设文件无法解析：${textOf(error)}` };
  }
}

/**
 * Persist the preset list; the directory is created on demand.
 * @param {string} presetsFile - absolute path of `presets.json`.
 * @param {readonly string[]} presets - preset paths in display order.
 * @returns {{ ok: true } | { ok: false, error: { code: string, message: string } }}
 */
export function writePresets(presetsFile, presets) {
  try {
    mkdirSync(dirname(presetsFile), { recursive: true });
    const payload = { version: 1, presets: [...presets] };
    writeFileSync(presetsFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return { ok: true };
  } catch (error) {
    return fail("presets-write-failed", textOf(error));
  }
}

/**
 * Create the plugin config directory and a default `presets.json`.
 * @param {{ env?: Record<string, string | undefined>, home?: string }} [options] - overrides for tests.
 * @returns {{ ok: true, value: { configDir: string, presetsFile: string } } | { ok: false, error: { code: string, message: string } }}
 */
export function ensureConfig(options = {}) {
  const layout = resolveLayout(options.env, options.home);
  try {
    mkdirSync(layout.configDir, { recursive: true });
    if (!existsSync(layout.presetsFile)) writePresets(layout.presetsFile, []);
  } catch (error) {
    return fail("config-init-failed", textOf(error));
  }
  return { ok: true, value: { configDir: layout.configDir, presetsFile: layout.presetsFile } };
}

/**
 * Discover the skills of one preset directory (one level deep).
 * @param {string} presetPath - absolute preset directory.
 * @returns {{ exists: boolean, skills: Array<{ name: string, folder: string, description: string, dir: string, warning?: string }>, warning?: string }}
 */
export function listPresetSkills(presetPath) {
  const info = statOf(presetPath);
  if (info === undefined) return { exists: false, skills: [] };
  if (!info.isDirectory()) return { exists: false, skills: [], warning: "预设路径不是目录" };
  let entries;
  try {
    entries = readdirSync(presetPath, { withFileTypes: true });
  } catch (error) {
    return { exists: true, skills: [], warning: `目录无法读取：${textOf(error)}` };
  }
  const skills = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const dir = join(presetPath, entry.name);
    const stat = statOf(dir);
    if (stat === undefined || !stat.isDirectory()) continue;
    const skillFile = join(dir, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    let meta = {};
    let warning;
    try {
      meta = parseFrontmatter(readFileSync(skillFile, "utf8"));
    } catch (error) {
      warning = `SKILL.md 无法读取：${textOf(error)}`;
    }
    const declared = typeof meta.name === "string" ? meta.name.trim() : "";
    const declaredOk = KEBAB.test(declared);
    const folderOk = KEBAB.test(entry.name);
    const name = declaredOk ? declared : entry.name;
    skills.push({
      name,
      folder: entry.name,
      description: typeof meta.description === "string" ? meta.description.trim() : "",
      dir,
      ...(declaredOk || folderOk ? {} : { warning: "技能名不是 kebab-case，无法映射到技能目录" }),
      ...(warning === undefined ? {} : { warning }),
    });
  }
  skills.sort((left, right) => left.name.localeCompare(right.name));
  return { exists: true, skills };
}

/**
 * Describe how one skill currently relates to the user skill root.
 * @param {string} skillsRoot - absolute user skill root.
 * @param {string} name - skill name, used as the link name.
 * @param {string} dir - the discovered skill directory.
 * @returns {{ link: 'missing' | 'linked' | 'conflict' | 'occupied', target: string, actual?: string }}
 */
export function inspectLink(skillsRoot, name, dir) {
  const target = join(skillsRoot, name);
  const info = lstatOf(target);
  if (info === undefined) return { link: "missing", target };
  if (!info.isSymbolicLink()) return { link: "occupied", target };
  let actual;
  try {
    actual = readlinkSync(target);
  } catch {
    actual = undefined;
  }
  let resolvedTarget;
  let resolvedSource;
  try {
    resolvedTarget = realpathSync(target);
  } catch {
    resolvedTarget = undefined;
  }
  try {
    resolvedSource = realpathSync(dir);
  } catch {
    resolvedSource = undefined;
  }
  if (resolvedTarget !== undefined && resolvedSource !== undefined) {
    if (samePath(resolvedTarget, resolvedSource)) return { link: "linked", target };
  } else if (actual !== undefined && samePath(actual, dir)) {
    return { link: "linked", target };
  }
  return { link: "conflict", target, ...(actual === undefined ? {} : { actual }) };
}

/**
 * Read the whole page state: presets, discovered skills and link states.
 * @param {{ env?: Record<string, string | undefined>, home?: string }} [options] - overrides for tests.
 * @returns {{ ok: true, value: object } | { ok: false, error: { code: string, message: string } }}
 */
export function readState(options = {}) {
  const layout = resolveLayout(options.env, options.home);
  const stored = readPresets(layout.presetsFile);
  const presets = [];
  const skills = [];
  const warnings = [];
  if (stored.warning !== undefined) warnings.push(stored.warning);
  for (const presetPath of stored.presets) {
    const discovered = listPresetSkills(presetPath);
    presets.push({
      path: presetPath,
      exists: discovered.exists,
      skillCount: discovered.skills.length,
      ...(discovered.warning === undefined ? {} : { warning: discovered.warning }),
    });
    if (discovered.warning !== undefined) warnings.push(`${presetPath}: ${discovered.warning}`);
    for (const skill of discovered.skills) {
      if (skill.warning !== undefined) warnings.push(`${skill.dir}: ${skill.warning}`);
      const inspected = inspectLink(layout.skillsRoot, skill.name, skill.dir);
      skills.push({
        name: skill.name,
        folder: skill.folder,
        description: skill.description,
        dir: skill.dir,
        presetPath,
        target: inspected.target,
        link: inspected.link,
        ...(inspected.actual === undefined ? {} : { actual: inspected.actual }),
        ...(skill.warning === undefined ? {} : { warning: skill.warning }),
      });
    }
  }
  const counts = new Map();
  for (const skill of skills) counts.set(skill.name, (counts.get(skill.name) ?? 0) + 1);
  for (const skill of skills) {
    if ((counts.get(skill.name) ?? 0) > 1) skill.duplicate = true;
  }
  return {
    ok: true,
    value: {
      skillsRoot: layout.skillsRoot,
      configDir: layout.configDir,
      presetsFile: layout.presetsFile,
      presets,
      skills,
      warnings,
    },
  };
}

/**
 * Add one preset path to the plugin config file.
 * @param {{ path?: unknown, env?: Record<string, string | undefined>, home?: string }} request - add request.
 * @returns {{ ok: true, value: object } | { ok: false, error: { code: string, message: string } }}
 */
export function addPreset(request) {
  const layout = resolveLayout(request?.env, request?.home);
  const path = cleanPath(request?.path);
  if (path === "") return fail("path-empty", "请输入预设路径");
  if (!isAbsolute(path)) return fail("path-not-absolute", "预设路径必须是绝对路径");
  const stored = readPresets(layout.presetsFile);
  if (stored.presets.some((item) => samePath(item, path))) {
    return fail("path-duplicate", "该预设路径已存在");
  }
  const next = [...stored.presets, path];
  const written = writePresets(layout.presetsFile, next);
  if (!written.ok) return written;
  return readState({ env: request?.env, home: request?.home });
}

/**
 * Remove one preset path from the plugin config file.
 * @param {{ path?: unknown, env?: Record<string, string | undefined>, home?: string }} request - remove request.
 * @returns {{ ok: true, value: object } | { ok: false, error: { code: string, message: string } }}
 */
export function removePreset(request) {
  const layout = resolveLayout(request?.env, request?.home);
  const path = cleanPath(request?.path);
  if (path === "") return fail("path-empty", "缺少要删除的预设路径");
  const stored = readPresets(layout.presetsFile);
  const next = stored.presets.filter((item) => !samePath(item, path));
  if (next.length === stored.presets.length) return fail("path-missing", "该预设路径不在列表中");
  const written = writePresets(layout.presetsFile, next);
  if (!written.ok) return written;
  return readState({ env: request?.env, home: request?.home });
}

/**
 * The link flavour this platform needs: a directory junction on Windows (no
 * administrator rights, never a real directory), a directory symlink elsewhere.
 * @returns {'junction' | 'dir'}
 */
function linkType() {
  return process.platform === "win32" ? "junction" : "dir";
}

/**
 * Create the link `<skillsRoot>/<name>` → the discovered skill directory.
 * @param {{ name?: unknown, dir?: unknown, env?: Record<string, string | undefined>, home?: string }} request - link request.
 * @returns {{ ok: true, value: object } | { ok: false, error: { code: string, message: string } }}
 */
export function linkSkill(request) {
  const layout = resolveLayout(request?.env, request?.home);
  const name = cleanPath(request?.name);
  const dir = cleanPath(request?.dir);
  if (!KEBAB.test(name)) return fail("invalid-name", `技能名不合法：${name === "" ? "(空)" : name}`);
  if (dir === "" || !isAbsolute(dir)) return fail("invalid-dir", "技能目录必须是绝对路径");
  const source = statOf(dir);
  if (source === undefined || !source.isDirectory()) return fail("source-missing", "技能目录不存在");
  if (!existsSync(join(dir, "SKILL.md"))) return fail("source-missing", "技能目录缺少 SKILL.md");
  const inspected = inspectLink(layout.skillsRoot, name, dir);
  if (inspected.link === "linked") return readState({ env: request?.env, home: request?.home });
  if (inspected.link === "occupied") {
    return fail("target-occupied", `技能目录中已存在同名真实目录：${inspected.target}`);
  }
  if (inspected.link === "conflict") {
    return fail("target-conflict", `技能目录中已有同名链接指向其他位置：${inspected.actual ?? inspected.target}`);
  }
  let sourcePath = dir;
  try {
    sourcePath = realpathSync(dir);
  } catch {
    sourcePath = dir;
  }
  try {
    mkdirSync(layout.skillsRoot, { recursive: true });
    symlinkSync(sourcePath, inspected.target, linkType());
  } catch (error) {
    return fail("link-failed", textOf(error));
  }
  return readState({ env: request?.env, home: request?.home });
}

/**
 * Remove the junction `<skillsRoot>/<name>` without touching the source.
 * @param {{ name?: unknown, env?: Record<string, string | undefined>, home?: string }} request - unlink request.
 * @returns {{ ok: true, value: object } | { ok: false, error: { code: string, message: string } }}
 */
export function unlinkSkill(request) {
  const layout = resolveLayout(request?.env, request?.home);
  const name = cleanPath(request?.name);
  if (!KEBAB.test(name)) return fail("invalid-name", `技能名不合法：${name === "" ? "(空)" : name}`);
  const target = join(layout.skillsRoot, name);
  const info = lstatOf(target);
  if (info === undefined) return readState({ env: request?.env, home: request?.home });
  if (!info.isSymbolicLink()) return fail("target-not-link", "目标不是链接（可能是真实目录），已跳过");
  try {
    rmSync(target, { recursive: false, force: false });
  } catch {
    try {
      rmdirSync(target);
    } catch (error) {
      return fail("unlink-failed", textOf(error));
    }
  }
  return readState({ env: request?.env, home: request?.home });
}
