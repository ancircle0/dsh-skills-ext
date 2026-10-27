/**
 * Read files straight out of an Electron app.asar archive.
 * Usage: node test/asar-peek.mjs <asar> <pattern> [<regex>]
 */
import { openSync, readSync, closeSync } from "node:fs";

const [archive, pattern, regexSource] = process.argv.slice(2);
const fd = openSync(archive, "r");

const readAt = (position, length) => {
  const buffer = Buffer.alloc(length);
  readSync(fd, buffer, 0, length, position);
  return buffer;
};

const sizeBuffer = readAt(0, 16);
if (sizeBuffer.readUInt32LE(0) !== 4) throw new Error("not an asar archive");
const headerLength = sizeBuffer.readUInt32LE(8);
const rawHeader = readAt(16, headerLength).toString("utf8");
const headerJson = rawHeader.slice(0, rawHeader.lastIndexOf("}") + 1);
const header = JSON.parse(headerJson);
const baseOffset = 16 + headerLength;

/** @type {{path: string, size: number, offset: string}[]} */
const files = [];
const walk = (node, prefix) => {
  if (!node || typeof node !== "object") return;
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) walk(child, prefix === "" ? name : `${prefix}/${name}`);
    return;
  }
  if (typeof node.offset === "string" && typeof node.size === "number") {
    files.push({ path: prefix, size: node.size, offset: node.offset });
  }
};

walk(header, "");
const matcher = new RegExp(pattern);
const matches = files.filter((file) => matcher.test(file.path));
const regex = regexSource === undefined ? null : new RegExp(regexSource, "g");

for (const file of matches) {
  const content = readAt(baseOffset + Number(file.offset), file.size).toString("utf8");
  if (regex === null) {
    console.log(`--- ${file.path} (${file.size} bytes) ---`);
    console.log(content.slice(0, 1200));
    continue;
  }
  const hits = [];
  for (const match of content.matchAll(regex)) {
    const start = Math.max(0, match.index - 160);
    hits.push(content.slice(start, match.index + 220).replace(/\s+/g, " "));
    if (hits.length >= 6) break;
  }
  if (hits.length === 0) continue;
  console.log(`--- ${file.path} (${file.size} bytes) ---`);
  for (const hit of hits) console.log(`  … ${hit} …`);
}
closeSync(fd);
