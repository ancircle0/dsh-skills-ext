/**
 * dsh-skills-ext — Typert Host manifest.
 *
 * Hand-written TYPERT manifest consumed by DSH's typert-loader from the
 * package's `./typert` export. It describes the `skillsExt` Remote service so
 * the browser Client can call
 * `ctx.remote.skillsExt.{state, addPreset, removePreset, link, unlink}`.
 *
 * Strict codecs must carry a `create()` factory. Request parameters are validated
 * with Zod when this Host can resolve it (pass-through otherwise); results are
 * declared permissive on purpose, because a method returns the page snapshot
 * and every rule already lives in `lib/core.js`, so a rejected call keeps its own
 * readable reason instead of being flattened into a wire validation error.
 */

let z = null;
try {
  ({ z } = await import("zod"));
} catch {
  z = null;
}

/** Pass-through schema: a result is handed back exactly as the method returned it. */
function passthroughSchema() {
  return {
    parse: (value) => value,
    safeParse: (value) => ({ success: true, data: value }),
  };
}

const pathRequestSchema = () => (z === null ? passthroughSchema() : z.object({ path: z.string() }));
const linkRequestSchema = () =>
  z === null ? passthroughSchema() : z.object({ name: z.string(), dir: z.string() });
const nameRequestSchema = () => (z === null ? passthroughSchema() : z.object({ name: z.string() }));

/**
 * Build a strict codec that satisfies both DSH codec generations.
 * @param {string} typeSymbol - wire type symbol.
 * @param {() => object} factory - memoized schema factory.
 * @returns {object}
 */
function strictCodec(typeSymbol, factory) {
  return {
    mode: "strict",
    typeSymbol,
    schema: factory(),
    create: factory,
  };
}

/** One descriptor per Remote method, resolved by namespace and method. */
const INVOCATIONS = [
  {
    id: "dsh-skills-ext#skillsExt/state",
    service: "skillsExt",
    namespace: "skillsExt",
    method: "state",
    invocation: { kind: "direct" },
    parameters: [],
    result: strictCodec("dsh-skills-ext#SkillsExtSnapshot", passthroughSchema),
  },
  {
    id: "dsh-skills-ext#skillsExt/addPreset",
    service: "skillsExt",
    namespace: "skillsExt",
    method: "addPreset",
    invocation: { kind: "direct" },
    parameters: [{ name: "request", wire: "request", source: "json", codec: strictCodec("dsh-skills-ext#SkillsExtPathRequest", pathRequestSchema) }],
    result: strictCodec("dsh-skills-ext#SkillsExtSnapshot", passthroughSchema),
  },
  {
    id: "dsh-skills-ext#skillsExt/removePreset",
    service: "skillsExt",
    namespace: "skillsExt",
    method: "removePreset",
    invocation: { kind: "direct" },
    parameters: [{ name: "request", wire: "request", source: "json", codec: strictCodec("dsh-skills-ext#SkillsExtPathRequest", pathRequestSchema) }],
    result: strictCodec("dsh-skills-ext#SkillsExtSnapshot", passthroughSchema),
  },
  {
    id: "dsh-skills-ext#skillsExt/link",
    service: "skillsExt",
    namespace: "skillsExt",
    method: "link",
    invocation: { kind: "direct" },
    parameters: [{ name: "request", wire: "request", source: "json", codec: strictCodec("dsh-skills-ext#SkillsExtLinkRequest", linkRequestSchema) }],
    result: strictCodec("dsh-skills-ext#SkillsExtSnapshot", passthroughSchema),
  },
  {
    id: "dsh-skills-ext#skillsExt/unlink",
    service: "skillsExt",
    namespace: "skillsExt",
    method: "unlink",
    invocation: { kind: "direct" },
    parameters: [{ name: "request", wire: "request", source: "json", codec: strictCodec("dsh-skills-ext#SkillsExtNameRequest", nameRequestSchema) }],
    result: strictCodec("dsh-skills-ext#SkillsExtSnapshot", passthroughSchema),
  },
];

export const TYPERT = {
  package: "dsh-skills-ext",
  face: "host",
  schemas: [],
  invocations: INVOCATIONS,
  model: {
    services: [
      {
        description:
          "Skills management service: maintain preset skill directories, discover the skills inside them, and link or unlink them into the user skill root as directory junctions.",
        summary: "Skills preset and link management service.",
        tags: [],
        jsDoc:
          "/**\n * Skills management service: preset paths, discovered skills, and link state.\n */",
        key: "skillsExt",
        exportName: "SkillsExtService",
        members: [
          {
            kind: "method",
            name: "state",
            signature: "async state(): Promise<SkillsExtSnapshot>",
            summary: "Read presets, discovered skills, and their link state.",
            jsDoc:
              "/**\n * Read presets, discovered skills, and their link state.\n * @returns the page state.\n */",
          },
          {
            kind: "method",
            name: "addPreset",
            signature: "async addPreset(request: SkillsExtPathRequest): Promise<SkillsExtSnapshot>",
            summary: "Append one preset skill directory.",
            jsDoc:
              "/**\n * Append one preset skill directory.\n * @param request - absolute preset directory.\n * @returns the refreshed page state.\n */",
          },
          {
            kind: "method",
            name: "removePreset",
            signature:
              "async removePreset(request: SkillsExtPathRequest): Promise<SkillsExtSnapshot>",
            summary: "Remove one preset skill directory.",
            jsDoc:
              "/**\n * Remove one preset skill directory.\n * @param request - absolute preset directory.\n * @returns the refreshed page state.\n */",
          },
          {
            kind: "method",
            name: "link",
            signature: "async link(request: SkillsExtLinkRequest): Promise<SkillsExtSnapshot>",
            summary: "Link one discovered skill into the user skill root.",
            jsDoc:
              "/**\n * Link one discovered skill into the user skill root as a junction.\n * @param request - skill name and directory.\n * @returns the refreshed page state.\n */",
          },
          {
            kind: "method",
            name: "unlink",
            signature: "async unlink(request: SkillsExtNameRequest): Promise<SkillsExtSnapshot>",
            summary: "Remove one skill junction from the user skill root.",
            jsDoc:
              "/**\n * Remove one skill junction from the user skill root.\n * @param request - skill name.\n * @returns the refreshed page state.\n */",
          },
        ],
        types: [
          {
            name: "SkillsExtPathRequest",
            declaration: "export interface SkillsExtPathRequest {\n    readonly path: string;\n}",
          },
          {
            name: "SkillsExtLinkRequest",
            declaration:
              "export interface SkillsExtLinkRequest {\n    readonly name: string;\n    readonly dir: string;\n}",
          },
          {
            name: "SkillsExtNameRequest",
            declaration: "export interface SkillsExtNameRequest {\n    readonly name: string;\n}",
          },
          {
            name: "SkillsExtSnapshot",
            declaration:
              "export interface SkillsExtSnapshot {\n    readonly skillsRoot: string;\n    readonly configDir: string;\n    readonly presetsFile: string;\n    readonly presets: ReadonlyArray<{ path: string; exists: boolean; skillCount: number; warning?: string }>;\n    readonly skills: ReadonlyArray<{ name: string; dir: string; presetPath: string; target: string; link: 'missing' | 'linked' | 'conflict' | 'occupied'; description: string }>;\n    readonly warnings: ReadonlyArray<string>;\n}",
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
};
