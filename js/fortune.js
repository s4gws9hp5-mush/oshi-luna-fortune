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
    getDailyFortune: getDailyFortune, jstDateKey: jstDateKey, msUntilNextJstDay: msUntilNextJstDay
  };
  root.OshiLuna = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
