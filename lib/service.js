/**
 * dsh-skills-ext — Host service.
 *
 * The DSH loader treats an exported service class as a plugin: it constructs it
 * with `(ctx, config)` and calls `[Service.init]()`. `TypertRemoteService`
 * publishes the `skillsExt` service and the Typert manifest (`typert.host.js`)
 * exposes its methods to the browser Client under the `skillsExt` Remote
 * namespace, so the Plugins/Settings page and the Host share one implementation.
 *
 * Wire contract: a method returns the page snapshot itself, and a business
 * failure is thrown as a `RemoteError`. The transport adds the only envelope
 * (`{ ok: true, value }` / `{ ok: false, error }`), so both sides handle exactly
 * one known shape instead of guessing how many layers wrapped it.
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
  unlinkSkill,
} from "./core.js";

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
 * Run one core call and hand back its value, turning every failure — the
 * envelope `lib/core.js` returns, or an unexpected throw — into a RemoteError.
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
    markRemoteMethod(this, "state", "state");
    markRemoteMethod(this, "addPreset", "addPreset");
    markRemoteMethod(this, "removePreset", "removePreset");
    markRemoteMethod(this, "link", "link");
    markRemoteMethod(this, "unlink", "unlink");
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
   * Link one discovered skill into the user skill root as a directory junction.
   * @param {{ name?: string, dir?: string }} request - skill name and directory.
   * @returns {Promise<object>} the refreshed page snapshot.
   */
  async link(request) {
    return guarded("link-failed", () => linkSkill({ name: request?.name, dir: request?.dir }));
  }

  /**
   * Remove one skill's junction from the user skill root.
   * @param {{ name?: string }} request - skill name.
   * @returns {Promise<object>} the refreshed page snapshot.
   */
  async unlink(request) {
    return guarded("unlink-failed", () => unlinkSkill({ name: request?.name }));
  }
}

export default SkillsExtService;
