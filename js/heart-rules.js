/* ルナのこころ整理：回答の正規化・検証と、採用済みルールによる結果の選択（仕様書 v0.1）
 * 画面（DOM）・保存・外部通信とは分ける。同じ回答からは、いつも同じ結果になる（クリック順・実行時の生成を使わない）。
 * 根拠：Q2本文＝9章、テーマ補足＝12.5、小さな一歩＝13.11（選択順と36候補）、適合判定＝13.13、期限補足＝13.9・13.12。 */
(function (root) {
  "use strict";
  var D = root.OshiLunaHeartData || (typeof require === "function" ? require("./heart-data.js") : null);

  var ORDER = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"];
  var THEMES = D.q1.options.map(function (o) { return o.id; });

  // ---- 質問の定義 ----
  // q3・q4 は Q1 で選んだテーマの2問（テーマが未回答なら null）
  function questionDef(qid, answers) {
    if (qid === "q3" || qid === "q4") {
      var t = answers && answers.q1;
      return t && D.themes[t] ? D.themes[t][qid] : null;
    }
    return D[qid] || null;
  }
  function numberOf(def, id) {
    for (var i = 0; i < def.options.length; i++) if (def.options[i].id === id) return i + 1;
    return 0;
  }
  function labelOf(def, id) { var n = numberOf(def, id); return n ? def.options[n - 1].label : null; }

  // 選択の正規化：表示順（番号順）に並べる。クリック順を保存しない
  function normalize(def, ids) {
    return ids.slice().sort(function (a, b) { return numberOf(def, a) - numberOf(def, b); });
  }
  // 選択の検証：選択肢にある・重複なし・最大件数・単独の選択肢は単独
  function validSelection(def, value) {
    if (!def) return false;
    if (def.max === 1) return typeof value === "string" && numberOf(def, value) > 0;
    if (!Array.isArray(value) || value.length < 1 || value.length > def.max) return false;
    var seen = {};
    for (var i = 0; i < value.length; i++) {
      if (typeof value[i] !== "string" || !numberOf(def, value[i]) || seen[value[i]]) return false;
      seen[value[i]] = true;
      if (value.length > 1 && def.exclusive.indexOf(numberOf(def, value[i])) >= 0) return false;
    }
    return value.join("|") === normalize(def, value).join("|");
  }
  // 選択肢を押したときの新しい選択（単独の選択肢を選ぶと、ほかを外す。最大件数に達したら追加しない）
  function toggle(def, current, id) {
    if (def.max === 1) return current === id ? null : id;
    var cur = Array.isArray(current) ? current.slice() : [];
    var n = numberOf(def, id);
    if (!n) return current;
    var at = cur.indexOf(id);
    if (at >= 0) { cur.splice(at, 1); return cur.length ? normalize(def, cur) : null; }
    if (def.exclusive.indexOf(n) >= 0) return [id];
    cur = cur.filter(function (x) { return def.exclusive.indexOf(numberOf(def, x)) < 0; });
    if (cur.length >= def.max) return cur.length ? normalize(def, cur) : null;
    cur.push(id);
    return normalize(def, cur);
  }
  function isAnswered(qid, answers) {
    var v = answers[qid];
    if (qid === "q7") return v !== null && v !== undefined;
    return v !== null && v !== undefined;
  }
  // Q1 を変えたときは Q3・Q4 だけ消す（Q2・Q5・Q6・Q7 は残す）
  function setTheme(answers, theme) {
    var a = copyAnswers(answers);
    if (a.q1 !== theme) { a.q3 = null; a.q4 = null; }
    a.q1 = theme;
    return a;
  }
  function emptyAnswers() { return { q1: null, q2: null, q3: null, q4: null, q5: null, q6: null, q7: null }; }
  function copyAnswers(a) {
    var o = emptyAnswers();
    ORDER.forEach(function (k) { o[k] = Array.isArray(a[k]) ? a[k].slice() : a[k]; });
    return o;
  }
  // 回答全体の検証。complete=true なら Q1〜Q6 がすべて回答済みであること（Q7 は任意）
  function validateAnswers(a, complete) {
    if (!a || typeof a !== "object" || Array.isArray(a)) return false;
    var keys = Object.keys(a).sort().join(",");
    if (keys !== ORDER.slice().sort().join(",")) return false;
    if (a.q7 !== null && !(typeof a.q7 === "number" && a.q7 % 1 === 0 && a.q7 >= D.q7.min && a.q7 <= D.q7.max)) return false;
    if ((a.q3 !== null || a.q4 !== null) && a.q1 === null) return false; // テーマなしの Q3・Q4 はない
    for (var i = 0; i < 6; i++) {
      var qid = ORDER[i], v = a[qid];
      if (v === null) { if (complete) return false; continue; }
      if (!validSelection(questionDef(qid, a), v)) return false;
    }
    return true;
  }

  // ---- 9章：Q2本文（単独＝S、2つ＝番号昇順の P。10・11 は単独のみ） ----
  function q2TextId(q2) {
    if (!validSelection(D.q2, q2)) return null;
    var n = q2.map(function (id) { return numberOf(D.q2, id); });
    var pad = function (x) { return (x < 10 ? "0" : "") + x; };
    return n.length === 1 ? "S" + pad(n[0]) : "P" + pad(n[0]) + "-" + pad(n[1]);
  }
  // ---- 12.5：Q1=feeling かつ Q4 に選択肢5があるときだけ、テーマ補足を1回添える ----
  function hasFeelingSupplement(a) {
    return a.q1 === "feeling" && Array.isArray(a.q4) && a.q4.indexOf("feeling-q4-05") >= 0;
  }

  // ---- 13.11：小さな一歩 ----
  // Q3 の番号（テーマごと。複数選択のテーマは番号の配列）
  function q3Numbers(a) {
    var def = questionDef("q3", a);
    if (!def || a.q3 === null) return [];
    return (Array.isArray(a.q3) ? a.q3 : [a.q3]).map(function (id) { return numberOf(def, id); });
  }
  function themeQ3(a, theme, nums) {
    if (a.q1 !== theme) return false;
    var have = q3Numbers(a);
    for (var i = 0; i < have.length; i++) if (nums.indexOf(have[i]) >= 0) return true;
    return false;
  }
  // 状況条件（13.11「初回の状況条件」）。回答で確認できない前提は満たさない扱い（13.13）
  var SITUATION = {
    none: function () { return true; },
    // 除外2状態：ticket の Q3=3（落選）、travel の Q3=5（見送り）
    notExcluded: function (a) { return !themeQ3(a, "ticket", [3]) && !themeQ3(a, "travel", [5]); },
    calm: function (a) { return themeQ3(a, "social", [3]) || themeQ3(a, "vague", [2]) || themeQ3(a, "feeling", [6]); },
    moneyBuy: function (a) { return themeQ3(a, "money", [1]); },
    work: function (a) { return themeQ3(a, "ticket", [1, 4, 5]) || themeQ3(a, "travel", [1, 2, 3, 4]) || themeQ3(a, "money", [2]); },
    travelGoing: function (a) { return themeQ3(a, "travel", [3, 4]); },
    moneyWork: function (a) { return themeQ3(a, "ticket", [1, 4, 5]) || themeQ3(a, "travel", [1, 2]) || themeQ3(a, "money", [2]); },
    moneyRest: function (a) { return themeQ3(a, "ticket", [1, 4, 5]) || themeQ3(a, "travel", [1, 2, 3, 4]) || themeQ3(a, "money", [1, 2, 3, 4]); }
  };
  // 負担区分（全文を候補にできる Q7）："low"＝回答済みの1〜3、"normal"＝1〜7・未回答
  function burdenOk(kind, q7) {
    if (kind === "low") return q7 !== null && q7 >= 1 && q7 <= 3;
    if (kind === "normal") return q7 === null || (q7 >= 1 && q7 <= 7);
    return false; // "off"：初回対象外
  }
  // 13.11 の36行（キー＝選択肢の番号を昇順に「+」でつないだもの）
  var Q6_CANDIDATES = {
    "1": ["action-q6-concern", "normal", "none"],
    "2": ["action-q6-emotion", "normal", "none"],
    "3": ["action-q6-values", "normal", "none"],
    "4": ["action-q6-calm", "normal", "calm"],
    "5": ["action-q6-pace", "low", "none"],
    "1+2": ["action-q6-concern-emotion", "low", "none"],
    "1+3": ["action-q6-concern-values", "low", "none"],
    "1+4": ["action-q6-concern-calm", "normal", "none"],
    "1+5": ["action-q6-concern-pace", "low", "none"],
    "2+3": ["action-q6-emotion-values", "low", "none"],
    "2+4": ["action-q6-emotion-calm", "normal", "none"],
    "2+5": ["action-q6-emotion-pace", "low", "none"],
    "3+4": ["action-q6-values-calm", "normal", "none"],
    "3+5": ["action-q6-values-pace", "low", "notExcluded"],
    "4+5": ["action-q6-calm-pace", "normal", "none"]
  };
  var Q5_CANDIDATES = {
    "1": ["action-q5-money", "normal", "moneyBuy"],
    "2": ["action-q5-work", "low", "work"],
    "3": ["action-q5-rest", "low", "travelGoing"],
    "4": ["action-q5-personal-time", "low", "none"],
    "5": ["action-q5-love", "normal", "none"],
    "6": ["action-q5-own-pace", "low", "notExcluded"],
    "1+2": ["action-money-work-plan", "low", "moneyWork"],
    "1+3": ["action-money-rest-plan", "low", "moneyRest"],
    "1+4": ["action-money-personal-time", "normal", "none"],
    "1+5": ["action-money-love-item", "low", "moneyBuy"],
    "1+6": ["action-money-own-pace", "low", "none"],
    "2+3": ["action-work-rest-plan", "low", "travelGoing"],
    "2+4": ["action-work-personal-time", "off", "none"], // 初回対象外（本文は保持。自動選択・他候補への置換はしない）
    "2+5": ["action-work-love", "normal", "none"],
    "2+6": ["action-work-own-pace", "low", "none"],
    "3+4": ["action-rest-personal-time", "normal", "none"],
    "3+5": ["action-rest-love", "normal", "none"],
    "3+6": ["action-rest-own-pace", "normal", "none"],
    "4+5": ["action-personal-time-love", "low", "none"],
    "4+6": ["action-personal-time-own-pace", "low", "none"],
    "5+6": ["action-love-own-pace", "normal", "notExcluded"]
  };
  var Q5_NONE = "q5-none", Q6_NONE = "q6-none";
  function keyOf(def, ids) { return ids.map(function (id) { return numberOf(def, id); }).join("+"); }
  function candidateFits(c, a) { return !!c && burdenOk(c[1], a.q7) && SITUATION[c[2]](a); }

  // 小さな一歩を1つ選ぶ。戻り値 { id, route }（route は確認用の経路名）
  function selectAction(a) {
    // 1. Q7=8〜10 なら休息文だけ
    if (a.q7 !== null && a.q7 >= 8) return { id: "action-rest-high", route: "rest" };
    // 2. Q6 通常回答：対応する1候補。合わなければ共通文（Q5・期限専用文へ戻さない）
    if (a.q6.indexOf(Q6_NONE) < 0) {
      var c6 = Q6_CANDIDATES[keyOf(D.q6, a.q6)];
      return candidateFits(c6, a) ? { id: c6[0], route: "q6" } : { id: "action-common-reflect", route: "q6-common" };
    }
    // 3. Q6=6（まだ分からない・答えたくない）：Q5 の対応する1候補
    if (a.q5.indexOf(Q5_NONE) < 0) {
      var c5 = Q5_CANDIDATES[keyOf(D.q5, a.q5)];
      if (candidateFits(c5, a)) return { id: c5[0], route: "q5" };
    }
    // 4. 合う Q5 候補がない：限定条件を満たすときだけ期限専用文、ほかは共通文（Q7 未回答を1〜3と扱わない）
    if (a.q7 !== null && a.q7 >= 1 && a.q7 <= 3 && (themeQ3(a, "ticket", [1, 4, 5]) || themeQ3(a, "money", [2]))) {
      return { id: "action-deadline-reminder", route: "reminder" };
    }
    return { id: "action-common-reflect", route: "common" };
  }

  // ---- 13.9・13.12：共通の期限補足 ----
  // A：補足の対象（このうち1つ以上を表示し、B がないとき「今できる小さな一歩」の直後に1回だけ）
  var DEADLINE_A = ["action-q5-rest", "action-q5-own-pace", "action-q6-pace", "action-q6-calm-pace", "action-common-reflect",
    "action-money-rest-plan", "action-money-own-pace", "action-work-personal-time", "action-work-love", "action-work-own-pace",
    "action-rest-personal-time", "action-rest-own-pace", "action-personal-time-love", "action-love-own-pace", "P02-06", "P04-06"];
  // B：本文に期限の案内がすでにある（共通補足を追加しない）
  var DEADLINE_B = ["action-rest-high", "action-deadline-reminder", "P02-08"];
  function needsDeadlineSupplement(shownIds) {
    for (var i = 0; i < shownIds.length; i++) if (DEADLINE_B.indexOf(shownIds[i]) >= 0) return false;
    for (var j = 0; j < shownIds.length; j++) if (DEADLINE_A.indexOf(shownIds[j]) >= 0) return true;
    return false;
  }

  // ---- 結果（4区分）を作る：表示とコピーの両方にこの内容を使う ----
  function labels(def, v) { return (Array.isArray(v) ? v : [v]).map(function (id) { return labelOf(def, id); }); }
  function buildResult(a) {
    if (!validateAnswers(a, true)) return null;
    var textId = q2TextId(a.q2), act = selectAction(a);
    var supplement = hasFeelingSupplement(a);
    var deadline = needsDeadlineSupplement([textId, act.id]);
    return {
      concern: [
        { label: D.q1.text, values: labels(D.q1, a.q1) },
        { label: D.q2.text, values: labels(D.q2, a.q2) },
        { label: questionDef("q3", a).text, values: labels(questionDef("q3", a), a.q3) },
        { label: questionDef("q4", a).text, values: labels(questionDef("q4", a), a.q4) }
      ],
      values: [
        { label: "大切にしたいもの", values: labels(D.q5, a.q5) },
        { label: "今、整理したいこと", values: labels(D.q6, a.q6) }
      ],
      message: { textId: textId, paragraphs: D.q2Texts[textId].slice(),
        supplementId: supplement ? "supplement-feeling-forgotten" : null,
        supplement: supplement ? D.supplementFeelingForgotten.slice() : [] },
      action: { actionId: act.id, route: act.route, paragraphs: D.actions[act.id].slice(),
        deadlineSupplement: deadline ? D.deadlineSupplement : null }
    };
  }

  // ---- 6.3：整理した日付（日本時間で結果を表示した日） ----
  function jstDateKey(date) {
    var d = new Date(date.getTime() + 9 * 3600 * 1000);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
  }
  function formatDate(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
    return m ? Number(m[1]) + "年" + Number(m[2]) + "月" + Number(m[3]) + "日" : "";
  }
  function validDateKey(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }

  // ---- 結果の見出しとコピー用の文章 ----
  var SECTIONS = { concern: "💭 今、気になっていること", values: "🎀 大切にしたいこと", message: "🐈 ルナからのひとこと", action: "⭐ 今できる小さな一歩" };
  function plain(p) { return p.replace(/\*\*(.+?)\*\*/g, "$1"); } // 強調の印（**）はコピーに入れない
  function copyText(result, dateKey) {
    var out = [D.ui.title, formatDate(dateKey), ""];
    out.push("【" + SECTIONS.concern + "】");
    result.concern.forEach(function (r) { out.push(r.label); r.values.forEach(function (v) { out.push("・" + v); }); });
    out.push("", "【" + SECTIONS.values + "】");
    result.values.forEach(function (r) { out.push(r.label); r.values.forEach(function (v) { out.push("・" + v); }); });
    out.push("", "【" + SECTIONS.message + "】");
    out.push(result.message.paragraphs.concat(result.message.supplement).map(plain).join("\n\n"));
    out.push("", "【" + SECTIONS.action + "】");
    var act = result.action.paragraphs.map(plain);
    if (result.action.deadlineSupplement) act.push(result.action.deadlineSupplement);
    out.push(act.join("\n\n"));
    return out.join("\n");
  }

  // ---- 保存内容の検証（19.3）。版・型・件数・回答の整合・結果と回答の一致を確かめる ----
  var PHASES = ["question", "result"];
  function validateRecord(r) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return false;
    var keys = ["answers", "phase", "questionId", "questionVersion", "resultDate", "resultSnapshot", "resultVersion", "schemaVersion"];
    if (Object.keys(r).sort().join(",") !== keys.join(",")) return false;
    if (r.schemaVersion !== D.versions.schema || r.questionVersion !== D.versions.question || r.resultVersion !== D.versions.result) return false;
    if (PHASES.indexOf(r.phase) < 0 || ORDER.indexOf(r.questionId) < 0) return false;
    if (r.phase === "question") {
      if (!validateAnswers(r.answers, false) || r.resultSnapshot !== null || r.resultDate !== null) return false;
      // 再開位置：テーマ未回答の Q3・Q4 には戻れない
      if ((r.questionId === "q3" || r.questionId === "q4") && r.answers.q1 === null) return false;
      return true;
    }
    // 結果：回答がそろい、日付が正しく、保存した結果が今の版の選択ルールで回答から作る結果と同じ
    if (!validateAnswers(r.answers, true) || !validDateKey(r.resultDate) || r.questionId !== "q7") return false;
    var expect = buildResult(r.answers);
    return !!expect && JSON.stringify(expect) === JSON.stringify(r.resultSnapshot);
  }

  var api = {
    ORDER: ORDER, THEMES: THEMES, SECTIONS: SECTIONS, Q6_CANDIDATES: Q6_CANDIDATES, Q5_CANDIDATES: Q5_CANDIDATES,
    DEADLINE_A: DEADLINE_A, DEADLINE_B: DEADLINE_B,
    questionDef: questionDef, numberOf: numberOf, labelOf: labelOf, normalize: normalize, validSelection: validSelection,
    toggle: toggle, isAnswered: isAnswered, setTheme: setTheme, emptyAnswers: emptyAnswers, copyAnswers: copyAnswers,
    validateAnswers: validateAnswers, q2TextId: q2TextId, hasFeelingSupplement: hasFeelingSupplement,
    selectAction: selectAction, needsDeadlineSupplement: needsDeadlineSupplement, buildResult: buildResult,
    jstDateKey: jstDateKey, formatDate: formatDate, validDateKey: validDateKey, copyText: copyText, plain: plain,
    validateRecord: validateRecord
  };
  root.OshiLunaHeartRules = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
