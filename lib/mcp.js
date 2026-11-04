/**
 * dsh-skills-ext — MCP server list: file format, validation and import parsing.
 *
 * This module is pure: it never touches the Cordis context. The list lives in the
 * plugin's own directory (`<dshHome>/skills-ext/mcp.json`) so that nothing here
 * writes the profile composition; `lib/mcp-runtime.js` turns each entry into a
 * mounted `@deepseek-ai/dsh-mcp-client` plugin.
 *
 * Accepted on-disk shape (also what the manual JSON editor shows):
 *
 * ```json
 * { "version": 1, "servers": [ { "id": "github", "serverName": "github", "transport": "stdio", ... } ] }
 * ```
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { composePath } from "./runtimes.js";

/** Server names become the tool prefix, so they must satisfy the client's contract. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
/** Transports the MCP client understands. */
export const MCP_TRANSPORTS = ["stdio", "streamable-http"];
/** Current on-disk format version. */
export const MCP_FILE_VERSION = 1;

const EMPTY = { version: MCP_FILE_VERSION, servers: [] };

/**
 * Build one failure result.
 * @param {string} code - stable failure code.
 * @param {string} message - human readable detail.
 * @returns {{ ok: false, error: { code: string, message: string } }}
 */
function fail(code, message) {
  return { ok: false, error: { code, message } };
}

/** Read a JSON file, returning undefined when it is absent or unreadable. */
function readJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Turn a server name into a stable, filesystem-free identifier.
 * @param {string} name - server name.
 * @returns {string} kebab-ish id, never empty.
 */
export function serverId(name) {
  const slug = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "server" : slug;
}

/**
 * Normalise one parsed document into the stored shape.
 *
 * Accepts the stored object, a bare array of servers, and the `mcpServers` map used
 * by other agent clients so pasted configurations import unchanged.
 * @param {unknown} parsed - parsed JSON value.
 * @returns {{ version: number, servers: object[] }}
 */
export function normalizeDocument(parsed) {
  const rawList = Array.isArray(parsed)
    ? parsed
    : parsed !== null && typeof parsed === "object"
      ? Array.isArray(parsed.servers)
        ? parsed.servers
        : parsed.mcpServers !== null && typeof parsed.mcpServers === "object"
          ? Object.entries(parsed.mcpServers).map(([name, spec]) => ({
              ...(spec !== null && typeof spec === "object" ? spec : {}),
              serverName:
                spec !== null && typeof spec === "object" && typeof spec.serverName === "string"
                  ? spec.serverName
                  : name,
            }))
          : []
      : [];
  const servers = [];
  for (const raw of rawList) {
    const normalised = normalizeServer(raw, { servers });
    if (normalised.ok) servers.push(normalised.value);
  }
  return { version: MCP_FILE_VERSION, servers };
}

/**
 * Read the server list; a missing or broken file yields an empty list.
 * @param {string} file - absolute path of `mcp.json`.
 * @returns {{ version: number, servers: object[] }}
 */
export function readMcpConfig(file) {
  if (!existsSync(file)) return { ...EMPTY, servers: [] };
  const parsed = readJsonFile(file);
  if (parsed === undefined) return { ...EMPTY, servers: [] };
  return normalizeDocument(parsed);
}

/**
 * Persist the server list atomically (write beside the target, then rename).
 * @param {string} file - absolute path of `mcp.json`.
 * @param {readonly object[]} servers - normalised servers.
 * @returns {{ ok: true, value: { file: string, text: string } } | { ok: false, error: { code: string, message: string } }}
 */
