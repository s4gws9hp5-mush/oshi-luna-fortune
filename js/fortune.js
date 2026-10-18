/* 推しルナ占い：回答から結果を組み立てるロジック（DOMに依存しない） */
(function (root) {
  "use strict";

  var D = root.OshiLunaData;

  // 文字列から32bitの数値を作る（FNV-1a）
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // 同じシードなら同じ並びになる簡易乱数
  function seededRandom(seed) {
    var s = seed || 1;
    return function () {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  function pick(list, rand) {
    return list[Math.floor(rand() * list.length)];
  }

  function pickDistinct(list, count, rand) {
    var pool = list.slice();
    var out = [];
    while (out.length < count && pool.length) {
      out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    }
    return out;
  }

  function dateKey(date) {
    var y = date.getFullYear();
    var m = ("0" + (date.getMonth() + 1)).slice(-2);
    var d = ("0" + date.getDate()).slice(-2);
    return y + "-" + m + "-" + d;
  }

  // 回答の得点から1位・2位のタイプを決める。同点なら先の質問で選んだタイプを優先
  function rankTypes(answers) {
    var totals = {};
    var firstSeen = {};
    answers.forEach(function (optionIndex, q) {
      var scores = D.QUESTIONS[q].options[optionIndex].scores;
      Object.keys(scores).forEach(function (type) {
        totals[type] = (totals[type] || 0) + scores[type];
        if (!(type in firstSeen)) firstSeen[type] = q;
      });
    });
    var ranked = Object.keys(D.TYPES).sort(function (a, b) {
      var diff = (totals[b] || 0) - (totals[a] || 0);
      if (diff) return diff;
      var fa = a in firstSeen ? firstSeen[a] : 99;
      var fb = b in firstSeen ? firstSeen[b] : 99;
      return fa - fb;
    });
    var primary = ranked[0];
    // 2位が0点（すべて同じタイプ）なら「純度100%」スタイル
    var secondary = totals[ranked[1]] ? ranked[1] : primary;
    return { primary: primary, secondary: secondary, totals: totals };
  }

  // answers: 各質問で選んだ選択肢の番号（0〜3）×4
  function getFortune(answers, date) {
    if (!Array.isArray(answers) || answers.length !== D.QUESTIONS.length) {
      throw new Error("回答数が正しくありません");
    }
    var today = dateKey(date || new Date());
    var rank = rankTypes(answers);
    var focus = D.QUESTIONS[3].options[answers[3]].focus;
    var rand = seededRandom(hash(answers.join("") + "|" + today));

    // ★1は出にくく、★3〜4が出やすい配分
    var r = rand();
    var stars = r < 0.06 ? 1 : r < 0.22 ? 2 : r < 0.52 ? 3 : r < 0.84 ? 4 : 5;

    return {
      date: today,
      answers: answers.slice(),
      type: D.TYPES[rank.primary],
      typeKey: rank.primary,
      style: D.STYLES[rank.primary][rank.secondary],
      luck: { stars: stars, title: D.LUCK[stars].title, text: D.LUCK[stars].text },
      insight: D.INSIGHTS[answers[2]][rank.primary],
      actions: pickDistinct(D.ACTIONS[focus], 2, rand),
      lucky: {
        color: pick(D.LUCKY_COLORS, rand),
        item: pick(D.LUCKY_ITEMS, rand),
        time: pick(D.LUCKY_TIMES, rand)
      },
      omamori: pick(D.OMAMORI[focus], rand)
    };
  }

  var api = { getFortune: getFortune, rankTypes: rankTypes, dateKey: dateKey };
  root.OshiLuna = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
