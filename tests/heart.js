// ルナのこころ整理：データ・選択ルール・保存処理のテスト（Node.js だけで動く）
//   node tests/heart.js
// 仕様書 v0.1 の16章（Q2本文47件・選択順によらない本文・Q1変更でQ3/Q4だけリセット・最大2件と単独の選択肢・
// 13.11の選択順・期限補足・保存の成功／失敗の区別）を確かめる
"use strict";
const assert = require("assert");
const D = require("../js/heart-data.js");
const R = require("../js/heart-rules.js");
const S = require("../js/heart-storage.js");

// ---- データ ----
const pad = (n) => (n < 10 ? "0" : "") + n;
{
  const ids = Object.keys(D.q2Texts);
  const singles = [...Array(11)].map((_, i) => "S" + pad(i + 1));
  const pairs = [];
  for (let a = 1; a <= 9; a++) for (let b = a + 1; b <= 9; b++) pairs.push("P" + pad(a) + "-" + pad(b));
  assert.deepStrictEqual(ids.slice().sort(), singles.concat(pairs).sort(), "Q2本文：単独11件・1〜9の2件組合せ36件（10・11の組合せはない）");
  assert.strictEqual(ids.length, 47);
  ids.forEach((id) => assert.ok(D.q2Texts[id].length >= 2 && D.q2Texts[id].every((p) => p.length > 10), "本文 " + id));
  assert.deepStrictEqual(D.q1.options.map((o) => o.id), ["ticket", "travel", "money", "feeling", "social", "vague"]);
  assert.deepStrictEqual([D.q2.options.length, D.q2.max, D.q2.exclusive], [11, 2, [10, 11]]);
  assert.deepStrictEqual([D.q5.options.length, D.q5.max, D.q5.exclusive], [7, 2, [7]]);
  assert.deepStrictEqual([D.q6.options.length, D.q6.max, D.q6.exclusive], [6, 2, [6]]);
  const shape = Object.fromEntries(Object.entries(D.themes).map(([t, v]) => [t, [v.q3.options.length, v.q3.max, v.q3.exclusive, v.q4.options.length, v.q4.max, v.q4.exclusive]]));
  assert.deepStrictEqual(shape, {
    ticket: [6, 1, [], 7, 2, [7]], travel: [6, 1, [], 8, 2, [8]], money: [6, 1, [], 8, 2, [8]],
    feeling: [8, 2, [7, 8], 8, 2, [8]], social: [8, 2, [8], 8, 2, [6, 7, 8]], vague: [7, 2, [6, 7], 5, 1, []]
  }, "Q3・Q4 の選択肢の数・最大件数・単独の選択肢（5章）");
  // 小さな一歩：13.11 の36行（初回対象外1件を含む）＋休息文・共通文・期限専用文の本文がある
  const cand = Object.values(R.Q6_CANDIDATES).concat(Object.values(R.Q5_CANDIDATES)).map((c) => c[0]);
  assert.strictEqual(cand.length, 36, "通常候補36行");
  assert.strictEqual(new Set(cand).size, 36, "通常候補のIDは重複しない");
  cand.concat(["action-rest-high", "action-common-reflect", "action-deadline-reminder"]).forEach((id) => assert.ok(D.actions[id] && D.actions[id].length >= 2, "行動文 " + id));
  assert.strictEqual(Object.keys(D.actions).length, 39);
  assert.strictEqual(Object.values(R.Q5_CANDIDATES).filter((c) => c[1] === "off").map((c) => c[0]).join(), "action-work-personal-time", "初回対象外は1件");
  assert.ok(D.deadlineSupplement === "申込みや支払いなどの期限があるものは、その日時を確かめてから、いつ考えるか決めてね。");
  // 期限補足の対象（13.9 A は通常候補・共通文・Q2本文の16件、B は3件）
  assert.strictEqual(R.DEADLINE_A.length, 16); assert.deepStrictEqual(R.DEADLINE_B, ["action-rest-high", "action-deadline-reminder", "P02-08"]);
  R.DEADLINE_A.concat(R.DEADLINE_B).forEach((id) => assert.ok(D.actions[id] || D.q2Texts[id], "期限補足の対象のIDが本文にある " + id));
  // 文章の指紋：採用文がうっかり変わっていないか（文章を直したときは、仕様書と照合してからこの値も直す）
  const fp = require("crypto").createHash("sha256").update(JSON.stringify([D.q1, D.q2, D.themes, D.q5, D.q6, D.q7, D.q2Texts, D.supplementFeelingForgotten, D.deadlineSupplement, D.actions, D.ui])).digest("hex");
  assert.strictEqual(fp, "dc976502d4a3462b259f789fa3433f231bfe4dde7d6d825ee40c2dd3d1d07c6d", "文章の指紋（仕様書 v0.1 から取り出した採用文）");
  console.log("OK: データ（Q2本文47件・行動文39件・選択肢）／文章の指紋 " + fp.slice(0, 16));
}

