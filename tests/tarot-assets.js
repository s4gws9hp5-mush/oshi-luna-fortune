"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
require("../js/tarot-public.js");
require("../js/tarot-assets.js");
const cards = globalThis.OshiLunaTarotPublic.cards, assets = globalThis.OshiLunaTarotAssets;
assert.deepEqual(Object.keys(assets).sort(), cards.map(c => c.id).sort());
const paths = new Set();
for (const c of cards) {
  const a = assets[c.id];
  assert.match(a.src, /^images\/tarot\/cards\/(major_\d{2}|wands_\d{2}|cups_\d{2}|swords_\d{2}|pentacles_\d{2})\.png$/);
  assert.ok(!paths.has(a.src), "別カードが同じ画像を使わない"); paths.add(a.src);
  const bytes = fs.readFileSync(path.join(__dirname, "..", a.src));
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16), a.width);
  assert.equal(bytes.readUInt32BE(20), a.height);
}
const css = fs.readFileSync(path.join(__dirname, "../css/tarot.css"), "utf8");
assert.match(css, /data-position="reversed"\] img\s*\{\s*transform: rotate\(180deg\)/);
console.log("Tarot assets: 78 unique local paths, PNG dimensions and reversed-image CSS: PASS");
