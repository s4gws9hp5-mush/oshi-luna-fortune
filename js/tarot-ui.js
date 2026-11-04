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
  var shownDate = "", current = null;
  $("tarot-entry").hidden = false;
  $("tarot-preview-note").hidden = !preview;
  function checkDate() {
    var now = new Date(), day = engine.dateKey(now);
    if (day === shownDate) return;
    shownDate = day;
    current = daily.peek(now);
    render();
  }
  function render() {
    $("tarot-date").textContent = shownDate.replace(/-/g, "/") + "（日本時間）";
    $("tarot-result").hidden = !current;
    $("tarot-draw").hidden = !!current;
    $("tarot-storage-note").hidden = !current || daily.isPersisted(current);
    $("tarot-status").textContent = current ? "今日の一枚です。同じ日はこの結果を見返せます。" : "心を落ち着けて、今日の一枚を引いてみよう。";
    if (!current) return;
    var card = data.cards.find(function (c) { return c.id === current.cardId; });
    var copy = card.readings && card.readings[current.position];
    $("tarot-name").textContent = card.name.ja;
    $("tarot-position").textContent = current.position === "upright" ? "正位置" : "逆位置";
    $("tarot-art").setAttribute("data-position", current.position);
    $("tarot-keywords").textContent = copy ? copy.keywords.join("・") : "無料公開用の解釈は確認中です";
    $("tarot-message").textContent = copy ? copy.message : "プレビューでは、カード名と正逆位置・日付・保存の動作を確認できます。";
    $("tarot-action").textContent = copy ? copy.action : "公開する文章と採用画像を確認してから、正式に公開します。";
  }
  $("tarot-open").addEventListener("click", function () {
    checkDate();
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("is-active", el.id === "screen-tarot");
    });
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
