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

  // ---- 推し活タイプ診断：回答だけでタイプを決める（日付・乱数は使わない） ----
  // answers: 各質問で選んだ選択肢の番号（0〜3）。選んだ選択肢の main に2点、sub に1点。
  // 同点のときの順位：
  //   1. 合計点が高い
  //   2. main（2点）として選ばれた回数が多い
  //   3. main として選ばれた質問が早い（最初に強く惹かれたタイプを優先）
  //   4. 点が入った質問が早い
  //   5. TYPE_ORDER の順
  function diagnoseType(answers) {
    if (!isValidAnswers(answers)) throw new Error("回答が正しくありません");
    var score = {}, mainCount = {}, firstMain = {}, firstAny = {};
    D.TYPE_ORDER.forEach(function (t) { score[t] = 0; mainCount[t] = 0; firstMain[t] = 99; firstAny[t] = 99; });
    answers.forEach(function (optionIndex, q) {
      var opt = D.QUESTIONS[q].options[optionIndex];
      score[opt.main] += 2;
      score[opt.sub] += 1;
      mainCount[opt.main]++;
      if (firstMain[opt.main] === 99) firstMain[opt.main] = q;
      if (firstAny[opt.main] === 99) firstAny[opt.main] = q;
      if (firstAny[opt.sub] === 99) firstAny[opt.sub] = q;
    });
    var ranked = D.TYPE_ORDER.slice().sort(function (a, b) {
      return (score[b] - score[a]) || (mainCount[b] - mainCount[a]) ||
        (firstMain[a] - firstMain[b]) || (firstAny[a] - firstAny[b]) ||
        (D.TYPE_ORDER.indexOf(a) - D.TYPE_ORDER.indexOf(b));
    });
    return { type: ranked[0], sub: ranked[1], scores: score };
  }

  function isValidAnswers(answers) {
    return Array.isArray(answers) && answers.length === D.QUESTIONS.length && answers.every(function (v, q) {
      return v === Math.floor(v) && v >= 0 && v < D.QUESTIONS[q].options.length;
    });
  }

  // ---- サブタイプコード（4つの軸）：8タイプの判定（diagnoseType）とは別に計算する ----
  // axisAnswers: 追加の4問（Q11〜Q14）で選んだ選択肢の番号。mainAnswers: 既存の10問の答え（なければ追加の4問だけで決める）
  //
  // 軸ごとに、両側（例：E と W）の点数をそれぞれ合計し、「その側の平均的な点数」で割ってから比べる。
  //   平均的な点数＝関係する質問ごとに、4つの選択肢のその側の点数の平均を足したもの
  //   （選択肢の数のちがいで、片方の文字が有利にならないようにするため）
  //   左側の割合 ＝ (左 + 補正) ÷ (左 + 右 + 補正×2)  … 補正で 0%・100% のような極端な値を避ける
  // 割合が 45〜55% なら X（バランス型）、56〜65% なら「やや」、66% 以上ならその側。
  // 割合は回答から出した傾向の目安で、確率ではない
  function isValidAxisAnswers(axisAnswers) {
    return Array.isArray(axisAnswers) && axisAnswers.length === D.AXIS_QUESTIONS.length && axisAnswers.every(function (v, q) {
      return v === Math.floor(v) && v >= 0 && v < D.AXIS_QUESTIONS[q].options.length;
    });
  }

  // 質問ごとの「選択肢 → [軸, 文字, 点数] の一覧」。追加の4問は AXIS_QUESTIONS から作る
  function dedicatedTags(i) {
    return D.AXIS_QUESTIONS[i].options.map(function (o) { return [[D.AXIS_QUESTIONS[i].axis, o.pole, o.points]]; });
  }

  function diagnoseAxes(mainAnswers, axisAnswers) {
    if (!isValidAxisAnswers(axisAnswers)) throw new Error("サブタイプの回答が正しくありません");
    var reuse = isValidAnswers(mainAnswers);
    var R = D.AXIS_RULES;
    // 使う質問：[その質問の選択肢ごとのタグ, 選んだ選択肢の番号]
    var sources = D.AXIS_QUESTIONS.map(function (q, i) { return [dedicatedTags(i), axisAnswers[i]]; });
    if (reuse) D.AXIS_TAGS.forEach(function (tags, q) { sources.push([tags, mainAnswers[q]]); });
    var axes = D.AXES.map(function (axis) {
      var got = [0, 0], base = [0, 0];
      sources.forEach(function (src) {
        var tags = src[0];
        tags.forEach(function (optionTags, o) {
          optionTags.forEach(function (t) {
            if (t[0] !== axis.key) return;
            var side = t[1] === axis.letters[0] ? 0 : 1;
            base[side] += t[2] / tags.length;          // 平均的な点数
            if (o === src[1]) got[side] += t[2];        // 選んだ選択肢の点数
          });
        });
      });
      // 片側の平均的な点数が 0（その側に点の入る選択肢がない）なら、その側は 0 として扱う（NaN・Infinity にしない）
      var left = base[0] ? got[0] / base[0] : 0, right = base[1] ? got[1] / base[1] : 0;
      var percent = Math.round((left + R.smoothing) / (left + right + R.smoothing * 2) * 100);
      var lean = Math.max(percent, 100 - percent);
      var letter = lean <= R.balance ? "X" : percent > 50 ? axis.letters[0] : axis.letters[1];
      var strength = letter === "X" ? "balance" : lean < R.clear ? "slight" : "clear";
      return { key: axis.key, letter: letter, strength: strength, percent: percent, points: got };
    });
    return { code: axes.map(function (a) { return a.letter; }).join(""), axes: axes, reused: reuse };
  }

  // ---- 毎日の推し活占い（質問なし）：端末のタイムゾーンに関係なく日本時間（UTC+9）で日付を決める ----
  var DAY_MS = 86400000;
  var JST_OFFSET_MS = 9 * 3600000;

  function jstDayNumber(date) {
    return Math.floor((date.getTime() + JST_OFFSET_MS) / DAY_MS);
  }

  function jstDateKey(date) {
    var t = new Date(date.getTime() + JST_OFFSET_MS);
    return t.getUTCFullYear() + "-" + ("0" + (t.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + t.getUTCDate()).slice(-2);
  }

  // 次の日本時間0時までのミリ秒
  function msUntilNextJstDay(date) {
    return DAY_MS - ((date.getTime() + JST_OFFSET_MS) % DAY_MS);
  }

  // 候補を、リストごとに決まった並び（シャッフルした順番）で1日ずつ順番に出す。
  // 並びはユーザーID（なければ全員共通）ごとに固定なので、同じ人には候補の数と同じ日数のあいだ
  // 同じものが出ず、前の日と同じ内容が続くこともない（t は日付の番号。2つ選ぶときは 2t と 2t+1）
  var orders = {}, orderCount = 0;
  function orderOf(n, salt) {
    var key = salt + "|" + n;
    if (orders[key]) return orders[key];
    if (++orderCount > 2000) { orders = {}; orderCount = 1; } // たくさんのIDで計算するテスト用に、覚えておく数を抑える
    var rand = seededRandom(hash("order|" + key)), o = [];
    for (var i = 0; i < n; i++) o.push(i);
    for (var j = n - 1; j > 0; j--) {
      var r = Math.floor(rand() * (j + 1)), tmp = o[j];
      o[j] = o[r];
      o[r] = tmp;
    }
    return (orders[key] = o);
  }
  function cycle(list, t, salt) {
    var n = list.length;
    return list[orderOf(n, salt)[((t % n) + n) % n]];
  }
  function cyclePair(list, day, salt) {
    return [cycle(list, day * 2, salt), cycle(list, day * 2 + 1, salt)];
  }

  // userId（ブラウザごとのランダムなID）があれば、「日本時間の日付＋ID」で一人ひとり違う運勢になる。
  // userId がなければ、今までどおり日付だけで決まる全員共通の運勢。
  // typeKey（保存済みの推し活タイプ）があれば、メッセージ・ラッキーアクション・お守りの言葉をタイプに合わせる。
  // 運勢の★・運勢文・ラッキーカラー/アイテム/時間帯・お守りはタイプを使わずに決める（タイプで有利・不利が出ない）。
  function getDailyFortune(date, typeKey, userId) {
    var now = date || new Date();
    var key = jstDateKey(now);
    var day = jstDayNumber(now);
    var u = userId ? "|u:" + userId : ""; // 並びと★の乱数を、ユーザーごとに変える
    // ★の数だけは日付ごとの乱数（出やすさに差をつけるため。前の日と同じ★になることはある）
    var r = seededRandom(hash("daily|" + key + u))();
    var stars = r < 0.06 ? 1 : r < 0.22 ? 2 : r < 0.52 ? 3 : r < 0.84 ? 4 : 5;
    var allActions = Object.keys(D.ACTIONS).reduce(function (list, k) { return list.concat(D.ACTIONS[k]); }, []);
    var result = {
      date: key,
      typeKey: null,
      // 同じ★が続いても、運勢文は前の日とちがうものになる
      luck: { stars: stars, title: D.LUCK[stars].title, text: cycle(D.DAILY.luck[stars], day, "luck" + stars + u) },
      actions: cyclePair(allActions, day, "actions" + u),
      lucky: {
        color: cycle(D.LUCKY_COLORS, day, "color" + u),
        item: cycle(D.LUCKY_ITEMS, day, "item" + u),
        time: cycle(D.LUCKY_TIMES, day, "time" + u)
      },
      message: cycle(D.DAILY.messages, day, "message" + u),
      omamori: cycle(D.DAILY.omamori, day, "omamori" + u)
    };
    var type = typeKey && D.TYPES[typeKey];
    if (type) {
      // タイプ別の部分は、タイプごと（とユーザーごと）の並びで選ぶ。ほかの部分は変えない
      result.typeKey = typeKey;
      result.actions = cyclePair(type.daily.actions, day, "actions|" + typeKey + u);
      result.message = cycle(type.daily.messages, day, "message|" + typeKey + u);
      // タイプのお守りの言葉（結果画面のお守りの言葉と、毎日用の言葉を順番に）
      result.typeOmamori = cycle([type.omamori.charm].concat(type.daily.charms || []), day, "charm|" + typeKey + u);
    }
    return result;
  }

  var api = {
    diagnoseType: diagnoseType, isValidAnswers: isValidAnswers,
    diagnoseAxes: diagnoseAxes, isValidAxisAnswers: isValidAxisAnswers,
    getDailyFortune: getDailyFortune, jstDateKey: jstDateKey, msUntilNextJstDay: msUntilNextJstDay
  };
  root.OshiLuna = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
