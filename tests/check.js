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
        assert.ok(f.omamori, "omamori " + answers);
        // 同じ日・同じ回答なら同じ結果
        assert.deepStrictEqual(getFortune(answers, date), f, "deterministic " + answers);
        styles.add(f.style.title);
        insights.add(f.insight);
        count++;
      }

const expectedStyles = Object.values(D.STYLES).reduce((n, row) => n + Object.keys(row).length, 0);
assert.strictEqual(styles.size, expectedStyles, "到達できない推し活スタイルがあります");
assert.strictEqual(insights.size, 16, "到達できない気づきがあります");

console.log("OK: " + count + "通りを確認 / スタイル " + styles.size + "種 / 気づき " + insights.size + "種");
