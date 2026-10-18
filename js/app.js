/* 推しルナ占い：画面の切り替えと描画 */
(function () {
  "use strict";

  var D = window.OshiLunaData;
  var F = window.OshiLuna;

  // 保存先（この端末のブラウザの localStorage。サーバーには送らない）
  var KEYS = {
    type: "oshi-luna-type",   // 推し活タイプ診断の結果 { version, type, sub, answers, date }
    quiz: "oshi-luna-quiz",   // 診断の途中の回答 { version, answers }
    daily: "oshi-luna-daily", // 今日の推し活占いの履歴 { version, history: [結果, ...] }（新しい順・最大7日分）
    legacy: "oshi-luna-last"  // 旧4問版の診断の回答（読むだけ。消さない）
  };
  var HISTORY_DAYS = 7;

  var answers = [];
  var pendingChoice = null; // 選択の演出中に保留している回答
  var busy = false;         // 読み込み演出中（連打による二重処理を防ぐ）
  var shownDaily = null;    // 表示中の今日の占い
  var shownType = null;     // 表示中のタイプ { type, sub }
  var pendingType = null;   // 再診断で出た、まだ保存していないタイプ
  var dateTimer = null;

  function $(id) { return document.getElementById(id); }

  // ---- 保存 ----
  function load(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 保存できなくても続行 */ }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* 何もしない */ }
  }

  function loadSavedType() {
    var v = load(KEYS.type);
    return v && D.TYPES[v.type] ? v : null;
  }
  function savedTypeKey() {
    var v = loadSavedType();
    return v ? v.type : null;
  }

  function loadQuizProgress() {
    var v = load(KEYS.quiz);
    if (!v || !Array.isArray(v.answers) || !v.answers.length || v.answers.length >= D.QUESTIONS.length) return null;
    var ok = v.answers.every(function (a, q) { return a === Math.floor(a) && a >= 0 && a < D.QUESTIONS[q].options.length; });
    return ok ? v.answers : null;
  }

  function isValidDaily(d) {
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.luck && d.luck.stars >= 1 && d.luck.stars <= 5 &&
      d.luck.title && d.luck.text && Array.isArray(d.actions) && d.actions.length && d.lucky &&
      d.lucky.color && d.lucky.item && d.lucky.time && d.message && d.omamori;
  }
  function loadHistory() {
    var v = load(KEYS.daily);
    var list = v && Array.isArray(v.history) ? v.history.filter(isValidDaily) : [];
    return list.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function saveToHistory(d) {
    var list = loadHistory().filter(function (x) { return x.date !== d.date; });
    list.unshift(d);
    save(KEYS.daily, { version: 1, history: list.slice(0, HISTORY_DAYS) });
  }

  function todayKey() { return F.jstDateKey(new Date()); }

  // 今日の占い：その日に一度出た結果は、日付が変わるまで同じものを表示する
  function todayFortune() {
    var key = todayKey();
    var saved = loadHistory().filter(function (x) { return x.date === key; })[0];
    if (saved) return saved;
    var d = F.getDailyFortune(new Date(), savedTypeKey());
    saveToHistory(d);
    return d;
  }

  // ---- 画面 ----
  function showScreen(name) {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("is-active", el.id === "screen-" + name);
    });
    window.scrollTo(0, 0);
  }

  // 読み込み演出のあとに done を実行する（演出中のタップは無視）
  function runWithLoading(text, ms, done) {
    if (busy) return;
    busy = true;
    $("loading-text").textContent = text;
    showScreen("loading");
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(function () {
      try {
        done();
      } catch (e) {
        refreshTop();
        showScreen("top");
        if (window.console) console.error(e);
      } finally {
        busy = false;
      }
    }, reduce ? 300 : ms);
  }

  function formatDate(key, withYear) {
    var p = key.split("-");
    var week = "日月火水木金土".charAt(new Date(key + "T00:00:00Z").getUTCDay());
    return (withYear ? Number(p[0]) + "年" : "") + Number(p[1]) + "月" + Number(p[2]) + "日（" + week + "）";
  }

  // 白猫のイラスト（公式マスコット。タイプのちがいは周りの色と絵文字で表す）
  function catSrc() {
    return "images/luna-cat.png";
  }

  // ---- トップ ----
  function refreshTop() {
    var saved = loadSavedType();
    var progress = loadQuizProgress();
    var history = loadHistory();

    var introType = $("daily-intro-type");
    introType.hidden = !saved;
    if (saved) introType.textContent = "✨ 「" + D.TYPES[saved.type].name + "」のあなたに合わせたメッセージ付き";

    var last = $("last-btn");
    last.hidden = !history.length;
    if (history.length) {
      last.textContent = "前回の結果を見る";
      var sub = document.createElement("span");
      sub.className = "btn-sub";
      sub.textContent = formatDate(history[0].date) + "の占い";
      last.appendChild(sub);
    }

    $("type-card-done").hidden = !saved;
    $("type-card-resume").hidden = !!saved || !progress;
    $("type-card-new").hidden = !!saved || !!progress;
    $("type-card-renewal").hidden = !!saved || !load(KEYS.legacy);
    if (saved) {
      var t = D.TYPES[saved.type];
      $("top-type-emblem").style.setProperty("--type-color", t.color);
      $("top-type-img").src = catSrc(saved.type);
      $("top-type-name").textContent = t.emoji + " " + t.name;
      $("top-type-catch").textContent = t.catch;
    } else if (progress) {
      $("type-card-resume-text").textContent = "全" + D.QUESTIONS.length + "問のうち、" + progress.length + "問まで回答済みです。";
    }
  }

  // ---- 今日の推し活占い ----
  function openDaily() {
    runWithLoading("月と星に、今日のあなたを聞いています…", 1000, function () {
      renderDaily(todayFortune());
      showScreen("daily");
    });
  }

  function renderDaily(d) {
    shownDaily = d;
    var type = d.typeKey && D.TYPES[d.typeKey];
    var today = todayKey();
    var saved = savedTypeKey();

    $("daily-date").textContent = formatDate(d.date, true);
    $("daily-type-chip").hidden = !type;
    if (type) $("daily-type-chip").textContent = type.emoji + " " + type.name + "のあなたへ";

    $("daily-past").hidden = d.date === today;
    if (d.date !== today) $("daily-past-text").textContent = "これは " + formatDate(d.date) + " の占いです。今日の占いも届いています。";
    $("daily-locked").hidden = !(d.date === today && saved && d.typeKey !== saved);

    renderStars($("daily-stars"), d.luck.stars);
    $("daily-luck-title").textContent = d.luck.title;
    $("daily-luck-text").textContent = d.luck.text;

    $("daily-foryou-img").src = catSrc(d.typeKey);
    $("daily-message").textContent = d.message;

    $("daily-actions-note").hidden = !type;
    if (type) $("daily-actions-note").textContent = type.name + "のあなたにおすすめ";
    renderActions($("daily-actions"), d.actions);
    renderLucky("daily", d.lucky);
    $("daily-omamori").textContent = d.omamori;

    $("daily-invite").hidden = !!saved;
    $("daily-mytype-btn").hidden = !saved;
    $("daily-toast").textContent = "";
  }

  function renderStars(el, stars) {
    el.textContent = "★★★★★".slice(0, stars) + "☆☆☆☆☆".slice(0, 5 - stars);
    el.setAttribute("aria-label", "5段階中" + stars);
  }

  function renderActions(list, actions) {
    list.innerHTML = "";
    actions.forEach(function (a) {
      var li = document.createElement("li");
      li.textContent = a;
      list.appendChild(li);
    });
  }

  // ラッキーカラー（色チップ）・アイテム・時間帯（アイコン）
  function renderLucky(prefix, lucky) {
    setLuckyName($(prefix + "-color"), lucky.color);
    $(prefix + "-color-chip").style.backgroundColor = D.LUCKY_COLOR_CODES[lucky.color] || "transparent";
    setLuckyName($(prefix + "-item"), lucky.item);
    $(prefix + "-item-icon").textContent = D.LUCKY_ITEM_ICONS[lucky.item] || "🍀";
    setLuckyName($(prefix + "-time"), lucky.time);
    $(prefix + "-time-icon").textContent = D.LUCKY_TIME_ICONS[lucky.time] || "🕰️";
  }

  // 名前を表示し、LUCKY_LINE_BREAKS の位置にだけ改行の候補（<wbr>）を入れる
  function setLuckyName(el, name) {
    el.textContent = "";
    (D.LUCKY_LINE_BREAKS[name] || name).split("|").forEach(function (part, i) {
      if (i) el.appendChild(document.createElement("wbr"));
      el.appendChild(document.createTextNode(part));
    });
  }

  function dailyShareText(d) {
    var p = d.date.split("-");
    return "【推しルナ占い】" + Number(p[1]) + "月" + Number(p[2]) + "日の推し活占い\n今日の運勢：" +
      "★".repeat(d.luck.stars) + "（" + d.luck.title + "）\nラッキーカラー：" + d.lucky.color + "\n💌 " + d.message;
  }

  // 日付が変わったか確かめる（開いたまま0時をまたいだとき・アプリに戻ってきたとき）
  function checkDate() {
    refreshTop();
    if (shownDaily && $("screen-daily").classList.contains("is-active")) renderDaily(shownDaily);
    clearTimeout(dateTimer);
    dateTimer = setTimeout(checkDate, F.msUntilNextJstDay(new Date()) + 1000);
  }

  // ---- 推し活タイプ診断 ----
  function startQuiz(resume) {
    if (busy) return;
    answers = resume ? (loadQuizProgress() || []) : [];
    if (!resume) remove(KEYS.quiz);
    showScreen("quiz");
    renderQuestion();
  }

  function renderQuestion() {
    var q = answers.length;
    var question = D.QUESTIONS[q];
    $("q-count").textContent = "Q" + (q + 1) + " / " + D.QUESTIONS.length;
    $("q-text").textContent = question.text;
    $("q-note").hidden = !question.note;
    $("q-note").textContent = question.note || "";
    $("progress").setAttribute("aria-valuemax", D.QUESTIONS.length);
    $("progress").setAttribute("aria-valuenow", q + 1);
    $("progress-bar").style.width = ((q + 1) / D.QUESTIONS.length) * 100 + "%";

    var box = $("options");
    box.innerHTML = "";
    var marks = ["🌙", "✨", "🌠", "🐾"];
    question.options.forEach(function (opt, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.style.animationDelay = i * 60 + "ms";
      btn.innerHTML = '<span class="option-mark" aria-hidden="true">' + marks[i % marks.length] + "</span>";
      btn.appendChild(document.createTextNode(opt.label));
      btn.addEventListener("click", function () { choose(i, btn); });
      box.appendChild(btn);
    });
    $("back-btn").textContent = q === 0 ? "‹ トップに戻る" : "‹ ひとつ戻る";
    $("quiz-home-btn").hidden = q === 0; // 1問目は「‹ トップに戻る」と重なるので出さない
    var title = $("q-text");
    title.setAttribute("tabindex", "-1");
    title.focus({ preventScroll: true });
  }

  function choose(index, btn) {
    if (pendingChoice) return; // 連打による二重回答を防ぐ
    btn.classList.add("is-chosen");
    pendingChoice = setTimeout(function () {
      pendingChoice = null;
      answers.push(index);
      if (answers.length < D.QUESTIONS.length) {
        save(KEYS.quiz, { version: 2, answers: answers }); // 途中で閉じても続きから再開できるように
        renderQuestion();
      } else {
        finishQuiz();
      }
    }, 220);
  }

  function cancelPendingChoice() {
    if (pendingChoice) {
      clearTimeout(pendingChoice);
      pendingChoice = null;
    }
  }

  function finishQuiz() {
    var finalAnswers = answers.slice();
    runWithLoading("白猫が、あなたの推し活タイプを読み解いています…", 1200, function () {
      var r = F.diagnoseType(finalAnswers);
      var record = { version: 2, type: r.type, sub: r.sub, answers: finalAnswers, date: todayKey() };
      var saved = loadSavedType();
      remove(KEYS.quiz);
      renderType(r.type, r.sub);
      if (!saved) {
        save(KEYS.type, record);
        showTypeStatus("診断結果を保存しました。トップページからいつでも見返せます。");
      } else if (saved.type === r.type) {
        save(KEYS.type, record);
        showTypeStatus("前回と同じ「" + D.TYPES[r.type].name + "」でした。");
      } else {
        // 保存済みのタイプと違うときは、確定するまで上書きしない
        pendingType = record;
        $("type-confirm-text").textContent = "前回の診断では「" + D.TYPES[saved.type].name + "」でした。今回の結果を保存しますか？保存すると、明日からの占いがこのタイプに合わせたアドバイスになります。";
        $("type-confirm").hidden = false;
      }
      showScreen("result");
    });
  }

  function renderType(typeKey, subKey) {
    var t = D.TYPES[typeKey];
    shownType = { type: typeKey, sub: subKey };
    pendingType = null;
    $("type-confirm").hidden = true;
    $("type-status").hidden = true;

    $("type-emblem").style.setProperty("--type-color", t.color);
    $("type-hero").style.setProperty("--type-color", t.color);
    $("type-img").src = catSrc(typeKey);
    $("type-omamori-img").src = catSrc(typeKey);
    $("type-emoji").textContent = t.emoji;
    $("type-name").textContent = t.name;
    $("type-catch").textContent = t.catch;
    var sub = subKey && subKey !== typeKey && D.TYPES[subKey];
    $("type-sub").hidden = !sub;
    if (sub) {
      $("type-sub").textContent = "もうひとつの顔：";
      var subName = document.createElement("span");
      subName.className = "nowrap";
      subName.textContent = sub.emoji + " " + sub.name;
      $("type-sub").appendChild(subName);
    }

    $("type-personality").textContent = t.personality;
    renderList($("type-strengths"), t.strengths);
    renderList($("type-pitfalls"), t.pitfalls);
    renderList($("type-tips"), t.tips);
    var chips = $("type-match-types");
    chips.innerHTML = "";
    t.match.types.forEach(function (k) {
      var chip = document.createElement("span");
      chip.className = "match-chip";
      chip.style.setProperty("--type-color", D.TYPES[k].color);
      chip.textContent = D.TYPES[k].emoji + " " + D.TYPES[k].name;
      chips.appendChild(chip);
    });
    $("type-match-text").textContent = t.match.text;
    $("type-action").textContent = t.smallAction;
    $("type-charm").textContent = t.omamori.charm;
    $("type-omamori-msg").textContent = t.omamori.message;
    $("toast").textContent = "";
  }

  function renderList(list, items) {
    list.innerHTML = "";
    items.forEach(function (text) {
      var li = document.createElement("li");
      li.textContent = text;
      list.appendChild(li);
    });
  }

  function showTypeStatus(text, showSavedLink) {
    $("type-status-text").textContent = text;
    $("type-view-saved-btn").hidden = !showSavedLink;
    $("type-status").hidden = false;
  }

  function openSavedType() {
    var saved = loadSavedType();
    if (!saved) return;
    renderType(saved.type, saved.sub);
    showScreen("result");
  }

  function typeShareText(typeKey) {
    var t = D.TYPES[typeKey];
    return "【推しルナ占い】私の推し活タイプは\n" + t.emoji + "「" + t.name + "」\n" + t.catch + "\n🎀 " + t.omamori.charm;
  }

  // ---- 共有 ----
  function toast(msg, toastId) {
    var el = $(toastId || "toast");
    el.textContent = msg;
    el.classList.add("is-show");
    setTimeout(function () { el.classList.remove("is-show"); }, 2400);
  }

  function share(text, toastId) {
    var url = location.protocol.indexOf("http") === 0 ? location.href.split("#")[0] : undefined;
    if (navigator.share) {
      navigator.share({ title: "推しルナ占い", text: text, url: url }).catch(function () {});
      return;
    }
    var full = url ? text + "\n" + url : text;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(full).then(function () {
        toast("結果をコピーしました", toastId);
      }, function () { fallbackCopy(full, toastId); });
    } else {
      fallbackCopy(full, toastId);
    }
  }

  function fallbackCopy(text, toastId) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    ta.style.fontSize = "16px"; // iOSでフォーカス時に拡大されないように
    document.body.appendChild(ta);
    // iOS Safari は select() だけでは選択されないため、範囲指定でも選択する
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { /* 失敗時は下で案内 */ }
    document.body.removeChild(ta);
    toast(ok ? "結果をコピーしました" : "コピーできませんでした。画面をスクリーンショットしてね", toastId);
  }

  // 背景の星をランダムに配置
  function drawSky() {
    var sky = document.querySelector(".sky");
    var colors = ["#ffffff", "#ffd6e8", "#d9ccff", "#cfe8ff"];
    for (var i = 0; i < 36; i++) {
      var s = document.createElement("span");
      s.className = "twinkle";
      var size = 2 + Math.random() * 4;
      s.style.cssText = "left:" + Math.random() * 100 + "%;top:" + Math.random() * 100 + "%;width:" + size +
        "px;height:" + size + "px;background:" + colors[i % colors.length] +
        ";animation-delay:" + (Math.random() * 4).toFixed(2) + "s";
      sky.appendChild(s);
    }
  }

  function goTop() {
    if (busy) return;
    cancelPendingChoice();
    refreshTop();
    showScreen("top");
  }

  // ---- ボタン ----
  // トップ
  $("daily-btn").addEventListener("click", openDaily);
  $("last-btn").addEventListener("click", function () {
    var history = loadHistory();
    if (!history.length || busy) return;
    renderDaily(history[0]);
    showScreen("daily");
  });
  $("start-btn").addEventListener("click", function () { startQuiz(false); });
  $("resume-btn").addEventListener("click", function () { startQuiz(true); });
  $("restart-btn").addEventListener("click", function () { startQuiz(false); });
  $("mytype-btn").addEventListener("click", openSavedType);
  $("retake-btn").addEventListener("click", function () { startQuiz(false); });

  // 今日の占い
  $("daily-share-btn").addEventListener("click", function () {
    if (shownDaily) share(dailyShareText(shownDaily), "daily-toast");
  });
  $("daily-today-btn").addEventListener("click", openDaily);
  $("daily-start-btn").addEventListener("click", function () { startQuiz(!!loadQuizProgress()); });
  $("daily-mytype-btn").addEventListener("click", openSavedType);
  $("daily-home-btn").addEventListener("click", goTop);

  // 診断の質問
  $("back-btn").addEventListener("click", function () {
    // 回答直後（演出中）に戻った場合は、保留中の回答を取り消してから戻る
    cancelPendingChoice();
    if (answers.length === 0) {
      remove(KEYS.quiz);
      goTop();
    } else {
      answers.pop();
      if (answers.length) save(KEYS.quiz, { version: 2, answers: answers }); else remove(KEYS.quiz);
      renderQuestion();
    }
  });
  $("quiz-home-btn").addEventListener("click", goTop);

  // 診断結果
  $("type-save-btn").addEventListener("click", function () {
    if (!pendingType) return;
    save(KEYS.type, pendingType);
    var name = D.TYPES[pendingType.type].name;
    pendingType = null;
    $("type-confirm").hidden = true;
    showTypeStatus("「" + name + "」を保存しました。今日の占いは今日のまま、明日からこのタイプに合わせたアドバイスになります。");
  });
  $("type-keep-btn").addEventListener("click", function () {
    var saved = loadSavedType();
    pendingType = null;
    $("type-confirm").hidden = true;
    showTypeStatus("保存中のタイプ「" + (saved ? D.TYPES[saved.type].name : "") + "」のままにしました。", true);
  });
  $("type-view-saved-btn").addEventListener("click", openSavedType);
  $("to-daily-btn").addEventListener("click", openDaily);
  $("share-btn").addEventListener("click", function () {
    if (shownType) share(typeShareText(shownType.type), "toast");
  });
  $("retry-btn").addEventListener("click", function () { startQuiz(false); });
  $("result-home-btn").addEventListener("click", goTop);

  // 戻ってきたとき（別アプリから復帰・タブ切り替え・戻るボタンでの再表示）にも日付を確かめる
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") checkDate();
  });
  window.addEventListener("pageshow", checkDate);
  window.addEventListener("focus", checkDate);

  drawSky();
  checkDate();
})();
