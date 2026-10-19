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
    legacy: "oshi-luna-last", // 旧4問版の診断の回答（読むだけ。消さない）
    a2hs: "oshi-luna-a2hs",   // ホーム画面への追加の案内を閉じたかどうか { dismissed }（表示の設定のみ）
    device: "oshi-luna-device", // 今日の運勢を一人ひとり変えるためのランダムなID { version, id }（運勢の計算にだけ使う）
    subtypeQuiz: "oshi-luna-subtype-quiz" // 診断済みの人がサブタイプの4問だけ答えている途中の回答 { version, answers }
  };
  var HISTORY_DAYS = 7;

  var answers = [];
  var quizMode = "full";    // "full"：既存の10問＋サブタイプの4問 ／ "axes"：診断済みの人がサブタイプの4問だけ答える
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

  // 診断の質問：既存の10問のあとにサブタイプの4問（Q11〜Q14）
  var FULL_QUESTIONS = D.QUESTIONS.concat(D.AXIS_QUESTIONS);
  function quizQuestions() { return quizMode === "axes" ? D.AXIS_QUESTIONS : FULL_QUESTIONS; }

  // 途中の回答（全部答える前のもの）。10問だけの古い途中データも、そのまま続きから使える
  function validProgress(v, list) {
    if (!v || !Array.isArray(v.answers) || !v.answers.length || v.answers.length >= list.length) return null;
    var ok = v.answers.every(function (a, q) { return a === Math.floor(a) && a >= 0 && a < list[q].options.length; });
    return ok ? v.answers : null;
  }
  function loadQuizProgress() { return validProgress(load(KEYS.quiz), FULL_QUESTIONS); }
  function loadSubtypeProgress() { return validProgress(load(KEYS.subtypeQuiz), D.AXIS_QUESTIONS); }

  // 保存済みの結果のサブタイプ。サブタイプの項目がない古いデータ・こわれたデータは「まだ調べていない」（null）
  // コードは保存した文字ではなく、保存した答えから計算し直す
  function subtypeOf(record) {
    var s = record && record.subtype;
    return s && F.isValidAxisAnswers(s.answers) ? F.diagnoseAxes(record.answers, s.answers) : null;
  }

  // ---- ブラウザごとのランダムなID（今日の運勢を一人ひとり変えるため） ----
  // 名前や端末の情報は使わず、どこにも送らない。画面・シェア画像・URL・共有文にも出さない。
  // 保存できない環境（プライベートブラウズなど）では null を返し、全員共通の運勢にする
  // （読み込むたびに運勢が変わってしまわないように）
  var deviceIdCache;
  function randomId() {
    var bytes = [], i;
    try {
      var buf = new Uint8Array(16);
      window.crypto.getRandomValues(buf);
      for (i = 0; i < 16; i++) bytes.push(buf[i]);
    } catch (e) {
      for (i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256) ^ ((Date.now() >> (i % 4) * 8) & 255));
    }
    return bytes.map(function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function deviceId() {
    if (deviceIdCache !== undefined) return deviceIdCache;
    var v = load(KEYS.device);
    if (v && /^[0-9a-f]{32}$/.test(v.id)) return (deviceIdCache = v.id);
    var id = randomId();
    save(KEYS.device, { version: 1, id: id });
    v = load(KEYS.device); // 本当に保存できたかを読み直して確かめる
    return (deviceIdCache = v && v.id === id ? id : null);
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

  // 日付のお試し表示：URL に ?preview-date=2026-10-19 を付けると、このブラウザのその日の占いを表示する（保存はしない）
  // 翌日の占いに保存したタイプが反映されるかを、日付が変わるのを待たずに確かめるためのもの
  var PREVIEW_DATE = (function () {
    var m = /[?&]preview-date=(\d{4}-\d{2}-\d{2})(?:&|$)/.exec(location.search);
    return m && !isNaN(new Date(m[1] + "T12:00:00+09:00")) ? m[1] : null;
  })();

  function todayKey() { return PREVIEW_DATE || F.jstDateKey(new Date()); }

  // 今日の占い：その日に一度出た結果は、日付が変わるまで同じものを表示する
  function todayFortune() {
    var key = todayKey();
    var saved = loadHistory().filter(function (x) { return x.date === key; })[0];
    if (saved) return saved;
    if (PREVIEW_DATE) return F.getDailyFortune(new Date(PREVIEW_DATE + "T12:00:00+09:00"), savedTypeKey(), deviceId());
    var d = F.getDailyFortune(new Date(), savedTypeKey(), deviceId());
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

  // 白猫のイラスト：タイプが決まっていればタイプ別の絵、なければ公式マスコット（元の白猫）
  // 縦横の大きさも合わせて設定し、どのブラウザでも縦横比が崩れないようにする
  var MASCOT = { src: "images/luna-cat.png", width: 640, height: 513 };
  function setCat(img, typeKey) {
    var t = typeKey && D.TYPES[typeKey];
    img.src = t ? t.image : MASCOT.src;
    img.width = t ? 400 : MASCOT.width;   // タイプ別の絵はすべて正方形
    img.height = t ? 400 : MASCOT.height;
  }

  // ---- トップ ----
  function refreshTop() {
    $("a2hs-top-btn").hidden = isStandalone();
    var saved = loadSavedType();
    var progress = loadQuizProgress();

    // 保存済みのタイプがあるときだけ B（あなたの推し活タイプ）、なければ必ず A（初めての人向けの案内）
    $("type-card-done").hidden = !saved;
    $("type-card-new").hidden = !!saved;
    $("type-card-renewal").hidden = !!saved || !load(KEYS.legacy);
    $("resume-btn").hidden = !!saved || !progress;
    if (saved) {
      var t = D.TYPES[saved.type];
      $("top-type-emblem").style.setProperty("--type-color", t.color);
      setCat($("top-type-img"), saved.type);
      $("top-type-img").alt = t.name + "の白猫";
      $("top-type-name").textContent = "「" + t.name + "」";
      $("top-type-catch").textContent = t.catch;
    } else if (progress) {
      $("resume-btn").textContent = "続きから再開する（" + progress.length + "/" + FULL_QUESTIONS.length + "問まで回答済み）";
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
    $("daily-preview").hidden = !PREVIEW_DATE;
    if (PREVIEW_DATE) $("daily-preview").textContent = "🧪 お試し表示：" + formatDate(PREVIEW_DATE, true) + "の占いを表示しています（保存はされません）";
    $("daily-type-chip").hidden = !type;
    if (type) $("daily-type-chip").textContent = type.emoji + " " + type.name + "のあなたへ";

    $("daily-past").hidden = d.date === today;
    if (d.date !== today) $("daily-past-text").textContent = "これは " + formatDate(d.date) + " の占いです。今日の占いも届いています。";
    $("daily-locked").hidden = !(d.date === today && saved && d.typeKey !== saved);

    renderStars($("daily-stars"), d.luck.stars);
    $("daily-luck-title").textContent = d.luck.title;
    $("daily-luck-text").textContent = d.luck.text;

    setCat($("daily-foryou-img"), d.typeKey);
    $("daily-message").textContent = d.message;

    $("daily-actions-note").hidden = !type;
    if (type) $("daily-actions-note").textContent = type.name + "のあなたにおすすめ";
    renderActions($("daily-actions"), d.actions);
    renderLucky("daily", d.lucky);
    $("daily-omamori").textContent = d.omamori;
    $("daily-omamori-type").hidden = !(type && d.typeOmamori);
    if (type && d.typeOmamori) $("daily-omamori-type").textContent = type.emoji + " " + type.name + "のあなたへ：" + d.typeOmamori;

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
    quizMode = "full";
    answers = resume ? (loadQuizProgress() || []) : [];
    if (!resume) remove(KEYS.quiz);
    showScreen("quiz");
    renderQuestion();
  }

  // 診断済みの人が、サブタイプの4問だけ答える（8タイプはそのまま）
  function startSubtypeQuiz() {
    if (busy || !loadSavedType()) return;
    quizMode = "axes";
    answers = loadSubtypeProgress() || [];
    showScreen("quiz");
    renderQuestion();
  }

  function renderQuestion() {
    var list = quizQuestions();
    var q = answers.length;
    var question = list[q];
    var note = question.note ||
      (quizMode === "axes" && q === 0 ? "サブタイプコードの質問（全" + list.length + "問）" : "") ||
      (quizMode === "full" && q === D.QUESTIONS.length ? "ここからはサブタイプの質問（あと" + (list.length - q) + "問）" : "");
    $("q-count").textContent = "Q" + (q + 1) + " / " + list.length;
    $("q-text").textContent = question.text;
    $("q-note").hidden = !note;
    $("q-note").textContent = note;
    $("progress").setAttribute("aria-valuemax", list.length);
    $("progress").setAttribute("aria-valuenow", q + 1);
    $("progress-bar").style.width = ((q + 1) / list.length) * 100 + "%";

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
    $("back-btn").textContent = q > 0 ? "‹ ひとつ戻る" : quizMode === "axes" ? "‹ 結果に戻る" : "‹ トップに戻る";
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
      if (answers.length < quizQuestions().length) {
        saveProgress(); // 途中で閉じても続きから再開できるように
        renderQuestion();
      } else if (quizMode === "axes") {
        finishSubtype();
      } else {
        finishQuiz();
      }
    }, 220);
  }

  function saveProgress() {
    var key = quizMode === "axes" ? KEYS.subtypeQuiz : KEYS.quiz;
    if (answers.length) save(key, quizMode === "axes" ? { version: 1, answers: answers } : { version: 2, answers: answers });
    else remove(key);
  }

  function cancelPendingChoice() {
    if (pendingChoice) {
      clearTimeout(pendingChoice);
      pendingChoice = null;
    }
  }

  function finishQuiz() {
    // 8タイプは既存の10問だけで判定する。サブタイプの4問は 8タイプに使わない
    var finalAnswers = answers.slice(0, D.QUESTIONS.length);
    var axisAnswers = answers.slice(D.QUESTIONS.length);
    runWithLoading("白猫が、あなたの推し活タイプを読み解いています…", 1200, function () {
      var r = F.diagnoseType(finalAnswers);
      var axes = F.diagnoseAxes(finalAnswers, axisAnswers);
      var record = { version: 2, type: r.type, sub: r.sub, answers: finalAnswers, date: todayKey(),
        subtype: { version: 1, answers: axisAnswers, code: axes.code } };
      var saved = loadSavedType();
      remove(KEYS.quiz);
      renderType(r.type, r.sub, axes);
      if (!saved) {
        save(KEYS.type, record);
        var stored = loadSavedType();
        showTypeStatus(stored && stored.type === r.type ?
          "保存できたよ♡ トップページからいつでも見返せて、推し活占いにもこのタイプが反映されるよ🌙" :
          "結果を保存できませんでした。ブラウザの設定（プライベートブラウズなど）を確認してね。");
        if (stored && stored.type === r.type) showA2hsCard();
      } else if (saved.type === r.type) {
        save(KEYS.type, record);
        showTypeStatus("前回と同じ「" + D.TYPES[r.type].name + "」でした。");
      } else {
        // 保存済みのタイプと違うときは、確定するまで上書きしない
        pendingType = record;
        $("type-confirm-text").textContent = "前回の診断では「" + D.TYPES[saved.type].name + "」でした。" +
          "このタイプを保存すると、明日からの推し活占いにあなたのタイプが反映されます。毎日の運勢やラッキーアクションを、あなたの推し活スタイルに合わせてお届けします♡";
        $("type-confirm").hidden = false;
      }
      showScreen("result");
    });
  }

  // 診断済みの人がサブタイプの4問に答え終えたとき：保存済みの結果にサブタイプを足す（8タイプは変えない）
  function finishSubtype() {
    var axisAnswers = answers.slice();
    runWithLoading("白猫が、あなたのサブタイプを読み解いています…", 1200, function () {
      remove(KEYS.subtypeQuiz);
      var saved = loadSavedType();
      if (!saved) { goTop(); return; }
      var axes = F.diagnoseAxes(saved.answers, axisAnswers);
      var record = {};
      Object.keys(saved).forEach(function (k) { record[k] = saved[k]; });
      record.subtype = { version: 1, answers: axisAnswers, code: axes.code };
      save(KEYS.type, record);
      var stored = loadSavedType();
      var ok = !!(stored && stored.type === saved.type && stored.subtype && stored.subtype.code === axes.code);
      renderType(saved.type, saved.sub, axes);
      showTypeStatus(ok ? "サブタイプコードを保存したよ♡ この結果画面から、いつでも見返せるよ🌙" :
        "サブタイプコードを保存できませんでした。ブラウザの設定（プライベートブラウズなど）を確認してね。");
      showScreen("result");
    });
  }

  // サブタイプコードのカード。まだ調べていない診断済みの人には、4問だけ答える案内を出す
  function renderSubtype(typeKey, axes) {
    var saved = loadSavedType();
    $("subtype-card").hidden = !axes;
    $("subtype-invite").hidden = !!axes || !(saved && saved.type === typeKey);
    if (!axes) {
      $("subtype-start-btn").textContent = loadSubtypeProgress() ? "🧭 サブタイプの質問を続きから答える" : "🧭 サブタイプコードを調べる（4問）";
      return;
    }
    $("subtype-code").textContent = axes.code;
    var list = $("subtype-axes");
    list.innerHTML = "";
    axes.axes.forEach(function (a, i) {
      var def = D.AXES[i];
      var label = a.letter === "X" ? "バランス型：" + def.labels[def.letters[0]] + "・" + def.labels[def.letters[1]] :
        a.strength === "slight" ? "やや" + def.labels[a.letter] + "寄り" : def.labels[a.letter];
      var li = document.createElement("li");
      li.className = "subtype-axis";
      var mark = document.createElement("span");
      mark.className = "subtype-letter" + (a.letter === "X" ? " is-balance" : "");
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = a.letter;
      var body = document.createElement("div");
      var head = document.createElement("p");
      head.className = "subtype-head";
      head.textContent = def.name + "：" + a.letter;
      var labelEl = document.createElement("span");
      labelEl.className = "nowrap";
      labelEl.textContent = "（" + label + "）";
      head.appendChild(labelEl);
      // 割合（例：伝える 62%／見守る 38%）と、その長さのバー
      var meter = document.createElement("p");
      meter.className = "subtype-meter";
      [[def.letters[0], a.percent], [def.letters[1], 100 - a.percent]].forEach(function (side, j) {
        if (j) meter.appendChild(document.createTextNode("／"));
        var part = document.createElement("span");
        part.className = "nowrap";
        part.textContent = def.labels[side[0]] + " " + side[1] + "%";
        meter.appendChild(part);
      });
      var bar = document.createElement("span");
      bar.className = "subtype-bar";
      bar.setAttribute("aria-hidden", "true");
      var fill = document.createElement("span");
      fill.style.width = a.percent + "%";
      bar.appendChild(fill);
      var text = document.createElement("p");
      text.className = "subtype-text";
      text.textContent = def.texts[a.letter];
      body.appendChild(head);
      body.appendChild(meter);
      body.appendChild(bar);
      body.appendChild(text);
      li.appendChild(mark);
      li.appendChild(body);
      list.appendChild(li);
    });
  }

  function renderType(typeKey, subKey, axes) {
    var t = D.TYPES[typeKey];
    shownType = { type: typeKey, sub: subKey, axes: axes || null };
    pendingType = null;
    $("type-confirm").hidden = true;
    $("type-status").hidden = true;
    $("a2hs-card").hidden = true;

    $("type-emblem").style.setProperty("--type-color", t.color);
    $("type-hero").style.setProperty("--type-color", t.color);
    setCat($("type-img"), typeKey);
    setCat($("type-omamori-img"), typeKey);
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
    renderSubtype(typeKey, axes || null);
    $("toast").textContent = "";
    prepareShareImage(typeKey);
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
    renderType(saved.type, saved.sub, subtypeOf(saved));
    showScreen("result");
  }

  function typeShareText(typeKey, axes) {
    var t = D.TYPES[typeKey];
    return "【推しルナ占い】私の推し活タイプは\n" + t.emoji + "「" + t.name + "」\n" + t.catch + "\n" +
      (axes ? "サブタイプコード：" + axes.code + "\n" : "") + "#推しルナ占い";
  }

  // ---- 推し活タイプのシェア画像 ----
  var SITE_URL = "https://s4gws9hp5-mush.github.io/oshi-luna-fortune/";
  function siteUrl() {
    return location.protocol.indexOf("http") === 0 ? location.origin + location.pathname : SITE_URL;
  }
  var shareImage = null; // { typeKey, blob, file, url }

  function shareStatus(text) { $("share-status").textContent = text; }

  // 結果画面を開いたときに画像を用意しておく（iPhone では、ボタンを押してすぐに共有を始める必要があるため）
  function prepareShareImage(typeKey) {
    $("share-panel").hidden = true;
    shareStatus("");
    if (shareImage && shareImage.typeKey === typeKey) return;
    if (shareImage && shareImage.url) URL.revokeObjectURL(shareImage.url);
    shareImage = { typeKey: typeKey, pending: true };
    var current = shareImage;
    if (!window.OshiLunaShareCard || !window.Promise) { current.failed = true; return; }
    window.OshiLunaShareCard.create(D.TYPES[typeKey], siteUrl().replace(/^https?:\/\//, "").replace(/\/$/, "")).then(function (blob) {
      if (shareImage !== current) return; // 別のタイプに切り替わっていたら使わない
      current.pending = false;
      current.blob = blob;
      current.url = URL.createObjectURL(blob);
      try { current.file = new File([blob], shareFileName(typeKey), { type: "image/png", lastModified: Date.now() }); } catch (e) { current.file = null; }
      updateSharePanel();
    }, function (e) {
      if (shareImage !== current) return;
      current.pending = false;
      current.failed = true;
      if (window.console) console.error(e);
      updateSharePanel();
    });
  }

  // 保存するファイルの名前（例：推しルナ占い_ときめき全力応援隊長.png）
  function shareFileName(typeKey) { return "推しルナ占い_" + D.TYPES[typeKey].name + ".png"; }

  function canShareImage() {
    var f = shareImage && shareImage.file;
    try { return !!(f && navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch (e) { return false; }
  }

  // 保存の案内の出し分け：iPhone・iPad／Android／そのほか
  function deviceKind() {
    var kind = browserKind();
    return kind.indexOf("ios") === 0 ? "ios" : kind;
  }

  // 「画像を保存・シェアする」で何をするか：共有メニュー（share）か、画像ファイルのダウンロード（download）
  // 共有メニューが一度うまく開けなかったときは、次からダウンロードにする
  var shareMenuFailed = false;
  function saveMethod() { return canShareImage() && !shareMenuFailed ? "share" : "download"; }

  // 端末とブラウザの機能に合わせた、保存のしかた（確かめられない「写真アプリに直接保存」は約束しない）
  function shareGuide() {
    var kind = browserKind(), device = deviceKind(), share = saveMethod() === "share";
    var guide = { steps: [], note: "" };
    if (device === "ios" && share) {
      guide.steps = [
        "「画像を保存・シェアする」をタップ",
        "開いたメニューで「画像を保存」を選ぶと、写真アプリに保存できます（見つからないときは、メニューを上にスクロールしてね）。LINE や Instagram などを選ぶと、そのまま送れます",
        "保存したときは、写真アプリを開いて画像が入っているか確認してね"
      ];
      guide.note = "はじめて保存するときは、写真へのアクセスの確認が出ることがあります。";
    } else if (device === "ios") {
      guide.steps = [
        "上の画像を長押し",
        "出てきたメニューで「“写真”に追加」を選ぶ",
        "写真アプリを開いて、画像が入っているか確認してね"
      ];
      guide.note = (kind === "ios-inapp" ? "LINE や Instagram などのアプリの中で開いているときは、うまく保存できないことがあります。そのときは、メニューから「Safari で開く」を選んでね。" : "") +
        "「画像を保存・シェアする」を押すと画像ファイルをダウンロードします。保存先は写真アプリではなく「ファイル」アプリです。";
    } else if (device === "android" && share) {
      guide.steps = [
        "「画像を保存・シェアする」をタップ",
        "開いたメニューで、送り先のアプリや保存先のアプリを選ぶ（表示されるアプリは端末によって違います）",
        "端末にファイルとして保存したいときは、上の画像を長押しして「画像をダウンロード」を選んでね"
      ];
    } else if (device === "android") {
      guide.steps = [
        "「画像を保存・シェアする」をタップすると、画像ファイルをダウンロードします",
        "ダウンロードした画像は、ブラウザのダウンロード一覧や、「ファイル」・ギャラリーのアプリの「Download」から見られます（端末によって名前が違います）",
        "ダウンロードできないときは、上の画像を長押しして「画像をダウンロード」を選んでね"
      ];
    } else {
      guide.steps = share ? [
        "「画像を保存・シェアする」で共有メニューを開き、送り先や保存先を選ぶ",
        "ファイルとして保存したいときは、上の画像を長押し（右クリック）して保存"
      ] : [
        "「画像を保存・シェアする」をタップ（クリック）すると、画像ファイルをダウンロードします",
        "うまくいかないときは、上の画像を長押し（右クリック）して保存"
      ];
    }
    return guide;
  }

  function updateSharePanel() {
    if (!shareImage) return;
    var ready = !!(shareImage.url && !shareImage.failed);
    $("share-preview").hidden = !ready;
    $("share-save-btn").hidden = !ready;
    if (ready) $("share-preview").src = shareImage.url;
    $("share-hint").textContent = shareImage.pending ? "画像を作っています…" :
      shareImage.failed ? "この環境では画像を作れませんでした。下のボタンでタイプ名とURLをコピーできます。" : "";
    var guide = ready ? shareGuide() : null;
    $("share-guide").hidden = !guide;
    if (guide) {
      var list = $("share-steps");
      while (list.firstChild) list.removeChild(list.firstChild);
      guide.steps.forEach(function (text) {
        var li = document.createElement("li");
        li.textContent = text;
        list.appendChild(li);
      });
      $("share-guide-note").textContent = guide.note;
    }
  }

  function openSharePanel() {
    if (!shownType) return;
    if (!shareImage || shareImage.typeKey !== shownType.type) prepareShareImage(shownType.type);
    $("share-panel").hidden = false;
    shareStatus("");
    updateSharePanel();
    $("share-panel").scrollIntoView({ block: "nearest" });
  }

  // 「画像を保存・シェアする」：共有メニューが使えれば画像ファイルを渡し、使えなければダウンロードする
  // iPhone では、ボタンを押してすぐに呼ばないと共有メニューを開けないので、画像は前もって作っておく
  var sharing = false;
  function saveOrShareImage() {
    if (sharing) return; // 共有メニューを開いている間は、二重に開かない
    if (!shownType || !shareImage || !shareImage.url || shareImage.failed || shareImage.typeKey !== shownType.type) {
      shareStatus("画像の準備ができていません。少し待ってから、もう一度押してね。");
      return;
    }
    if (saveMethod() === "download") { downloadImage(); return; }
    var ios = deviceKind() === "ios";
    var promise;
    try {
      // 文章は付けない（画像だけのほうが、共有メニューに「画像を保存」が出やすいため。文章は「コピー」で）
      promise = navigator.share({ files: [shareImage.file] });
    } catch (e) {
      promise = Promise.reject(e);
    }
    sharing = true;
    shareStatus("");
    Promise.resolve(promise).then(function () {
      // 共有メニューで何かを選んで完了したことしか分からないので、保存できたとは言い切らない
      shareStatus(ios ? "共有メニューを閉じました。「画像を保存」を選んだときは、写真アプリに入っているか確認してね♡" :
        "共有メニューでの操作が終わりました。選んだアプリや保存先で、画像を確認してね♡");
    }, function (e) {
      if (e && e.name === "AbortError") {
        shareStatus("キャンセルしました。もう一度押すと、メニューが開きます。");
        return;
      }
      // 共有メニューが使えなかった：次に押したときはダウンロードにして、手順も切り替える
      shareMenuFailed = true;
      updateSharePanel();
      shareStatus("共有メニューを開けませんでした。もう一度「画像を保存・シェアする」を押すと、画像ファイルのダウンロードを試します。" +
        (ios ? "写真アプリに入れたいときは、上の画像を長押しして「“写真”に追加」を選んでね。" : ""));
    }).then(function () { sharing = false; });
  }

  // 画像ファイルのダウンロード。保存できたかはブラウザから分からないので、完了とは言わずに確かめ方を案内する
  function downloadImage() {
    var a = document.createElement("a");
    a.href = shareImage.url;
    a.download = shareFileName(shareImage.typeKey);
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    var device = deviceKind();
    shareStatus(device === "ios" ?
      "ダウンロードの確認が出たら「ダウンロード」を押してね。保存先は「ファイル」アプリです。写真アプリに入れたいときは、上の画像を長押しして「“写真”に追加」を選んでね。" :
      device === "android" ?
      "ダウンロードを始めました。保存できたかは、ブラウザのダウンロード一覧で確認してね。始まらないときは、上の画像を長押しして「画像をダウンロード」を選んでね。" :
      "ダウンロードを始めました。保存できたかは、ブラウザのダウンロード一覧で確認してね。始まらないときは、上の画像を長押し（右クリック）して保存してね。");
  }

  // ---- ホーム画面への追加 ----
  var installPrompt = null; // Android の Chrome などで使える「インストール」の呼び出し

  function isStandalone() {
    return !!((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true);
  }

  // 使っている端末・ブラウザの種類（手順の出し分け用）
  function browserKind() {
    var ua = navigator.userAgent || "";
    var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios && /Line\/|Instagram|FBAN|FBAV|Twitter|TikTok|BytedanceWebview/i.test(ua)) return "ios-inapp";
    if (ios && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return "ios-other";
    if (ios) return "ios-safari";
    if (/Android/.test(ua)) return "android";
    return "other";
  }

  var A2HS_STEPS = {
    "ios-safari": {
      lead: "iPhone の Safari では、次の手順でホーム画面に追加できます。",
      steps: [
        "画面の下（またはアドレスバーの横）にある「共有」ボタン（四角から上向きの矢印が出ているアイコン）をタップ。見つからないときは「…」ボタンを開いてね",
        "メニューを下にスクロールして「ホーム画面に追加」を選ぶ",
        "名前が「推しルナ占い」になっていることを確認して、右上の「追加」をタップ"
      ]
    },
    "ios-other": {
      lead: "iPhone の Chrome などでも、ブラウザによってはホーム画面に追加できます。",
      steps: [
        "アドレスバーの近くにある「共有」ボタンをタップ",
        "「ホーム画面に追加」を選び、「追加」をタップ",
        "見つからないときは、このページを Safari で開いてから追加してね"
      ]
    },
    "ios-inapp": {
      lead: "LINE や Instagram などのアプリの中で開いていると、ホーム画面に追加できないことがあります。",
      steps: [
        "画面の右上や右下のメニューから「Safariで開く」（「ブラウザで開く」）を選ぶ",
        "Safari で開いたら、「共有」ボタン → 「ホーム画面に追加」を選ぶ",
        "名前を確認して「追加」をタップ"
      ]
    },
    "android": {
      lead: "Android の Chrome では、次の手順でホーム画面に追加できます。",
      steps: [
        "右上のメニュー（︙）をタップ",
        "「ホーム画面に追加」または「アプリをインストール」を選ぶ",
        "表示された画面で「追加」（「インストール」）をタップ"
      ]
    },
    "other": {
      lead: "ホーム画面（デスクトップ）への追加の方法は、ブラウザによって違います。",
      steps: [
        "ブラウザのメニューや共有ボタンを開く",
        "「ホーム画面に追加」「アプリをインストール」などの項目を選ぶ",
        "項目が見つからないブラウザでは、ホーム画面に追加できません。ブックマークに登録してね"
      ]
    }
  };

  function a2hsDismissed() {
    var v = load(KEYS.a2hs);
    return !!(v && v.dismissed);
  }

  // はじめて診断を終えたときに一度だけ出す（閉じた人・ホーム画面から開いている人には出さない）
  function showA2hsCard() {
    $("a2hs-card").hidden = a2hsDismissed() || isStandalone();
  }

  function dismissA2hsCard() {
    save(KEYS.a2hs, { dismissed: true, date: todayKey() });
    $("a2hs-card").hidden = true;
  }

  function openA2hsSheet() {
    var kind = browserKind();
    var guide = A2HS_STEPS[kind];
    $("a2hs-lead").textContent = isStandalone() ? "いまはホーム画面から開いています。追加はもう済んでいるよ♡" : guide.lead;
    $("a2hs-steps").hidden = isStandalone();
    renderList($("a2hs-steps"), guide.steps);
    $("a2hs-install-btn").hidden = !installPrompt || isStandalone();
    $("a2hs-ios-note").hidden = kind.indexOf("ios") !== 0;
    $("a2hs-status").textContent = "";
    $("a2hs-sheet").hidden = false;
    $("a2hs-sheet-title").setAttribute("tabindex", "-1");
    $("a2hs-sheet-title").focus({ preventScroll: true });
  }

  function closeA2hsSheet() {
    $("a2hs-sheet").hidden = true;
  }

  // ---- 未診断の人への診断の案内 ----
  // トップの「今日の推し活占いを見る！」：診断済みならそのまま占いへ。未診断なら診断を案内する（強制はしない）
  function onDailyButton() {
    if (busy) return;
    var typed = false;
    try { typed = !!savedTypeKey(); } catch (e) { typed = false; } // 判定できないときは未診断として案内する
    if (typed) { openDaily(); return; }
    $("invite-popup").hidden = false;
    $("invite-popup-title").setAttribute("tabindex", "-1");
    $("invite-popup-title").focus({ preventScroll: true });
  }
  function closeInvitePopup() {
    $("invite-popup").hidden = true;
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
    copyText(url ? text + "\n" + url : text, function (ok) {
      toast(ok ? "結果をコピーしました" : "コピーできませんでした。画面をスクリーンショットしてね", toastId);
    });
  }

  // テキストをコピーして、実際にコピーできたか（true / false）を done に渡す
  function copyText(text, done) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else {
      done(fallbackCopy(text));
    }
  }

  function fallbackCopy(text) {
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
    return ok;
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
  $("daily-btn").addEventListener("click", onDailyButton);
  $("start-btn").addEventListener("click", function () { startQuiz(false); });
  $("resume-btn").addEventListener("click", function () { startQuiz(true); });
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
      if (quizMode === "axes") { remove(KEYS.subtypeQuiz); openSavedType(); return; }
      remove(KEYS.quiz);
      goTop();
    } else {
      answers.pop();
      saveProgress();
      renderQuestion();
    }
  });
  $("quiz-home-btn").addEventListener("click", goTop);

  // 診断結果
  $("type-save-btn").addEventListener("click", function () {
    if (!pendingType) return;
    save(KEYS.type, pendingType);
    var pendingTypeKey = pendingType.type;
    pendingType = null;
    $("type-confirm").hidden = true;
    var stored = loadSavedType();
    if (stored && stored.type === pendingTypeKey) {
      showTypeStatus("保存できたよ♡ 明日からの推し活占いに、このタイプが反映されるよ🌙");
    } else {
      showTypeStatus("保存できませんでした。ブラウザの設定（プライベートブラウズなど）を確認して、もう一度お試しください。");
    }
  });
  $("type-keep-btn").addEventListener("click", function () {
    var saved = loadSavedType();
    pendingType = null;
    $("type-confirm").hidden = true;
    showTypeStatus("保存中のタイプ「" + (saved ? D.TYPES[saved.type].name : "") + "」のままにしました。", true);
  });
  $("type-view-saved-btn").addEventListener("click", openSavedType);
  $("subtype-start-btn").addEventListener("click", startSubtypeQuiz);
  $("to-daily-btn").addEventListener("click", openDaily);
  $("share-btn").addEventListener("click", openSharePanel);
  $("share-save-btn").addEventListener("click", saveOrShareImage);
  $("share-copy-btn").addEventListener("click", function () {
    if (!shownType) return;
    copyText(typeShareText(shownType.type, shownType.axes) + "\n" + siteUrl(), function (ok) {
      shareStatus(ok ? "タイプ名とURLをコピーしたよ♡ SNSに貼り付けて使ってね。" : "コピーできませんでした。画面をスクリーンショットしてね。");
    });
  });
  $("retry-btn").addEventListener("click", function () { startQuiz(false); });
  $("result-home-btn").addEventListener("click", goTop);

  // ホーム画面への追加
  $("a2hs-top-btn").addEventListener("click", openA2hsSheet);
  $("a2hs-howto-btn").addEventListener("click", function () { dismissA2hsCard(); openA2hsSheet(); });
  $("a2hs-later-btn").addEventListener("click", dismissA2hsCard);
  $("a2hs-close-btn").addEventListener("click", closeA2hsSheet);
  $("a2hs-sheet").addEventListener("click", function (e) { if (e.target === $("a2hs-sheet")) closeA2hsSheet(); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!$("a2hs-sheet").hidden) closeA2hsSheet();
    if (!$("invite-popup").hidden) { closeInvitePopup(); $("daily-btn").focus(); }
  });

  // 診断の案内：診断する（既存の診断へ。途中の回答があれば続きから）／このまま占いへ／閉じる（トップのまま）
  $("invite-quiz-btn").addEventListener("click", function () { closeInvitePopup(); startQuiz(!!loadQuizProgress()); });
  $("invite-daily-btn").addEventListener("click", function () { closeInvitePopup(); openDaily(); });
  $("invite-close-btn").addEventListener("click", function () { closeInvitePopup(); $("daily-btn").focus(); });
  $("invite-popup").addEventListener("click", function (e) { if (e.target === $("invite-popup")) { closeInvitePopup(); $("daily-btn").focus(); } });
  // Android の Chrome などでは、ブラウザの「インストール」画面をボタンから呼び出せる
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installPrompt = e;
  });
  $("a2hs-install-btn").addEventListener("click", function () {
    if (!installPrompt) return;
    var p = installPrompt;
    installPrompt = null;
    $("a2hs-install-btn").hidden = true;
    p.prompt();
    p.userChoice.then(function (choice) {
      $("a2hs-status").textContent = choice && choice.outcome === "accepted" ?
        "ホーム画面に追加しました♡" : "追加をキャンセルしました。あとから上の手順でも追加できるよ。";
    }, function () {
      $("a2hs-status").textContent = "追加の画面を開けませんでした。上の手順で追加してね。";
    });
  });
  window.addEventListener("appinstalled", function () {
    $("a2hs-top-btn").hidden = true;
  });

  // オフラインでも開けるように、対応するブラウザでは Service Worker を使う（https のときだけ）
  if ("serviceWorker" in navigator && window.isSecureContext && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("sw.js").catch(function () { /* 使えなくてもサイトはそのまま動く */ });
  }

  // 戻ってきたとき（別アプリから復帰・タブ切り替え・戻るボタンでの再表示）にも日付を確かめる
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") checkDate();
  });
  window.addEventListener("pageshow", checkDate);
  window.addEventListener("focus", checkDate);

  deviceId(); // はじめて開いたときに、運勢用のIDを用意しておく
  drawSky();
  checkDate();
})();
