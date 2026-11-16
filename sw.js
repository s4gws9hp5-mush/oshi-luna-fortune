/* 推しルナ占い：Service Worker
 * いつもネットワークから最新のファイルを取りに行き（ネットワーク優先）、つながらないときだけ保存しておいた
 * ファイルを使う。更新したのに古い画面が残る、ということが起きないようにしている。
 * 診断結果や占いの記録はここでは扱わない（それらはページ側の localStorage にだけ保存される）。
 */
"use strict";

var CACHE = "oshi-luna-v9";
var CORE = [
  "./", "index.html", "types/", "css/style.css",
  "css/tarot.css", "js/tarot-public.js", "js/tarot-assets.js", "js/tarot.js", "js/tarot-ui.js",
  "js/data.js", "js/fortune.js", "js/share-card.js", "js/app.js",
  "images/luna-cat.png", "images/apple-touch-icon.png", "images/icon-192.png",
  "images/types/solo-moon-book.png", "images/types/cheer-penlight-sparkle.png", "images/types/memory-photos-goods.png",
  "images/types/talk-heart-bubble.png", "images/types/watch-starry-cloud.png", "images/types/create-notebook-pencil.png",
  "images/types/heal-cushion-mug-cozy.png", "images/types/research-telescope-book.png",
  // ルナのこころ整理（heart/）。回答・結果はページの localStorage にだけ保存し、このキャッシュには入れない
  "heart/", "css/heart.css", "js/heart-data.js", "js/heart-rules.js", "js/heart-storage.js", "js/heart-ui.js",
  "images/heart/luna-face-01.png", "images/heart/luna-face-02.png", "images/heart/luna-face-03.png",
  "images/heart/luna-face-04.png", "images/heart/luna-face-05.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(CORE); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  // 名前の違う古いキャッシュを消して、すぐにこの Service Worker で動かす
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      // オフラインのとき：保存しておいたファイル。ページを開くときは、こころ整理（heart/）ならそのページ、ほかは index.html を返す
      return caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(function (hit) {
        if (hit || req.mode !== "navigate") return hit;
        return /\/heart\/(index\.html)?$/.test(new URL(req.url).pathname) ? caches.match("heart/") : caches.match("index.html");
      }).then(function (res) {
        return res || Response.error();
      });
    })
  );
});
