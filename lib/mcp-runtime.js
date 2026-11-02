/**
 * dsh-skills-ext — MCP runtime: mounts one `@deepseek-ai/dsh-mcp-client` plugin per
 * configured server on this plugin's own context.
 *
 * Why not profile composition rows: a `cordis:include` subtree never gets a fiber
 * at runtime (probed), while `ctx.plugin()` inside our own scope mounts in about a
 * second and registers `mcp__<serverName>__<tool>`, and disposing the fiber removes
 * those tools again. The list therefore stays in our own JSON, and this module is
 * the only thing that talks to the client plugin.
 */

import { buildClientConfig, serverToolPrefix } from "./mcp.js";

/** The client bridge this plugin drives. */
export const MCP_CLIENT_PACKAGE = "@deepseek-ai/dsh-mcp-client";

/** Fiber states that matter to the list (cordis FiberState enum). */
const FIBER_ACTIVE = 2;
const FIBER_FAILED = 3;
const FIBER_DISPOSED = 4;

/**
 * @param {unknown} error - thrown value.
 * @returns {string} short message.
 */
function textOf(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Create the runtime bound to one service instance.
 * @param {object} ctx - the plugin context that owns the mounted children.
 * @returns {{
 *   sync: (servers: readonly object[]) => Promise<void>,
 *   unmount: (id: string) => Promise<void>,
 *   restart: (server: object) => Promise<void>,
 *   status: (id: string) => { phase: string, toolCount: number, error?: string },
 *   toolCount: (serverName: string) => number,
 *   available: () => boolean,
 *   dispose: () => Promise<void>,
 * }}
 */
export function createMcpRuntime(ctx) {
  /** @type {Map<string, { fiber: any, server: object, error?: string }>} */
  const mounted = new Map();
  /** @type {Promise<any> | null} */
  let pluginPromise = null;
  /** @type {Error | null} */
  let pluginError = null;

  /** Resolve the client plugin once; a failure is remembered, not retried per call. */
  const loadPlugin = async () => {
    if (pluginError !== null) throw pluginError;
    if (pluginPromise === null) {
      pluginPromise = import(MCP_CLIENT_PACKAGE)
        .then((module) => module.default ?? module)
        .catch((error) => {
          pluginError = error instanceof Error ? error : new Error(textOf(error));
          throw pluginError;
        });
    }
    return pluginPromise;
  };

  /** How many tools the server currently owns. */
  const toolCount = (serverName) => {
    const tools = typeof ctx.get === "function" ? ctx.get("tools") : undefined;
    if (!tools || typeof tools.schemas !== "function") return 0;
    const prefix = serverToolPrefix(serverName);
    try {
      return tools.schemas().filter((schema) => String(schema.name).startsWith(prefix)).length;
    } catch {
      return 0;
    }
  };

  /** Mount one server unless it is already mounted. */
  const mount = async (server) => {
    if (mounted.has(server.id)) return mounted.get(server.id);
    try {
      const plugin = await loadPlugin();
      const fiber = ctx.plugin(plugin, buildClientConfig(server));
      const record = { fiber, server };
      mounted.set(server.id, record);
      return record;
    } catch (error) {
      const record = { fiber: null, server, error: textOf(error) };
      mounted.set(server.id, record);
      return record;
    }
  };

  /** Drop one mounted server, removing its tools. */
  const unmount = async (id) => {
    const record = mounted.get(id);
    if (record === undefined) return;
    mounted.delete(id);
    const fiber = record.fiber;
    if (fiber && typeof fiber.dispose === "function") {
      try {
        await fiber.dispose();
      } catch {
        /* the child is gone either way */
      }
    }
  };

  /** Reconcile the mounted set with the desired list: add, drop, restart changed. */
  const sync = async (servers) => {
    const desired = servers.filter((server) => server.enabled !== false);
    for (const [id, record] of [...mounted]) {
      const target = desired.find((server) => server.id === id);
      if (target === undefined) {
        await unmount(id);
        continue;
      }
      const before = JSON.stringify(buildClientConfig(record.server));
      const after = JSON.stringify(buildClientConfig(target));
      if (before !== after) await unmount(id);
    }
    for (const server of desired) await mount(server);
  };

  /** Restart one server with its current configuration. */
  const restart = async (server) => {
    await unmount(server.id);
    await mount(server);
  };

  /** Current status of one server. */
  const status = (id) => {
    const record = mounted.get(id);
    if (record === undefined) return { phase: "stopped", toolCount: 0 };
    const count = toolCount(record.server.serverName);
    if (record.error !== undefined) return { phase: "failed", toolCount: count, error: record.error };
    const state = record.fiber === null ? undefined : record.fiber.state;
    if (state === undefined) return { phase: "pending", toolCount: count };
    if (state === FIBER_DISPOSED) return { phase: "stopped", toolCount: count };
    if (state === FIBER_FAILED) {
      let detail;
      try {
        const failure = record.fiber === null ? undefined : record.fiber.error;
        detail = failure instanceof Error ? failure.message : undefined;
      } catch {
        detail = undefined;
      }
      return detail === undefined
        ? { phase: "failed", toolCount: count }
        : { phase: "failed", toolCount: count, error: detail };
    }
    return { phase: state === FIBER_ACTIVE ? "active" : "pending", toolCount: count };
  };

  return {
    sync,
    unmount,
    restart,
    status,
    toolCount,
    available: () => pluginError === null,
    dispose: async () => {
      for (const id of [...mounted.keys()]) await unmount(id);
    },
  };
}