export function writeMcpConfig(file, servers) {
  const text = `${JSON.stringify({ version: MCP_FILE_VERSION, servers }, null, 2)}\n`;
  const temporary = `${file}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, file);
    return { ok: true, value: { file, text } };
  } catch (error) {
    try {
      rmSync(temporary, { force: true });
    } catch {
      /* the rename never happened; nothing else to undo */
    }
    return fail("mcp-write-failed", error instanceof Error ? error.message : String(error));
  }
}

/** True when the value is a plain object whose every value is a string. */
function isStringRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

/**
 * Validate and fill defaults for one server entry.
 * @param {unknown} raw - candidate entry (any shape).
 * @param {{ servers?: readonly object[], ignoreId?: string }} [options] - uniqueness context.
 * @returns {{ ok: true, value: object } | { ok: false, error: { code: string, message: string } }}
 */
export function normalizeServer(raw, options = {}) {
  const source = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const serverName = typeof source.serverName === "string" ? source.serverName.trim() : "";
  if (!SERVER_NAME_PATTERN.test(serverName)) {
    return fail("mcp-invalid-name", `serverName 必须匹配 [A-Za-z0-9_-]{1,32}（当前为 "${serverName}"）`);
  }
  const others = (options.servers ?? []).filter((entry) => entry.id !== options.ignoreId);
  if (others.some((entry) => entry.serverName === serverName)) {
    return fail("mcp-duplicate-name", `serverName "${serverName}" 已被其他条目使用`);
  }

  const declaredTransport = typeof source.transport === "string" ? source.transport.trim() : "";
  // Pasted `mcpServers` entries usually omit `transport`; infer it from the fields
  // that are present so imported configurations work unchanged.
  const transport =
    declaredTransport !== ""
      ? declaredTransport
      : typeof source.command === "string" && source.command.trim() !== ""
        ? "stdio"
        : typeof source.url === "string" && source.url.trim() !== ""
          ? "streamable-http"
          : "";
  if (!MCP_TRANSPORTS.includes(transport)) {
    return fail("mcp-invalid-transport", `transport 必须是 ${MCP_TRANSPORTS.join(" 或 ")}`);
  }

  /** @type {Record<string, unknown>} */
  const value = {
    id: typeof source.id === "string" && source.id.trim() !== "" ? source.id.trim() : serverId(serverName),
    serverName,
    transport,
    enabled: source.enabled === false ? false : true,
  };
  if (typeof source.note === "string" && source.note.trim() !== "") value.note = source.note.trim();

  if (transport === "stdio") {
    const command = typeof source.command === "string" ? source.command.trim() : "";
    if (command === "") return fail("mcp-missing-command", "stdio 传输必须提供 command");
    value.command = command;
    const args = Array.isArray(source.args) ? source.args.filter((entry) => typeof entry === "string") : [];
    value.args = args;
    if (source.env !== undefined) {
      if (!isStringRecord(source.env)) return fail("mcp-invalid-env", "env 必须是字符串键值对象");
      value.env = { ...source.env };
    }
    if (typeof source.cwd === "string" && source.cwd.trim() !== "") value.cwd = source.cwd.trim();
  } else {
    const url = typeof source.url === "string" ? source.url.trim() : "";
    if (!/^https?:\/\//i.test(url)) return fail("mcp-invalid-url", "streamable-http 传输必须提供 http(s) URL");
    value.url = url;
    if (source.headers !== undefined) {
      if (!isStringRecord(source.headers)) return fail("mcp-invalid-headers", "headers 必须是字符串键值对象");
      value.headers = { ...source.headers };
    }
  }

  if (source.toolCallTimeoutMs !== undefined) {
    const timeout = Number(source.toolCallTimeoutMs);
    if (!Number.isFinite(timeout) || timeout <= 0) return fail("mcp-invalid-timeout", "toolCallTimeoutMs 必须是正数");
    value.toolCallTimeoutMs = Math.round(timeout);
  }
  if (source.maxInstructionBytes !== undefined) {
    const bytes = Number(source.maxInstructionBytes);
    if (!Number.isFinite(bytes) || bytes < 1) return fail("mcp-invalid-instructions", "maxInstructionBytes 必须是正整数");
    value.maxInstructionBytes = Math.round(bytes);
  }
  if (typeof source.failOnStartupError === "boolean") value.failOnStartupError = source.failOnStartupError;
  if (source.reconnect !== null && typeof source.reconnect === "object" && !Array.isArray(source.reconnect)) {
    const source_ = source.reconnect;
    /** @type {Record<string, unknown>} */
    const reconnect = {};
    if (typeof source_.enabled === "boolean") reconnect.enabled = source_.enabled;
    for (const key of ["initialDelayMs", "maxDelayMs", "maxAttempts"]) {
      if (source_[key] === undefined) continue;
      const numeric = Number(source_[key]);
      if (!Number.isFinite(numeric) || numeric < 1) return fail("mcp-invalid-reconnect", `reconnect.${key} 必须是正数`);
      reconnect[key] = Math.round(numeric);
    }
    if (Object.keys(reconnect).length > 0) value.reconnect = reconnect;
  }

  const used = new Set(others.map((entry) => entry.id));
  let id = /** @type {string} */ (value.id);
  let suffix = 2;
  while (used.has(id)) {
    id = `${value.id}-${suffix}`;
    suffix += 1;
  }
  value.id = id;
  return { ok: true, value };
}

/**
 * The configuration object handed to the MCP client plugin: only its own fields.
 * @param {object} server - normalised server.
 * @returns {Record<string, unknown>} client config.
 */
export function buildClientConfig(server, options = {}) {
  /** @type {Record<string, unknown>} */
  const config = { transport: server.transport, serverName: server.serverName };
  if (server.transport === "stdio") {
    // Stored commands are portable names (`node`, `pnpm`, …); the caller expands them
    // to the bundled executables so a list copied to another device keeps working.
    const stored = { command: server.command, args: server.args ?? [] };
    const resolved =
      typeof options.expandCommand === "function" ? options.expandCommand(stored.command, stored.args) : stored;
    config.command = resolved.command;
    config.args = resolved.args;
    const env = { ...(server.env ?? {}) };
    if (Array.isArray(options.pathDirs) && options.pathDirs.length > 0) {
      // Bare names (and npx) inside the server itself should hit the bundled payload.
      env.PATH = composePath(options.pathDirs, String(options.parentPath ?? ""));
    }
    if (Object.keys(env).length > 0) config.env = env;
    if (server.cwd !== undefined) config.cwd = server.cwd;
  } else {
    config.url = server.url;
    if (server.headers !== undefined) config.headers = server.headers;
  }
  for (const key of ["toolCallTimeoutMs", "maxInstructionBytes", "failOnStartupError", "reconnect"]) {
    if (server[key] !== undefined) config[key] = server[key];
  }
  return config;
}

/**
 * The tool-name prefix a server owns (`mcp__<serverName>__`).
 * @param {string} serverName - server name.
 * @returns {string} prefix.
 */
export function serverToolPrefix(serverName) {
  return `mcp__${serverName}__`;
}

/**
 * A short, human readable endpoint description for the list UI.
 * @param {object} server - normalised server.
 * @returns {string} command line or URL.
 */
export function describeServer(server) {
  if (server.transport === "stdio") {
    const args = Array.isArray(server.args) ? server.args : [];
    return [server.command, ...args].join(" ");
  }
  return String(server.url ?? "");
}

/**
 * Parse text pasted into the manual editor and normalise every entry.
 * @param {string} text - raw JSON text.
 * @param {{ servers?: readonly object[] }} [options] - uniqueness context.
 * @returns {{ ok: true, value: { servers: object[] } } | { ok: false, error: { code: string, message: string } }}
 */
export function parseImportText(text, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? ""));
  } catch (error) {
    return fail("mcp-invalid-json", `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
  const rawList = Array.isArray(parsed)
    ? parsed
    : parsed !== null && typeof parsed === "object"
      ? Array.isArray(parsed.servers)
        ? parsed.servers
        : parsed.mcpServers !== null && typeof parsed.mcpServers === "object"
          ? Object.entries(parsed.mcpServers).map(([name, spec]) => ({
              ...(spec !== null && typeof spec === "object" ? spec : {}),
              serverName:
                spec !== null && typeof spec === "object" && typeof spec.serverName === "string"
                  ? spec.serverName
                  : name,
            }))
          : null
      : null;
  if (rawList === null) return fail("mcp-invalid-shape", "需要 servers 数组、服务器数组，或 mcpServers 对象");

  const servers = [];
  for (const raw of rawList) {
    const normalised = normalizeServer(raw, { servers: [...(options.servers ?? []), ...servers] });
    if (!normalised.ok) return normalised;
    servers.push(normalised.value);
  }
  return { ok: true, value: { servers } };
}

