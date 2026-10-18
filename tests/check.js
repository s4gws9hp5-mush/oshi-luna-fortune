// 全256通りの回答で、結果の各項目が欠けずに出るかを確認する
// 実行: node tests/check.js
"use strict";
require("../js/data.js");
const { getFortune } = require("../js/fortune.js");
const assert = require("assert");

const D = globalThis.OshiLunaData;
const date = new Date(2026, 9, 18);
const styles = new Set();
const insights = new Set();
let count = 0;

for (let a = 0; a < 4; a++)
  for (let b = 0; b < 4; b++)
    for (let c = 0; c < 4; c++)
      for (let d = 0; d < 4; d++) {
        const answers = [a, b, c, d];
        const f = getFortune(answers, date);
        assert.ok(f.style && f.style.title && f.style.text, "style " + answers);
        assert.ok(f.luck.stars >= 1 && f.luck.stars <= 5 && f.luck.text, "luck " + answers);
        assert.ok(typeof f.insight === "string" && f.insight, "insight " + answers);
        assert.strictEqual(f.actions.length, 2, "actions " + answers);
        assert.notStrictEqual(f.actions[0], f.actions[1], "actions distinct " + answers);
        assert.ok(f.lucky.color && f.lucky.item && f.lucky.time, "lucky " + answers);
        // お守りメッセージが、表示中の推し活スタイルのものであること
        assert.strictEqual(f.omamori, f.style.omamori, "omamori mismatch " + answers);
        D.OMAMORI_SECTIONS.forEach((sec) => assert.ok(f.omamori[sec.key], "omamori " + sec.key + " " + answers));
        // 同じ日・同じ回答なら同じ結果
        assert.deepStrictEqual(getFortune(answers, date), f, "deterministic " + answers);
        styles.add(f.style.title);
        insights.add(f.insight);
        count++;
      }

// お守りメッセージのデータ：全スタイル×全セクションがそろい、使い回しがなく、約束しすぎていない
const allTexts = new Map();
const BANNED = ["当選", "当たる", "良席", "神席", "必ず", "絶対", "恋愛", "両想い", "結ばれ", "運命", "接触", "認知"];
const LIMITS = { now: [60, 140], moon: [60, 140], charm: [15, 45], tomorrow: [20, 70] };
for (const p of Object.keys(D.STYLES)) {
  for (const s of Object.keys(D.STYLES[p])) {
    const om = D.STYLES[p][s].omamori;
    assert.ok(om, "omamori missing " + p + "/" + s);
    D.OMAMORI_SECTIONS.forEach((sec) => {
      const t = om[sec.key];
      const where = p + "/" + s + "." + sec.key;
      assert.ok(typeof t === "string" && t.trim(), "empty " + where);
      const [min, max] = LIMITS[sec.key];
      assert.ok(t.length >= min && t.length <= max, "length " + t.length + " " + where);
      BANNED.forEach((w) => assert.ok(!t.includes(w), "「" + w + "」を含む " + where));
      assert.ok(!allTexts.has(t), "同じ文章を使い回し " + where + " = " + allTexts.get(t));
      allTexts.set(t, where);
    });
  }
}

