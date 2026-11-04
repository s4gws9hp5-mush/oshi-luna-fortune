"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
require("../js/tarot-public.js");
const data = globalThis.OshiLunaTarotPublic, engine = require("../js/tarot.js");
const ui = fs.readFileSync(path.join(__dirname, "../js/tarot-ui.js"), "utf8");

function mount(record, preview) {
  const elements = new Map(), events = {}, timers = [];
  function el(id) {
    if (!elements.has(id)) elements.set(id, {
      id, hidden: true, textContent: "", attributes: {}, listeners: {},
      addEventListener(name, fn) { this.listeners[name] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
      classList: { toggle() {} }, focus() {}
    });
    return elements.get(id);
  }
  let result = record;
  const daily = { peek: () => result, draw: () => (result = record), isPersisted: () => true };
  const window = { OshiLunaTarotPublic: data,
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
    app.el("tarot-open").listeners.click();
    app.el("tarot-home").listeners.click();
  }
}
console.log("Tarot UI: disabled entry and all 156 approved readings/orientations rendered: PASS");