/**
 * Append one server, rejecting a duplicate name.
 * @param {readonly object[]} servers - current list.
 * @param {unknown} raw - candidate server.
 * @returns {{ ok: true, value: { servers: object[], server: object } } | { ok: false, error: { code: string, message: string } }}
 */
export function insertServer(servers, raw) {
  const normalised = normalizeServer(raw, { servers });
  if (!normalised.ok) return normalised;
  return { ok: true, value: { servers: [...servers, normalised.value], server: normalised.value } };
}

/**
 * Replace one server in place.
 * @param {readonly object[]} servers - current list.
 * @param {string} id - target server id.
 * @param {unknown} raw - replacement fields.
 * @returns {{ ok: true, value: { servers: object[], server: object } } | { ok: false, error: { code: string, message: string } }}
 */
export function replaceServer(servers, id, raw) {
  const index = servers.findIndex((entry) => entry.id === id);
  if (index < 0) return fail("mcp-missing", `找不到服务器 "${id}"`);
  const normalised = normalizeServer({ ...raw, id }, { servers, ignoreId: id });
  if (!normalised.ok) return normalised;
  const next = [...servers];
  next[index] = normalised.value;
  return { ok: true, value: { servers: next, server: normalised.value } };
}

/**
 * Remove one server.
 * @param {readonly object[]} servers - current list.
 * @param {string} id - target server id.
 * @returns {{ ok: true, value: { servers: object[], server: object } } | { ok: false, error: { code: string, message: string } }}
 */
export function removeServer(servers, id) {
  const index = servers.findIndex((entry) => entry.id === id);
  if (index < 0) return fail("mcp-missing", `找不到服务器 "${id}"`);
  const next = servers.filter((_, at) => at !== index);
  return { ok: true, value: { servers: next, server: servers[index] } };
}
