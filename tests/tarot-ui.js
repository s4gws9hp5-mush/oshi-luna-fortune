"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
require("../js/tarot-public.js");
require("../js/tarot-assets.js");
const data = globalThis.OshiLunaTarotPublic, engine = require("../js/tarot.js");
const assets = globalThis.OshiLunaTarotAssets;
const ui = fs.readFileSync(path.join(__dirname, "../js/tarot-ui.js"), "utf8");

// textContent を書きかえると子要素が消える（ブラウザと同じ）、子要素を足せる最小限の要素
function node() {
  let text = "";
  return { children: [],
    get textContent() { return text + this.children.map((c) => c.textContent).join(""); },
    set textContent(v) { text = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; } };
}

function mount(record, preview) {
  const elements = new Map(), events = {}, timers = [];
  function el(id) {
    if (!elements.has(id)) {
      const classes = new Set(id === "screen-top" ? ["is-active"] : []);
      elements.set(id, Object.assign(node(), {
        id, hidden: true, attributes: {}, listeners: {},
        addEventListener(name, fn) { this.listeners[name] = fn; },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; delete this[name]; },
        classList: {
          toggle(name, force) { (force === undefined ? !classes.has(name) : force) ? classes.add(name) : classes.delete(name); },
          contains(name) { return classes.has(name); }
        },
        focus() {}
      }));
    }
    return elements.get(id);
  }
  let result = record, day = engine.dateKey(new Date());
  const daily = { peek: () => result, draw: () => (result = record), isPersisted: () => true };
  const window = { OshiLunaTarotPublic: data, OshiLunaTarotAssets: assets,
    OshiLunaTarot: { ...engine, dateKey: () => day, createDaily: () => daily },
    localStorage: {}, crypto: {}, scrollTo() {}, addEventListener(name, fn) { events[name] = fn; } };
  const document = { getElementById: el, querySelectorAll: () => [el("screen-top"), el("screen-tarot")], createElement: () => node(),
    addEventListener(name, fn) { events[name] = fn; }, hidden: false };
  vm.runInNewContext(ui, { window, document, location: {search: preview ? "?tarot-preview=1" : ""},
    URLSearchParams, Date, setInterval(fn) { timers.push(fn); } });
  return { el, elements, daily, events,
    setResult(r) { result = r; },
    nextDay(d) { day = d; timers.forEach((fn) => fn()); } };
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
    assert.deepEqual(app.el("tarot-keywords").children.map((li) => li.textContent), reading.keywords, "キーワードは一つずつタグにする");
    assert.equal(app.el("tarot-position").attributes["data-position"], position, "正逆のバッジ");
    assert.equal(app.el("tarot-guide").hidden, true, "結果の表示中はルナの案内を出さない");
    assert.equal(app.el("tarot-current-box").hidden, false, "今のあなたへを表示する");
    assert.equal(app.el("tarot-current").textContent, reading.currentYou);
    assert.equal(app.el("tarot-message").textContent, reading.cardMessage, "カードが伝えるメッセージを表示する（既存の短文は画面に出さない）");
    assert.equal(app.el("tarot-action").textContent, reading.action);
    for (const id of ["tarot-current", "tarot-message", "tarot-action"]) {
      const keep = app.el(id).children;
      assert.ok(keep.length === 1 && keep[0].className === "tarot-keep" && Array.from(keep[0].textContent).length === 6, id + "：末尾6文字を改行しないまとまりにする");
    }
    assert.equal(app.el("tarot-art").attributes["data-position"], position);
    assert.equal(app.el("tarot-status").textContent, "", "結果の表示中は案内文を出さない");
    assert.equal(app.el("tarot-status").hidden, true, "結果の表示中は案内の行も残さない");
    const image = app.el("tarot-image");
    assert.equal(image.src, undefined, "保存済みの結果があっても、トップを開いただけでは画像を読み込まない");
    app.el("tarot-open").listeners.click();
    assert.equal(image.src, assets[card.id].src, "タロット画面を開いたときに、そのカードの画像を読み込む");
    assert.ok(image.alt.includes(card.name.ja));
    image.onload();
    assert.equal(image.hidden, false);
    assert.equal(app.el("tarot-placeholder").hidden, true);
    image.onerror();
    assert.equal(image.hidden, true);
    assert.equal(app.el("tarot-image-note").hidden, false);
    app.events.storage({ key: engine.KEY });
    assert.equal(app.el("tarot-image-note").hidden, false, "再描画でも画像エラーの案内を維持");
    assert.equal(app.el("tarot-current").textContent, reading.currentYou, "画像失敗でも文章を維持");
    assert.equal(app.el("tarot-message").textContent, reading.cardMessage, "画像失敗でも文章を維持");
    assert.equal(app.el("tarot-keywords").children.length, 3, "再描画してもタグは増えない");
    app.el("tarot-home").listeners.click();
  }
}

