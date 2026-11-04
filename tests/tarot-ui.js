"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
require("../js/tarot-public.js");
require("../js/tarot-assets.js");
const data = globalThis.OshiLunaTarotPublic, engine = require("../js/tarot.js");
const ui = fs.readFileSync(path.join(__dirname, "../js/tarot-ui.js"), "utf8");

function mount(record, preview) {
  const elements = new Map(), events = {}, timers = [];
  function el(id) {
    if (!elements.has(id)) elements.set(id, {
      id, hidden: true, textContent: "", attributes: {}, listeners: {},
      addEventListener(name, fn) { this.listeners[name] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; delete this[name]; },
      classList: { toggle() {} }, focus() {}
    });
    return elements.get(id);
  }
  let result = record;
  const daily = { peek: () => result, draw: () => (result = record), isPersisted: () => true };
  const window = { OshiLunaTarotPublic: data, OshiLunaTarotAssets: globalThis.OshiLunaTarotAssets,
    OshiLunaTarot: { ...engine, createDaily: () => daily },
    localStorage: {}, crypto: {}, scrollTo() {}, addEventListener(name, fn) { events[name] = fn; } };
  const document = { getElementById: el, querySelectorAll: () => [el("screen-top"), el("screen-tarot")],
    addEventListener(name, fn) { events[name] = fn; }, hidden: false };
  vm.runInNewContext(ui, { window, document, location: {search: preview ? "?tarot-preview=1" : ""},
    URLSearchParams, Date, setInterval(fn) { timers.push(fn); } });
  return { el, elements, daily, events };
}

assert.equal(mount(null, false).elements.size, 0, "通常URLではタロットを起動しない");
for (const card of data.cards) {
  for (const position of ["upright", "reversed"]) {
    const record = {version: 1, date: engine.dateKey(new Date()), cardId: card.id, position};
    const app = mount(record, true), reading = card.readings[position];
    assert.equal(app.el("tarot-entry").hidden, false);
    assert.equal(app.el("tarot-result").hidden, false);
    assert.equal(app.el("tarot-draw").hidden, true);
    assert.equal(app.el("tarot-name").textContent, card.name.ja);
    assert.equal(app.el("tarot-position").textContent, position === "upright" ? "正位置" : "逆位置");
    assert.equal(app.el("tarot-keywords").textContent, reading.keywords.join("・"));
    assert.equal(app.el("tarot-message").textContent, reading.message);
    assert.equal(app.el("tarot-action").textContent, reading.action);
    assert.equal(app.el("tarot-art").attributes["data-position"], position);
    const image = app.el("tarot-image");
    assert.equal(image.src, globalThis.OshiLunaTarotAssets[card.id].src);
    assert.ok(image.alt.includes(card.name.ja));
    image.onload();
    assert.equal(image.hidden, false);
    assert.equal(app.el("tarot-placeholder").hidden, true);
    image.onerror();
    assert.equal(image.hidden, true);
    assert.equal(app.el("tarot-image-note").hidden, false);
    app.events.storage({ key: engine.KEY });
    assert.equal(app.el("tarot-image-note").hidden, false, "再描画でも画像エラーの案内を維持");
    assert.equal(app.el("tarot-message").textContent, reading.message, "画像失敗でも文章を維持");
    app.el("tarot-open").listeners.click();
    app.el("tarot-home").listeners.click();
  }
}
const empty = mount(null, true);
assert.equal(empty.el("tarot-image").hidden, true);
assert.equal(empty.el("tarot-image").src, undefined, "引く前は画像をダウンロードしない");
console.log("Tarot UI: disabled entry, all 156 readings/artwork mappings, loading/fallback and pre-draw state: PASS");
