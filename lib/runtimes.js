/**
 * dsh-skills-ext — the runtimes DSH unpacked under its own home.
 *
 * After installation the harness keeps an unpacked payload in
 * `<dshHome>/dsh-runtimes/<payload>/` with a `runtime.json` and a `dependencies/`
 * tree, so the installation directory never has to be inspected: `$DSH_HOME` alone
 * tells us where node, python and pnpm live.
 *
 * Stored commands stay **portable names** (`node` / `python` / `pnpm`); the name is
 * expanded to the bundled executable only when a server is mounted, so a config
 * moved to another device keeps working. A missing payload just leaves names alone
 * and the UI keeps the free-text command field.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { delimiter, join, relative, sep } from "node:path";
import { resolveDshHome } from "./core.js";

/** Directory under `$DSH_HOME` that holds unpacked runtime payloads. */
const RUNTIME_ROOT = "dsh-runtimes";

/** Command names that resolve to a bundled runtime. */
export const RUNTIME_NAMES = ["node", "python", "pnpm"];

/** True for an existing directory. */
function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** First candidate that exists, or undefined. */
function firstExisting(base, candidates) {
  for (const candidate of candidates) {
    const path = join(base, candidate);
    if (existsSync(path)) return path;
  }
  return undefined;
}

/** Find the payload directory to use (a name containing `primary` wins). */
function findPayload(options = {}) {
  const root = join(resolveDshHome(options.env, options.home), RUNTIME_ROOT);
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return undefined;
  }
  const payloads = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(
      (name) => existsSync(join(root, name, "runtime.json")) && isDirectory(join(root, name, "dependencies")),
    )
    .sort((left, right) => {
      const leftPrimary = left.toLowerCase().includes("primary") ? 1 : 0;
      const rightPrimary = right.toLowerCase().includes("primary") ? 1 : 0;
      return rightPrimary - leftPrimary;
    });
  if (payloads.length === 0) return undefined;

  const dir = join(root, payloads[0]);
  let versions = {};
  try {
    const parsed = JSON.parse(readFileSync(join(dir, "runtime.json"), "utf8"));
    const pick = (value) => (typeof value === "string" ? value : "");
    versions = { node: pick(parsed.node), python: pick(parsed.python), pnpm: pick(parsed.pnpm) };
  } catch {
    versions = {};
  }
  return { dir, base: join(dir, "dependencies"), versions };
}

/**
 * Absolute paths of the bundled executables, plus the directories worth putting on
 * a child process's `PATH`.
 * @param {{ env?: Record<string, string | undefined>, home?: string }} [options] - overrides for tests.
 * @returns {{ node?: string, python?: string, pnpm?: string, pathDirs: string[] } | undefined}
 */
export function resolveRuntimeExecutables(options = {}) {
  const payload = findPayload(options);
  if (payload === undefined) return undefined;
  const { base } = payload;
  const node = firstExisting(base, [join("node", "bin", "node.exe"), join("node", "bin", "node")]);
  const python = firstExisting(base, [
    join("python", "python.exe"),
    join("python", "bin", "python3"),
    join("python", "bin", "python"),
  ]);
  const pnpm = firstExisting(base, [join("pnpm", "bin", "pnpm.cjs")]);
  const pathDirs = [
    join(base, "node", "bin"),
    join(base, "pnpm", "bin"),
    join(base, "python"),
    join(base, "python", "Scripts"),
  ].filter((dir) => isDirectory(dir));
  return { node, python, pnpm, pathDirs, versions: payload.versions };
}

/**
 * The runtimes offered as command presets. `id` is what gets stored, so the list is
 * portable: it never leaks this machine's paths into `mcp.json`.
 * @param {{ env?: Record<string, string | undefined>, home?: string }} [options] - overrides for tests.
 * @returns {Array<{ id: string, label: string, version: string, target: string }>}
 */
export function resolveDshRuntimes(options = {}) {
  const bundled = resolveRuntimeExecutables(options);
  if (bundled === undefined) return [];
  const versions = bundled.versions ?? {};
  const dshHome = resolveDshHome(options.env, options.home);
  /** Show a path relative to `$DSH_HOME`, so nothing looks hardcoded to one device. */
  const token = (absolute) => {
    const rel = relative(dshHome, absolute).split(sep).join("/");
    return rel === "" ? "$DSH_HOME" : `$DSH_HOME/${rel}`;
  };
  const runtimes = [];
  if (bundled.node !== undefined) {
    runtimes.push({
      id: "node",
      label: "Node",
      version: versions.node ?? "",
      target: bundled.node,
      targetToken: token(bundled.node),
    });
  }
  if (bundled.python !== undefined) {
    runtimes.push({
      id: "python",
      label: "Python",
      version: versions.python ?? "",
      target: bundled.python,
      targetToken: token(bundled.python),
    });
  }
  // pnpm ships as a script, so only offer it when node can run it.
  if (bundled.pnpm !== undefined && bundled.node !== undefined) {
    runtimes.push({
      id: "pnpm",
      label: "PNPM",
      version: versions.pnpm ?? "",
      target: `${bundled.node} ${bundled.pnpm}`,
      targetToken: `${token(bundled.node)} ${token(bundled.pnpm)}`,
    });
  }
  return runtimes;
}

/**
 * Expand a portable runtime name into the bundled executable at mount time.
 * Anything that is not one of the known names (an absolute path, `npx`, …) is
 * returned untouched.
 * @param {string} command - stored command.
 * @param {string[]} [args] - stored arguments.
 * @param {{ env?: Record<string, string | undefined>, home?: string, executables?: object }} [options] - overrides for tests.
 * @returns {{ command: string, args: string[] }}
 */
export function expandCommand(command, args = [], options = {}) {
  const name = String(command ?? "").trim();
  const bundled = options.executables ?? resolveRuntimeExecutables(options);
  const rest = Array.isArray(args) ? args : [];
  if (bundled === undefined) return { command: name, args: rest };
  if (name === "node" && bundled.node !== undefined) return { command: bundled.node, args: rest };
  if (name === "python" && bundled.python !== undefined) return { command: bundled.python, args: rest };
  if (name === "pnpm" && bundled.pnpm !== undefined && bundled.node !== undefined) {
    return { command: bundled.node, args: [bundled.pnpm, ...rest] };
  }
  return { command: name, args: rest };
}

/**
 * `PATH` entries that let a child process resolve `node`, `npm`, `npx`, `pnpm` and
 * `python` to the bundled payload instead of whatever the host happens to have.
 * @param {{ env?: Record<string, string | undefined>, home?: string }} [options] - overrides for tests.
 * @returns {string[]}
 */
export function runtimePathDirs(options = {}) {
  const bundled = resolveRuntimeExecutables(options);
  return bundled === undefined ? [] : bundled.pathDirs;
}

/**
 * Compose the `PATH` a mounted server should inherit.
 * @param {string[]} dirs - bundled directories to prepend.
 * @param {string} parentPath - current `PATH`.
 * @returns {string} the composed value.
 */
export function composePath(dirs, parentPath) {
  const clean = dirs.filter((dir) => typeof dir === "string" && dir !== "");
  if (clean.length === 0) return parentPath;
  return parentPath === "" ? clean.join(delimiter) : [...clean, parentPath].join(delimiter);
}