// ラッキーカラーの色コードとアイテム・時間帯のアイコン：すべての候補に対応し、余分なものがない
const sameKeys = (list, map, name) => {
  assert.deepStrictEqual(Object.keys(map).sort(), list.slice().sort(), name + " の対応表が候補と一致しません");
};
sameKeys(D.LUCKY_COLORS, D.LUCKY_COLOR_CODES, "LUCKY_COLOR_CODES");
sameKeys(D.LUCKY_ITEMS, D.LUCKY_ITEM_ICONS, "LUCKY_ITEM_ICONS");
sameKeys(D.LUCKY_TIMES, D.LUCKY_TIME_ICONS, "LUCKY_TIME_ICONS");
Object.entries(D.LUCKY_LINE_BREAKS).forEach(([name, shown]) => {
  assert.ok(D.LUCKY_COLORS.includes(name) || D.LUCKY_ITEMS.includes(name) || D.LUCKY_TIMES.includes(name), "改行位置の対象が候補にない " + name);
  assert.strictEqual(shown.split("|").join(""), name, "改行位置の指定で名前が変わっている " + name);
});
Object.entries(D.LUCKY_COLOR_CODES).forEach(([name, code]) => assert.match(code, /^#[0-9a-f]{6}$/i, "色コード " + name));

// 毎日の推し活占い
const { getDailyFortune, jstDateKey, msUntilNextJstDay } = require("../js/fortune.js");
const JST = (iso) => new Date(iso + "+09:00");
// 日本時間の0時ちょうどで日付が切り替わる（端末のタイムゾーンに関係ない）
assert.strictEqual(jstDateKey(JST("2026-10-18T23:59:59.999")), "2026-10-18");
assert.strictEqual(jstDateKey(JST("2026-10-19T00:00:00")), "2026-10-19");
assert.strictEqual(jstDateKey(new Date("2026-10-18T15:00:00Z")), "2026-10-19", "UTC 15時 = 日本時間 0時");
assert.strictEqual(jstDateKey(JST("2026-12-31T23:59:59")), "2026-12-31");
assert.strictEqual(jstDateKey(JST("2027-01-01T00:00:00")), "2027-01-01");
assert.strictEqual(msUntilNextJstDay(JST("2026-10-18T23:59:59")), 1000);
// 同じ日なら朝でも夜でも同じ結果、翌日は別の結果
assert.deepStrictEqual(getDailyFortune(JST("2026-10-18T00:00:00")), getDailyFortune(JST("2026-10-18T23:59:59")), "同じ日は同じ結果");
assert.notDeepStrictEqual(getDailyFortune(JST("2026-10-18T23:59:59")), getDailyFortune(JST("2026-10-19T00:00:00")), "翌日は別の結果");

const dailyTexts = [].concat(D.DAILY.omamori, ...D.DAILY.luck.filter(Boolean));
dailyTexts.forEach((t) => BANNED.forEach((w) => assert.ok(!t.includes(w), "毎日の占いに「" + w + "」 " + t)));
assert.strictEqual(new Set(D.DAILY.omamori).size, D.DAILY.omamori.length, "毎日のお守りに重複があります");

const seenOmamori = new Set(), seenLuck = new Set();
let prev = null, recent = [];
const DAYS = 800;
for (let i = 0; i < DAYS; i++) {
  const d = getDailyFortune(new Date(JST("2026-01-01T12:00:00").getTime() + i * 86400000));
  assert.ok(d.luck.stars >= 1 && d.luck.stars <= 5 && d.luck.title && d.luck.text, "daily luck " + d.date);
  assert.ok(D.DAILY.luck[d.luck.stars].includes(d.luck.text), "★の数と運勢文が一致しない " + d.date);
  assert.strictEqual(d.actions.length, 2); assert.notStrictEqual(d.actions[0], d.actions[1]);
  assert.ok(D.LUCKY_COLOR_CODES[d.lucky.color] && D.LUCKY_ITEM_ICONS[d.lucky.item] && D.LUCKY_TIME_ICONS[d.lucky.time], "daily lucky " + d.date);
  assert.ok(d.omamori, "daily omamori " + d.date);
  assert.ok(!prev || prev.date !== d.date, "日付が進んでいない " + d.date);
  // お守りメッセージは、文章の数（31）と同じ日数のあいだ同じ文が出ない
  assert.ok(!recent.includes(d.omamori), "お守りが" + D.DAILY.omamori.length + "日以内に重複 " + d.date);
  recent.push(d.omamori); if (recent.length >= D.DAILY.omamori.length) recent.shift();
  seenOmamori.add(d.omamori); seenLuck.add(d.luck.text);
  prev = d;
}
assert.strictEqual(seenOmamori.size, D.DAILY.omamori.length, "出てこないお守りメッセージがあります");
assert.strictEqual(seenLuck.size, dailyTexts.length - D.DAILY.omamori.length, "出てこない運勢文があります");

const expectedStyles = Object.values(D.STYLES).reduce((n, row) => n + Object.keys(row).length, 0);
assert.strictEqual(styles.size, expectedStyles, "到達できない推し活スタイルがあります");
assert.strictEqual(insights.size, 16, "到達できない気づきがあります");

console.log("OK: " + count + "通りを確認 / スタイル " + styles.size + "種 / 気づき " + insights.size + "種 / お守りの文章 " + allTexts.size + "件");
console.log("OK: 色コード " + D.LUCKY_COLORS.length + "色・アイコン " + (D.LUCKY_ITEMS.length + D.LUCKY_TIMES.length) + "個 / 毎日の占い " + DAYS + "日分（お守り " + seenOmamori.size + "種・運勢文 " + seenLuck.size + "種）");
