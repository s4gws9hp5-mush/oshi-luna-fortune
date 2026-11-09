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

function mount(record, preview, opts = {}) {
  const elements = new Map(), events = {}, timers = [], timeouts = [];
  function el(id) {
    if (!elements.has(id)) {
      const classes = new Set(id === "screen-top" ? ["is-active"] : []);
      elements.set(id, Object.assign(node(), {
        id, hidden: true, attributes: {}, listeners: {},
        addEventListener(name, fn) { this.listeners[name] = fn; },
        setAttribute(name, value) { this.attributes[name] = value; },
        getAttribute(name) { return name in this.attributes ? this.attributes[name] : (this[name] === undefined ? null : this[name]); },
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
  let result = opts.saved === undefined ? record : opts.saved, day = engine.dateKey(new Date()), draws = 0;
  const daily = { peek: () => result, draw: () => { draws++; return (result = record); }, isPersisted: () => true };
  const window = { OshiLunaTarotPublic: opts.data || data, OshiLunaTarotAssets: assets,
    OshiLunaTarot: { ...engine, dateKey: () => day, createDaily: () => daily },
    localStorage: {}, crypto: {}, scrollTo() {}, addEventListener(name, fn) { events[name] = fn; },
    matchMedia: (q) => ({ matches: !!opts.reduce && q.includes("reduce") }),
    setTimeout(fn, ms) { const t = { fn, ms }; timeouts.push(t); return t; },
    clearTimeout(t) { const i = timeouts.indexOf(t); if (i >= 0) timeouts.splice(i, 1); } };
  const document = { getElementById: el, querySelectorAll: () => [el("screen-top"), el("screen-tarot"), el("screen-tarot-loading")], createElement: () => node(),
    addEventListener(name, fn) { events[name] = fn; }, hidden: false };
  vm.runInNewContext(ui, { window, document, location: {search: preview ? "?tarot-preview=1" : ""},
    URLSearchParams, Date, setInterval(fn) { timers.push(fn); } });
  return { el, elements, daily, events, timeouts, get draws() { return draws; },
    active() { return ["screen-top", "screen-tarot", "screen-tarot-loading"].filter((id) => el(id).classList.contains("is-active")); },
    runTimeouts() { timeouts.splice(0).forEach((t) => t.fn()); },
    tick() { timers.forEach((fn) => fn()); },
    setResult(r) { result = r; },
    nextDay(d) { day = d; timers.forEach((fn) => fn()); } };
}

// 公開（enabled: true）：通常URLでも入口を出し、プレビュー専用の案内は出さない
{
  const pub = mount(null, false);
  assert.equal(pub.el("tarot-entry").hidden, false, "公開：通常URLで今日の一枚の入口を表示する");
  assert.equal(pub.el("tarot-preview-note").hidden, true, "公開：通常URLではプレビュー専用の案内を出さない");
  assert.equal(mount(null, true).el("tarot-preview-note").hidden, false, "?tarot-preview=1 のときだけプレビューの案内を出す");
}
// 戻すとき（enabled: false）：通常URLではタロットを起動しない。?tarot-preview=1 のときだけ表示する
assert.equal(mount(null, false, { data: { ...data, enabled: false } }).elements.size, 0, "enabled: false のときは通常URLでタロットを起動しない");
assert.equal(mount(null, true, { data: { ...data, enabled: false } }).el("tarot-entry").hidden, false, "enabled: false でも ?tarot-preview=1 なら表示する");
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

// 初めて引くとき：抽選・保存は一度だけ → 約3秒の演出（GIF）→ 結果。演出中は結果を出さない
const GIF = "images/tarot/luna-tarot-transparent.gif";
const sample = (i, position) => ({version: 1, date: engine.dateKey(new Date()), cardId: data.cards[i].id, position});
{
  const record = sample(12, "reversed"), card = data.cards[12];
  const app = mount(record, true, { saved: null });
  assert.equal(app.el("tarot-loading-gif").src, undefined, "トップを開いただけでは演出の GIF を読み込まない");
  app.el("tarot-open").listeners.click();
  assert.equal(app.el("tarot-loading-gif").src, undefined, "タロット画面を開いただけでも GIF は読み込まない");
  app.el("tarot-draw").listeners.click();
  app.el("tarot-draw").listeners.click();
  app.el("tarot-draw").listeners.click();
  assert.equal(app.draws, 1, "連打しても抽選・保存は一度だけ");
  assert.equal(app.timeouts.length, 1, "連打しても演出は一度だけ");
  assert.equal(app.timeouts[0].ms, 3000, "演出は約3秒");
  assert.deepEqual(app.active(), ["screen-tarot-loading"], "演出の画面だけを表示する");
  assert.equal(app.el("tarot-loading-gif").src, GIF, "演出を始めるときに GIF を読み込む");
  assert.equal(app.el("tarot-loading-gif").hidden, false);
  assert.equal(app.el("tarot-loading-still").hidden, true);
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.ok(html.includes('<span class="phrase">ルナが今日のあなたへ、</span><span class="phrase">一枚を選んでいるよ</span>'), "演出の文言");
  assert.ok(/<img class="tarot-loading-gif" id="tarot-loading-gif" width="384" height="384" alt="" hidden>/.test(html), "GIF の src は HTML に書かない（トップで取得しない）");
  assert.equal(app.el("tarot-result").hidden, true, "演出中は結果を描画しない");
  assert.equal(app.el("tarot-name").textContent, "", "演出中は結果の文章を入れない");
  assert.equal(app.el("tarot-image").src, assets[card.id].src, "演出のあいだにカード画像を読み込み始める");
  app.events.storage({ key: engine.KEY });
  app.tick();
  assert.equal(app.el("tarot-result").hidden, true, "演出中の別タブ更新・日付チェックでは結果に切り替えない");
  app.runTimeouts();
  assert.deepEqual(app.active(), ["screen-tarot"], "演出のあとにタロット画面へ戻る");
  assert.equal(app.el("tarot-result").hidden, false);
  assert.equal(app.el("tarot-name").textContent, card.name.ja);
  assert.equal(app.el("tarot-position").textContent, "逆位置");
  assert.equal(app.el("tarot-message").textContent, card.readings.reversed.cardMessage);
  assert.equal(app.el("tarot-draw").hidden, true);
  assert.equal(app.el("tarot-draw").disabled, false);
  assert.equal(app.draws, 1);
  // 見返すときは演出を挟まない
  app.el("tarot-home").listeners.click();
  app.el("tarot-open").listeners.click();
  assert.deepEqual(app.active(), ["screen-tarot"]);
  assert.equal(app.timeouts.length, 0, "今日の結果があるときは演出なしで見返せる");
}
// 別タブなどですでに今日の結果がある（この画面はまだ「引く前」）：押しても抽選も演出もせず、その結果を表示
{
  const app = mount(sample(5, "upright"), true, { saved: null });
  app.el("tarot-open").listeners.click();
  app.setResult(sample(20, "upright"));
  app.el("tarot-draw").listeners.click();
  assert.equal(app.draws, 0);
  assert.equal(app.timeouts.length, 0);
  assert.equal(app.el("tarot-name").textContent, data.cards[20].name.ja);
  assert.equal(app.el("tarot-loading-gif").src, undefined, "演出しないときは GIF を読み込まない");
}
// 演出中に日本時間の0時を過ぎた：前日の結果は出さず、新しい日の「引く前」に戻す（自動で引き直さない）
{
  const app = mount(sample(30, "upright"), true, { saved: null });
  app.el("tarot-open").listeners.click();
  app.el("tarot-draw").listeners.click();
  app.setResult(null);
  app.nextDay("2999-02-01");
  assert.notEqual(app.el("tarot-date").textContent, "2999/02/01（日本時間）", "演出中は日付の切り替えを保留");
  app.runTimeouts();
  assert.equal(app.el("tarot-date").textContent, "2999/02/01（日本時間）");
  assert.equal(app.el("tarot-result").hidden, true, "前日の結果に切り替えない");
  assert.equal(app.el("tarot-draw").hidden, false);
  assert.equal(app.draws, 1, "自動で引き直さない");
  assert.equal(app.el("tarot-image").src, undefined, "前日のカード画像は外す");
}
// 演出中に画面が移った：終わっても画面を奪わない（結果は次に開いたときに表示）
{
  const app = mount(sample(40, "upright"), true, { saved: null });
  app.el("tarot-open").listeners.click();
  app.el("tarot-draw").listeners.click();
  app.el("screen-tarot-loading").classList.toggle("is-active", false);
  app.el("screen-top").classList.toggle("is-active", true);
  app.runTimeouts();
  assert.deepEqual(app.active(), ["screen-top"]);
  app.el("tarot-open").listeners.click();
  assert.equal(app.el("tarot-name").textContent, data.cards[40].name.ja);
  assert.equal(app.draws, 1);
}
// 演出中に別アプリへ移り、裏でタイマーが止まったまま戻る：予定の3秒を過ぎていれば、戻ったときにすぐ結果へ（再抽選なし・表示は一度だけ）
{
  const app = mount(sample(45, "reversed"), true, { saved: null });
  app.el("tarot-open").listeners.click();
  const realNow = Date.now, start = realNow();
  app.el("tarot-draw").listeners.click();
  try {
    Date.now = () => start + 1000;
    app.events.visibilitychange();
    assert.deepEqual(app.active(), ["screen-tarot-loading"], "3秒より前に戻ったときは演出を続ける");
    Date.now = () => start + 60000;
    app.events.visibilitychange();
  } finally { Date.now = realNow; }
  assert.deepEqual(app.active(), ["screen-tarot"], "タイマーが動かなくても、戻ったときに結果へ進む");
  assert.equal(app.el("tarot-name").textContent, data.cards[45].name.ja);
  assert.equal(app.el("tarot-draw").disabled, false);
  app.el("tarot-home").listeners.click();
  app.runTimeouts();
  assert.deepEqual(app.active(), ["screen-top"], "あとから止まっていたタイマーが動いても、画面を切り替えない");
  assert.equal(app.draws, 1, "再抽選しない");
}
// GIF が届くまでは枠に ☾ の仮表示（is-gif）。動きを減らす設定・GIF の失敗では付けない
{
  const app = mount(sample(46, "upright"), true, { saved: null });
  app.el("tarot-open").listeners.click();
  app.el("tarot-draw").listeners.click();
  assert.equal(app.el("tarot-loading-art").classList.contains("is-gif"), true);
  app.el("tarot-loading-gif").onerror();
  assert.equal(app.el("tarot-loading-art").classList.contains("is-gif"), false);
}
// GIF が届いたら ☾ を消す（GIF は背景透過なので、残すと透けて見える）
{
  const app = mount(sample(47, "upright"), true, { saved: null });
  app.el("tarot-open").listeners.click();
  app.el("tarot-draw").listeners.click();
  assert.equal(app.el("tarot-loading-art").classList.contains("is-gif"), true);
  app.el("tarot-loading-gif").onload();
  assert.equal(app.el("tarot-loading-art").classList.contains("is-gif"), false);
  assert.equal(app.el("tarot-loading-gif").hidden, false);
}
// GIF の読み込みに失敗：静止画に切り替え、結果まで進む
{
  const app = mount(sample(50, "reversed"), true, { saved: null });
  app.el("tarot-open").listeners.click();
  app.el("tarot-draw").listeners.click();
  app.el("tarot-loading-gif").onerror();
  assert.equal(app.el("tarot-loading-gif").hidden, true);
  assert.equal(app.el("tarot-loading-still").hidden, false);
  app.runTimeouts();
  assert.equal(app.el("tarot-name").textContent, data.cards[50].name.ja);
}
// 動きを減らす設定：GIF を読み込まず静止画、3秒の待ちを省く
{
  const app = mount(sample(60, "upright"), true, { saved: null, reduce: true });
  app.el("tarot-open").listeners.click();
  app.el("tarot-draw").listeners.click();
  assert.equal(app.el("tarot-loading-gif").src, undefined);
  assert.equal(app.el("tarot-loading-gif").hidden, true);
  assert.equal(app.el("tarot-loading-still").hidden, false);
  assert.ok(app.timeouts[0].ms <= 300, "3秒の待ちを省く");
  app.runTimeouts();
  assert.equal(app.el("tarot-name").textContent, data.cards[60].name.ja);
}

const empty = mount(null, true);
assert.equal(empty.el("tarot-image").hidden, true);
assert.equal(empty.el("tarot-image").src, undefined, "引く前は画像をダウンロードしない");
assert.equal(empty.el("tarot-status").hidden, false, "引く前の案内は表示する");
assert.equal(empty.el("tarot-guide").hidden, false, "引く前はルナの案内を表示する");
assert.equal(empty.el("tarot-status").textContent, "心を落ち着けて、今日の一枚を引いてみよう。");
empty.el("tarot-open").listeners.click();
assert.equal(empty.el("tarot-image").src, undefined, "開いても、引く前は画像をダウンロードしない");
console.log("Tarot UI: disabled entry, all 156 readings (currentYou/cardMessage/action, short message kept as fallback)/artwork mappings, image loading only while open, loading/fallback, status, pre-draw state and first-draw animation (once, 3s, deferred date/storage, GIF fallback, resume after background, reduced motion): PASS");
