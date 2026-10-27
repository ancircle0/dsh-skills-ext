/**
 * dsh-skills-ext — Host half.
 *
 * Registered as a plain Cordis plugin (`apply(ctx, config)`), not as a service
 * class: a plugin installed from npm can only import `node:*` builtins, because
 * the harness does not expose its own `@deepseek-ai/*` packages to third-party
 * plugins at runtime. The `skillsExt` service is therefore published through
 * `ctx.reflect.provide()`, and the Remote markers are written by hand — the same
 * two records the typert decorators produce (`typertRemote` on the instance and
 * a `remote-methods` descriptor on its prototype).
 *
 * Wire contract: a method returns the page snapshot itself, and a business
 * failure is thrown as an error carrying a stable `code`. The transport adds the
 * only envelope (`{ ok: true, value }` / `{ ok: false, error }`), so both sides
 * handle exactly one known shape.
 */

import {
  addPreset,
  ensureConfig,
  linkSkill,
  readState,
  removePreset,
  resolveLayout,
  unlinkSkill,
} from "./core.js";

/** Property key the typert decorators use for their method record. */
const REMOTE_METHODS_KEY = "@deepseek-ai/dsh-typert-protocol/remote-methods";

/** The public Remote methods, in declaration order. */
const REMOTE_METHODS = ["state", "addPreset", "removePreset", "link", "unlink"];

/**
 * A failure with a stable code, shaped like the harness' own RemoteError without
 * importing it: the Gateway discriminates by `code`, never by `instanceof`.
 */
class SkillsExtError extends Error {
  /**
   * @param {string} code - stable failure code.
   * @param {string} message - human diagnostic.
   */
  constructor(code, message) {
    super(message);
    this.name = "SkillsExtError";
    this.code = code;
    this.isDSHRemoteError = true;
  }
}

/**
 * Run one core call and hand back its value, turning every failure — the
 * envelope `lib/core.js` returns, or an unexpected throw — into a coded error.
 * @param {string} code - stable failure code for unexpected throws.
 * @param {() => { ok: true, value: unknown } | { ok: false, error: { code: string, message?: string } }} run - core call.
 * @returns {unknown} the payload.
 */
