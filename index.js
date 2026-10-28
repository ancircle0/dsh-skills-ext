/**
 * dsh-skills-ext — Host entry.
 *
 * DSH's loader imports the package root and constructs the default export with
 * `(ctx, config)`; the exported service class is what publishes `skillsExt`.
 */

export { SkillsExtService } from "./lib/service.js";
export { default } from "./lib/service.js";
