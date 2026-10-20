// 推しルナ占い：サブタイプコード（4つの軸）の判定のテスト
// 実行: node tests/subtype.js
// 判定は js/fortune.js の diagnoseAxes。ここでは、検討で決めた対応表と計算方法をテストの中に別に書いて照らし合わせる
"use strict";
require("../js/data.js");
const { diagnoseType, isValidAnswers, diagnoseAxes, isValidAxisAnswers } = require("../js/fortune.js");
const assert = require("assert");
const D = globalThis.OshiLunaData;

let passed = 0;
const results = [];
function test(name, fn) {
  fn();
  passed++;
  results.push("PASS " + name);
}

// ---- 検討で決めた仕様（js/data.js とは別に書いておく） ----
const AXES = [["love", "E", "W"], ["place", "F", "H"], ["mind", "I", "A"], ["enjoy", "S", "P"]];
// 質問ごとの選択肢 A〜D：[軸, 文字, 点数]
const SPEC = {
  1: [[["enjoy", "P", 2], ["place", "H", 1]], [["love", "E", 2]], [["love", "W", 2]], []],
  2: [[["love", "E", 1]], [["enjoy", "S", 2]], [], [["mind", "A", 2]]],
  3: [[["mind", "A", 1]], [], [["enjoy", "S", 2]], [["mind", "A", 2]]],
  4: [[["place", "H", 1]], [], [["mind", "A", 1]], []],
  5: [[["enjoy", "S", 2]], [["enjoy", "S", 1]], [["enjoy", "S", 2]], [["enjoy", "P", 2]]],
  6: [[["enjoy", "P", 1]], [["enjoy", "P", 1]], [["enjoy", "S", 2]], []],
  7: [[["enjoy", "S", 1]], [["enjoy", "P", 1]], [["mind", "A", 2]], [["mind", "I", 2]]],
  8: [[["love", "W", 2]], [["love", "E", 2]], [], [["enjoy", "S", 1]]],
  9: [[["place", "F", 2]], [["place", "H", 2], ["enjoy", "P", 1]], [["enjoy", "P", 1]], [["place", "H", 1]]],
  10: [[["love", "W", 2]], [["love", "E", 2]], [["mind", "A", 2]], [["mind", "I", 2]]],
  11: [[["love", "E", 4]], [["love", "E", 4]], [["love", "W", 4]], [["love", "W", 4]]],
  12: [[["place", "F", 4]], [["place", "F", 2]], [["place", "H", 4]], [["place", "H", 4]]],
  13: [[["mind", "I", 4]], [["mind", "I", 4]], [["mind", "A", 4]], [["mind", "A", 4]]],
  14: [[["enjoy", "S", 4]], [["enjoy", "S", 4]], [["enjoy", "P", 4]], [["enjoy", "P", 4]]]
};
const RULES = { smoothing: 0.25, balance: 55, clear: 66 };

// 仕様どおりの計算（answers14：14問の答え。最初の10問が使えないときは null を渡す）
function oracle(main, ax) {
  const qs = []; // [質問番号, 選んだ選択肢]
  ax.forEach((o, i) => qs.push([11 + i, o]));
  if (main) main.forEach((o, i) => qs.push([1 + i, o]));
  return AXES.map(([key, l0, l1]) => {
    const got = [0, 0], mean = [0, 0], max = [0, 0];
    qs.forEach(([q, pick]) => {
      const best = [0, 0];
      SPEC[q].forEach((tags, o) => tags.forEach(([k, l, p]) => {
        if (k !== key) return;
        const side = l === l0 ? 0 : 1;
        mean[side] += p / 4;
        best[side] = Math.max(best[side], p);
        if (o === pick) got[side] += p;
      }));
      max[0] += best[0]; max[1] += best[1];
    });
    const left = got[0] / mean[0], right = got[1] / mean[1];
    const percent = Math.round((left + RULES.smoothing) / (left + right + RULES.smoothing * 2) * 100);
    const lean = Math.max(percent, 100 - percent);
    const letter = lean <= RULES.balance ? "X" : percent > 50 ? l0 : l1;
    return { key, got, mean, max, percent, letter, strength: letter === "X" ? "balance" : lean < RULES.clear ? "slight" : "clear" };
  });
}
const pick = (r) => r.axes.map((a) => [a.letter, a.strength, a.percent, a.points]);
const pickO = (o) => o.map((a) => [a.letter, a.strength, a.percent, a.got]);
let seed = 20261020;
const rnd = (n) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
const randomAnswers = (n) => Array.from({ length: n }, () => rnd(4));

