(function () {
  "use strict";
  var data = window.OshiLunaTarotPublic, engine = window.OshiLunaTarot;
  if (!data || !engine) return;
  var preview = new URLSearchParams(location.search).get("tarot-preview") === "1";
  if (!data.enabled && !preview) return;
  var $ = function (id) { return document.getElementById(id); };
  var storage;
  try { storage = window.localStorage; } catch (e) { storage = null; }
  var daily = engine.createDaily({ cards: data.cards, storage: storage, crypto: window.crypto });
  var shownDate = "", current = null, artworkSource = "";
  // 初めて引くときの演出。抽選・保存は押した直後に一度だけ行い、結果は演出のあとに表示する
  var LOADING_MS = 3000, REDUCED_MS = 300, LOADING_GIF = "images/tarot/luna-tarot-stable-center.gif";
  var drawing = false;
  var image = $("tarot-image"), placeholder = $("tarot-placeholder");
  function showArtwork(card, position) {
    var asset = card && window.OshiLunaTarotAssets && window.OshiLunaTarotAssets[card.id];
    if (!asset) {
      artworkSource = "";
      image.hidden = true;
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
      image.alt = "";
      placeholder.hidden = false;
      $("tarot-image-note").hidden = !card;
      return;
    }
    image.alt = card.name.ja + "のカード（" + (position === "upright" ? "正位置" : "逆位置") + "）";
    if (artworkSource === asset.src) return;
    artworkSource = asset.src;
    $("tarot-image-note").hidden = true;
    image.hidden = true;
    placeholder.hidden = false;
    image.onload = function () {
      if (artworkSource !== asset.src) return;
      image.hidden = false;
      placeholder.hidden = true;
      $("tarot-image-note").hidden = true;
    };
    image.onerror = function () {
      if (artworkSource !== asset.src) return;
      image.hidden = true;
      placeholder.hidden = false;
      $("tarot-image-note").hidden = false;
    };
    image.width = asset.width;
    image.height = asset.height;
    image.src = asset.src;
  }
  // カード画像はタロット画面を開いているときだけ読み込む（トップを開いただけ・日付の変更・別タブの更新では取得しない）
  function isOpen() { return $("screen-tarot").classList.contains("is-active"); }
  $("tarot-entry").hidden = false;
  $("tarot-preview-note").hidden = !preview;
  function checkDate() {
    if (drawing) return; // 演出中は日付の切り替えを保留し、演出の終わりに確かめる
    var now = new Date(), day = engine.dateKey(now);
    if (day === shownDate) return;
    shownDate = day;
    current = daily.peek(now);
    render();
  }
  // キーワードは一つずつ丸いタグにする
  function renderKeywords(words) {
    var list = $("tarot-keywords");
    list.textContent = "";
    words.forEach(function (word) {
      var item = document.createElement("li");
      item.textContent = word;
      list.appendChild(item);
    });
  }
  // 長い文章の最後の行が「ん。」のように1〜2文字だけにならないよう、末尾6文字を改行しないまとまりにする（文章は変えない。Safari でも効く方法）
  function setParagraph(id, text) {
    var el = $(id), chars = Array.from(text || ""), tail = chars.length > 12 ? 6 : 0;
    el.textContent = chars.slice(0, chars.length - tail).join("");
    if (!tail) return;
    var keep = document.createElement("span");
    keep.className = "tarot-keep";
    keep.textContent = chars.slice(-tail).join("");
    el.appendChild(keep);
  }
  function render() {
    $("tarot-date").textContent = shownDate.replace(/-/g, "/") + "（日本時間）";
    $("tarot-result").hidden = !current;
    $("tarot-draw").hidden = !!current;
    $("tarot-storage-note").hidden = !current || daily.isPersisted(current);
    // 結果を表示しているときは案内を出さない（空の行も残さない）。引く前の案内とエラーには使う
    $("tarot-status").textContent = current ? "" : "心を落ち着けて、今日の一枚を引いてみよう。";
    $("tarot-status").hidden = !!current;
    $("tarot-guide").hidden = !!current;
    if (!current) { showArtwork(null); return; }
    var card = data.cards.find(function (c) { return c.id === current.cardId; });
    var copy = card.readings && card.readings[current.position];
    $("tarot-name").textContent = card.name.ja;
    $("tarot-position").textContent = current.position === "upright" ? "正位置" : "逆位置";
    $("tarot-position").setAttribute("data-position", current.position);
    $("tarot-art").setAttribute("data-position", current.position);
    if (isOpen()) showArtwork(card, current.position);
    renderKeywords(copy ? copy.keywords : ["無料公開用の解釈は確認中です"]);
    // 画面では「今のあなたへ」「カードが伝えるメッセージ」を表示する。既存の短い message はデータに残し、追加文がないときだけ代わりに使う
    var currentYou = copy && copy.currentYou;
    $("tarot-current-box").hidden = !currentYou;
    setParagraph("tarot-current", currentYou || "");
    setParagraph("tarot-message", copy ? (copy.cardMessage || copy.message) : "プレビューでは、カード名と正逆位置・日付・保存の動作を確認できます。");
    setParagraph("tarot-action", copy ? copy.action : "公開する文章と採用画像を確認してから、正式に公開します。");
  }
  $("tarot-open").addEventListener("click", function () {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("is-active", el.id === "screen-tarot");
    });
    // 画面を開いてから描画する（ここで初めてカード画像を読み込む）
    checkDate();
    render();
    window.scrollTo(0, 0);
    $("tarot-title").focus({ preventScroll: true });
  });
  $("tarot-home").addEventListener("click", function () {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("is-active", el.id === "screen-top");
    });
    window.scrollTo(0, 0);
    $("tarot-open").focus({ preventScroll: true });
  });
  function showScreenById(id) {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("is-active", el.id === id);
    });
  }
  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  // 演出の画面。GIF はここで初めて読み込む。動きを減らす設定・GIF の読み込み失敗では静止画（ルナ）にする
  function showLoading(reduce) {
    var gif = $("tarot-loading-gif"), still = $("tarot-loading-still");
    gif.onerror = function () { gif.hidden = true; still.hidden = false; };
    if (reduce) {
      gif.hidden = true;
      still.hidden = false;
    } else {
      still.hidden = true;
      gif.hidden = false;
      if (gif.getAttribute("src") !== LOADING_GIF) gif.src = LOADING_GIF;
    }
    showScreenById("screen-tarot-loading");
    window.scrollTo(0, 0);
    $("tarot-loading-text").focus({ preventScroll: true });
  }
  function finishDrawing() {
    drawing = false;
    $("tarot-draw").disabled = false;
    // 演出のあいだに日付が変わっていたら、新しい日の「引く前」に戻す（前日の結果は出さない・自動で引き直さない）
    var now = new Date();
    shownDate = engine.dateKey(now);
    current = daily.peek(now);
    render();
    // 演出中にほかの画面へ移っていたら、画面は切り替えない（結果は次に開いたときに表示）
    if (!$("screen-tarot-loading").classList.contains("is-active")) return;
    showScreenById("screen-tarot");
    if (current) showArtwork(data.cards.find(function (c) { return c.id === current.cardId; }), current.position);
    window.scrollTo(0, 0);
    $("tarot-title").focus({ preventScroll: true });
  }
  $("tarot-draw").addEventListener("click", function () {
    if (drawing) return; // 連打しても抽選・保存・演出は一度だけ
    checkDate();
    var now = new Date(), saved = daily.peek(now);
    if (saved) { current = saved; render(); return; } // 別タブなどで今日の結果があれば、演出なしで見返す
    var result;
    try { result = daily.draw(now); }
    catch (e) { $("tarot-status").textContent = "カードを引けませんでした。通信環境やブラウザを確認し、もう一度お試しください。"; return; }
    drawing = true;
    $("tarot-draw").disabled = true;
    var reduce = reducedMotion();
    showLoading(reduce);
    // カード画像も演出のあいだに読み込み始める（結果画面では読み込み済みのことが多い）
    showArtwork(data.cards.find(function (c) { return c.id === result.cardId; }), result.position);
    window.setTimeout(finishDrawing, reduce ? REDUCED_MS : LOADING_MS);
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkDate(); });
  window.addEventListener("pageshow", checkDate);
  window.addEventListener("focus", checkDate);
  window.addEventListener("storage", function (event) {
    if (event.key !== engine.KEY || drawing) return; // 演出中の別タブの更新は、演出の終わりにまとめて反映する
    current = daily.peek(new Date());
    render();
  });
  setInterval(checkDate, 1000);
  checkDate();
})();
