/* 今日の一枚。既存の診断・毎日の占いとは独立した保存領域を使う。 */
(function (root) {
  "use strict";
  var KEY = "oshi-luna-tarot-daily-v1";
  function dateKey(date) {
    return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  function randomInt(max, crypto) {
    if (!Number.isInteger(max) || max < 1 || max > 4294967296) throw new Error("Invalid random range");
    if (!crypto || !crypto.getRandomValues) throw new Error("Secure randomness unavailable");
    var limit = Math.floor(4294967296 / max) * max, buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % max;
  }
  function createDaily(options) {
    var cards = options.cards, memory = {}, storage = options.storage;
    var find = function (id) { return cards.find(function (c) { return c.id === id; }); };
    function valid(r, day) {
      return r && r.version === 1 && r.date === day && !!find(r.cardId) &&
        (r.position === "upright" || r.position === "reversed");
    }
    function stored(day) {
      try {
        var r = JSON.parse(storage.getItem(KEY));
        if (valid(r, day)) { memory[day] = r; return r; }
      } catch (e) { /* 保存不可・破損時もタロット以外のデータには触らない */ }
      return memory[day] || null;
    }
    return {
      peek: function (date) { return stored(dateKey(date)); },
      draw: function (date) {
        var day = dateKey(date), old = stored(day);
        if (old) return old;
        if (cards.length !== 78 || new Set(cards.map(function (c) { return c.id; })).size !== 78) {
          throw new Error("Expected 78 distinct cards");
        }
        var result = { version: 1, date: day,
          cardId: cards[randomInt(cards.length, options.crypto)].id,
          position: randomInt(2, options.crypto) === 0 ? "upright" : "reversed" };
        memory[day] = result;
        try { storage.setItem(KEY, JSON.stringify(result)); } catch (e) { /* セッション内の結果は維持 */ }
        return result;
      },
      isPersisted: function (result) {
        try { return valid(JSON.parse(storage.getItem(KEY)), result.date) &&
          storage.getItem(KEY) === JSON.stringify(result); } catch (e) { return false; }
      }
    };
  }
  var api = { KEY: KEY, dateKey: dateKey, createDaily: createDaily, randomInt: randomInt };
  root.OshiLunaTarot = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