// ---- 1. 実装が検討で決めた仕様と一致している ----
test("対応表（Q1〜Q10 の選択肢と軸・文字・点数）が検討で決めたものと同じ", () => {
  for (let q = 1; q <= 10; q++) D.AXIS_TAGS[q - 1].forEach((tags, o) =>
    assert.deepStrictEqual(tags.map((t) => t.join()).sort(), SPEC[q][o].map((t) => t.join()).sort(), "Q" + q + "ABCD"[o]));
});
test("追加の4問（Q11〜Q14）の軸・文字・点数が検討で決めたものと同じ", () => {
  D.AXIS_QUESTIONS.forEach((q, i) => q.options.forEach((o, j) => assert.deepStrictEqual([q.axis, o.pole, o.points], SPEC[11 + i][j][0])));
});
test("判定の決まり（補正 0.25・X は 45〜55%・はっきりは 66% 以上）", () => {
  assert.deepStrictEqual(D.AXIS_RULES, RULES);
});

test("応援スタイルの表示名は「体験型／マイペース型」（文字は F・H のまま、説明文はそのまま）", () => {
  const place = D.AXES.find((x) => x.key === "place");
  assert.deepStrictEqual(place.letters, ["F", "H"]);
  assert.deepStrictEqual(place.labels, { F: "体験型", H: "マイペース型" });
  assert.strictEqual(place.texts.H, "自分の空間で、落ち着いて推しを味わう人。");
  assert.strictEqual(place.texts.F, "その場の空気を感じて、全身で推しを楽しむ人。");
  assert.strictEqual(place.texts.X, "体験するときも、マイペースに楽しむときも、そのときの自分に合った楽しみ方ができる人。");
  // 前の分類（現場・おうち）を思わせる言葉を、応援スタイルの表示名・説明文に残さない
  Object.values(place.labels).concat(Object.values(place.texts)).forEach((t) => assert.ok(!/現場|おうち|会場/.test(t), t));
});

