/**
 * dsh-skills-ext — Host entry.
 *
 * DSH's loader imports the package root and calls the default export with
 * `(ctx, config)`. Nothing here imports a harness package: the plugin must load
 * from an npm installation, where only `node:*` builtins resolve.
 */

export { apply, default } from "./lib/service.js";
