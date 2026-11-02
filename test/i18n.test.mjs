/**
 * Guard the client dictionaries.
 *
 * Three invariants, all of which broke at least once while building the MCP tab:
 *  1. ZH and EN define exactly the same keys.
 *  2. Every Host error code has a dictionary entry, so a failure never surfaces as
 *     a bare code or as the Host's own (single-language) message.
 *  3. No Chinese lives outside the ZH block — user-visible strings must be keys.
 *
 * Run: node test/i18n.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const client = readFileSync(join(root, "client.js"), "utf8");

let failures = 0;
/**
 * Assert one condition and print its result.
 * @param {string} label - what is being checked.
 * @param {boolean} condition - expected truthiness.
 * @param {unknown} [detail] - printed on failure.
 */
function check(label, condition, detail) {
  if (condition) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${label}`);
  if (detail !== undefined) console.log("     ", JSON.stringify(detail));
}

/** Slice one dictionary literal out of the client source. */
function dictBlock(start, end) {
  const from = client.indexOf(start);
  const to = end === undefined ? client.length : client.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`dictionary markers not found: ${start}`);
  return client.slice(from, to);
}

const zhBlock = dictBlock("const ZH = {", "const EN = {");
const enBlock = dictBlock("const EN = {", "// ---- styles");
const keyOf = (block) => new Set([...block.matchAll(/"([A-Za-z0-9_.-]+)":/g)].map((match) => match[1]));
const zh = keyOf(zhBlock);
const en = keyOf(enBlock);

check("dictionaries are non-empty", zh.size > 50 && en.size > 50, { zh: zh.size, en: en.size });
check(
  "same key count in both locales",
  zh.size === en.size,
  { zh: zh.size, en: en.size },
);
const missingInEn = [...zh].filter((key) => !en.has(key));
const missingInZh = [...en].filter((key) => !zh.has(key));
check("every ZH key exists in EN", missingInEn.length === 0, missingInEn);
check("every EN key exists in ZH", missingInZh.length === 0, missingInZh);

// Every Host error code must be named by the client dictionary.
const libSources = ["lib/core.js", "lib/mcp.js", "lib/mcp-runtime.js", "lib/service.js"].map((file) =>
  readFileSync(join(root, file), "utf8"),
);
const codes = new Set();
for (const source of libSources) {
  for (const match of source.matchAll(/(?:fail|RemoteError|guarded)\("([a-z0-9-]+)"/g)) codes.add(match[1]);
}
check("host error codes found", codes.size > 20, codes.size);
const unnamed = [...codes].filter((code) => !zh.has(`errors.${code}`) || !en.has(`errors.${code}`));
check("every host error code is localized", unnamed.length === 0, unnamed);

// No Chinese outside the ZH block (comments excluded: they may quote a UI label).
const cjk = /[\u4e00-\u9fff]/;
const zhStart = client.indexOf("const ZH = {");
const zhEnd = client.indexOf("const EN = {");
const strays = [];
client.split("\n").forEach((line, index) => {
  const offset = client.split("\n").slice(0, index).join("\n").length;
  if (offset >= zhStart && offset < zhEnd) return;
  if (!cjk.test(line)) return;
  const trimmed = line.trim();
  if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return;
  strays.push(`${index + 1}: ${trimmed}`);
});
check("no user-facing Chinese outside the ZH block", strays.length === 0, strays.slice(0, 5));

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
