/**
 * dsh-skills-ext — Host entry.
 *
 * Re-exports the Cordis class plugin. DSH's loader imports the package root and
 * instantiates the default export with `(ctx, config)`.
 */

export { SkillsExtService } from "./lib/service.js";
export { default } from "./lib/service.js";
