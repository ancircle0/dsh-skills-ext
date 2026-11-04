/**
 * dsh-skills-ext — Host service.
 *
 * The DSH loader treats an exported service class as a plugin: it constructs it
 * with `(ctx, config)` and calls `[Service.init]()`. `TypertRemoteService`
 * publishes the `skillsExt` service, and the `@Remote` markers written in
 * `[Service.init]()` expose its methods to the browser Client under the
 * `skillsExt` Remote namespace — the same shape every shipped plugin uses, so no
 * hand-written manifest is involved.
 *
 * Wire contract: a method returns the page snapshot itself, and a business
 * failure is thrown as a `RemoteError` carrying a stable `code`.
 */

import { Service } from "@deepseek-ai/cordis";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { existsSync, readFileSync } from "node:fs";
import {
  addPreset,
  ensureConfig,
  linkPresetSkills,
  linkSkill,
  readState,
  removePreset,
  resolveLayout,
  setScanDepth as storeScanDepth,
  unlinkPresetSkills,
  unlinkSkill,
} from "./core.js";
import { createMcpRuntime } from "./mcp-runtime.js";
import { resolveDshRuntimes } from "./runtimes.js";
import {
  describeServer,
  insertServer,
  parseImportText,
  readMcpConfig,
  removeServer,
  replaceServer,
  writeMcpConfig,
} from "./mcp.js";

/** The public Remote methods, in declaration order. */
const REMOTE_METHODS = [
  "state",
  "addPreset",
  "removePreset",
  "link",
  "unlink",
  "linkPreset",
  "unlinkPreset",
  "setScanDepth",
  "mcpState",
  "mcpCreate",
  "mcpUpdate",
  "mcpRemove",
  "mcpToggle",
  "mcpRestart",
  "mcpRaw",
  "mcpSaveRaw",
];

/**
 * Mark one instance method as a Remote export without decorator syntax.
 * Node ESM does not accept the decorator proposal, so drive the same
 * `Remote(name)` decorator manually through a synthetic decorator context.
 * @param {object} instance - live service instance.
 * @param {string} method - public instance method name.
 * @param {string} [exportName] - wire export name; defaults to the method name.
 */
function markRemoteMethod(instance, method, exportName) {
  const decorator = Remote(method, undefined);
  const initializers = [];
  decorator(undefined, {
    kind: "method",
    name: method,
    static: false,
    private: false,
    addInitializer: (fn) => initializers.push(fn),
  });
  for (const fn of initializers) fn.call(instance);
}

/**
 * Run one core call and hand back its value, turning the envelope `lib/core.js`
 * returns — or an unexpected throw — into a `RemoteError`.
 * @param {string} code - stable failure code for unexpected throws.
 * @param {() => { ok: true, value: unknown } | { ok: false, error: { code: string, message?: string } }} run - core call.
 * @returns {unknown} the payload.
 */
