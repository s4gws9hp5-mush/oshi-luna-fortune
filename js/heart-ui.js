/* ルナのこころ整理：画面の表示と入力（heart/index.html）
 * - 文章は heart-data.js の採用文と、heart-rules.js が選んだ結果だけを表示する（実行時に文を作らない）
 * - 回答・結果は heart-storage.js でこの端末にだけ保存する。URL・解析・運営側へは送らない
 * - 保存できなくても画面はそのまま使える。保存の成功は、読み直して確かめたときだけ成功とする */
(function () {
  "use strict";
  var D = window.OshiLunaHeartData, R = window.OshiLunaHeartRules, S = window.OshiLunaHeartStorage;
  if (!D || !R || !S) return;
  var $ = function (id) { return document.getElementById(id); };
  // 保存の窓口：確かめるまでは書き込まない（既存の保存内容を本人の確認なしに上書きしない）
  var store = S.createSession(function () { return window.localStorage; });

  var state = {
    screen: "intro", answers: R.emptyAnswers(), qid: "q1",
    result: null, dateKey: null,   // 結果（表示した当時の内容）と整理した日付
    stored: "empty",               // 保存の状態：empty / ok / invalid / unavailable
    saved: null,                   // 読み込めた保存内容
    saveFailed: false, pendingConfirm: null
  };

  // ---- 文字の表示（保存内容も文章もテキストとして入れる。HTML として扱わない） ----
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  // 段落：段落内の改行は <br>。**…** は強調（休息文の1行目）
  function para(text) {
    var p = el("p");
    text.split("\n").forEach(function (line, i) {
      if (i) p.appendChild(document.createElement("br"));
      var m = /^\*\*(.+)\*\*$/.exec(line);
      if (m) p.appendChild(el("strong", "", m[1])); else p.appendChild(document.createTextNode(line));
    });
    return p;
  }
  function fill(box, paragraphs) { box.textContent = ""; paragraphs.forEach(function (t) { box.appendChild(para(t)); }); }
  // 「、」「。」のあとで区切ったまとまりごとに改行する（文は変えない。iPhone の Safari でも言葉の途中で切れないように）
  function phrased(box, text) {
    box.textContent = "";
    (text.match(/[^、。]+[、。]?/g) || [text]).forEach(function (t) { box.appendChild(el("span", "h-phrase", t)); });
  }
  function button(text) { return text.replace(/^［|］$/g, ""); }

  function show(screen) {
    state.screen = screen;
    ["intro", "question", "loading", "result"].forEach(function (s) { $("h-" + s).hidden = s !== screen; });
    $("h-save-failed").hidden = !(state.saveFailed && screen !== "intro");
    window.scrollTo(0, 0);
  }

  // ---- 保存 ----
  function record() {
    return {
      schemaVersion: D.versions.schema, questionVersion: D.versions.question, resultVersion: D.versions.result,
      phase: state.result ? "result" : "question", questionId: state.result ? "q7" : state.qid,
      answers: R.copyAnswers(state.answers),
      resultSnapshot: state.result, resultDate: state.result ? state.dateKey : null
    };
  }
  function persist() {
    var res = store.write(record());
    if (res.ok) { state.stored = "ok"; state.saved = record(); state.saveFailed = false; }
    else {
      // 書けなかった・書かなかった：画面の回答はそのまま。保存内容があると分かったときは、開始前の案内に反映する（上書きしない）
      state.saveFailed = true; $("h-save-failed").textContent = D.ui.saveFailed;
      if (res.reason === "existing") { state.stored = res.status; state.saved = res.status === "ok" ? res.record : null; }
    }
    $("h-save-failed").hidden = !(state.saveFailed && state.screen !== "intro");
  }

  // ---- 開始前 ----
  function renderIntro() {
    phrased($("h-intro-lead"), D.ui.introLead);
    $("h-intro-free").textContent = D.ui.introFree;
    phrased($("h-intro-privacy"), D.ui.introPrivacy);
    $("h-details-summary").textContent = D.ui.introDetailsLabel;
    fill($("h-intro-text"), D.ui.introDetails);
    var box = $("h-resume"), main = $("h-resume-main"), sub = $("h-resume-sub");
    box.hidden = true;
    if (state.stored === "ok" && state.saved) {
      var isResult = state.saved.phase === "result";
      phrased($("h-resume-text"), isResult ? D.ui.resumeResult : D.ui.resumeProgress);
      main.textContent = isResult ? D.ui.buttons32[1][0] : D.ui.buttons32[0][0];
      sub.textContent = isResult ? D.ui.buttons32[1][1] : D.ui.buttons32[0][1];
      main.onclick = isResult ? showSavedResult : resume;
      sub.onclick = function () { openConfirm(); };
      box.hidden = false;
    } else if (state.stored === "invalid" && !state.dismissedInvalid) {
      // 読み込めない：推測で直さず、自動で消さない（3.3）
      phrased($("h-resume-text"), D.ui.unreadable);
      main.textContent = "最初から";
      sub.textContent = "今はやめる";
      main.onclick = function () { openConfirm(); };
      sub.onclick = function () { state.dismissedInvalid = true; renderIntro(); $("h-intro-title").scrollIntoView(); };
      box.hidden = false;
    }
    // 保存内容の案内を出しているときは、同じ働き（最初から・新しく整理する）の開始ボタンを重ねて出さない
    $("h-start").hidden = !box.hidden;
    $("h-intro-delete").hidden = !(state.stored === "ok" || state.stored === "invalid");
  }
  function begin() {
    // 保存した内容（読み込めない内容を含む）があるときは、上書きせず削除の確認へ
    if (state.stored === "ok" || state.stored === "invalid") { openConfirm(); return; }
    state.answers = R.emptyAnswers(); state.result = null; state.dateKey = null; state.qid = "q1";
    show("question"); renderQuestion(); persist();
  }
  function resume() {
    var r = state.saved;
    store.adopt(); // 本人が保存内容から続けることを選んだ
    state.answers = R.copyAnswers(r.answers); state.result = null; state.dateKey = null; state.qid = r.questionId;
    show("question"); renderQuestion();
  }
  function showSavedResult() {
    var r = state.saved;
    store.adopt();
    state.answers = R.copyAnswers(r.answers); state.result = r.resultSnapshot; state.dateKey = r.resultDate; state.qid = "q7";
    show("result"); renderResult();
  }

  // ---- 削除の確認（3.2） ----
  var lastFocus = null;
  function openConfirm() {
    lastFocus = document.activeElement;
    $("h-confirm-text").textContent = D.ui.deleteConfirm;
    $("h-confirm-yes").textContent = D.ui.buttons32[3][0];
    $("h-confirm-no").textContent = D.ui.buttons32[3][1];
    $("h-confirm-error").hidden = true;
    $("h-confirm").hidden = false;
    $("h-confirm-text").focus();
  }
  function closeConfirm() {
    $("h-confirm").hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function confirmDelete() {
    // 消したあと読んで「保存がない」と確かめられたときだけ、消せたとして最初に戻す。
    // 保存内容が残っている・保存領域に入れず確かめられないときは、成功と表示せず、画面の内容も保存内容もそのまま
    var res = store.remove();
    if (!res.ok) {
      $("h-confirm-error").textContent = "この端末に保存した内容を消せませんでした。";
      $("h-confirm-error").hidden = false;
      return;
    }
    state.stored = "empty";
    state.saved = null;
    state.answers = R.emptyAnswers(); state.result = null; state.dateKey = null; state.qid = "q1";
    state.saveFailed = false; state.dismissedInvalid = false;
    $("h-confirm").hidden = true;
    renderIntro(); show("intro");
    $("h-intro-title").focus();
  }

  // ---- 質問 ----
  function questionNumber(qid) { return R.ORDER.indexOf(qid) + 1; }
  function renderQuestion() {
    var qid = state.qid, def = R.questionDef(qid, state.answers);
    $("h-q-count").textContent = questionNumber(qid) + "／" + R.ORDER.length;
    $("h-progress").style.width = (questionNumber(qid) / R.ORDER.length) * 100 + "%";
    $("h-q-text").textContent = def.text;
    var note = qid === "q1" ? D.q1.note : qid === "q5" ? D.q5.note : "";
    $("h-q-note").textContent = note; $("h-q-note").hidden = !note;
    var isQ7 = qid === "q7";
    $("h-options").hidden = isQ7; $("h-q7").hidden = !isQ7; $("h-q7-skip").hidden = !isQ7;
    if (isQ7) $("h-q-pick").hidden = true;
    $("h-next").textContent = isQ7 ? "整理した結果を見る" : "次へ";
    if (isQ7) renderQ7(); else renderOptions(def);
    updateNext();
    $("h-q-text").focus({ preventScroll: true });
  }
  function renderOptions(def) {
    var box = $("h-options"), qid = state.qid, cur = state.answers[qid];
    box.textContent = "";
    var multi = def.max > 1;
    var count = Array.isArray(cur) ? cur.length : 0;
    def.options.forEach(function (o, i) {
      var chosen = multi ? Array.isArray(cur) && cur.indexOf(o.id) >= 0 : cur === o.id;
      // 最大件数まで選んだら、ほかの選択肢は選べないことを見た目でも示す（単独で選ぶ選択肢は押すとそれだけになる）
      var full = multi && !chosen && count >= def.max && def.exclusive.indexOf(i + 1) < 0;
      var b = el("button", "option h-option" + (chosen ? " is-chosen" : "") + (full ? " is-full" : ""));
      if (full) b.setAttribute("aria-disabled", "true");
      b.type = "button";
      b.setAttribute("aria-pressed", chosen ? "true" : "false");
      b.setAttribute("data-id", o.id);
      b.appendChild(el("span", "option-mark h-mark" + (multi ? " is-multi" : ""), chosen ? "✓" : ""));
      b.lastChild.setAttribute("aria-hidden", "true");
      b.appendChild(el("span", "h-option-label", o.label));
      b.addEventListener("click", function () { choose(o.id); });
      box.appendChild(b);
    });
    var pick = $("h-q-pick");
    if (multi) {
      var n = Array.isArray(cur) ? cur.length : 0;
      pick.textContent = "選択中 " + n + "／" + def.max; pick.hidden = false;
    } else { pick.hidden = true; }
  }
  function choose(id) {
    var qid = state.qid, def = R.questionDef(qid, state.answers);
    if (qid === "q1") {
      state.answers = R.setTheme(state.answers, id); // 1つ選択。別のテーマにしたときは Q3・Q4 だけ消す
    } else {
      var next = R.toggle(def, state.answers[qid], id);
      state.answers[qid] = next;
    }
    renderOptions(R.questionDef(qid, state.answers)); updateNext(); persist();
  }
  function updateNext() {
    $("h-next").disabled = !R.isAnswered(state.qid, state.answers);
  }
  function go(delta) {
    var i = R.ORDER.indexOf(state.qid) + delta;
    if (i < 0) { show("intro"); renderIntro(); return; }
    state.qid = R.ORDER[i];
    renderQuestion(); persist();
  }

  // ---- Q7 ----
  function faceFor(v) {
    for (var i = 0; i < D.q7.faces.length; i++) if (v >= D.q7.faces[i].from && v <= D.q7.faces[i].to) return D.q7.faces[i];
    return null;
  }
  var shownFace = null;
  var CENTER = (D.q7.min + D.q7.max) / 2; // 5.5：スライダーの見た目の中央
  function renderQ7() {
    $("h-q7-low").textContent = D.q7.lowLabel; $("h-q7-high").textContent = D.q7.highLabel;
    $("h-q7-note").textContent = D.q7.note; $("h-q7-skip").textContent = D.q7.skip;
    updateQ7(false);
  }
  function updateQ7(animate) {
    var v = state.answers.q7, range = $("h-q7-range"), face = faceFor(v), img = $("h-face");
    // 未回答：つまみをスライダーの見た目の中央（1〜10 の 5.5 の位置）に薄く置く、未回答専用の表示。
    // この位置は回答にも保存にも使わない（answers.q7 は null のまま）。回答後は実際の数値の位置（step=1）に戻す
    range.step = v === null ? "any" : "1";
    range.value = v === null ? CENTER : v;
    range.classList.toggle("is-unset", v === null);
    range.setAttribute("aria-valuetext", v === null ? "未回答" : v + "（" + (face ? face.alt : "") + "）");
    $("h-q7-value").textContent = v === null ? "未回答" : String(v);
    $("h-q7-value").classList.toggle("is-unset", v === null);
    if (face) {
      if (shownFace !== face.src) {
        img.src = "../images/heart/" + face.src;
        img.alt = "";
        if (animate) { img.classList.remove("is-pop"); void img.offsetWidth; img.classList.add("is-pop"); }
      }
      img.hidden = false; $("h-face-moon").hidden = true;
    } else { img.hidden = true; $("h-face-moon").hidden = false; }
    shownFace = face ? face.src : null;
    updateNext();
  }
  function setQ7(v, animate) {
    v = Math.max(D.q7.min, Math.min(D.q7.max, v));
    if (state.answers.q7 === v) return;
    state.answers.q7 = v; updateQ7(animate); persist();
  }

  // ---- 結果 ----
  // ［整理した結果を見る］［答えずに結果を見る］：結果は押したときに1回だけ作って保存し、そのあと約3秒の整理中の画面
  // （表示だけの演出。文章を作ったり外へ送ったりはしない）を見せてから表示する。
  // 先に保存するので、整理中に再読み込みしても、開き直すと「前回の結果」として出る（整理中の画面では止まらない）
  var LOADING_MS = 3000, REDUCED_MS = 300, finishing = false;
  function reduceMotion() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function finish(skipQ7) {
    if (finishing) return; // 連打しても1回だけ
    if (skipQ7) state.answers.q7 = null;
    var result = R.buildResult(state.answers);
    if (!result) return;
    finishing = true;
    $("h-next").disabled = true; $("h-q7-skip").disabled = true;
    state.result = result; state.dateKey = R.jstDateKey(new Date());
    persist();
    show("loading");
    $("h-loading-text").focus({ preventScroll: true });
    window.setTimeout(function () {
      finishing = false; $("h-q7-skip").disabled = false;
      show("result"); renderResult();
      $("h-result-title").focus({ preventScroll: true });
    }, reduceMotion() ? REDUCED_MS : LOADING_MS);
  }
  function rows(box, list) {
    box.textContent = "";
    list.forEach(function (r) {
      var d = el("div", "h-row");
      d.appendChild(el("p", "h-row-label", r.label));
      var ul = el("ul", "h-row-values");
      r.values.forEach(function (v) { ul.appendChild(el("li", "", v)); });
      d.appendChild(ul); box.appendChild(d);
    });
  }
  function renderResult() {
    var r = state.result;
    $("h-date").textContent = "整理した日：" + R.formatDate(state.dateKey);
    $("h-result-notice").textContent = D.ui.resultNotice;
    // 見出し：絵文字と文字を分け、文字にだけ蛍光ペンのようなマーカーを付ける（表示する文は R.SECTIONS と同じ）
    ["concern", "values", "message", "action"].forEach(function (k) {
      var h = $("h-sec-" + k), m = /^(\S+)\s+(.+)$/.exec(R.SECTIONS[k]);
      h.textContent = "";
      h.appendChild(el("span", "h-sec-emoji", m[1])); h.lastChild.setAttribute("aria-hidden", "true");
      h.appendChild(document.createTextNode(" "));
      h.appendChild(el("span", "h-hl", m[2]));
    });
    rows($("h-concern"), r.concern); rows($("h-values"), r.values);
    fill($("h-message"), r.message.paragraphs.concat(r.message.supplement));
    var act = r.action.paragraphs.slice();
    if (r.action.deadlineSupplement) act.push(r.action.deadlineSupplement);
    fill($("h-action"), act);
    // Coming Soon（採用文。ボタンは整理結果のコピー）
    var soon = $("h-soon"); soon.textContent = "";
    D.ui.comingSoon.forEach(function (t, i) {
      if (/^［.+］$/.test(t)) {
        var b = el("button", "btn btn-ghost h-copy", button(t)); b.type = "button";
        b.addEventListener("click", function () { copyResult("h-copy-area-soon"); });
        soon.appendChild(b);
      } else {
        var p = para(t); if (i === 2) p.className = "h-soon-title"; soon.appendChild(p);
      }
    });
    clearCopyAreas();
  }

  // ---- コピー（6.4） ----
  function clearCopyAreas() { $("h-copy-area-main").textContent = ""; $("h-copy-area-soon").textContent = ""; }
  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.top = "0"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function copyResult(areaId) {
    var text = R.copyText(state.result, state.dateKey);
    var done = function (ok) {
      clearCopyAreas();
      var area = $(areaId);
      if (ok) { area.appendChild(el("p", "h-copy-status", D.ui.copySuccess)); }
      else {
        // 失敗：成功と表示しない。コピーする予定だった全文を、選んで手動でコピーできるように出す
        area.appendChild(el("p", "h-copy-status is-error", D.ui.copyFailed));
        var ta = el("textarea", "h-copy-text"); ta.value = text; ta.readOnly = true; ta.rows = 12;
        ta.setAttribute("aria-label", "コピーする文章");
        ta.addEventListener("focus", function () { ta.select(); });
        area.appendChild(ta);
      }
      area.firstChild.setAttribute("role", "status");
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(legacyCopy(text)); });
    } else { done(legacyCopy(text)); }
  }

  // ---- 起動 ----
  function init() {
    var res = store.read();
    state.stored = res.status;
    state.saved = res.status === "ok" ? res.record : null;
    phrased($("h-loading-text"), D.ui.loading);
    renderIntro(); show("intro");
    $("h-start").addEventListener("click", begin);
    $("h-intro-delete").addEventListener("click", function () { openConfirm(); });
    $("h-next").addEventListener("click", function () { if (state.qid === "q7") finish(false); else go(1); });
    $("h-back").addEventListener("click", function () { go(-1); });
    $("h-q7-skip").addEventListener("click", function () { finish(true); });
    var range = $("h-q7-range");
    // タップ・ドラッグした位置の値（未回答の中央表示のあいだは step=any なので、いちばん近い整数にする）
    var rangeValue = function () { return Math.round(Number(range.value)); };
    range.addEventListener("input", function () { if (Number(range.value) !== CENTER || state.answers.q7 !== null) setQ7(rangeValue(), true); });
    range.addEventListener("change", function () { if (Number(range.value) !== CENTER || state.answers.q7 !== null) setQ7(rangeValue(), true); });
    // 未回答のとき、中央（5.5）の点線のつまみの上（5・6 の位置を含む）をタップしても、ブラウザはつまみをつかんだだけと扱い、
    // 値が変わらない。そこで、指を離した位置から値を求める（つまみの中心が動く範囲に対する位置 → 1〜10 のいちばん近い値）。
    // 中央（5.5）のごく近く（5と6のちょうど間）を押しただけのときは、どちらとも決められないので未回答のまま
    var THUMB = 30; // つまみの幅（css/heart.css の .h-slider のつまみ）
    range.addEventListener("pointerup", function (e) {
      if (state.answers.q7 !== null) return;
      var r = range.getBoundingClientRect(), span = r.width - THUMB;
      if (span <= 0) return;
      var raw = D.q7.min + Math.max(0, Math.min(1, (e.clientX - r.left - THUMB / 2) / span)) * (D.q7.max - D.q7.min);
      if (Math.abs(raw - CENTER) < 0.25) return;
      setQ7(Math.round(raw), true);
    });
    // キーボード：未回答のときは ±ボタンと同じく ←↓ で4、→↑ で6
    range.addEventListener("keydown", function (e) {
      if (state.answers.q7 !== null) return;
      var d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if (d) { e.preventDefault(); setQ7(d < 0 ? 4 : 6, true); }
    });
    // 未回答のときの±：−で4、＋で6 を、押した時点で回答にする
    $("h-q7-minus").addEventListener("click", function () { setQ7(state.answers.q7 === null ? 4 : state.answers.q7 - 1, true); });
    $("h-q7-plus").addEventListener("click", function () { setQ7(state.answers.q7 === null ? 6 : state.answers.q7 + 1, true); });
    $("h-copy").addEventListener("click", function () { copyResult("h-copy-area-main"); });
    $("h-again").addEventListener("click", function () { openConfirm(); });
    $("h-result-delete").addEventListener("click", function () { openConfirm(); });
    $("h-confirm-yes").addEventListener("click", confirmDelete);
    $("h-confirm-no").addEventListener("click", closeConfirm);
    $("h-confirm").addEventListener("click", function (e) { if (e.target === $("h-confirm")) closeConfirm(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("h-confirm").hidden) closeConfirm(); });
    $("h-face").addEventListener("animationend", function () { $("h-face").classList.remove("is-pop"); });
    // ルートの Service Worker（オフラインでもこのページを開けるように）。回答・結果はキャッシュに入れない
    if ("serviceWorker" in navigator && window.isSecureContext && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("../sw.js").catch(function () {});
    }
  }
  init();
})();
