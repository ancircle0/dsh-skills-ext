/**
 * Smoke test for lib/core.js against a throwaway DSH home.
 * Run: node test/core.test.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addPreset,
  ensureConfig,
  linkSkill,
  readState,
  removePreset,
  setScanDepth,
  unlinkSkill,
} from "../lib/core.js";

const root = mkdtempSync(join(tmpdir(), "ske-test-"));
const home = join(root, "home");
const presetsRoot = join(root, "external-skills");
const env = { DSH_HOME: home };

let failures = 0;
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
};

const writeSkill = (parent, folder, name, description) => {
  const dir = join(parent, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8",
  );
  return dir;
};

mkdirSync(presetsRoot, { recursive: true });
const alpha = writeSkill(presetsRoot, "alpha", "alpha", "Alpha skill");
writeSkill(presetsRoot, "beta-skill", "beta-skill", "Beta skill");
mkdirSync(join(presetsRoot, "not-a-skill"), { recursive: true });

// --- empty state -----------------------------------------------------------
const ensured = ensureConfig({ env });
check("ensureConfig ok", ensured.ok === true, ensured);
check("presets file created", existsSync(join(home, "skills-ext", "presets.json")), ensured);

const empty = readState({ env });
check("state ok", empty.ok === true, empty);
check("no presets yet", empty.value.presets.length === 0, empty.value.presets);
check("skills root path", empty.value.skillsRoot === join(home, "skills"), empty.value.skillsRoot);

// --- add preset ------------------------------------------------------------
const added = addPreset({ env, path: presetsRoot });
check("add preset ok", added.ok === true, added);
check("preset recorded", added.value.presets.length === 1 && added.value.presets[0].path === presetsRoot, added.value.presets);
check("two skills discovered", added.value.skills.length === 2, added.value.skills.map((s) => s.name));
check("frontmatter name used", added.value.skills.some((s) => s.name === "beta-skill"), added.value.skills.map((s) => s.name));
check("description parsed", added.value.skills[0].description.length > 0, added.value.skills[0]);
check("all missing", added.value.skills.every((s) => s.link === "missing"), added.value.skills.map((s) => s.link));
check(
  "preset file written",
  JSON.parse(readFileSync(join(home, "skills-ext", "presets.json"), "utf8")).presets.includes(presetsRoot),
);

// --- scan depth ------------------------------------------------------------
writeSkill(join(presetsRoot, "team", "sub"), "deep-skill", "deep-skill", "Deep skill");
check(
  "default depth 1 hides nested skills",
  added.value.scanDepth === 1 && !added.value.skills.some((s) => s.name === "deep-skill"),
  added.value.scanDepth,
);
const savedDepth = setScanDepth({ env, depth: 3 });
check("depth saved", savedDepth.ok === true && savedDepth.value.scanDepth === 3, savedDepth);
check(
  "settings file written",
  JSON.parse(readFileSync(join(home, "skills-ext", "settings.json"), "utf8")).scanDepth === 3,
);
const deeper = readState({ env });
check(
  "depth 3 finds the nested skill",
  deeper.value.skills.some((s) => s.name === "deep-skill"),
  deeper.value.skills.map((s) => `${s.name}@L${s.level}`),
);
check(
  "nested skill reports its level",
  deeper.value.skills.find((s) => s.name === "deep-skill").level === 3,
  deeper.value.skills.find((s) => s.name === "deep-skill"),
);
check("depth clamps high", setScanDepth({ env, depth: 50 }).value.scanDepth === 10);
check("depth clamps low", setScanDepth({ env, depth: 0 }).value.scanDepth === 1);
setScanDepth({ env, depth: 1 });
check(
  "depth 1 hides the nested skill again",
  !readState({ env }).value.skills.some((s) => s.name === "deep-skill"),
);

const duplicate = addPreset({ env, path: presetsRoot });
check("duplicate rejected", duplicate.ok === false && duplicate.error.code === "path-duplicate", duplicate);

const relative = addPreset({ env, path: "relative/dir" });
check("relative rejected", relative.ok === false && relative.error.code === "path-not-absolute", relative);

// --- link ------------------------------------------------------------------
const linked = linkSkill({ env, name: "alpha", dir: alpha });
check("link ok", linked.ok === true, linked);
const alphaAfter = linked.value.skills.find((s) => s.name === "alpha");
check("alpha linked", alphaAfter.link === "linked", alphaAfter);
check("junction exists", readdirSync(join(home, "skills")).includes("alpha"));

const again = linkSkill({ env, name: "alpha", dir: alpha });
check("relink is idempotent", again.ok === true && again.value.skills.find((s) => s.name === "alpha").link === "linked", again);

// occupied: a real directory with the same name
mkdirSync(join(home, "skills", "beta-skill"), { recursive: true });
const occupied = readState({ env }).value.skills.find((s) => s.name === "beta-skill");
check("real dir reported occupied", occupied.link === "occupied", occupied);
const blocked = linkSkill({ env, name: "beta-skill", dir: join(presetsRoot, "beta-skill") });
check("link blocked by real dir", blocked.ok === false && blocked.error.code === "target-occupied", blocked);

// conflict: a link pointing somewhere else
const elsewhere = writeSkill(join(root, "other"), "alpha", "alpha", "Decoy alpha");
rmSync(join(home, "skills", "alpha"));
symlinkSync(elsewhere, join(home, "skills", "alpha"), "junction");
const conflict = readState({ env }).value.skills.find((s) => s.name === "alpha");
check("conflict reported", conflict.link === "conflict", conflict);
const refused = linkSkill({ env, name: "alpha", dir: alpha });
check("link refused on conflict", refused.ok === false && refused.error.code === "target-conflict", refused);
const removedOther = unlinkSkill({ env, name: "alpha" });
check("conflict link removable", removedOther.ok === true, removedOther);
const relinked = linkSkill({ env, name: "alpha", dir: alpha });
check("relink after conflict", relinked.ok === true && relinked.value.skills.find((s) => s.name === "alpha").link === "linked", relinked);

// --- unlink ----------------------------------------------------------------
const before = readdirSync(alpha);
const unlinked = unlinkSkill({ env, name: "alpha" });
check("unlink ok", unlinked.ok === true, unlinked);
check("skill now missing", unlinked.value.skills.find((s) => s.name === "alpha").link === "missing", unlinked.value.skills);
check("source untouched", readdirSync(alpha).join() === before.join());
check("unlink idempotent", unlinkSkill({ env, name: "alpha" }).ok === true);

// --- remove preset ---------------------------------------------------------
const removed = removePreset({ env, path: presetsRoot });
check("remove preset ok", removed.ok === true && removed.value.presets.length === 0, removed);
check("remove missing preset rejected", removePreset({ env, path: presetsRoot }).error.code === "path-missing");

rmSync(root, { recursive: true, force: true });
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
