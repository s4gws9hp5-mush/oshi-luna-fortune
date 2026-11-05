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
  var image = $("tarot-image"), placeholder = $("tarot-placeholder");
  function showArtwork(card) {
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
    image.alt = card.name.ja + "のカード（" + (current.position === "upright" ? "正位置" : "逆位置") + "）";
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
    if (isOpen()) showArtwork(card);
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
  $("tarot-draw").addEventListener("click", function () {
    checkDate();
    try { current = daily.draw(new Date()); render(); }
    catch (e) { $("tarot-status").textContent = "カードを引けませんでした。通信環境やブラウザを確認し、もう一度お試しください。"; }
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkDate(); });
  window.addEventListener("pageshow", checkDate);
  window.addEventListener("focus", checkDate);
  window.addEventListener("storage", function (event) {
    if (event.key !== engine.KEY) return;
    current = daily.peek(new Date());
    render();
  });
  setInterval(checkDate, 1000);
  checkDate();
})();
