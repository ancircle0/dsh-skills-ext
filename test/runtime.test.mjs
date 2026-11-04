/**
 * Tests for the `$DSH_HOME`-only runtime resolution, the portable-name expansion and
 * the PATH the mounted server receives.
 * Run: node test/runtime.test.mjs
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { buildClientConfig } from "../lib/mcp.js";
import {
  composePath,
  expandCommand,
  resolveDshRuntimes,
  resolveRuntimeExecutables,
  runtimePathDirs,
} from "../lib/runtimes.js";

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

const NODE_BIN = process.platform === "win32" ? join("node", "bin", "node.exe") : join("node", "bin", "node");
const PYTHON_BIN = process.platform === "win32" ? join("python", "python.exe") : join("python", "bin", "python3");
const PNPM_BIN = join("pnpm", "bin", "pnpm.cjs");

/** Create one payload directory with the given files and versions. */
function writePayload(root, name, { versions = {}, files = [] } = {}) {
  const payload = join(root, name);
  mkdirSync(join(payload, "dependencies"), { recursive: true });
  writeFileSync(join(payload, "runtime.json"), JSON.stringify(versions, null, 2), "utf8");
  for (const file of files) {
    const target = join(payload, "dependencies", file);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, "", "utf8");
  }
  return payload;
}