// ---- 2. 14問に答えたときの判定（手計算した例） ----
test("手計算の例1：点数・平均的な点数・最大点・割合（愛情表現）", () => {
  // Q1-B(E2) Q2-A(E1) Q8-B(E2) Q10-B(E2) Q11-A(E4) → E 11点・W 0点
  // E の平均的な点数 = Q1 2/4 + Q2 1/4 + Q8 2/4 + Q10 2/4 + Q11 8/4 = 3.75、W = Q1 0.5 + Q8 0.5 + Q10 0.5 + Q11 2 = 3.5
  // E の最大点 = 2+1+2+2+4 = 11、W = 2+2+2+4 = 10
  // 割合 = (11/3.75 + 0.25) / (11/3.75 + 0 + 0.5) = 3.1833… / 3.4333… = 92.7% → 93%
  const main = [1, 0, 0, 0, 0, 0, 0, 1, 0, 1], ax = [0, 2, 1, 3];
  const o = oracle(main, ax)[0];
  assert.deepStrictEqual([o.got, o.mean, o.max, o.percent], [[11, 0], [3.75, 3.5], [11, 10], 93]);
  const r = diagnoseAxes(main, ax);
  assert.deepStrictEqual([r.axes[0].points, r.axes[0].percent, r.axes[0].letter, r.axes[0].strength], [[11, 0], 93, "E", "clear"]);
});
test("手計算の例1：4軸すべてとコード（EHIP）", () => {
  // 応援スタイル：Q4-A(H1) Q9-A(F2) Q12-C(H4) → F 2点・H 5点
  //   平均的な点数 F = Q9 2/4 + Q12 6/4 = 2.0、H = Q1 1/4 + Q4 1/4 + Q9 3/4 + Q12 8/4 = 3.25
  //   F の割合 = (2/2 + 0.25) / (1 + 5/3.25 + 0.5) = 1.25 / 3.038 = 41.1% → 41%（ややマイペース型寄り）
  const r = diagnoseAxes([1, 0, 0, 0, 0, 0, 0, 1, 0, 1], [0, 2, 1, 3]);
  assert.strictEqual(r.code, "EHIP");
  assert.deepStrictEqual([r.axes[1].points, r.axes[1].percent, r.axes[1].strength], [[2, 5], 41, "slight"]);
  assert.deepStrictEqual(pick(r), pickO(oracle([1, 0, 0, 0, 0, 0, 0, 1, 0, 1], [0, 2, 1, 3])));
});
test("手計算の例2：どの軸も片側だけを選ぶと、はっきりした結果（EFIS・WHAP）", () => {
  // E・F・I・S 側だけ：Q1-B Q2-A Q3-C… のように各軸の左側に点が入る選択肢を選ぶ
  const left = diagnoseAxes([1, 1, 2, 0, 0, 2, 3, 1, 0, 3], [0, 0, 0, 0]);
  assert.strictEqual(left.code, "EFIS");
  assert.ok(left.axes.every((a) => a.strength === "clear" && a.percent >= 66));
  const right = diagnoseAxes([0, 3, 3, 0, 3, 1, 1, 0, 1, 0], [3, 3, 3, 3]);
  assert.strictEqual(right.code, "WHAP");
  assert.ok(right.axes.every((a) => a.strength === "clear" && a.percent <= 34));
});
test("手計算の例3：追加の質問で「伝える」でも、既存で「見守る」が2つあればバランス型（XFIS・伝える53%）", () => {
  // E: Q2-A 1 + Q11-A 4 = 5 → 5/3.75 = 1.333、W: Q8-A 2 + Q10-A 2 = 4 → 4/3.5 = 1.143
  // 割合 = (1.333+0.25)/(1.333+1.143+0.5) = 1.583/2.976 = 53.2% → 53% → X
  const r = diagnoseAxes([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0]);
  assert.deepStrictEqual([r.axes[0].points, r.axes[0].percent, r.axes[0].letter], [[5, 4], 53, "X"]);
  assert.strictEqual(r.code, "XFIS");
});
test("14問の組み合わせ（ランダム3万通り）で、点数・割合・文字・強さが仕様の計算と一致", () => {
  for (let n = 0; n < 30000; n++) {
    const main = randomAnswers(10), ax = randomAnswers(4);
    assert.deepStrictEqual(pick(diagnoseAxes(main, ax)), pickO(oracle(main, ax)), JSON.stringify([main, ax]));
  }
});
test("既存10問と追加4問が両方使われる（どちらを変えても、その軸の点数が変わることがある）", () => {
  // 例：愛情表現は Q1・Q2・Q8・Q10（既存）と Q11（追加）を使う
  const base = diagnoseAxes([3, 2, 0, 1, 0, 3, 0, 2, 2, 2], [0, 0, 0, 0]).axes[0].points;
  assert.notDeepStrictEqual(diagnoseAxes([1, 2, 0, 1, 0, 3, 0, 2, 2, 2], [0, 0, 0, 0]).axes[0].points, base, "既存の Q1 が使われていない");
  assert.notDeepStrictEqual(diagnoseAxes([3, 2, 0, 1, 0, 3, 0, 2, 2, 2], [2, 0, 0, 0]).axes[0].points, base, "追加の Q11 が使われていない");
  assert.ok(diagnoseAxes([3, 2, 0, 1, 0, 3, 0, 2, 2, 2], [0, 0, 0, 0]).reused);
});

