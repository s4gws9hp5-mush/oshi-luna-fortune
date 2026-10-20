// 推しルナ占いのデータとロジックの検証
// 実行: node tests/check.js
"use strict";
require("../js/data.js");
const { diagnoseType, isValidAnswers, diagnoseAxes, isValidAxisAnswers } = require("../js/fortune.js");
const assert = require("assert");

const D = globalThis.OshiLunaData;
const BANNED = ["当選", "当たる", "良席", "神席", "必ず", "絶対", "恋愛", "両想い", "結ばれ", "運命", "接触", "認知", "好かれ"];
const noBanned = (t, where) => BANNED.forEach((w) => assert.ok(!t.includes(w), "「" + w + "」を含む " + where));
const nonEmpty = (t, where) => assert.ok(typeof t === "string" && t.trim().length > 0, "空欄 " + where);

// ---- 推し活タイプ：8タイプすべてに9項目がそろっている ----
const TYPE_KEYS = D.TYPE_ORDER;
assert.strictEqual(TYPE_KEYS.length, 8, "タイプは8種類");
assert.deepStrictEqual(Object.keys(D.TYPES).sort(), TYPE_KEYS.slice().sort(), "TYPE_ORDER と TYPES が一致しない");
const fs = require("fs"), path = require("path");
const seenTexts = new Map();
const unique = (t, where) => { assert.ok(!seenTexts.has(t), "文章の使い回し " + where + " = " + seenTexts.get(t)); seenTexts.set(t, where); };
const names = new Set();
for (const k of TYPE_KEYS) {
  const t = D.TYPES[k];
  ["name", "emoji", "catch", "personality", "smallAction"].forEach((f) => nonEmpty(t[f], k + "." + f));
  assert.match(t.color, /^#[0-9a-f]{6}$/i, "色コード " + k);
  assert.ok(!names.has(t.name), "タイプ名の重複 " + t.name); names.add(t.name);
  [["strengths", 3], ["pitfalls", 2], ["tips", 3]].forEach(([f, min]) => {
    assert.ok(Array.isArray(t[f]) && t[f].length >= min, k + "." + f + " が足りない");
    t[f].forEach((x, i) => { nonEmpty(x, k + "." + f + i); noBanned(x, k + "." + f + i); });
  });
  assert.strictEqual(t.match.types.length, 2, "相性タイプは2つ " + k);
  t.match.types.forEach((m) => assert.ok(D.TYPES[m] && m !== k, "相性タイプが不正 " + k + "→" + m));
  // 相性の説明文に、相性タイプの名前が入っている（別タイプの説明を書き間違えていない）
  t.match.types.forEach((m) => assert.ok(t.match.text.includes(D.TYPES[m].name), "相性の説明に " + D.TYPES[m].name + " がない（" + k + "）"));
  nonEmpty(t.omamori.charm, k + ".omamori.charm"); nonEmpty(t.omamori.message, k + ".omamori.message");
  assert.ok(t.daily.actions.length >= 5 && t.daily.messages.length >= 5, "今日の占い用の文章が足りない " + k);
  assert.ok(Array.isArray(t.daily.charms) && t.daily.charms.length >= 1, "毎日のお守りの言葉がない " + k);
  t.daily.charms.forEach((x, i) => { nonEmpty(x, k + ".daily.charms" + i); noBanned(x, k + ".daily.charms" + i); unique(x, k + ".charms" + i); });
  [t.catch, t.personality, t.smallAction, t.omamori.charm, t.omamori.message, t.match.text]
    .concat(t.daily.messages).forEach((x, i) => { noBanned(x, k + "#" + i); unique(x, k + "#" + i); });
  t.daily.actions.forEach((x, i) => { nonEmpty(x, k + ".daily.actions" + i); noBanned(x, k + ".daily.actions" + i); });
  assert.strictEqual(new Set(t.daily.actions).size, t.daily.actions.length, "アクションの重複 " + k);
}
assert.ok(fs.existsSync(path.join(__dirname, "..", "images", "luna-cat.png")), "images/luna-cat.png（白猫のマスコット）がない");
// タイプごとの白猫：全タイプに別々の画像があり、正方形（表示で縦横比が崩れない）
const pngSize = (file) => { const b = fs.readFileSync(file); assert.strictEqual(b.toString("ascii", 1, 4), "PNG", file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const typeImages = new Set();
for (const k of TYPE_KEYS) {
  const img = D.TYPES[k].image;
  assert.match(img, /^images\/types\/[a-z-]+\.png$/, "画像のパス " + k);
  assert.ok(!typeImages.has(img), "画像の使い回し " + k + " " + img); typeImages.add(img);
  const file = path.join(__dirname, "..", img);
  assert.ok(fs.existsSync(file), img + " がない");
  const [w, h] = pngSize(file);
  assert.strictEqual(w, h, img + " が正方形でない");
}

// シェア画像「推し活タイプ取扱説明書」用の短い紹介：全タイプにあり、短く、使い回しがない
for (const k of TYPE_KEYS) {
  const c = D.TYPES[k].card;
  assert.ok(c, "card がない " + k);
  ["traits", "care", "friend"].forEach((f) => {
    nonEmpty(c[f], k + ".card." + f); noBanned(c[f], k + ".card." + f);
    assert.ok(c[f].length <= 34, "シェア画像の文章が長すぎる " + k + "." + f + " (" + c[f].length + "文字)");
    unique(c[f], k + ".card." + f);
  });
}

// ホーム画面への追加（PWA）：マニフェストとアイコン、Service Worker
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.webmanifest"), "utf8"));
assert.strictEqual(manifest.name, "推しルナ占い"); assert.strictEqual(manifest.short_name, "推しルナ占い");
assert.strictEqual(manifest.start_url, "./"); assert.strictEqual(manifest.scope, "./"); assert.strictEqual(manifest.display, "standalone");
assert.ok(manifest.icons.some((i) => i.sizes === "192x192") && manifest.icons.some((i) => i.sizes === "512x512") && manifest.icons.some((i) => i.purpose === "maskable"));
manifest.icons.forEach((i) => {
  const [w, h] = pngSize(path.join(__dirname, "..", i.src));
  assert.strictEqual(w + "x" + h, i.sizes, "アイコンの大きさ " + i.src);
});
const sw = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
(sw.match(/"(?:\.\/|[a-z][^"]*\.(?:html|css|js|png))"/g) || []).map((x) => x.slice(1, -1)).filter((f) => f !== "./")
  .forEach((f) => assert.ok(fs.existsSync(path.join(__dirname, "..", f)), "sw.js の CORE にあるファイルがない " + f));

// ---- 質問：10問×4択、各タイプが main・sub ともに同じ回数だけ登場する（偏りのない配点） ----
assert.ok(D.QUESTIONS.length >= 8 && D.QUESTIONS.length <= 12, "質問は8〜12問");
const mainCount = {}, subCount = {};
D.QUESTIONS.forEach((q, qi) => {
  nonEmpty(q.text, "Q" + (qi + 1)); noBanned(q.text, "Q" + (qi + 1));
  assert.strictEqual(q.options.length, 4, "Q" + (qi + 1) + " は4択");
  q.options.forEach((o, oi) => {
    nonEmpty(o.label, "Q" + (qi + 1) + "-" + oi);
    assert.ok(D.TYPES[o.main] && D.TYPES[o.sub] && o.main !== o.sub, "配点が不正 Q" + (qi + 1) + "-" + oi);
    mainCount[o.main] = (mainCount[o.main] || 0) + 1; subCount[o.sub] = (subCount[o.sub] || 0) + 1;
  });
});
TYPE_KEYS.forEach((k) => {
  assert.strictEqual(mainCount[k], mainCount[TYPE_KEYS[0]], "main の回数が偏っている " + k);
  assert.strictEqual(subCount[k], subCount[TYPE_KEYS[0]], "sub の回数が偏っている " + k);
});

// ---- 判定：全組み合わせで必ずどれか1タイプになり、全タイプに到達でき、極端に偏らない ----
const N = Math.pow(4, D.QUESTIONS.length);
const dist = {};
let fingerprint = 2166136261;
for (let i = 0; i < N; i++) {
  const ans = []; let x = i;
  for (let q = 0; q < D.QUESTIONS.length; q++) { ans.push(x & 3); x >>= 2; }
  const r = diagnoseType(ans);
  dist[r.type] = (dist[r.type] || 0) + 1;
  for (const ch of r.type + r.sub) { fingerprint ^= ch.charCodeAt(0); fingerprint = Math.imul(fingerprint, 16777619); }
  if (i % 9973 === 0) {
    // 同じ回答なら何度判定しても同じ（日付や乱数を使っていない）
    assert.deepStrictEqual(diagnoseType(ans.slice()), r);
    assert.ok(D.TYPES[r.sub] && r.sub !== r.type, "サブタイプが不正");
  }
}
TYPE_KEYS.forEach((k) => {
  const share = dist[k] / N;
  assert.ok(share > 0.08 && share < 0.18, "タイプの出やすさが偏っている " + k + " " + (share * 100).toFixed(1) + "%");
});
// 典型的な回答 → 期待どおりのタイプ（いちばん「らしい」選択肢を選び続けたとき）
const pickMain = (k) => D.QUESTIONS.map((q) => { const i = q.options.findIndex((o) => o.main === k); return i >= 0 ? i : q.options.findIndex((o) => o.sub === k) >= 0 ? q.options.findIndex((o) => o.sub === k) : 0; });
TYPE_KEYS.forEach((k) => assert.strictEqual(diagnoseType(pickMain(k)).type, k, "典型的な回答で " + k + " にならない"));
// 同点の決め方：合計点 → main の回数 → main に選ばれた質問の早さ
assert.strictEqual(D.QUESTIONS[0].options[0].main, "solo");
// 不正な回答は受け付けない
assert.ok(!isValidAnswers([0, 1, 2]) && !isValidAnswers(new Array(D.QUESTIONS.length).fill(4)) && isValidAnswers(new Array(D.QUESTIONS.length).fill(0)));
assert.throws(() => diagnoseType([0, 1]));

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
[D.DAILY.messages, D.LUCKY_COLORS, D.LUCKY_ITEMS, D.LUCKY_TIMES, Object.values(D.ACTIONS).flat()].concat(D.DAILY.luck.filter(Boolean))
  .forEach((list) => assert.strictEqual(new Set(list).size, list.length, "毎日の占いの候補に重複があります " + list[0]));
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
  // 前の日と同じ内容が続かない（★の数だけは続くことがある）
  if (prev) {
    assert.notStrictEqual(d.luck.text, prev.luck.text, "運勢文が前の日と同じ " + d.date);
    ["color", "item", "time"].forEach((f) => assert.notStrictEqual(d.lucky[f], prev.lucky[f], "ラッキー" + f + "が前の日と同じ " + d.date));
    assert.notStrictEqual(d.message, prev.message, "メッセージが前の日と同じ " + d.date);
    assert.ok(d.actions.every((a) => !prev.actions.includes(a)), "ラッキーアクションが前の日と重なる " + d.date);
  }
  seenOmamori.add(d.omamori); seenLuck.add(d.luck.text);
  prev = d;
}
assert.strictEqual(seenOmamori.size, D.DAILY.omamori.length, "出てこないお守りメッセージがあります");
assert.strictEqual(seenLuck.size, dailyTexts.length - D.DAILY.omamori.length, "出てこない運勢文があります");

// タイプに合わせた今日の占い：運勢・ラッキー・お守りは全員共通（タイプで不公平にならない）、
// メッセージとラッキーアクションだけがタイプ別。メッセージは文章の数だけ連続した日で重複しない
D.DAILY.messages.forEach((t) => noBanned(t, "DAILY.messages"));
const recentByType = {};
for (let i = 0; i < DAYS; i++) {
  const t = new Date(JST("2026-01-01T12:00:00").getTime() + i * 86400000);
  const base = getDailyFortune(t);
  assert.ok(D.DAILY.messages.includes(base.message) && base.typeKey === null, "未診断のメッセージ " + base.date);
  for (const k of TYPE_KEYS) {
    const d = getDailyFortune(t, k);
    assert.strictEqual(d.typeKey, k);
    assert.deepStrictEqual([d.luck, d.lucky, d.omamori, d.date], [base.luck, base.lucky, base.omamori, base.date], "タイプで運勢が変わっている " + k + " " + d.date);
    assert.ok(d.actions.length === 2 && d.actions.every((x) => D.TYPES[k].daily.actions.includes(x)) && d.actions[0] !== d.actions[1], "タイプ別アクション " + k);
    assert.ok(D.TYPES[k].daily.messages.includes(d.message), "タイプ別メッセージ " + k);
    const r = (recentByType[k] = recentByType[k] || []);
    assert.ok(!r.includes(d.message), "メッセージが連続した日で重複 " + k + " " + d.date);
    r.push(d.message); if (r.length >= D.TYPES[k].daily.messages.length) r.shift();
    assert.deepStrictEqual(getDailyFortune(t, k), d, "同じ日・同じタイプなら同じ結果");
    const charms = [D.TYPES[k].omamori.charm].concat(D.TYPES[k].daily.charms);
    assert.ok(charms.includes(d.typeOmamori), "タイプのお守りの言葉 " + k);
    const y = i > 0 && getDailyFortune(new Date(t.getTime() - 86400000), k);
    if (y) {
      assert.notStrictEqual(d.message, y.message, "タイプ別メッセージが前の日と同じ " + k + " " + d.date);
      assert.notStrictEqual(d.typeOmamori, y.typeOmamori, "タイプのお守りの言葉が前の日と同じ " + k + " " + d.date);
      assert.ok(d.actions.every((a) => !y.actions.includes(a)), "タイプ別アクションが前の日と重なる " + k + " " + d.date);
    }
  }
}
assert.strictEqual(getDailyFortune(JST("2026-10-18T12:00:00"), "unknown-type").typeKey, null, "知らないタイプは未診断扱い");

// ---- ブラウザごとのID（userId）で、一人ひとり違う今日の運勢 ----
const crypto = require("crypto");
const IDS = Array.from({ length: 1000 }, () => crypto.randomBytes(16).toString("hex"));
const DAY0 = JST("2026-10-20T12:00:00");
const at = (i) => new Date(DAY0.getTime() + i * 86400000);
const baseOf = (d) => JSON.stringify([d.date, d.luck, d.lucky, d.omamori]);
// 1. 同じID・同じ日付（朝と夜・何度計算しても）なら全項目が同じ
IDS.slice(0, 50).forEach((id) => {
  const a = getDailyFortune(JST("2026-10-20T00:00:00"), null, id);
  assert.deepStrictEqual(getDailyFortune(JST("2026-10-20T23:59:59"), null, id), a, "同じID・同じ日は同じ結果");
  assert.deepStrictEqual(getDailyFortune(JST("2026-10-20T12:00:00"), null, id), a, "同じID・同じ日は何度計算しても同じ");
  TYPE_KEYS.forEach((k) => assert.deepStrictEqual(getDailyFortune(JST("2026-10-20T08:00:00"), k, id), getDailyFortune(JST("2026-10-20T21:00:00"), k, id), "同じID・同じタイプ・同じ日は同じ " + k));
});
// 2. 同じ日でもIDがちがえば個人差がある（1000人で統計的に確かめる）
const sameDay = IDS.map((id) => getDailyFortune(DAY0, null, id));
const kinds = (f) => new Set(sameDay.map(f)).size;
assert.strictEqual(kinds((d) => d.luck.stars), 5, "★が人によって分かれない");
assert.strictEqual(kinds((d) => d.lucky.color), D.LUCKY_COLORS.length, "ラッキーカラーが人によって分かれない");
assert.strictEqual(kinds((d) => d.lucky.item), D.LUCKY_ITEMS.length, "ラッキーアイテムが人によって分かれない");
assert.strictEqual(kinds((d) => d.lucky.time), D.LUCKY_TIMES.length, "ラッキータイムが人によって分かれない");
assert.strictEqual(kinds((d) => d.luck.text), dailyTexts.length - D.DAILY.omamori.length, "運勢文が人によって分かれない");
assert.ok(kinds((d) => d.omamori) >= 30 && kinds((d) => d.message) === D.DAILY.messages.length, "お守り・メッセージが人によって分かれない");
assert.ok(kinds(baseOf) >= 990, "全体の組み合わせがほとんど人によってちがう " + kinds(baseOf));
// どの候補もほぼ同じくらいの人に出る（特定の候補に偏らない）：期待値の半分〜2倍
[[D.LUCKY_COLORS, (d) => d.lucky.color], [D.LUCKY_ITEMS, (d) => d.lucky.item], [D.LUCKY_TIMES, (d) => d.lucky.time]].forEach(([list, f]) => {
  const c = {}; sameDay.forEach((d) => { c[f(d)] = (c[f(d)] || 0) + 1; });
  list.forEach((x) => assert.ok(c[x] > 500 / list.length && c[x] < 2000 / list.length, "候補の出かたが偏っている " + x + " " + c[x]));
});
// 2人のIDを比べると、ほとんどの項目がちがう（偶然の一致はあってよい）
let pairSame = 0;
for (let i = 0; i < 500; i++) { const a = sameDay[i], b = sameDay[i + 500]; if (a.lucky.color === b.lucky.color && a.lucky.item === b.lucky.item && a.luck.text === b.luck.text) pairSame++; }
assert.ok(pairSame <= 3, "別の人なのに運勢文・カラー・アイテムがそろって同じことが多い " + pairSame);
// ★の出現率は今までと同じ（1:6% 2:16% 3:30% 4:32% 5:16%）。1人を1年続けて見ても偏りすぎない
const starCount = [0, 0, 0, 0, 0, 0]; let sameStar = 0, pairs = 0;
IDS.slice(0, 200).forEach((id) => {
  let prev = null, five = 0;
  for (let i = 0; i < 365; i++) {
    const d = getDailyFortune(at(i), null, id);
    starCount[d.luck.stars]++; if (d.luck.stars === 5) five++;
    // 3. 日付を進めると新しい日付の運勢
    assert.strictEqual(d.date, jstDateKey(at(i)), "日付が進まない");
    // 4. 同じ人の連日：★以外は前の日と同じにならない
    if (prev) {
      pairs++; if (prev.luck.stars === d.luck.stars) sameStar++;
      assert.notStrictEqual(d.luck.text, prev.luck.text, "運勢文が前の日と同じ " + id + " " + d.date);
      ["color", "item", "time"].forEach((f) => assert.notStrictEqual(d.lucky[f], prev.lucky[f], "ラッキー" + f + "が前の日と同じ " + id + " " + d.date));
      assert.notStrictEqual(d.message, prev.message, "メッセージが前の日と同じ " + id);
      assert.notStrictEqual(d.omamori, prev.omamori, "お守りが前の日と同じ " + id);
      assert.ok(d.actions.every((x) => !prev.actions.includes(x)), "開運アクションが前の日と重なる " + id + " " + d.date);
    }
    prev = d;
  }
  assert.ok(five / 365 > 0.06 && five / 365 < 0.28, "1人の★5の割合が偏っている " + id + " " + five);
});
const total = 200 * 365;
[[1, 0.06], [2, 0.16], [3, 0.30], [4, 0.32], [5, 0.16]].forEach(([s, p]) => assert.ok(Math.abs(starCount[s] / total - p) < 0.01, "★" + s + "の出現率が仕様とちがう " + (starCount[s] / total)));
assert.ok(sameStar / pairs < 0.3, "前の日と同じ★が多すぎる " + sameStar / pairs);
// 5・6. 同じID・同じ日なら、タイプを変えても基本運勢は同じ。タイプ別の部分はタイプに合わせる
IDS.slice(0, 100).forEach((id) => {
  for (let i = 0; i < 20; i++) {
    const base = getDailyFortune(at(i), null, id);
    TYPE_KEYS.forEach((k) => {
      const d = getDailyFortune(at(i), k, id), t = D.TYPES[k];
      assert.strictEqual(baseOf(d), baseOf(base), "タイプで基本運勢が変わる " + k + " " + id);
      assert.ok(t.daily.messages.includes(d.message) && d.actions.length === 2 && d.actions.every((x) => t.daily.actions.includes(x)) && d.actions[0] !== d.actions[1] &&
        [t.omamori.charm].concat(t.daily.charms).includes(d.typeOmamori) && d.typeKey === k, "タイプ別の内容 " + k);
      if (i) {
        const y = getDailyFortune(at(i - 1), k, id);
        assert.ok(d.message !== y.message && d.typeOmamori !== y.typeOmamori && d.actions.every((x) => !y.actions.includes(x)), "タイプ別の内容が前の日と同じ " + k + " " + id);
      }
    });
  }
});
// 同じタイプでも、人によってタイプ別の内容がちがう
TYPE_KEYS.forEach((k) => assert.ok(new Set(IDS.slice(0, 200).map((id) => getDailyFortune(DAY0, k, id).message)).size === D.TYPES[k].daily.messages.length, "同じタイプで人によってメッセージが分かれない " + k));
// 10. 日本時間の0時で切り替わる（UTC 14:59:59 と 15:00:00 の境目）
IDS.slice(0, 20).forEach((id) => {
  const before = getDailyFortune(new Date("2026-10-20T14:59:59Z"), null, id), after = getDailyFortune(new Date("2026-10-20T15:00:00Z"), null, id);
  assert.ok(before.date === "2026-10-20" && after.date === "2026-10-21" && baseOf(before) !== baseOf(after), "日本時間0時で切り替わらない");
});
// ID がなければ今までどおり全員共通（保存できない環境の動き）
assert.deepStrictEqual(getDailyFortune(DAY0, "cheer", null), getDailyFortune(DAY0, "cheer"), "IDなしは全員共通");

// ---- 8タイプの判定が変わっていないこと（全1048576通りのタイプとサブの並びの指紋。サブタイプコードを足す前と同じ） ----
assert.strictEqual((fingerprint >>> 0).toString(16), "fcb7705", "8タイプの判定結果が変わっています");
assert.throws(() => diagnoseType(new Array(D.QUESTIONS.length + D.AXIS_QUESTIONS.length).fill(0)), "8タイプの判定に14問ぶんの答えを渡せてしまう");

// ---- サブタイプコード（4つの軸） ----
assert.strictEqual(D.AXES.length, 4);
assert.strictEqual(D.AXIS_QUESTIONS.length, D.AXES.length);
const axisLetters = new Set();
D.AXES.forEach((axis, i) => {
  assert.strictEqual(axis.letters.length, 2);
  axis.letters.forEach((l) => { assert.ok(/^[A-Z]$/.test(l) && l !== "X" && !axisLetters.has(l), "軸の文字 " + l); axisLetters.add(l); });
  axis.letters.concat("X").forEach((l) => { nonEmpty(axis.texts[l], axis.key + ".texts." + l); noBanned(axis.texts[l], axis.key + "." + l); });
  axis.letters.forEach((l) => nonEmpty(axis.labels[l], axis.key + ".labels." + l));
  nonEmpty(axis.name, axis.key + ".name");
  const q = D.AXIS_QUESTIONS[i];
  assert.strictEqual(q.axis, axis.key, "追加の質問の順番が軸とちがう " + i);
  nonEmpty(q.text, "AXIS_QUESTIONS" + i); noBanned(q.text, "AXIS_QUESTIONS" + i);
  assert.strictEqual(q.options.length, 4, "追加の質問は4択 " + i);
  axis.letters.forEach((l) => {
    const opts = q.options.filter((o) => o.pole === l);
    assert.strictEqual(opts.length, 2, "追加の質問の選択肢はそれぞれの側に2つずつ " + axis.key + l);
    assert.ok(opts.some((o) => o.points === 4), "追加の質問のそれぞれの側に4点の選択肢がある " + axis.key + l);
  });
  q.options.forEach((o, j) => { nonEmpty(o.label, "AXIS_QUESTIONS" + i + "." + j); noBanned(o.label, "AXIS_QUESTIONS" + i + "." + j);
    assert.ok(o.points === 2 || o.points === 4, "追加の質問の点数は2か4"); assert.ok(!("main" in o) && !("sub" in o), "追加の質問は8タイプに点を入れない"); });
  assert.strictEqual(new Set(q.options.map((o) => o.label)).size, 4);
});
// 既存の10問と4軸の関係：番号・軸・文字・点数（1か2）が正しく、同じ選択肢を同じ軸で2回数えない
assert.strictEqual(D.AXIS_TAGS.length, D.QUESTIONS.length);
D.AXIS_TAGS.forEach((options, q) => {
  assert.strictEqual(options.length, D.QUESTIONS[q].options.length, "選択肢の数 Q" + (q + 1));
  options.forEach((tags, o) => {
    const seen = new Set();
    tags.forEach(([key, l, pts]) => {
      const axis = D.AXES.find((a) => a.key === key);
      assert.ok(axis && axis.letters.includes(l) && (pts === 1 || pts === 2), "関係の指定が不正 Q" + (q + 1) + "-" + o);
      assert.ok(!seen.has(key), "同じ選択肢を同じ軸で2回数えている Q" + (q + 1) + "-" + o); seen.add(key);
    });
  });
});
assert.ok(!isValidAxisAnswers([0, 0, 0]) && !isValidAxisAnswers([0, 0, 0, 4]) && !isValidAxisAnswers(null) && isValidAxisAnswers([3, 2, 1, 0]));
assert.throws(() => diagnoseAxes(null, [0, 0, 0]));

// 判定の決まりを、テストの中で別に計算して照らし合わせる
const R = D.AXIS_RULES;
const tagsOf = (q) => q < D.QUESTIONS.length ? D.AXIS_TAGS[q] : D.AXIS_QUESTIONS[q - D.QUESTIONS.length].options.map((o) => [[D.AXIS_QUESTIONS[q - D.QUESTIONS.length].axis, o.pole, o.points]]);
function expectAxis(axis, picks) { // picks: { 質問の番号（0〜13）: 選んだ選択肢 }
  const got = [0, 0], base = [0, 0];
  Object.keys(picks).forEach((q) => tagsOf(+q).forEach((tags, o) => tags.forEach(([key, l, pts]) => {
    if (key !== axis.key) return; const side = l === axis.letters[0] ? 0 : 1;
    base[side] += pts / 4; if (o === picks[q]) got[side] += pts;
  })));
  const left = got[0] / base[0], right = got[1] / base[1];
  const percent = Math.round((left + R.smoothing) / (left + right + R.smoothing * 2) * 100);
  const lean = Math.max(percent, 100 - percent);
  return { percent, letter: lean <= R.balance ? "X" : percent > 50 ? axis.letters[0] : axis.letters[1], strength: lean <= R.balance ? "balance" : lean < R.clear ? "slight" : "clear" };
}
// 軸ごとに、関係する質問の全組み合わせで確かめる（関係しない質問の答えは結果に影響しない）
const axisSummary = D.AXES.map((axis, k) => {
  const qs = []; for (let q = 0; q < D.QUESTIONS.length; q++) if (D.AXIS_TAGS[q].some((t) => t.some((g) => g[0] === axis.key))) qs.push(q);
  const n = Math.pow(4, qs.length + 1), cnt = { X: 0, [axis.letters[0]]: 0, [axis.letters[1]]: 0 };
  let lo = 100, hi = 0;
  for (let i = 0; i < n; i++) {
    const main = new Array(D.QUESTIONS.length).fill(i % 4); const ax = [0, 0, 0, 0]; let x = i;
    ax[k] = x & 3; x >>= 2;
    qs.forEach((q) => { main[q] = x & 3; x >>= 2; });
    const picks = { [D.QUESTIONS.length + k]: ax[k] }; qs.forEach((q) => { picks[q] = main[q]; });
    const r = diagnoseAxes(main, ax).axes[k], e = expectAxis(axis, picks);
    assert.deepStrictEqual([r.percent, r.letter, r.strength], [e.percent, e.letter, e.strength], "判定が決まりどおりでない " + axis.key + " " + JSON.stringify(picks));
    assert.ok(Number.isInteger(r.percent) && r.percent > 0 && r.percent < 100, "割合が範囲外 " + r.percent);
    lo = Math.min(lo, r.percent); hi = Math.max(hi, r.percent); cnt[r.letter]++;
    if (i % 997 === 0) {
      // 関係しない質問の答えを変えても、この軸の結果は変わらない
      const other = main.map((v, q) => qs.includes(q) ? v : (v + 1) % 4);
      assert.deepStrictEqual(diagnoseAxes(other, ax).axes[k], r, "関係しない質問で結果が変わる " + axis.key);
      // 片側の点がいちばん高い選択肢に変えると、その側の割合は下がらない（逆の側も同じ）
      qs.concat([D.QUESTIONS.length + k]).forEach((q) => [0, 1].forEach((side) => {
        let best = -1, bestPts = -1;
        tagsOf(q).forEach((tags, o) => { const t = tags.find((g) => g[0] === axis.key); const v = t ? (t[1] === axis.letters[side] ? t[2] : -t[2]) : 0; if (v > bestPts) { bestPts = v; best = o; } });
        const m2 = main.slice(), a2 = ax.slice();
        if (q < D.QUESTIONS.length) m2[q] = best; else a2[k] = best;
        const p2 = diagnoseAxes(m2, a2).axes[k].percent;
        assert.ok(side === 0 ? p2 >= r.percent : p2 <= r.percent, "選択肢を変えると逆向きに動く " + axis.key + " Q" + (q + 1));
      }));
    }
  }
  // どの選択肢も同じ確率で選ばれたとき、左右の割合の差は5ポイント以内、X は 20% 未満
  const s0 = cnt[axis.letters[0]] / n, s1 = cnt[axis.letters[1]] / n, sx = cnt.X / n;
  assert.ok(Math.abs(s0 - s1) <= 0.05, "片方の文字が有利 " + axis.key + " " + s0 + " " + s1);
  assert.ok(sx < 0.2, "バランス型が多すぎる " + axis.key + " " + sx);
  assert.ok(lo >= 5 && hi <= 95, "割合が極端 " + lo + "〜" + hi);
  return axis.letters[0] + " " + (s0 * 100).toFixed(1) + "%/" + axis.letters[1] + " " + (s1 * 100).toFixed(1) + "% X " + (sx * 100).toFixed(1) + "%（" + lo + "〜" + hi + "%）";
});
// 同じ答えなら同じ結果・答えの配列を書きかえない
{
  const main = [1, 0, 0, 0, 0, 0, 0, 1, 0, 1], ax = [0, 2, 1, 3], copy = JSON.stringify([main, ax]);
  assert.deepStrictEqual(diagnoseAxes(main, ax), diagnoseAxes(main.slice(), ax.slice()));
  assert.strictEqual(JSON.stringify([main, ax]), copy);
  assert.strictEqual(diagnoseAxes(main, ax).code, "EHIP");
}
// 既存の10問の答えがない（古い保存データ）：追加の4問だけで決まり、X にはならない
for (let i = 0; i < 256; i++) {
  const ax = [i & 3, (i >> 2) & 3, (i >> 4) & 3, (i >> 6) & 3];
  const r = diagnoseAxes(null, ax);
  assert.ok(!r.reused && r.axes.every((a) => a.letter !== "X" && a.strength === "clear"), "古いデータの判定 " + ax);
  assert.deepStrictEqual(diagnoseAxes([0, 0], ax), r, "答えの数がちがう古いデータも同じ扱い");
}
assert.strictEqual(diagnoseAxes(null, [0, 0, 0, 0]).code, "EFIS");
assert.strictEqual(diagnoseAxes(null, [3, 3, 3, 3]).code, "WHAP");

// ---- 検索エンジン向け：sitemap.xml と robots.txt ----
const SITE = "https://oshi-luna.com/";
const sitemap = fs.readFileSync(path.join(__dirname, "..", "sitemap.xml"), "utf8");
assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/, "sitemap.xml の先頭");
assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">[\s\S]*<\/urlset>\s*$/, "sitemap.xml の urlset");
const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
assert.ok(locs.length >= 1 && (sitemap.match(/<url>/g) || []).length === locs.length, "sitemap.xml の url");
locs.forEach((u) => {
  // 公開しているページだけ：サイトのアドレスで始まり、?・# のつく一時的な表示（お試し表示・診断結果など）は入れない
  assert.ok(u.startsWith(SITE) && !/[?#]/.test(u), "sitemap.xml に入れないURL " + u);
  const file = u === SITE ? "index.html" : u.slice(SITE.length);
  assert.ok(fs.existsSync(path.join(__dirname, "..", file)), "sitemap.xml のページが存在しない " + u);
});
[...sitemap.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].forEach((m) => assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/, "lastmod の形式"));
const robots = fs.readFileSync(path.join(__dirname, "..", "robots.txt"), "utf8");
assert.match(robots, /^User-agent: \*$/m, "robots.txt に User-agent: *");
assert.ok(!/^Disallow:\s*\/\s*$/m.test(robots), "robots.txt でサイト全体をブロックしている");
assert.match(robots, new RegExp("^Sitemap: " + SITE.replace(/[.]/g, "\\.") + "sitemap\\.xml$", "m"), "robots.txt にサイトマップのURL");

// ---- アクセス解析：Google Analytics 4 の公式タグ（gtag.js）が、公開ページの <head> に1回だけある ----
const GA_ID = "G-GW3MQNMW58";
fs.readdirSync(path.join(__dirname, "..")).filter((f) => f.endsWith(".html")).forEach((f) => {
  const html = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  const count = (re) => (html.match(re) || []).length;
  assert.strictEqual(count(/googletagmanager\.com\/gtag\/js/g), 1, f + "：gtag.js の読み込みは1回だけ（二重計測しない）");
  assert.ok(head.includes('<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA_ID + '"></script>'), f + "：gtag.js は <head> で非同期に読み込む");
  assert.strictEqual(count(/gtag\('config',/g), 1, f + "：gtag('config') は1回だけ");
  assert.ok(head.includes("gtag('config', '" + GA_ID + "');"), f + "：測定ID");
  assert.ok(!/G-(?!GW3MQNMW58)[A-Z0-9]{6,}|UA-\d|GTM-/.test(html), f + "：ほかの測定ID・タグがない");
  assert.ok(Buffer.byteLength(html.slice(0, html.indexOf('<meta charset="utf-8">'))) < 1024, f + "：文字コードの指定は先頭1024バイト以内");
});

console.log("OK: タイプ " + TYPE_KEYS.length + "種・質問 " + D.QUESTIONS.length + "問 / 全" + N + "通りの回答で判定（" +
  TYPE_KEYS.map((k) => k + " " + (dist[k] / N * 100).toFixed(1) + "%").join("・") + "）");
console.log("OK: ブラウザごとのID 1000個で、同じ日の運勢が人ごとに分かれ（全体の組み合わせ " + kinds(baseOf) + "通り）、★の出現率は仕様どおり、前の日と同じ★は " + (sameStar / pairs * 100).toFixed(1) + "%");
console.log("OK: 8タイプの判定は変更なし（全通りの指紋が一致）／サブタイプコード " + axisSummary.join("・"));
console.log("OK: 色コード " + D.LUCKY_COLORS.length + "色・アイコン " + (D.LUCKY_ITEMS.length + D.LUCKY_TIMES.length) + "個 / 毎日の占い " + DAYS + "日分（お守り " + seenOmamori.size + "種・運勢文 " + seenLuck.size + "種）");