// ---- 入力：最大件数・単独の選択肢・選択順 ----
{
  const all = [D.q1, D.q2, D.q5, D.q6].concat(...Object.values(D.themes).map((t) => [t.q3, t.q4]));
  all.forEach((def) => {
    def.options.forEach((o, i) => {
      // 1つずつ押していく：最大件数を超えない・単独の選択肢は単独・並びは番号順
      let cur = null;
      def.options.forEach((p) => { cur = R.toggle(def, cur, p.id); if (cur !== null) assert.ok(R.validSelection(def, cur), def.text + " " + JSON.stringify(cur)); });
      const one = R.toggle(def, null, o.id);
      assert.ok(R.validSelection(def, one), "1つ選べる " + o.id);
      if (def.max > 1 && def.exclusive.indexOf(i + 1) >= 0) {
        // 単独の選択肢を選ぶと、ほかは外れる。ほかを選ぶと単独の選択肢は外れる
        const other = def.options.find((p, j) => def.exclusive.indexOf(j + 1) < 0);
        assert.deepStrictEqual(R.toggle(def, [other.id], o.id), [o.id]);
        assert.deepStrictEqual(R.toggle(def, [o.id], other.id), [other.id]);
      }
    });
  });
  // Q2：逆順に選んでも同じ本文
  for (let a = 1; a <= 9; a++) for (let b = a + 1; b <= 9; b++) {
    const A = "q2-" + pad(a), B = "q2-" + pad(b);
    const ab = R.toggle(D.q2, R.toggle(D.q2, null, A), B), ba = R.toggle(D.q2, R.toggle(D.q2, null, B), A);
    assert.deepStrictEqual(ab, ba); assert.strictEqual(R.q2TextId(ab), "P" + pad(a) + "-" + pad(b));
  }
  assert.strictEqual(R.q2TextId(["q2-10"]), "S10"); assert.strictEqual(R.q2TextId(["q2-11"]), "S11");
  assert.strictEqual(R.q2TextId(["q2-01", "q2-10"]), null, "10・11 は単独のみ");
  // 3件目は追加しない
  assert.deepStrictEqual(R.toggle(D.q2, ["q2-01", "q2-02"], "q2-03"), ["q2-01", "q2-02"]);
  // Q1 を変えると Q3・Q4 だけ消える（Q2・Q5・Q6・Q7 は残る）
  const a = { q1: "ticket", q2: ["q2-01"], q3: "ticket-q3-01", q4: ["ticket-q4-01"], q5: ["q5-love"], q6: ["q6-pace"], q7: 4 };
  assert.deepStrictEqual(R.setTheme(a, "travel"), { q1: "travel", q2: ["q2-01"], q3: null, q4: null, q5: ["q5-love"], q6: ["q6-pace"], q7: 4 });
  assert.deepStrictEqual(R.setTheme(a, "ticket"), a, "同じテーマなら消さない");
  console.log("OK: 入力（最大2件・単独の選択肢・選択順によらない本文・Q1変更でQ3/Q4だけリセット）");
}