// ---- 3. 答えを1つ変えたとき、関係する軸だけが変わる ----
test("答えを1つ変えると、その2つの選択肢に関係する軸だけが変わる（14問×12通り×300回）", () => {
  for (let q = 1; q <= 14; q++) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    if (a === b) continue;
    const related = new Set(SPEC[q][a].concat(SPEC[q][b]).map((t) => t[0]));
    for (let n = 0; n < 300; n++) {
      const main = randomAnswers(10), ax = randomAnswers(4);
      const set = (v) => { const m = main.slice(), x = ax.slice(); if (q <= 10) m[q - 1] = v; else x[q - 11] = v; return diagnoseAxes(m, x); };
      const r1 = set(a), r2 = set(b);
      r1.axes.forEach((x, k) => { if (!related.has(x.key)) assert.deepStrictEqual(r2.axes[k], x, "関係しない軸が変わった Q" + q + " " + x.key); });
    }
  }
});
test("関係しない選択肢だけを変えても結果は同じ（Q1-D・Q2-C・Q3-B・Q4-B/D・Q6-D・Q8-C は使わない）", () => {
  const unused = [[1, 3], [2, 2], [3, 1], [4, 1], [4, 3], [6, 3], [8, 2]];
  unused.forEach(([q, o]) => assert.deepStrictEqual(SPEC[q][o], [], "Q" + q + "ABCD"[o]));
  for (let n = 0; n < 2000; n++) {
    const main = randomAnswers(10), ax = randomAnswers(4);
    const m1 = main.slice(), m2 = main.slice();
    m1[1] = 2; m2[1] = 2; m1[3] = 1; m2[3] = 3; // Q2-C は固定、Q4 を B と D で入れかえ
    assert.deepStrictEqual(diagnoseAxes(m1, ax), diagnoseAxes(m2, ax));
  }
});

// ---- 4. 判定の境界 ----
// 軸ごとに、関係する質問の全組み合わせで出る割合を集め、境界の前後の割合の判定を確かめる
const reachable = AXES.map(([key]) => {
  const qs = []; for (let q = 1; q <= 14; q++) if (SPEC[q].some((t) => t.some((g) => g[0] === key))) qs.push(q);
  const seen = new Map();
  const total = Math.pow(4, qs.length);
  for (let i = 0; i < total; i++) {
    const main = new Array(10).fill(3), ax = [0, 0, 0, 0]; let x = i;
    qs.forEach((q) => { if (q <= 10) main[q - 1] = x & 3; else ax[q - 11] = x & 3; x >>= 2; });
    const k = AXES.findIndex((a) => a[0] === key);
    const r = diagnoseAxes(main, ax).axes[k];
    if (!seen.has(r.percent)) seen.set(r.percent, { r, main, ax });
  }
  return seen;
});
test("境界の判定：45〜55% は X、56〜65%・35〜44% は「やや」、66% 以上・34% 以下ははっきり", () => {
  AXES.forEach(([key, l0, l1], k) => reachable[k].forEach(({ r }, p) => {
    const want = p >= 45 && p <= 55 ? ["X", "balance"] : p >= 56 && p <= 65 ? [l0, "slight"] : p >= 66 ? [l0, "clear"] : p >= 35 ? [l1, "slight"] : [l1, "clear"];
    assert.deepStrictEqual([r.letter, r.strength], want, key + " " + p + "%");
  }));
});
test("境界の前後の割合が、実際の回答で出る（どの軸も X・やや・はっきりの3つに到達できる）", () => {
  AXES.forEach(([key], k) => {
    const s = [...reachable[k].keys()];
    assert.ok(s.some((p) => p >= 45 && p <= 55), key + " X");
    assert.ok(s.some((p) => p >= 56 && p <= 65) && s.some((p) => p >= 35 && p <= 44), key + " やや");
    assert.ok(s.some((p) => p >= 66) && s.some((p) => p <= 34), key + " はっきり");
  });
});
test("境界付近で答えを1つ変えると、X ⇄ やや ⇄ はっきりが切り替わる", () => {
  let toX = 0, toClear = 0;
  for (let n = 0; n < 20000 && (!toX || !toClear); n++) {
    const main = randomAnswers(10), ax = randomAnswers(4);
    const r1 = diagnoseAxes(main, ax);
    const m2 = main.slice(); m2[rnd(10)] = rnd(4);
    const r2 = diagnoseAxes(m2, ax);
    r1.axes.forEach((a, k) => {
      const b = r2.axes[k];
      if (a.strength === "slight" && b.strength === "balance") { toX++; assert.ok(Math.abs(b.percent - 50) <= 5 && Math.abs(a.percent - 50) >= 6); }
      if (a.strength === "slight" && b.strength === "clear") { toClear++; assert.ok(Math.abs(b.percent - 50) >= 16 && Math.abs(a.percent - 50) <= 15); }
    });
  }
  assert.ok(toX > 0 && toClear > 0, "切り替わりの例が見つからない");
});