function guarded(code, run) {
  try {
    const result = run();
    if (result && result.ok === true) return result.value;
    const error = result && result.error ? result.error : { code, message: "unexpected result" };
    throw new RemoteError(error.code, error.message === undefined ? error.code : error.message);
  } catch (error) {
    if (error instanceof RemoteError) throw error;
    throw new RemoteError(code, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Make the harness re-read its skill catalog right away, on both sides.
 *
 * Host: the registry caches discovery per revision, and `invalidateCache()` is the
 * entry point the directory watcher ends in (bump the revision, drop the collected
 * catalog, notify observers), so the next model step already sees the change
 * instead of waiting for the watcher's debounce.
 *
 * Client: the shipped `/` picker keeps one cached list per session and drops it
 * only on `plugin-manager/changed`, so that event is forwarded as well.
 * @param {object} ctx - Cordis context.
 */
function refreshCatalog(ctx) {
  try {
    const skills = typeof ctx.get === "function" ? ctx.get("skills") : undefined;
    if (skills && typeof skills.invalidateCache === "function") skills.invalidateCache();
    else if (typeof ctx.emit === "function") ctx.emit("skills/change");
  } catch {
    /* the watcher still fires; nothing else to do */
  }
  try {
    if (typeof ctx.emit === "function") {
      ctx.emit("plugin-manager/changed", { reason: "dsh-skills-ext: skill catalog changed" });
    }
  } catch {
    /* a host without that event keeps the current client cache */
  }
}

export class SkillsExtService extends TypertRemoteService {
  /**
   * @param {object} ctx - Cordis context.
   * @param {object} config - plugin config (unused).
   */
  constructor(ctx, config) {
    super(ctx, "skillsExt");
    /** Mounts one MCP client plugin per configured server on this context. */
    this.mcp = createMcpRuntime(ctx);
  }

  /** Cordis class-plugin initializer: mark the Remote methods before publication. */
  [Service.init]() {
    for (const method of REMOTE_METHODS) markRemoteMethod(this, method, method);
    // Create the plugin-private config directory up front; the page reads the
    // preset list from it, and a failure here is reported by `state`.
    try {
      ensureConfig();
    } catch {
      /* `state` reports the concrete failure to the page */
    }
    // Mount the configured MCP servers in the background: their tools appear about
    // a second later, and a server that fails to start keeps its row with a status.
    void this.syncMcpServers().catch(() => {});
    if (typeof this.ctx.effect === "function") {
      this.ctx.effect(() => () => void this.mcp.dispose(), "skills-ext: mcp servers");
    }
  }

  /** The harness config root this plugin reads and writes. */
  layout() {
    return resolveLayout();
  }

  /**
   * Read presets, discovered skills, and their link state.
   * @returns {Promise<object>} the page snapshot.
   */
  async state() {
    return guarded("state-failed", () => readState());
  }

  /**
   * Append one preset path.
   * @param {{ path?: string }} request - preset directory.
   * @returns {Promise<object>} the refreshed page snapshot.
   */
  async addPreset(request) {
    return guarded("add-failed", () => addPreset({ path: request?.path }));
  }

  /**
   * Remove one preset path.
   * @param {{ path?: string }} request - preset directory.
   * @returns {Promise<object>} the refreshed page snapshot.
   */
  async removePreset(request) {
    return guarded("remove-failed", () => removePreset({ path: request?.path }));
  }

  /**
   * Link every skill discovered under one preset path.
   * @param {{ path?: string }} request - preset directory.
   * @returns {Promise<object>} the refreshed page snapshot plus a `summary`.
   */
  async linkPreset(request) {
    const snapshot = guarded("link-failed", () => linkPresetSkills({ path: request?.path }));
    refreshCatalog(this.ctx);
    return snapshot;
  }

  /**
   * Remove the links of every skill discovered under one preset path.
   * @param {{ path?: string }} request - preset directory.
   * @returns {Promise<object>} the refreshed page snapshot plus a `summary`.
   */
  async unlinkPreset(request) {
    const snapshot = guarded("unlink-failed", () => unlinkPresetSkills({ path: request?.path }));
    refreshCatalog(this.ctx);
    return snapshot;
  }

  /**
   * Persist the scan depth used for preset discovery.
   * @param {{ depth?: number }} request - depth, clamped to 1–10.
   * @returns {Promise<{ scanDepth: number }>} the setting actually stored.
   */
  async setScanDepth(request) {
    return guarded("settings-failed", () => storeScanDepth({ depth: request?.depth }));
  }

  /**
   * Link one discovered skill into the user skill root.
   * @param {{ name?: string, dir?: string }} request - skill name and directory.
   * @returns {Promise<object>} the refreshed page snapshot.
   */
  async link(request) {
    const snapshot = guarded("link-failed", () =>
      linkSkill({ name: request?.name, dir: request?.dir }),
    );
    refreshCatalog(this.ctx);
    return snapshot;
  }

  /**
   * Remove one skill's link from the user skill root.
   * @param {{ name?: string }} request - skill name.
   * @returns {Promise<object>} the refreshed page snapshot.
   */
  async unlink(request) {
    const snapshot = guarded("unlink-failed", () => unlinkSkill({ name: request?.name }));
    refreshCatalog(this.ctx);
    return snapshot;
  }

  // ---- MCP servers ---------------------------------------------------------

  /**
   * Read the stored server list together with each server's live status.
   * @returns {{ layout: object, config: { version: number, servers: object[] } }}
   */
  readMcpServers() {
    const layout = resolveLayout();
    return { layout, config: readMcpConfig(layout.mcpFile) };
  }

  /** Build the MCP portion of the page snapshot. */
  mcpSnapshot() {
    const { layout, config } = this.readMcpServers();
    return {
      file: layout.mcpFile,
      available: this.mcp.available(),
      // The runtimes DSH unpacked under its own home, offered as command presets.
      runtimes: resolveDshRuntimes(),
      servers: config.servers.map((server) => ({
        ...server,
        endpoint: describeServer(server),
        status: this.mcp.status(server.id),
        tools: this.mcp.toolsOf(server.serverName),
      })),
    };
  }

  /** Reconcile the mounted servers with whatever is stored. */
  async syncMcpServers() {
    const { config } = this.readMcpServers();
    await this.mcp.sync(config.servers);
  }

  /** Persist one list, reconcile the mounts, and answer with the fresh snapshot. */
  async applyMcpServers(layout, servers) {
    const written = writeMcpConfig(layout.mcpFile, servers);
    if (!written.ok) throw new RemoteError(written.error.code, written.error.message);
    await this.mcp.sync(servers);
    return this.mcpSnapshot();
  }

  /**
   * Read the server list and statuses.
   * @returns {Promise<object>} `{ file, available, servers }`.
   */
  async mcpState() {
    return guarded("mcp-state-failed", () => ({ ok: true, value: this.mcpSnapshot() }));
  }

  /**
   * Read the raw JSON text, for the manual editor.
   * @returns {Promise<{ file: string, text: string }>} file path and current text.
   */
  async mcpRaw() {
    return guarded("mcp-state-failed", () => {
      const { layout } = this.readMcpServers();
      const text = existsSync(layout.mcpFile)
        ? readFileSync(layout.mcpFile, "utf8")
        : `${JSON.stringify({ version: 1, servers: [] }, null, 2)}\n`;
      return { ok: true, value: { file: layout.mcpFile, text } };
    });
  }

  /**
   * Add one server and mount it immediately.
   * @param {{ server?: object }} request - the candidate server.
   * @returns {Promise<object>} the refreshed MCP snapshot.
   */
  async mcpCreate(request) {
    const { layout, config } = this.readMcpServers();
    const inserted = insertServer(config.servers, request?.server);
    if (!inserted.ok) throw new RemoteError(inserted.error.code, inserted.error.message);
    return this.applyMcpServers(layout, inserted.value.servers);
  }

  /**
   * Replace one server and remount it.
   * @param {{ id?: string, server?: object }} request - target id and new fields.
   * @returns {Promise<object>} the refreshed MCP snapshot.
   */
  async mcpUpdate(request) {
    const { layout, config } = this.readMcpServers();
    const replaced = replaceServer(config.servers, String(request?.id ?? ""), request?.server);
    if (!replaced.ok) throw new RemoteError(replaced.error.code, replaced.error.message);
    return this.applyMcpServers(layout, replaced.value.servers);
  }

  /**
   * Remove one server and unmount it.
   * @param {{ id?: string }} request - target id.
   * @returns {Promise<object>} the refreshed MCP snapshot.
   */
  async mcpRemove(request) {
    const { layout, config } = this.readMcpServers();
    const removed = removeServer(config.servers, String(request?.id ?? ""));
    if (!removed.ok) throw new RemoteError(removed.error.code, removed.error.message);
    return this.applyMcpServers(layout, removed.value.servers);
  }

  /**
   * Enable or disable one server.
   * @param {{ id?: string, enabled?: boolean }} request - target id and desired state.
   * @returns {Promise<object>} the refreshed MCP snapshot.
   */
  async mcpToggle(request) {
    const { layout, config } = this.readMcpServers();
    const id = String(request?.id ?? "");
    const target = config.servers.find((server) => server.id === id);
    if (target === undefined) throw new RemoteError("mcp-missing", `找不到服务器 "${id}"`);
    const replaced = replaceServer(config.servers, id, { ...target, enabled: request?.enabled === true });
    if (!replaced.ok) throw new RemoteError(replaced.error.code, replaced.error.message);
    return this.applyMcpServers(layout, replaced.value.servers);
  }

  /**
   * Remount one server without touching its stored configuration.
   * @param {{ id?: string }} request - target id.
   * @returns {Promise<object>} the refreshed MCP snapshot.
   */
  async mcpRestart(request) {
    const { config } = this.readMcpServers();
    const id = String(request?.id ?? "");
    const target = config.servers.find((server) => server.id === id);
    if (target === undefined) throw new RemoteError("mcp-missing", `找不到服务器 "${id}"`);
    if (target.enabled !== false) await this.mcp.restart(target);
    return this.mcpSnapshot();
  }

  /**
   * Replace the whole list from the manual JSON editor and reconcile mounts.
   * @param {{ text?: string }} request - pasted JSON text.
   * @returns {Promise<object>} the refreshed MCP snapshot.
   */
  async mcpSaveRaw(request) {
    const { layout } = this.readMcpServers();
    const parsed = parseImportText(request?.text, { servers: [] });
    if (!parsed.ok) throw new RemoteError(parsed.error.code, parsed.error.message);
    return this.applyMcpServers(layout, parsed.value.servers);
  }
}

export default SkillsExtService;