// ---- 13.11：全回答の組合せで、小さな一歩を確かめる ----
// 期待値は、実装（js/heart-rules.js）の候補表を使わず、仕様書13.11の表の文面と「表を読む前の選択順」から、このテストの中で作る。
// 下の表は仕様書13.11の「系統｜選択｜本文ID／13.2参照名｜全文Q7｜初回の状況条件」の5列を、文面のまま写したもの
const TABLE_13_11 = [
  ["Q6", "1", "action-q6-concern", "1〜7・未回答", "追加制限なし"],
  ["Q6", "2", "action-q6-emotion", "1〜7・未回答", "追加制限なし"],
  ["Q6", "3", "action-q6-values", "1〜7・未回答", "追加制限なし"],
  ["Q6", "4", "action-q6-calm", "1〜7・未回答", "socialのQ3に3、vagueのQ3に2、feelingのQ3に6のいずれかを含む"],
  ["Q6", "5", "action-q6-pace", "1〜3", "追加制限なし"],
  ["Q6", "1＋2", "action-q6-concern-emotion", "1〜3", "追加制限なし"],
  ["Q6", "1＋3", "action-q6-concern-values", "1〜3", "追加制限なし"],
  ["Q6", "1＋4", "action-q6-concern-calm", "1〜7・未回答", "追加制限なし。単独calmの3分岐は流用しない"],
  ["Q6", "1＋5", "action-q6-concern-pace", "1〜3", "追加制限なし"],
  ["Q6", "2＋3", "action-q6-emotion-values", "1〜3", "追加制限なし"],
  ["Q6", "2＋4", "action-q6-emotion-calm", "1〜7・未回答", "追加制限なし。単独calmの3分岐は流用しない"],
  ["Q6", "2＋5", "action-q6-emotion-pace", "1〜3", "追加制限なし"],
  ["Q6", "3＋4", "action-q6-values-calm", "1〜7・未回答", "追加制限なし。単独calmの3分岐は流用しない"],
  ["Q6", "3＋5", "action-q6-values-pace", "1〜3", "除外2状態以外は追加制限なし"],
  ["Q6", "4＋5", "action-q6-calm-pace", "1〜7・未回答", "追加制限なし"],
  ["Q5", "1", "暮らしの安心", "1〜7・未回答", "moneyのQ3=1のみ"],
  ["Q5", "2", "仕事・学校", "1〜3", "ticketのQ3=1・4・5、travelのQ3=1〜4、moneyのQ3=2"],
  ["Q5", "3", "睡眠・体力", "1〜3", "travelのQ3=3・4のみ"],
  ["Q5", "4", "家族や友達、自分のための時間", "1〜3", "追加制限なし"],
  ["Q5", "5", "推しへの好きという気持ち", "1〜7・未回答", "追加制限なし"],
  ["Q5", "6", "自分に合った推し活のペース", "1〜3", "除外2状態以外は追加制限なし"],
  ["Q5", "1＋2", "action-money-work-plan", "1〜3", "ticketのQ3=1・4・5、travelのQ3=1・2、moneyのQ3=2"],
  ["Q5", "1＋3", "action-money-rest-plan", "1〜3", "ticketのQ3=1・4・5、travelのQ3=1〜4、moneyのQ3=1〜4"],
  ["Q5", "1＋4", "action-money-personal-time", "1〜7・未回答", "追加制限なし"],
  ["Q5", "1＋5", "action-money-love-item", "1〜3", "moneyのQ3=1のみ"],
  ["Q5", "1＋6", "action-money-own-pace", "1〜3", "追加制限なし"],
  ["Q5", "2＋3", "action-work-rest-plan", "1〜3", "travelのQ3=3・4のみ"],
  ["Q5", "2＋4", "action-work-personal-time", "初回対象外", "本文は保持。自動選択・他候補への置換はしない"],
  ["Q5", "2＋5", "action-work-love", "1〜7・未回答", "追加制限なし"],
  ["Q5", "2＋6", "action-work-own-pace", "1〜3", "追加制限なし"],
  ["Q5", "3＋4", "action-rest-personal-time", "1〜7・未回答", "追加制限なし"],
  ["Q5", "3＋5", "action-rest-love", "1〜7・未回答", "追加制限なし"],
  ["Q5", "3＋6", "action-rest-own-pace", "1〜7・未回答", "追加制限なし"],
  ["Q5", "4＋5", "action-personal-time-love", "1〜3", "追加制限なし"],
  ["Q5", "4＋6", "action-personal-time-own-pace", "1〜3", "追加制限なし"],
  ["Q5", "5＋6", "action-love-own-pace", "1〜7・未回答", "除外2状態以外は追加制限なし"]
];
// 13.2 参照名（Q5単独）→ 本文ID（js/heart-data.js では action-q5-…）
const Q5_SINGLE = { "暮らしの安心": "action-q5-money", "仕事・学校": "action-q5-work", "睡眠・体力": "action-q5-rest",
  "家族や友達、自分のための時間": "action-q5-personal-time", "推しへの好きという気持ち": "action-q5-love", "自分に合った推し活のペース": "action-q5-own-pace" };