const home = mkdtempSync(join(tmpdir(), "dsh-runtimes-"));
const runtimeRoot = join(home, ".dsh", "dsh-runtimes");
const emptyHome = mkdtempSync(join(tmpdir(), "dsh-runtimes-empty-"));
try {
  // --- no payload at all ----------------------------------------------------
  const options = { env: {}, home };
  const empty = { env: {}, home: emptyHome };
  check("missing runtime root yields nothing", resolveDshRuntimes(empty).length === 0);
  check("missing runtime root leaves names alone", expandCommand("node", [], empty).command === "node");
  check("missing runtime root adds no PATH entries", runtimePathDirs(empty).length === 0);

  // --- a complete primary payload ------------------------------------------
  const primary = writePayload(runtimeRoot, "dsh-primary-runtime", {
    versions: { node: "24.21.0", pnpm: "11.28.5", python: "3.12.14" },
    files: [NODE_BIN, PYTHON_BIN, PNPM_BIN],
  });
  const base = join(primary, "dependencies");
  const runtimes = resolveDshRuntimes(options);
  check("three runtimes offered", runtimes.length === 3, runtimes.map((entry) => entry.id));
  check(
    "presets store portable names, not paths",
    runtimes.every((entry) => ["node", "python", "pnpm"].includes(entry.id)),
    runtimes.map((entry) => entry.id),
  );
  check("presets carry versions", runtimes.every((entry) => entry.version !== ""), runtimes);
  check(
    "presets expose the target for a tooltip",
    runtimes.find((entry) => entry.id === "node").target === join(base, NODE_BIN),
  );
  const nodeToken = runtimes.find((entry) => entry.id === "node").targetToken;
  check(
    "the display value is a $DSH_HOME token",
    nodeToken.startsWith("$DSH_HOME/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/"),
    nodeToken,
  );
  check("the token never leaks the absolute home path", !nodeToken.includes(home), nodeToken);
  check("the token uses forward slashes", !nodeToken.includes("\\"), nodeToken);
  const pnpmToken = runtimes.find((entry) => entry.id === "pnpm").targetToken;
  check(
    "the pnpm token names both node and the script",
    pnpmToken.includes("/node/bin/") && pnpmToken.endsWith("/pnpm/bin/pnpm.cjs"),
    pnpmToken,
  );

  // --- expanding a stored name ---------------------------------------------
  check("node expands to the bundled binary", expandCommand("node", [], options).command === join(base, NODE_BIN));
  check(
    "python expands to the bundled binary",
    expandCommand("python", [], options).command === join(base, PYTHON_BIN),
  );
  const pnpm = expandCommand("pnpm", ["--version"], options);
  check("pnpm runs through the bundled node", pnpm.command === join(base, NODE_BIN), pnpm);
  check(
    "pnpm keeps the caller's arguments after the script",
    pnpm.args.length === 2 && pnpm.args[0] === join(base, PNPM_BIN) && pnpm.args[1] === "--version",
    pnpm,
  );
  check("pnpm expansion is idempotent-safe (no duplicate script)", expandCommand("pnpm", [], options).args.length === 1);
  check("unknown names pass through", expandCommand("npx", ["-y", "pkg"], options).command === "npx");
  const absolute = expandCommand("C:\\tools\\node.exe", [], options);
  check("absolute paths pass through untouched", absolute.command === "C:\\tools\\node.exe", absolute);

  // --- the PATH handed to a mounted server ---------------------------------
  const dirs = runtimePathDirs(options);
  check("bundled bins are collected", dirs.includes(join(base, "node", "bin")), dirs);
  check("composePath prepends and keeps the parent", composePath(["/a", "/b"], "/c") === ["/a", "/b", "/c"].join(delimiter));
  check("composePath tolerates an empty parent", composePath(["/a"], "") === "/a");

  const server = { serverName: "demo", transport: "stdio", command: "pnpm", args: ["--version"], cwd: "C:\\work" };
  const config = buildClientConfig(server, {
    expandCommand: (command, args) => expandCommand(command, args, options),
    pathDirs: dirs,
    parentPath: "/parent",
  });
  check("mounted config carries the expanded command", config.command === join(base, NODE_BIN), config);
  check("mounted config carries the script argument", config.args[0] === join(base, PNPM_BIN), config);
  check(
    "mounted config prepends the bundled bins to PATH",
    typeof config.env?.PATH === "string" && config.env.PATH.startsWith(join(base, "node", "bin")) && config.env.PATH.endsWith("/parent"),
    config.env,
  );
  const bare = buildClientConfig(server);
  check("without options the stored values are untouched", bare.command === "pnpm" && bare.args.length === 1, bare);
  check("without options no PATH is injected", bare.env === undefined, bare.env);

  // --- a non-primary payload must not win ----------------------------------
  writePayload(runtimeRoot, "aaa-other-runtime", { versions: { node: "1.2.3" }, files: [NODE_BIN] });
  check(
    "primary payload wins over an alphabetically earlier one",
    resolveDshRuntimes(options)[0].version === "24.21.0",
  );

  // --- a payload without dependencies is ignored ---------------------------
  const home2 = mkdtempSync(join(tmpdir(), "dsh-runtimes-"));
  const root2 = join(home2, ".dsh", "dsh-runtimes");
  mkdirSync(join(root2, "dsh-primary-runtime"), { recursive: true });
  writeFileSync(join(root2, "dsh-primary-runtime", "runtime.json"), '{"node":"9.9.9"}', "utf8");
  check("payload without dependencies is ignored", resolveDshRuntimes({ env: {}, home: home2 }).length === 0);
  rmSync(home2, { recursive: true, force: true });

  // --- a missing node binary drops node and pnpm ---------------------------
  const home3 = mkdtempSync(join(tmpdir(), "dsh-runtimes-"));
  const root3 = join(home3, ".dsh", "dsh-runtimes");
  writePayload(root3, "dsh-primary-runtime", { versions: { node: "24.21.0", python: "3.12.14" }, files: [PYTHON_BIN, PNPM_BIN] });
  const partial = resolveDshRuntimes({ env: {}, home: home3 });
  check(
    "without node only python remains",
    partial.length === 1 && partial[0].id === "python",
    partial.map((entry) => entry.id),
  );
  check(
    "without node the executables report no pnpm",
    resolveRuntimeExecutables({ env: {}, home: home3 }).pnpm === undefined ||
      resolveRuntimeExecutables({ env: {}, home: home3 }).node === undefined,
  );
  rmSync(home3, { recursive: true, force: true });
} finally {
  rmSync(home, { recursive: true, force: true });
  rmSync(emptyHome, { recursive: true, force: true });
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