// ---- 5. いつも同じ結果 ----
test("同じ答えなら、何度・どの順番で計算しても同じ結果（答えの配列も書きかえない）", () => {
  const list = Array.from({ length: 3000 }, () => [randomAnswers(10), randomAnswers(4)]);
  const first = list.map(([m, a]) => JSON.stringify(diagnoseAxes(m, a)));
  for (let round = 0; round < 3; round++) {
    const order = list.map((_, i) => i).sort(() => rnd(3) - 1);
    order.forEach((i) => {
      const [m, a] = list[i], copy = JSON.stringify([m, a]);
      assert.strictEqual(JSON.stringify(diagnoseAxes(m, a)), first[i]);
      assert.strictEqual(JSON.stringify([m, a]), copy);
    });
  }
});

// ---- 6. 答えが足りない・古いデータ ----
test("既存10問の答えが使えないときは、追加の4問だけで決まる（null・空・9問・11問・範囲外・小数・文字）", () => {
  const bad = [null, undefined, [], [0, 0, 0, 0, 0, 0, 0, 0, 0], new Array(11).fill(0), [4, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0], ["0", "0", "0", "0", "0", "0", "0", "0", "0", "0"], "0000000000", { length: 10 }];
  for (let i = 0; i < 256; i++) {
    const ax = [i & 3, (i >> 2) & 3, (i >> 4) & 3, (i >> 6) & 3];
    const want = diagnoseAxes(null, ax);
    assert.strictEqual(want.reused, false);
    assert.deepStrictEqual(pick(want), pickO(oracle(null, ax)));
    // 追加の4問だけのときは X にならず、はっきりした結果
    assert.ok(want.axes.every((a) => a.letter !== "X" && a.strength === "clear"));
    bad.forEach((m) => assert.deepStrictEqual(diagnoseAxes(m, ax), want, JSON.stringify(m)));
  }
});
test("追加の4問の答えが足りない・おかしいときは判定しない（エラーにして、呼び出し側でサブタイプなしとして扱う）", () => {
  const bad = [null, undefined, [], [0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 4], [0, 0, 0, -1], [0, 0, 0, 1.5], ["0", "0", "0", "0"], "0000"];
  bad.forEach((ax) => {
    assert.strictEqual(isValidAxisAnswers(ax), false, JSON.stringify(ax));
    assert.throws(() => diagnoseAxes([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ax), JSON.stringify(ax));
  });
});

// ---- 7. 割合 ----
test("割合はいつも 1〜99 の整数で、2つの割合（○%／100−○%）の合計は100（全組み合わせの集計から）", () => {
  reachable.forEach((m) => m.forEach((v, p) => {
    assert.ok(Number.isInteger(p) && p >= 1 && p <= 99, p);
    assert.strictEqual(p + (100 - p), 100);
  }));
  for (let n = 0; n < 5000; n++) diagnoseAxes(randomAnswers(10), randomAnswers(4)).axes.forEach((a) => assert.ok(Number.isFinite(a.percent) && Number.isInteger(a.percent)));
});
test("平均的な点数が 0 になる軸があっても NaN・Infinity にならない（データを変えたときの安全装置）", () => {
  // 片側の点がない状態をつくる：愛情表現の追加の質問の W 側を 0 点にし、既存の W の関係も一時的に外す
  const saveQ = JSON.stringify(D.AXIS_QUESTIONS), saveT = JSON.stringify(D.AXIS_TAGS);
  try {
    D.AXIS_QUESTIONS[0].options.forEach((o) => { if (o.pole === "W") o.points = 0; });
    D.AXIS_TAGS.forEach((q) => q.forEach((tags, o) => { q[o] = tags.filter((t) => !(t[0] === "love" && t[1] === "W")); }));
    for (let n = 0; n < 500; n++) {
      const r = diagnoseAxes(randomAnswers(10), randomAnswers(4));
      r.axes.forEach((a) => assert.ok(Number.isFinite(a.percent) && a.percent >= 0 && a.percent <= 100, a.key + " " + a.percent));
      assert.ok(!/NaN|Infinity|undefined/.test(r.code), r.code);
    }
    // すべての点が 0 の軸（追加の質問の点も 0）でも 50%（X）
    D.AXIS_QUESTIONS[0].options.forEach((o) => { o.points = 0; });
    D.AXIS_TAGS.forEach((q) => q.forEach((tags, o) => { q[o] = tags.filter((t) => t[0] !== "love"); }));
    const z = diagnoseAxes(randomAnswers(10), randomAnswers(4)).axes[0];
    assert.deepStrictEqual([z.percent, z.letter], [50, "X"]);
  } finally {
    JSON.parse(saveQ).forEach((q, i) => { D.AXIS_QUESTIONS[i] = q; });
    JSON.parse(saveT).forEach((q, i) => { D.AXIS_TAGS[i] = q; });
  }
  assert.strictEqual(diagnoseAxes([1, 0, 0, 0, 0, 0, 0, 1, 0, 1], [0, 2, 1, 3]).code, "EHIP", "データを元に戻せていない");
});

// ---- 8. 8タイプの判定は変わらない ----
test("8タイプの判定：全1048576通りの結果が、サブタイプを足す前と同じ（指紋 fcb7705）", () => {
  let fp = 2166136261;
  for (let i = 0; i < Math.pow(4, 10); i++) {
    const ans = []; let x = i;
    for (let q = 0; q < 10; q++) { ans.push(x & 3); x >>= 2; }
    const r = diagnoseType(ans);
    for (const ch of r.type + r.sub) { fp ^= ch.charCodeAt(0); fp = Math.imul(fp, 16777619); }
  }
  assert.strictEqual((fp >>> 0).toString(16), "fcb7705");
});
test("8タイプの判定は14問ぶんの答えを受け取らず、サブタイプの答えに左右されない", () => {
  assert.throws(() => diagnoseType(new Array(14).fill(0)));
  assert.strictEqual(isValidAnswers(new Array(14).fill(0)), false);
  for (let n = 0; n < 1000; n++) {
    const main = randomAnswers(10);
    const before = JSON.stringify(diagnoseType(main));
    diagnoseAxes(main, randomAnswers(4));
    assert.strictEqual(JSON.stringify(diagnoseType(main)), before);
  }
});

results.forEach((r) => console.log(r));
console.log("OK: サブタイプのテスト " + passed + "件");
