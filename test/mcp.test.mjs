/**
 * Tests for the pure MCP list modules (`lib/mcp.js`).
 * Run: node test/mcp.test.mjs
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildClientConfig,
  describeServer,
  insertServer,
  normalizeDocument,
  normalizeServer,
  parseImportText,
  readMcpConfig,
  removeServer,
  replaceServer,
  serverToolPrefix,
  writeMcpConfig,
} from "../lib/mcp.js";

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

const stdio = {
  transport: "stdio",
  serverName: "probe",
  command: "node",
  args: ["server.mjs"],
  env: { A: "1" },
};

// --- validation -------------------------------------------------------------
const valid = normalizeServer(stdio);
check("valid stdio accepted", valid.ok === true, valid);
check("id derived from serverName", valid.ok && valid.value.id === "probe");
check("args kept", valid.ok && valid.value.args.length === 1);
check("enabled defaults true", valid.ok && valid.value.enabled === true);
check("bad name rejected", normalizeServer({ ...stdio, serverName: "bad name!" }).ok === false);
check("bad transport rejected", normalizeServer({ ...stdio, transport: "sse" }).ok === false);
check("stdio needs a command", normalizeServer({ transport: "stdio", serverName: "x" }).ok === false);
check("http needs a url", normalizeServer({ transport: "streamable-http", serverName: "x" }).ok === false);
check(
  "http accepts a url",
  normalizeServer({ transport: "streamable-http", serverName: "x", url: "https://example.com/mcp" }).ok === true,
);
check("env must be string values", normalizeServer({ ...stdio, env: { A: 1 } }).ok === false);
check("dup name rejected", normalizeServer({ ...stdio }, { servers: [valid.value] }).ok === false);
check(
  "same id allowed when ignored",
  normalizeServer({ ...stdio }, { servers: [valid.value], ignoreId: "probe" }).ok === true,
);

// --- client config ----------------------------------------------------------
const config = buildClientConfig({ ...valid.value, note: "hello", enabled: false });
check("client config keeps transport", config.transport === "stdio");
check("client config drops id", config.id === undefined);
check("client config drops note", config.note === undefined);
check("client config drops enabled", config.enabled === undefined);
check("tool prefix", serverToolPrefix("probe") === "mcp__probe__");
check("describe stdio", describeServer(valid.value) === "node server.mjs");
check("describe http", describeServer({ transport: "streamable-http", url: "https://x/y" }) === "https://x/y");

// --- list operations --------------------------------------------------------
const inserted = insertServer([], stdio);
check("insert ok", inserted.ok === true && inserted.value.servers.length === 1, inserted);
const second = insertServer(inserted.value.servers, { ...stdio, serverName: "other", command: "node" });
check("insert second ok", second.ok === true && second.value.servers.length === 2, second);
check("insert dup rejected", insertServer(second.value.servers, stdio).ok === false);
check(
  "insert dup id gets a suffix",
  insertServer(second.value.servers, { ...stdio, serverName: "third", command: "x", id: "other" }).value.servers
    .at(-1).id === "other-2",
);
const replaced = replaceServer(second.value.servers, "probe", { ...stdio, args: ["next.mjs"] });
check("replace ok", replaced.ok === true && replaced.value.server.args[0] === "next.mjs", replaced);
check("replace missing fails", replaceServer(second.value.servers, "nope", stdio).ok === false);
const removed = removeServer(second.value.servers, "probe");
check("remove ok", removed.ok === true && removed.value.servers.length === 1, removed);
check("remove missing fails", removeServer(second.value.servers, "nope").ok === false);

// --- import shapes ----------------------------------------------------------
const fromServers = parseImportText(JSON.stringify({ servers: [stdio] }));
check("import servers array", fromServers.ok === true && fromServers.value.servers.length === 1, fromServers);
const fromBare = parseImportText(JSON.stringify([stdio]));
check("import bare array", fromBare.ok === true && fromBare.value.servers.length === 1, fromBare);
const fromMap = parseImportText(
  JSON.stringify({
    mcpServers: {
      github: { command: "npx", args: ["-y", "pkg"], env: { TOKEN: "x" } },
      web: { url: "https://example.com/mcp" },
    },
  }),
);
check(
  "import mcpServers map infers names and http transport",
  fromMap.ok === true &&
    fromMap.value.servers.length === 2 &&
    fromMap.value.servers[0].serverName === "github" &&
    fromMap.value.servers[0].transport === "stdio" &&
    fromMap.value.servers[1].transport === "streamable-http",
  fromMap,
);
check("import broken json fails", parseImportText("{ nope").ok === false);
check("import wrong shape fails", parseImportText(JSON.stringify({ hello: 1 })).ok === false);

// --- file round trip --------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), "dsh-mcp-"));
const file = join(dir, "mcp.json");
try {
  check("missing file reads empty", readMcpConfig(file).servers.length === 0);
  const written = writeMcpConfig(file, second.value.servers);
  check("write ok", written.ok === true, written);
  const reread = readMcpConfig(file);
  check("round trip keeps both", reread.servers.length === 2 && reread.version === 1, reread);
  check("round trip keeps env", reread.servers[0].env.A === "1", reread.servers[0]);
  writeFileSync(file, "{ broken", "utf8");
  check("broken file reads empty", readMcpConfig(file).servers.length === 0);
  check(
    "document shape tolerant",
    normalizeDocument({ servers: [stdio] }).servers.length === 1 &&
      normalizeDocument([stdio]).servers.length === 1,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
