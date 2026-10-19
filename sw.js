/* 推しルナ占い：Service Worker
 * いつもネットワークから最新のファイルを取りに行き（ネットワーク優先）、つながらないときだけ保存しておいた
 * ファイルを使う。更新したのに古い画面が残る、ということが起きないようにしている。
 * 診断結果や占いの記録はここでは扱わない（それらはページ側の localStorage にだけ保存される）。
 */
"use strict";

var CACHE = "oshi-luna-v3";
var CORE = [
  "./", "index.html", "css/style.css",
  "js/data.js", "js/fortune.js", "js/share-card.js", "js/app.js",
  "images/luna-cat.png", "images/apple-touch-icon.png", "images/icon-192.png",
  "images/types/solo-moon-book.png", "images/types/cheer-penlight.png", "images/types/memory-photos-goods.png",
  "images/types/talk-heart.png", "images/types/watch-starry-cloud.png", "images/types/create-notebook-pencil.png",
  "images/types/heal-cushion-mug.png", "images/types/research-magnifier-starbook.png"
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
      // オフラインのとき：保存しておいたファイル。ページを開くときは index.html を返す
      return caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(function (hit) {
        return hit || (req.mode === "navigate" ? caches.match("index.html") : null);
      }).then(function (res) {
        return res || Response.error();
      });
    })
  );
});
