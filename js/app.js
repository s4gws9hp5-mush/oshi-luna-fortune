/* 推しルナ占い：画面の切り替えと描画 */
(function () {
  "use strict";

  var D = window.OshiLunaData;
  var STORAGE_KEY = "oshi-luna-last";
  var answers = [];
  var current = null;

  function $(id) { return document.getElementById(id); }

  function storageGet() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }
  function storageSet(value) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch (e) { /* 保存できなくても続行 */ }
  }

  function showScreen(name) {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("is-active", el.id === "screen-" + name);
    });
    window.scrollTo(0, 0);
  }

  function renderQuestion() {
    var q = answers.length;
    var question = D.QUESTIONS[q];
    $("q-count").textContent = "Q" + (q + 1) + " / " + D.QUESTIONS.length;
    $("q-text").textContent = question.text;
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
      btn.innerHTML = '<span class="option-mark" aria-hidden="true">' + marks[i] + "</span>";
      btn.appendChild(document.createTextNode(opt.label));
      btn.addEventListener("click", function () { choose(i, btn); });
      box.appendChild(btn);
    });
    $("back-btn").textContent = q === 0 ? "‹ トップに戻る" : "‹ ひとつ戻る";
    var title = $("q-text");
    title.setAttribute("tabindex", "-1");
    title.focus({ preventScroll: true });
  }

  var pendingChoice = null; // 選択の演出中に保留している回答
  function choose(index, btn) {
    if (pendingChoice) return; // 連打による二重回答を防ぐ
    btn.classList.add("is-chosen");
    pendingChoice = setTimeout(function () {
      pendingChoice = null;
      answers.push(index);
      if (answers.length < D.QUESTIONS.length) {
        renderQuestion();
      } else {
        finish();
      }
    }, 220);
  }

  function finish() {
    showScreen("loading");
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(function () {
      current = window.OshiLuna.getFortune(answers);
      storageSet({ answers: answers });
      renderResult(current);
      showScreen("result");
    }, reduce ? 300 : 1600);
  }

  function renderResult(f) {
    var parts = f.date.split("-");
    $("result-date").textContent = Number(parts[1]) + "月" + Number(parts[2]) + "日のあなた";
    $("result-type").textContent = f.type.emoji + " " + f.type.label;
    $("result-style").textContent = f.style.title;
    $("result-style-text").textContent = f.style.text;

    $("luck-stars").textContent = "★★★★★".slice(0, f.luck.stars) + "☆☆☆☆☆".slice(0, 5 - f.luck.stars);
    $("luck-stars").setAttribute("aria-label", "5段階中" + f.luck.stars);
    $("luck-title").textContent = f.luck.title;
    $("luck-text").textContent = f.luck.text;

    $("insight-text").textContent = f.insight;

    var list = $("actions");
    list.innerHTML = "";
    f.actions.forEach(function (a) {
      var li = document.createElement("li");
      li.textContent = a;
      list.appendChild(li);
    });
    $("lucky-color").textContent = f.lucky.color;
    $("lucky-item").textContent = f.lucky.item;
    $("lucky-time").textContent = f.lucky.time;

    $("omamori-text").textContent = f.omamori;
    $("toast").textContent = "";
  }

  function shareText(f) {
    return "【推しルナ占い】\n私の推し活スタイルは「" + f.style.title + "」\n今日の推し活運：" +
      "★".repeat(f.luck.stars) + "（" + f.luck.title + "）\n🐈 " + f.omamori;
  }

  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("is-show");
    setTimeout(function () { el.classList.remove("is-show"); }, 2400);
  }

  function share() {
    if (!current) return;
    var text = shareText(current);
    var url = location.protocol.indexOf("http") === 0 ? location.href.split("#")[0] : undefined;
    if (navigator.share) {
      navigator.share({ title: "推しルナ占い", text: text, url: url }).catch(function () {});
      return;
    }
    var full = url ? text + "\n" + url : text;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(full).then(function () {
        toast("結果をコピーしました");
      }, function () { fallbackCopy(full); });
    } else {
      fallbackCopy(full);
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
    toast(ok ? "結果をコピーしました" : "コピーできませんでした。画面をスクリーンショットしてね");
  }

  function start() {
    answers = [];
    showScreen("quiz");
    renderQuestion();
  }

  function setupLast() {
    var saved = storageGet();
    var valid = saved && Array.isArray(saved.answers) && saved.answers.length === D.QUESTIONS.length;
    $("last-btn").hidden = !valid;
    return valid ? saved.answers : null;
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

  $("start-btn").addEventListener("click", start);
  $("retry-btn").addEventListener("click", function () {
    setupLast();
    showScreen("top");
  });
  $("share-btn").addEventListener("click", share);
  $("back-btn").addEventListener("click", function () {
    // 回答直後（演出中）に戻った場合は、保留中の回答を取り消してから戻る
    if (pendingChoice) {
      clearTimeout(pendingChoice);
      pendingChoice = null;
    }
    if (answers.length === 0) {
      showScreen("top");
    } else {
      answers.pop();
      renderQuestion();
    }
  });
  $("last-btn").addEventListener("click", function () {
    var last = setupLast();
    if (!last) return;
    answers = last.slice();
    // 同じ回答でも“今日の日付”で占い直す
    current = window.OshiLuna.getFortune(answers);
    renderResult(current);
    showScreen("result");
  });

  drawSky();
  setupLast();
})();