// タロット画面が非表示のあいだは、日付の変更・別タブの保存更新でも画像を読み込まない
{
  const [a, b, c] = [data.cards[0], data.cards[40], data.cards[77]];
  const today = engine.dateKey(new Date());
  const app = mount({version: 1, date: today, cardId: a.id, position: "upright"}, true), image = app.el("tarot-image");
  app.setResult({version: 1, date: today, cardId: b.id, position: "reversed"});
  app.events.storage({ key: engine.KEY });
  assert.equal(app.el("tarot-name").textContent, b.name.ja, "別タブの更新は文章に反映する");
  assert.equal(image.src, undefined, "非表示のまま別タブで更新されても画像を読み込まない");
  app.setResult({version: 1, date: "2999-01-01", cardId: c.id, position: "upright"});
  app.nextDay("2999-01-01");
  assert.equal(app.el("tarot-date").textContent, "2999/01/01（日本時間）");
  assert.equal(app.el("tarot-name").textContent, c.name.ja, "日付の変更は文章に反映する");
  assert.equal(image.src, undefined, "非表示のまま日付が変わっても画像を読み込まない");
  app.el("tarot-open").listeners.click();
  assert.equal(image.src, assets[c.id].src, "開いたときに、その時点のカードの画像だけを読み込む");
  app.el("tarot-home").listeners.click();
  app.setResult({version: 1, date: "2999-01-01", cardId: a.id, position: "reversed"});
  app.events.storage({ key: engine.KEY });
  assert.equal(image.src, assets[c.id].src, "閉じたあとの更新では新しい画像を読み込まない");
  app.el("tarot-open").listeners.click();
  assert.equal(image.src, assets[a.id].src, "もう一度開くと新しいカードの画像を読み込む");
  app.setResult(null);
  app.nextDay("2999-01-02");
  assert.equal(app.el("tarot-result").hidden, true, "新しい日は引く前の状態に戻る");
  assert.equal(image.src, undefined);
  assert.equal(app.el("tarot-status").hidden, false);
}

// 追加文がないカードでは、既存の短い message を表示し、今のあなたへは隠す（データは変えずに表示だけで確かめる）
{
  const card = data.cards[3], saved = card.readings.upright, { currentYou, cardMessage, ...short } = saved;
  card.readings.upright = short;
  try {
    const app = mount({version: 1, date: engine.dateKey(new Date()), cardId: card.id, position: "upright"}, true);
    assert.equal(app.el("tarot-current-box").hidden, true);
    assert.equal(app.el("tarot-message").textContent, saved.message);
    assert.equal(app.el("tarot-action").textContent, saved.action);
  } finally { card.readings.upright = saved; }
}

const empty = mount(null, true);
assert.equal(empty.el("tarot-image").hidden, true);
assert.equal(empty.el("tarot-image").src, undefined, "引く前は画像をダウンロードしない");
assert.equal(empty.el("tarot-status").hidden, false, "引く前の案内は表示する");
assert.equal(empty.el("tarot-guide").hidden, false, "引く前はルナの案内を表示する");
assert.equal(empty.el("tarot-status").textContent, "心を落ち着けて、今日の一枚を引いてみよう。");
empty.el("tarot-open").listeners.click();
assert.equal(empty.el("tarot-image").src, undefined, "開いても、引く前は画像をダウンロードしない");
console.log("Tarot UI: disabled entry, all 156 readings (currentYou/cardMessage/action, short message kept as fallback)/artwork mappings, image loading only while open, loading/fallback, status and pre-draw state: PASS");
