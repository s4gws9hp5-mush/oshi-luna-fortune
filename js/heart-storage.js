/* ルナのこころ整理：この機能専用の端末内保存（localStorage の1キーだけ。ほかの保存データには触れない）
 * 読込の結果は4つに分ける（19.3）：
 *   empty       … 保存がない
 *   ok          … 読み込めて、形式・回答・結果の整合を確かめられた
 *   invalid     … 保存はあるが、形式・版・回答の対応を確かめられない（推測で直さない・自動で消さない）
 *   unavailable … 保存領域にアクセスできない（「保存なし」と同じに扱わない）
 * 書込・削除は、読み直して実際に反映されたかを確かめてから ok を返す。 */
(function (root) {
  "use strict";
  var KEY = "oshi-luna-heart-state-v1";
  var rules = root.OshiLunaHeartRules || (typeof require === "function" ? require("./heart-rules.js") : null);

  function create(getStorage) {
    // getStorage：localStorage を返す関数（アクセスで例外が出る環境があるため、毎回 try の中で取り出す）
    function store() { return getStorage(); }
    function read() {
      var raw;
      try { var s = store(); if (!s) return { status: "unavailable" }; raw = s.getItem(KEY); }
      catch (e) { return { status: "unavailable" }; }
      if (raw === null || raw === undefined) return { status: "empty" };
      var rec;
      try { rec = JSON.parse(raw); } catch (e) { return { status: "invalid" }; }
      return rules.validateRecord(rec) ? { status: "ok", record: rec } : { status: "invalid" };
    }
    function write(record) {
      var text = JSON.stringify(record);
      try {
        var s = store(); if (!s) return { ok: false };
        s.setItem(KEY, text);
        return { ok: s.getItem(KEY) === text };
      } catch (e) { return { ok: false }; }
    }
    function remove() {
      try {
        var s = store(); if (!s) return { ok: false };
        s.removeItem(KEY);
        return { ok: s.getItem(KEY) === null };
      } catch (e) { return { ok: false }; }
    }
    return { KEY: KEY, read: read, write: write, remove: remove };
  }

  // 画面から使う保存の窓口。既存の保存内容を、本人の確認なしに上書き・削除扱いにしない。
  // 書き込んでよいのは、次のどれかを確かめたあとだけ（owned）：
  //   ・読んで「保存がない」と確かめた（起動時・書く直前・削除の後）
  //   ・本人が保存内容から「続きから」「前回の結果を見る」を選んだ（adopt）
  // 保存領域に入れない・保存内容があるのに確かめていないときは書かない（画面での利用は続けられる）。
  // 削除は、消したあと読んで「保存がない」と確かめられたときだけ成功とする。
  function createSession(getStorage) {
    var st = create(getStorage), owned = false;
    function read() {
      var r = st.read();
      if (r.status === "empty") owned = true;
      return r;
    }
    function write(record) {
      if (!owned) {
        var now = st.read();
        if (now.status !== "empty") {
          // existing：保存内容がある（読める／読めない）。unavailable：あるかどうか確かめられない
          return { ok: false, reason: now.status === "unavailable" ? "unavailable" : "existing", status: now.status, record: now.record };
        }
        owned = true;
      }
      return st.write(record).ok ? { ok: true } : { ok: false, reason: "failed" };
    }
    function remove() {
      var r = st.remove(), after = st.read();
      var cleared = after.status === "empty";
      if (cleared) owned = true;
      return { ok: cleared, removed: r.ok, after: after.status };
    }
    function adopt() { owned = true; }
    return { KEY: KEY, read: read, write: write, remove: remove, adopt: adopt, isOwned: function () { return owned; } };
  }

  var api = { KEY: KEY, create: create, createSession: createSession };
  root.OshiLunaHeartStorage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