const q3nums = (a) => { const def = D.themes[a.q1] && D.themes[a.q1].q3; return def && a.q3 !== null ? (Array.isArray(a.q3) ? a.q3 : [a.q3]).map((id) => R.numberOf(def, id)) : []; };
const hasQ3 = (a, theme, list) => a.q1 === theme && q3nums(a).some((n) => list.includes(n));
// 「全文Q7」列
const burdenOk = (text, q7) => text === "1〜3" ? q7 !== null && q7 >= 1 && q7 <= 3 : text === "1〜7・未回答" ? q7 === null || (q7 >= 1 && q7 <= 7) : text === "初回対象外" ? false : (() => { throw new Error("全文Q7 " + text); })();
// 「初回の状況条件」列（除外2状態＝ticket の Q3=3、travel の Q3=5。13.11の本文）
const nums = (spec) => { const m = /^(\d+)〜(\d+)$/.exec(spec); return m ? Array.from({ length: m[2] - m[1] + 1 }, (_, i) => +m[1] + i) : spec.split("・").map(Number); };
function condOk(text, a) {
  if (text.startsWith("追加制限なし")) return true;
  if (text === "除外2状態以外は追加制限なし") return !hasQ3(a, "ticket", [3]) && !hasQ3(a, "travel", [5]);
  if (text.startsWith("本文は保持")) return false;
  const any = text.replace(/のいずれかを含む$/, "").split("、").map((part) => {
    const m = /^([a-z]+)のQ3(?:=|に)([\d・〜]+)(?:のみ)?$/.exec(part);
    if (!m) throw new Error("状況条件 " + part);
    return [m[1], nums(m[2])];
  });
  return any.some(([theme, list]) => hasQ3(a, theme, list));
}
function rowFor(kind, def, ids) {
  const key = ids.map((x) => R.numberOf(def, x)).join("＋");
  const row = TABLE_13_11.find((r) => r[0] === kind && r[1] === key);
  if (!row) throw new Error("13.11 に行がない " + kind + " " + key);
  return { id: Q5_SINGLE[row[2]] || row[2], fits: (a) => burdenOk(row[3], a.q7) && condOk(row[4], a) };
}
// 13.11「表を読む前の選択順」1〜4
function expected(a) {
  if (a.q7 !== null && a.q7 >= 8) return "action-rest-high";
  if (!a.q6.includes("q6-none")) { const r = rowFor("Q6", D.q6, a.q6); return r.fits(a) ? r.id : "action-common-reflect"; }
  if (!a.q5.includes("q5-none")) { const r = rowFor("Q5", D.q5, a.q5); if (r.fits(a)) return r.id; }
  if (a.q7 !== null && a.q7 >= 1 && a.q7 <= 3 && (hasQ3(a, "ticket", [1, 4, 5]) || hasQ3(a, "money", [2]))) return "action-deadline-reminder";
  return "action-common-reflect";
}
function selections(def) {
  if (def.max === 1) return def.options.map((o) => o.id);
  const out = def.options.map((o) => [o.id]);
  def.options.forEach((o, i) => def.options.forEach((p, j) => {
    if (j > i && def.exclusive.indexOf(i + 1) < 0 && def.exclusive.indexOf(j + 1) < 0) out.push([o.id, p.id]);
  }));
  return out;
}
{
  assert.strictEqual(TABLE_13_11.length, 36);
  const q5s = selections(D.q5), q6s = selections(D.q6), q7s = [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.strictEqual(q5s.length, 22); assert.strictEqual(q6s.length, 16);
  // テーマごとの Q3 の有効な選び方：ticket・travel・money 各6、feeling 23、social 29、vague 17（計87）
  const q3count = Object.fromEntries(R.THEMES.map((t) => [t, selections(D.themes[t].q3).length]));
  assert.deepStrictEqual(q3count, { ticket: 6, travel: 6, money: 6, feeling: 23, social: 29, vague: 17 });
  let total = 0; const count = {};
  for (const t of R.THEMES) for (const q3 of selections(D.themes[t].q3)) for (const q5 of q5s) for (const q6 of q6s) for (const q7 of q7s) {
    // Q2・Q4 は小さな一歩の選択に使わないので固定（Q2本文と期限補足、Q4のテーマ補足は下で別に全件を確かめる）
    const a = { q1: t, q2: ["q2-10"], q3, q4: D.themes[t].q4.max === 1 ? D.themes[t].q4.options[0].id : [D.themes[t].q4.options[0].id], q5, q6, q7 };
    assert.ok(R.validateAnswers(a, true));
    const got = R.selectAction(a).id, want = expected(a);
    assert.strictEqual(got, want, JSON.stringify(a));
    total++; count[got] = (count[got] || 0) + 1;
  }
  assert.strictEqual(total, 87 * 22 * 16 * 11);
  assert.ok(!count["action-work-personal-time"], "初回対象外は選ばれない");
  // 個別の条件の例（読み違いがないかの目印）
  const base = (o) => Object.assign({ q1: "vague", q2: ["q2-10"], q3: ["vague-q3-06"], q4: "vague-q4-05", q5: ["q5-none"], q6: ["q6-none"], q7: null }, o);
  const pick = (o) => R.selectAction(base(o)).id;
  assert.strictEqual(pick({ q6: ["q6-calm"], q7: 3 }), "action-common-reflect", "calm：情報のQ3がないと使わない");
  assert.strictEqual(pick({ q3: ["vague-q3-02"], q6: ["q6-calm"], q7: 7 }), "action-q6-calm");
  assert.strictEqual(pick({ q1: "social", q3: ["social-q3-03", "social-q3-05"], q4: ["social-q4-06"], q6: ["q6-calm"] }), "action-q6-calm", "calm は未回答でも使える");
  assert.strictEqual(pick({ q1: "money", q3: "money-q3-01", q4: ["money-q4-08"], q5: ["q5-money"], q7: 6 }), "action-q5-money");
  assert.strictEqual(pick({ q1: "money", q3: "money-q3-05", q4: ["money-q4-08"], q5: ["q5-money"], q7: 6 }), "action-common-reflect", "出費全体の見直しには暮らしの安心の単独候補を使わない");
  assert.strictEqual(pick({ q1: "travel", q3: "travel-q3-05", q4: ["travel-q4-08"], q5: ["q5-rest", "q5-own-pace"], q7: 2 }), "action-rest-own-pace", "見送りでも追加制限のない候補は使う");
  assert.strictEqual(pick({ q1: "ticket", q3: "ticket-q3-03", q4: ["ticket-q4-07"], q5: ["q5-own-pace"], q7: 2 }), "action-common-reflect", "落選では自分に合ったペースの単独候補を使わない");
  assert.strictEqual(pick({ q5: ["q5-work", "q5-personal-time"], q7: 2 }), "action-common-reflect", "初回対象外の組合せは共通文");
  console.log("OK: 小さな一歩（全 " + total + " 通り＝Q3 87通り×Q5 22×Q6 16×Q7 11。期待値は仕様書13.11の表の文面から作成）：選ばれた行動文 " + Object.keys(count).length + " 種");
}

// ---- 期限補足・テーマ補足 ----
{
  const actions = Object.keys(D.actions), texts = Object.keys(D.q2Texts);
  for (const t of texts) for (const a of actions) {
    const ids = [t, a], want = !ids.some((x) => R.DEADLINE_B.includes(x)) && ids.some((x) => R.DEADLINE_A.includes(x));
    assert.strictEqual(R.needsDeadlineSupplement(ids), want);
  }
  assert.strictEqual(R.needsDeadlineSupplement(["P02-08", "action-common-reflect"]), false, "P02-08 は本文の案内を使う");
  assert.strictEqual(R.needsDeadlineSupplement(["P02-06", "action-q6-concern"]), true, "Q2本文が対象なら小さな一歩の直後に1回");
  assert.strictEqual(R.needsDeadlineSupplement(["S10", "action-q6-values-calm"]), false, "E の本文だけでは付けない");
  const base = { q1: "feeling", q2: ["q2-02", "q2-05"], q3: ["feeling-q3-01"], q4: ["feeling-q4-05"], q5: ["q5-love"], q6: ["q6-emotion"], q7: 2 };
  const r = R.buildResult(base);
  assert.strictEqual(r.message.textId, "P02-05"); assert.strictEqual(r.message.supplementId, "supplement-feeling-forgotten");
  assert.deepStrictEqual(r.message.supplement, D.supplementFeelingForgotten);
  assert.strictEqual(R.buildResult(Object.assign({}, base, { q4: ["feeling-q4-04"] })).message.supplementId, null, "Q4 に選択肢5がなければ補足なし");
  assert.strictEqual(R.buildResult(Object.assign({}, base, { q1: "social", q3: ["social-q3-01"], q4: ["social-q4-01"] })).message.supplementId, null, "feeling 以外は補足なし");
  // コピー：タイトル・日付・4区分・表示と同じ補足
  const r2 = R.buildResult({ q1: "ticket", q2: ["q2-02", "q2-06"], q3: "ticket-q3-02", q4: ["ticket-q4-07"], q5: ["q5-none"], q6: ["q6-none"], q7: 5 });
  const text = R.copyText(r2, "2026-11-16");
  assert.ok(text.startsWith("ルナのこころ整理\n2026年11月16日\n"));
  Object.values(R.SECTIONS).forEach((h) => assert.strictEqual(text.split("【" + h + "】").length, 2, "コピーの区分 " + h));
  assert.strictEqual(text.split(D.deadlineSupplement).length, 2, "期限補足はコピーにも1回");
  assert.ok(text.indexOf(D.deadlineSupplement) > text.indexOf("【" + R.SECTIONS.action + "】"), "期限補足は小さな一歩の後");
  const rest = R.copyText(R.buildResult({ q1: "ticket", q2: ["q2-02"], q3: "ticket-q3-02", q4: ["ticket-q4-07"], q5: ["q5-none"], q6: ["q6-none"], q7: 9 }), "2026-11-16");
  assert.ok(rest.includes("今日は、ここまででも大丈夫。") && !rest.includes("**"), "休息文の強調の印はコピーに入れない");
  console.log("OK: 期限補足（Q2本文47件×行動文39件）・テーマ補足・コピーの内容");
}

// ---- 日付（日本時間） ----
assert.strictEqual(R.jstDateKey(new Date("2026-11-16T14:59:59Z")), "2026-11-16");
assert.strictEqual(R.jstDateKey(new Date("2026-11-16T15:00:00Z")), "2026-11-17");
assert.strictEqual(R.formatDate("2026-11-05"), "2026年11月5日");
assert.ok(!R.validDateKey("2026-02-30") && R.validDateKey("2026-02-28"));

// ---- 保存内容の検証（19.3） ----
{
  const answers = { q1: "social", q2: ["q2-07"], q3: ["social-q3-03"], q4: ["social-q4-01", "social-q4-05"], q5: ["q5-rest", "q5-love"], q6: ["q6-calm"], q7: 6 };
  const res = { schemaVersion: 1, questionVersion: 1, resultVersion: 1, phase: "result", questionId: "q7", answers, resultSnapshot: R.buildResult(answers), resultDate: "2026-11-16" };
  const mid = { schemaVersion: 1, questionVersion: 1, resultVersion: 1, phase: "question", questionId: "q3", answers: Object.assign(R.emptyAnswers(), { q1: "ticket", q2: ["q2-01"] }), resultSnapshot: null, resultDate: null };
  assert.ok(R.validateRecord(res) && R.validateRecord(mid));
  const bad = (f) => { const c = JSON.parse(JSON.stringify(res)); f(c); return R.validateRecord(c); };
  const badMid = (f) => { const c = JSON.parse(JSON.stringify(mid)); f(c); return R.validateRecord(c); };
  assert.ok(!bad((c) => { c.schemaVersion = 2; }), "知らない版");
  assert.ok(!bad((c) => { c.resultSnapshot.action.paragraphs[0] += "x"; }), "結果が回答と合わない");
  assert.ok(!bad((c) => { c.answers.q7 = 11; }), "Q7 は1〜10");
  assert.ok(!bad((c) => { c.answers.q3 = ["ticket-q3-01"]; }), "Q1 と Q3 の対応");
  assert.ok(!bad((c) => { c.answers.q2 = ["q2-07", "q2-10"]; }), "単独の選択肢");
  assert.ok(!bad((c) => { c.answers.q5 = ["q5-love", "q5-rest"]; }), "番号順でない");
  assert.ok(!bad((c) => { c.resultDate = "2026-13-01"; }), "日付");
  assert.ok(!bad((c) => { c.extra = 1; }), "知らない項目");
  assert.ok(!badMid((c) => { c.questionId = "q9"; }), "再開位置");
  assert.ok(!badMid((c) => { c.answers.q1 = null; }), "テーマなしの再開位置 q3");
  assert.ok(!badMid((c) => { delete c.answers.q7; }), "回答の項目が足りない");
  console.log("OK: 日付（日本時間の境目）・保存内容の検証（版・回答の整合・結果と回答の一致）");
}

// ---- 保存処理：成功・失敗・読込不能・アクセス不可を区別する ----
{
  const mem = (o = {}) => { const m = new Map(Object.entries(o)); return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
  const others = { "oshi-luna-type": "{\"x\":1}", "oshi-luna-daily": "{}", "oshi-luna-tarot-daily-v1": "{}" };
  const ls = mem(others), st = S.create(() => ls);
  assert.strictEqual(st.read().status, "empty");
  const answers = Object.assign(R.emptyAnswers(), { q1: "vague" });
  const rec = { schemaVersion: 1, questionVersion: 1, resultVersion: 1, phase: "question", questionId: "q2", answers, resultSnapshot: null, resultDate: null };
  assert.ok(st.write(rec).ok); assert.strictEqual(st.read().status, "ok");
  assert.ok(st.remove().ok); assert.strictEqual(st.read().status, "empty");
  Object.entries(others).forEach(([k, v]) => assert.strictEqual(ls.getItem(k), v, "ほかの保存データは変えない " + k));
  ls.setItem(S.KEY, "{壊れた"); assert.strictEqual(st.read().status, "invalid");
  assert.strictEqual(ls.getItem(S.KEY), "{壊れた", "読み込めない内容を自動で消さない");
  const throwing = S.create(() => { throw new Error("SecurityError"); });
  assert.strictEqual(throwing.read().status, "unavailable"); assert.ok(!throwing.write(rec).ok); assert.ok(!throwing.remove().ok);
  const full = mem(); full.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.ok(!S.create(() => full).write(rec).ok, "書き込めないときは失敗");
  const silent = mem(); silent.setItem = () => {}; // 例外は出ないが保存されない
  assert.ok(!S.create(() => silent).write(rec).ok, "読み直して確かめる");
  const stuck = mem({ [S.KEY]: JSON.stringify(rec) }); stuck.removeItem = () => {};
  assert.ok(!S.create(() => stuck).remove().ok, "消えていなければ削除は失敗");
  console.log("OK: 保存処理（成功・失敗・読込不能・アクセス不可・削除の確認・ほかの保存データに触れない）");
}

// ---- 保存の窓口（createSession）：既存の保存内容を、本人の確認なしに上書き・削除扱いにしない（レビュー指摘の2件） ----
{
  const rec = (q1) => ({ schemaVersion: 1, questionVersion: 1, resultVersion: 1, phase: "question", questionId: "q2",
    answers: Object.assign(R.emptyAnswers(), { q1 }), resultSnapshot: null, resultDate: null });
  const OLD = JSON.stringify(rec("ticket"));
  // getItem・setItem・removeItem を、呼んだ回数や切り替えで失敗させられる保存領域
  const fake = (init = {}) => {
    const m = new Map(Object.entries(init)), f = { failGet: 0, failAll: false, removeNoop: false, failGetAfterRemove: false, calls: [] };
    f.ls = {
      getItem: (k) => { f.calls.push("get"); if (f.failAll || f.failGet > 0) { f.failGet = Math.max(0, f.failGet - 1); throw new Error("SecurityError"); } return m.has(k) ? m.get(k) : null; },
      setItem: (k, v) => { f.calls.push("set"); if (f.failAll) throw new Error("SecurityError"); m.set(k, String(v)); },
      removeItem: (k) => { f.calls.push("remove"); if (f.failAll) throw new Error("SecurityError"); if (!f.removeNoop) m.delete(k); if (f.failGetAfterRemove) f.failGet = 99; }
    };
    f.raw = () => (m.has(S.KEY) ? m.get(S.KEY) : null);
    return f;
  };
  // 1. 起動時の読取だけ失敗し、その後は読み書きできる：保存内容は書き換えない
  {
    const f = fake({ [S.KEY]: OLD }); f.failGet = 1;
    const s = S.createSession(() => f.ls);
    assert.strictEqual(s.read().status, "unavailable");
    const w = s.write(rec("vague"));
    assert.ok(!w.ok && w.reason === "existing" && w.status === "ok", "既存の保存内容があれば書かない");
    assert.strictEqual(f.raw(), OLD, "起動時に読めなかった保存内容を上書きしない");
    for (let i = 0; i < 5; i++) assert.ok(!s.write(rec("money")).ok); // 回答のたびの自動保存でも書かない
    assert.strictEqual(f.raw(), OLD);
    assert.ok(!f.calls.includes("set"), "setItem を呼ばない");
  }
  // 2. 利用の途中で保存領域が回復しても、本人の確認（続きから／削除）前に上書きしない
  {
    const f = fake({ [S.KEY]: OLD }); f.failGet = 3;
    const s = S.createSession(() => f.ls);
    assert.strictEqual(s.read().status, "unavailable");
    assert.strictEqual(s.write(rec("vague")).reason, "unavailable", "確かめられない間は書かない");
    assert.strictEqual(s.write(rec("vague")).reason, "unavailable");
    assert.strictEqual(s.write(rec("vague")).reason, "existing", "回復したら保存内容に気づく");
    assert.strictEqual(f.raw(), OLD);
    // 本人が削除を確かめたあとは書ける
    assert.ok(s.remove().ok); assert.strictEqual(f.raw(), null);
    assert.ok(s.write(rec("vague")).ok); assert.strictEqual(JSON.parse(f.raw()).answers.q1, "vague");
  }
  // 3. 読めない（壊れた）保存内容があるときも書かない
  {
    const f = fake({ [S.KEY]: "{壊れた" }); f.failGet = 1;
    const s = S.createSession(() => f.ls);
    s.read(); const w = s.write(rec("vague"));
    assert.ok(!w.ok && w.reason === "existing" && w.status === "invalid"); assert.strictEqual(f.raw(), "{壊れた");
  }
  // 4. 起動時に読めなくても、回復して「保存がない」と確かめられれば書ける。通常の環境の保存も動く
  {
    const f = fake(); f.failGet = 1;
    const s = S.createSession(() => f.ls);
    assert.strictEqual(s.read().status, "unavailable");
    assert.ok(s.write(rec("vague")).ok, "保存がないと確かめてから書く");
    assert.ok(s.write(rec("travel")).ok, "自分で書いた内容は更新できる");
    assert.strictEqual(JSON.parse(f.raw()).answers.q1, "travel");
    const g = fake(), t = S.createSession(() => g.ls);
    assert.strictEqual(t.read().status, "empty"); assert.ok(t.write(rec("feeling")).ok); assert.ok(t.isOwned());
  }
  // 5. 本人が「続きから／前回の結果を見る」を選んだときだけ、既存の保存内容を更新できる
  {
    const f = fake({ [S.KEY]: OLD }), s = S.createSession(() => f.ls);
    assert.strictEqual(s.read().status, "ok");
    assert.ok(!s.write(rec("vague")).ok, "選ぶ前は書かない"); assert.strictEqual(f.raw(), OLD);
    s.adopt(); assert.ok(s.write(rec("vague")).ok);
  }
  // 6. 削除：消したあと「保存がない」と確かめられたときだけ成功
  {
    const all = fake({ [S.KEY]: OLD }), a = S.createSession(() => all.ls); all.failAll = true;
    assert.strictEqual(a.read().status, "unavailable");
    assert.ok(!a.remove().ok, "保存領域に入れないときは削除成功にしない（以前の保存がないことの証明にならない）");
    all.failAll = false; assert.strictEqual(all.raw(), OLD);
    const noop = fake({ [S.KEY]: OLD }); noop.removeNoop = true;
    const b = S.createSession(() => noop.ls); b.read();
    assert.ok(!b.remove().ok, "削除が反映されないときは失敗"); assert.strictEqual(noop.raw(), OLD);
    assert.ok(!b.write(rec("vague")).ok, "削除に失敗したあとも上書きしない");
    const after = fake({ [S.KEY]: OLD }); after.failGetAfterRemove = true;
    const c = S.createSession(() => after.ls); c.read();
    assert.ok(!c.remove().ok, "削除のあと読めず確かめられないときは失敗");
    const ok = fake({ [S.KEY]: OLD }), d = S.createSession(() => ok.ls); d.read();
    const r = d.remove(); assert.ok(r.ok && r.after === "empty"); assert.strictEqual(ok.raw(), null);
  }
  console.log("OK: 保存の窓口（起動時の読取失敗・途中の回復・読めない内容・続きから・削除の失敗／確認できない場合で、既存の保存内容を上書き・削除扱いにしない）");
}

// ---- 入口（index.html）：トップと診断結果画面の採用文（2章・2.2） ----
{
  const html = require("fs").readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8");
  const strip = (s) => s.replace(/<br>/g, "\n").replace(/<[^>]+>/g, "");
  const top = (html.match(/<section class="heart-entry"[\s\S]*?<\/section>/) || [""])[0], inv = (html.match(/<aside class="heart-invite"[\s\S]*?<\/aside>/) || [""])[0];
  D.ui.topEntry.forEach((t) => assert.ok(strip(top).includes(t.replace(/^［|］$/g, "")), "トップの入口の文 " + t));
  D.ui.resultEntry.forEach((t) => assert.ok(strip(inv).includes(t.replace(/^［|］$/g, "")), "結果画面の入口の文 " + t));
  assert.ok(/href="heart\/"/.test(top) && /href="heart\/"/.test(inv), "入口は heart/ へ");
  // トップ：「今日の占い」ブロック全体の直後（8タイプ一覧の上。2026-11-17 の指定）。結果画面：お守りの後
  const dailyEnd = html.indexOf('</section>', html.indexOf('id="daily-entry"'));
  assert.ok(dailyEnd < html.indexOf('id="heart-entry"') && html.indexOf('id="heart-entry"') < html.indexOf('class="type-grid"'), "トップの入口は今日の占いの後");
  assert.ok(!/id="heart-entry"/.test(html.slice(html.indexOf('id="daily-entry"'), dailyEnd)), "今日の占いの中には入れない");
  // 「無料」を案内・ボタンのまわりで強調しない（2026-11-17）
  assert.ok(!/無料/.test(top) && !/無料/.test(inv) && !/無料・約1分/.test(html), "入口・診断カードの案内に「無料」を入れない");
  ["introFree", "introPrivacy", "introLead"].forEach((k) => assert.ok(!/無料/.test(D.ui[k]), "開始前の案内に「無料」を入れない " + k));
  D.ui.topEntry.forEach((t) => assert.ok(!/無料/.test(t), "トップの入口の文に「無料」を入れない"));
  assert.ok(html.indexOf('id="type-omamori-title"') < html.indexOf('class="heart-invite"') && html.indexOf('class="heart-invite"') < html.indexOf('id="to-daily-btn"'));
  console.log("OK: 入口（トップ・診断結果画面の採用文と位置）");
}