function guarded(code, run) {
  try {
    const result = run();
    if (result && result.ok === true) return result.value;
    const error = result && result.error ? result.error : { code, message: "unexpected result" };
    throw new SkillsExtError(error.code, error.message === undefined ? error.code : error.message);
  } catch (error) {
    if (error instanceof SkillsExtError) throw error;
    throw new SkillsExtError(code, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Make the harness re-read its skill catalog right away, on both sides.
 *
 * Host: the registry caches discovery per revision and recomputes only when a
 * provider invalidates it; the built-in directory watcher does that eventually,
 * but only after its debounce window — which is why a fresh link or unlink
 * otherwise waits for the next session. `invalidateCache()` is the same entry
 * point the watcher ends in (bump the revision, drop the collected catalog,
 * notify observers), so the next model step already sees the new list.
 *
 * Client: caches are separate. The shipped `/` skill picker keeps one list per
 * session and drops it only on `plugin-manager/changed`, a preset change or a
 * connection reset, so a link stays invisible there until the page reloads
 * without a nudge. That event means "configuration changed, refetch"; its other
 * consumer is the Plugins page, which simply reloads its own lists.
 *
 * Every step is guarded: a host without either entry point keeps the watcher's
 * own eventual refresh, and a missing event bus costs nothing.
 * @param {object} ctx - Cordis context.
 */
function refreshCatalog(ctx) {
  try {
    const skills = typeof ctx?.get === "function" ? ctx.get("skills") : undefined;
    if (skills && typeof skills.invalidateCache === "function") skills.invalidateCache();
    else if (ctx && typeof ctx.emit === "function") ctx.emit("skills/change");
  } catch {
    /* the watcher still fires; nothing else to do */
  }
  try {
    if (ctx && typeof ctx.emit === "function") {
      ctx.emit("plugin-manager/changed", { reason: "dsh-skills-ext: skill catalog changed" });
    }
  } catch {
    /* a host without that event keeps the current client cache */
  }
}

/**
 * The service surface the Remote namespace exposes.
 * @param {object} ctx - Cordis context, used to refresh the catalog.
 * @returns {object} the `skillsExt` service object.
 */
function createService(ctx) {
  return {
    /** The harness config root this plugin reads and writes. */
    layout() {
      return resolveLayout();
    },

    /**
     * Read presets, discovered skills, and their link state.
     * @returns {Promise<object>} the page snapshot.
     */
    async state() {
      return guarded("state-failed", () => readState());
    },

    /**
     * Append one preset path.
     * @param {{ path?: string }} request - preset directory.
     * @returns {Promise<object>} the refreshed page snapshot.
     */
    async addPreset(request) {
      return guarded("add-failed", () => addPreset({ path: request?.path }));
    },

    /**
     * Remove one preset path.
     * @param {{ path?: string }} request - preset directory.
     * @returns {Promise<object>} the refreshed page snapshot.
     */
    async removePreset(request) {
      return guarded("remove-failed", () => removePreset({ path: request?.path }));
    },

    /**
     * Link one discovered skill into the user skill root.
     * @param {{ name?: string, dir?: string }} request - skill name and directory.
     * @returns {Promise<object>} the refreshed page snapshot.
     */
    async link(request) {
      const snapshot = guarded("link-failed", () => linkSkill({ name: request?.name, dir: request?.dir }));
      refreshCatalog(ctx);
      return snapshot;
    },

    /**
     * Remove one skill's link from the user skill root.
     * @param {{ name?: string }} request - skill name.
     * @returns {Promise<object>} the refreshed page snapshot.
     */
    async unlink(request) {
      const snapshot = guarded("unlink-failed", () => unlinkSkill({ name: request?.name }));
      refreshCatalog(ctx);
      return snapshot;
    },
  };
}

/**
 * Publish the service under `skillsExt` and mark its Remote methods exactly the
 * way `TypertRemoteService` and `@Remote(...)` would.
 * @param {object} ctx - Cordis context.
 * @param {object} service - service instance.
 * @returns {() => void} disposer unregistering the service.
 */
function publish(ctx, service) {
  const markers = REMOTE_METHODS.map((method) =>
    Object.freeze({ method, invocation: Object.freeze({ kind: "direct" }) }),
  );
  Object.defineProperty(Object.getPrototypeOf(service), REMOTE_METHODS_KEY, {
    configurable: true,
    value: Object.freeze({ version: 1, methods: Object.freeze(markers) }),
  });
  // Visible binding consumed by the Gateway's source-mode discovery.
  Object.defineProperty(service, "typertRemote", {
    configurable: true,
    enumerable: true,
    value: Object.freeze({ service, serviceKey: "skillsExt", namespace: "skillsExt" }),
  });
  // `ctx.invocation` must read as undefined outside a Remote call.
  try {
    const root = ctx.root;
    const props = root && root.reflect ? root.reflect.props : undefined;
    if (props && !Object.hasOwn(props, "invocation")) {
      root.accessor("invocation", { get: () => undefined });
    }
  } catch {
    /* optional convenience only */
  }
  const reflector = ctx.reflect;
  if (reflector && typeof reflector.provide === "function") {
    return reflector.provide("skillsExt", service);
  }
  return ctx.provide("skillsExt", service);
}

/**
 * Cordis plugin entry.
 * @param {object} ctx - Cordis context.
 * @param {object} [config] - plugin config (unused).
 * @returns {void}
 */
export function apply(ctx, config) {
  const service = createService(ctx);
  ctx.effect(() => publish(ctx, service), "skills-ext: skillsExt service");
  // Create the plugin-private config directory up front; the page reads the
  // preset list from it, and a failure here is reported by `state`.
  try {
    ensureConfig();
  } catch {
    /* `state` reports the concrete failure to the page */
  }
}

export default apply;

