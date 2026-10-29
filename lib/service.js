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
import {
  addPreset,
  ensureConfig,
  linkSkill,
  readState,
  removePreset,
  resolveLayout,
  setScanDepth as storeScanDepth,
  unlinkSkill,
} from "./core.js";

/** The public Remote methods, in declaration order. */
const REMOTE_METHODS = ["state", "addPreset", "removePreset", "link", "unlink", "setScanDepth"];

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
}

export default SkillsExtService;
