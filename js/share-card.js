/* 推しルナ占い：推し活タイプのシェア画像「推し活タイプ取扱説明書」（1080×1920）をブラウザの中で作る */
(function (root) {
  "use strict";

  var W = 1080, H = 1920;
  var FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "BIZ UDPGothic", "Noto Sans CJK JP", "Yu Gothic", sans-serif';
  var INK = "#5a4a78", INK_SOFT = "#8a7aa6", PINK = "#f07fb2", LAVENDER = "#a68ce8";

  // 改行してよい位置（この文字のあと）と、行の先頭に置かない文字
  var BREAK_AFTER = "、。！？♡ 」”をがはにのも"; // 「で」は「できる」などの言葉の頭になりやすいので使わない
  var NO_LINE_START = "ー、。！？」”ぁぃぅぇぉっゃゅょァィゥェォッャュョ";
  var PARTICLES = "をがはのもにへとやで"; // 2行に分けるとき、2行目をこの文字（助詞）から始めない

  // 文字列を maxWidth に収まるように行に分ける（できるだけ言葉の切れ目で改行する）
  function wrap(ctx, text, maxWidth) {
    var lines = [];
    var rest = text;
    while (rest.length) {
      if (ctx.measureText(rest).width <= maxWidth) { lines.push(rest); break; }
      var fit = 1;
      while (fit < rest.length && ctx.measureText(rest.slice(0, fit + 1)).width <= maxWidth) fit++;
      var cut = fit;
      for (var i = fit; i > Math.floor(fit * 0.4); i--) {
        if (BREAK_AFTER.indexOf(rest.charAt(i - 1)) >= 0) { cut = i; break; }
      }
      while (cut > 1 && NO_LINE_START.indexOf(rest.charAt(cut)) >= 0) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    // 最後の行が3文字以下だけ残ったら、1つ前の行の言葉の切れ目で分け直す
    var n = lines.length;
    if (n >= 2 && lines[n - 1].length <= 3) {
      var prev = lines[n - 2];
      for (var j = prev.length - 1; j > Math.floor(prev.length * 0.4); j--) {
        var moved = prev.slice(j);
        if (!moved.length) continue; // 何も移らない位置では分け直さない
        if (BREAK_AFTER.indexOf(prev.charAt(j - 1)) >= 0 && ctx.measureText(moved + lines[n - 1]).width <= maxWidth) {
          lines.splice(n - 2, 2, prev.slice(0, j), prev.slice(j) + lines[n - 1]);
          break;
        }
      }
    }
    return lines;
  }

  // 言葉の切れ目（の・な・、など）のうち、2行の長さがいちばんそろう位置で分ける。切れ目がなければ null
  function splitTwo(ctx, text, chars) {
    var best = null;
    for (var i = 2; i < text.length - 1; i++) {
      if (chars.indexOf(text.charAt(i - 1)) < 0 || NO_LINE_START.indexOf(text.charAt(i)) >= 0 || PARTICLES.indexOf(text.charAt(i)) >= 0) continue;
      var w = Math.max(ctx.measureText(text.slice(0, i)).width, ctx.measureText(text.slice(i)).width);
      if (!best || w < best.w) best = { w: w, lines: [text.slice(0, i), text.slice(i)] };
    }
    return best;
  }

  // 1行で読める大きさならそのまま。入らなければ、言葉の切れ目で2行にそろえる。それでも無理なら普通に折り返す
  function fitPhrase(ctx, text, weight, oneLineSizes, twoLineSizes, maxWidth, chars) {
    var i, s;
    for (i = 0; i < oneLineSizes.length; i++) {
      ctx.font = weight + " " + oneLineSizes[i] + "px " + FONT;
      if (ctx.measureText(text).width <= maxWidth) return { size: oneLineSizes[i], lines: [text] };
    }
    for (i = 0; i < twoLineSizes.length; i++) {
      ctx.font = weight + " " + twoLineSizes[i] + "px " + FONT;
      s = splitTwo(ctx, text, chars);
      if (s && s.w <= maxWidth) return { size: twoLineSizes[i], lines: s.lines };
    }
    return fitText(ctx, text, weight, twoLineSizes, maxWidth, 3);
  }

  // maxLines 行以内に収まる、いちばん大きい文字サイズを選ぶ
  function fitText(ctx, text, weight, sizes, maxWidth, maxLines) {
    for (var i = 0; i < sizes.length; i++) {
      ctx.font = weight + " " + sizes[i] + "px " + FONT;
      var lines = wrap(ctx, text, maxWidth);
      if (lines.length <= maxLines) return { size: sizes[i], lines: lines };
    }
    return { size: sizes[sizes.length - 1], lines: wrap(ctx, text, maxWidth) };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 色を混ぜる（"#rrggbb" どうし。t は b の割合）
  function rgbOf(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) {
    var x = rgbOf(a), y = rgbOf(b);
    return "rgb(" + x.map(function (v, i) { return Math.round(v + (y[i] - v) * t); }).join(",") + ")";
  }
  function rgba(hex, a) { return "rgba(" + rgbOf(hex).join(",") + "," + a + ")"; }

  // ---- 飾り（キラキラ・星・ハート・三日月・リボン）----
  function sparkle(ctx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
  }

  function star(ctx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineJoin = "round";
    ctx.lineWidth = r * 0.22;
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.5 : r;
      ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function heart(ctx, x, y, s, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.85);
    ctx.bezierCurveTo(x - s * 1.3, y, x - s * 0.7, y - s * 1.05, x, y - s * 0.38);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.05, x + s * 1.3, y, x, y + s * 0.85);
    ctx.fill();
    ctx.restore();
  }

  // 三日月：円から、右上にずらした円を切り抜いた形
  function moon(ctx, x, y, r, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2);
    ctx.arc(x + r * 0.42, y - r * 0.32, r * 0.8, 0, Math.PI * 2, true);
    ctx.fillStyle = color;
    ctx.fill("evenodd");
    ctx.restore();
  }

  function bow(ctx, x, y, s, color, knot) {
    ctx.save();
    ctx.fillStyle = color;
    [-1, 1].forEach(function (d) {
      ctx.beginPath(); // 垂れ
      ctx.moveTo(x, y);
      ctx.lineTo(x + d * s * 0.62, y + s * 1.05);
      ctx.lineTo(x + d * s * 0.36, y + s * 0.9);
      ctx.lineTo(x + d * s * 0.2, y + s * 1.12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath(); // 輪
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + d * s * 0.5, y - s * 0.9, x + d * s * 1.35, y - s * 0.7, x + d * s * 1.15, y);
      ctx.bezierCurveTo(x + d * s * 1.35, y + s * 0.7, x + d * s * 0.5, y + s * 0.9, x, y);
      ctx.fill();
    });
    ctx.fillStyle = knot;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function centerLines(ctx, lines, y, lineHeight) {
    lines.forEach(function (line, i) { ctx.fillText(line, W / 2, y + i * lineHeight); });
    return y + lines.length * lineHeight;
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("画像を読み込めませんでした: " + src)); };
      img.src = src;
    });
  }

  var CARD = { x: 44, y: 44, w: W - 88, h: H - 88 };     // 白いカード
  var TEXT_W = W - 200;                                   // タイプ名などの幅
  var PX = 96, PW = W - 192, COL_GAP = 24;                // 説明のパネルの左端と幅
  var CTA_TOP = H - 340;                                  // 下の誘導エリア（ここより上に説明を収める）

  function background(ctx, theme) {
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#ffe3f0");
    bg.addColorStop(0.5, mix("#efe4ff", theme, 0.3));
    bg.addColorStop(1, "#dcefff");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    [[24, 24, 14, "#ffffff"], [1050, 30, 12, "#f6d36b"], [22, 1890, 13, "#c9b8f0"], [1054, 1886, 15, "#ffffff"], [540, 22, 9, "#ffffff"]]
      .forEach(function (p) { sparkle(ctx, p[0], p[1], p[2], p[3]); });
    ctx.save();
    ctx.shadowColor = "rgba(166, 140, 232, 0.3)";
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 10;
    roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 64);
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fill();
    ctx.restore();
    // ふちの点線（ステッチ）はタイプの色
    ctx.save();
    roundRect(ctx, CARD.x + 16, CARD.y + 16, CARD.w - 32, CARD.h - 32, 50);
    ctx.setLineDash([14, 12]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(theme, 0.85);
    ctx.stroke();
    ctx.restore();
  }

  // 「推し活タイプ取扱説明書」のリボン帯
  function banner(ctx, text, y, size) {
    ctx.font = "700 " + size + "px " + FONT;
    var h = Math.round(size * 1.9), w = ctx.measureText(text).width + size * 2.4, x = W / 2 - w / 2;
    ctx.fillStyle = "#f4c2dc";
    [[x, -1], [x + w, 1]].forEach(function (p) {
      var e = p[0], d = p[1];
      ctx.beginPath();
      ctx.moveTo(e - d * h * 0.4, y + h * 0.3);
      ctx.lineTo(e + d * h * 0.75, y + h * 0.3);
      ctx.lineTo(e + d * h * 0.48, y + h * 0.72);
      ctx.lineTo(e + d * h * 0.75, y + h * 1.12);
      ctx.lineTo(e - d * h * 0.4, y + h * 1.12);
      ctx.closePath();
      ctx.fill();
    });
    var g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#ffd3e7");
    g.addColorStop(1, "#e4d8ff");
    roundRect(ctx, x, y, w, h, 16);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.fillText(text, W / 2, y + (h - size) / 2);
    sparkle(ctx, x + size * 0.75, y + h / 2, size * 0.32, "#ffffff");
    sparkle(ctx, x + w - size * 0.75, y + h / 2, size * 0.32, "#ffffff");
    return y + h;
  }

  // 改行の位置ごとの「不自然さ」（小さいほど自然）。text の i 文字目の前で改行する場合。-1 は改行できない
  var OPENING = "「“（(";
  function isHira(c) { return c >= "ぁ" && c <= "ゖ"; }
  // 途中で分けない言葉（ひらがなの言葉は、助詞と見分けがつかないことがあるため）
  var KEEP_WORDS = ["ひと息", "ひと言", "ひとり", "そっと", "もっと", "ずっと", "きっと", "ちょっと", "とき", "やさし", "あたたか",
    "うれし", "のんびり", "おしゃべり", "しっかり", "じっくり", "ゆっくり", "すてき", "まっすぐ", "どんどん", "おおらか", "なきゃ", "盛り上がろう"];
  function insideWord(text, i) {
    return KEEP_WORDS.some(function (w) {
      for (var at = text.indexOf(w); at >= 0; at = text.indexOf(w, at + 1)) if (i > at && i < at + w.length) return true;
      return false;
    });
  }
  function breakCost(text, i) {
    var a = text.charAt(i - 1), b = text.charAt(i), a2 = text.charAt(i - 2);
    if (NO_LINE_START.indexOf(b) >= 0 || OPENING.indexOf(a) >= 0) return -1;
    if (insideWord(text, i)) return 8;
    if ("」”".indexOf(a) >= 0 && PARTICLES.indexOf(b) >= 0) return 6; // 「〜」／と
    if ("、。！？♡」”".indexOf(a) >= 0) return 0;          // 句読点のあと
    if (OPENING.indexOf(b) >= 0) return 1;                  // かぎかっこの前
    if (a === "て" && isHira(b)) return 3;                  // 「〜して／あげて」「聞いて／もらえる」
    if (b === "で" && text.charAt(i + 1) === "き") return 2; // 「／できる」
    // 助詞から行を始めない。ただし後ろがひらがなのときは「やさしく」「とっても」など言葉の頭のことも多い
    if (PARTICLES.indexOf(b) >= 0) return isHira(text.charAt(i + 1)) ? 3 : 8;
    if ("をがはのにへとやな".indexOf(a) >= 0 && "てでっ".indexOf(a2) < 0) return 1; // 助詞のあと
    if (a === "も" && "てで".indexOf(a2) < 0) return 2;
    if (isHira(a) && !isHira(b)) return 2;                  // ひらがな → 漢字・カタカナ
    return 8;                                               // 言葉の途中（できるだけ使わない）
  }

  // できるだけ少ない行数で、自然な位置で、行の長さがそろうように分ける
  function wrapNice(ctx, text, maxWidth) {
    var n = text.length, cache = {}, em = ctx.measureText("あ").width;
    function width(s, e) { var k = s + ":" + e; return k in cache ? cache[k] : (cache[k] = ctx.measureText(text.slice(s, e)).width); }
    if (width(0, n) <= maxWidth) return [text];
    var cost = [];
    for (var i = 1; i < n; i++) cost[i] = breakCost(text, i);
    var found = null;
    for (var count = 2; count <= 5; count++) {
      var best = null;
      (function search(start, left, cuts, total, worst) {
        if (left === 1) {
          if (width(start, n) > maxWidth) return;
          var ws = [], prev = 0;
          cuts.concat([n]).forEach(function (c) { ws.push(width(prev, c)); prev = c; });
          var score = total * 3 + (Math.max.apply(null, ws) - Math.min.apply(null, ws)) / em;
          if (!best || score < best.score) best = { score: score, cuts: cuts, worst: worst };
          return;
        }
        for (var c = start + 1; c < n; c++) {
          if (width(start, c) > maxWidth) break;
          if (cost[c] >= 0) search(c, left - 1, cuts.concat([c]), total + cost[c], Math.max(worst, cost[c]));
        }
      })(0, count, [], 0, 0);
      if (!best) { if (found) break; continue; }
      if (best.worst < 8) { found = best; break; }   // 自然な位置だけで切れた
      if (found) break;                              // 1行増やしても無理なら、少ない行数のほうを使う
      found = best;                                  // 言葉の途中で切るしかないときは、1行増やして試す
    }
    if (!found) return wrap(ctx, text, maxWidth);
    var lines = [], from = 0;
    found.cuts.concat([n]).forEach(function (c) { lines.push(text.slice(from, c)); from = c; });
    return lines;
  }

  // パネルの本文の行（項目が2つ以上なら「・」をつけ、2行目以降は字下げ）
  function panelLines(ctx, items, size, width) {
    ctx.font = "400 " + size + "px " + FONT;
    var prefix = items.length > 1 ? "・" : "", indent = prefix ? ctx.measureText(prefix).width : 0, out = [];
    items.forEach(function (t) {
      wrapNice(ctx, t, width - indent).forEach(function (line, i) {
        out.push({ prefix: i === 0 ? prefix : "", indent: indent, text: line });
      });
    });
    return out;
  }

  function panelPad(w) { return w < PW ? 26 : 34; } // パネルの左右の余白
  function panelHeight(p) { return p.tab / 2 + 12 + (p.lines.length - 1) * p.size * 1.5 + p.size + 24; }

  // 見出しのタブつきのパネル（タブはパネルの上のふちに重ねる）
  function panel(ctx, p, theme, record) {
    roundRect(ctx, p.x, p.y, p.w, p.h, 30);
    ctx.fillStyle = mix(theme, "#ffffff", 0.8);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(theme, 0.8);
    ctx.stroke();

    ctx.font = "700 " + p.ls + "px " + FONT;
    var th = p.tab, br = th * 0.36;
    var tw = th / 2 + br + p.ls * 0.4 + ctx.measureText(p.title).width + p.ls * 0.8, tx = p.x + 24, ty = p.y - th / 2;
    roundRect(ctx, tx, ty, tw, th, th / 2);
    ctx.fillStyle = theme;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    var bx = tx + th / 2, by = ty + th / 2;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    p.icon(ctx, bx, by, br * 0.62);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(p.title, bx + br + p.ls * 0.4, ty + (th - p.ls) / 2);

    ctx.font = "400 " + p.size + "px " + FONT;
    var x = p.x + panelPad(p.w), y = p.y + th / 2 + 12;
    p.lines.forEach(function (l) {
      if (l.prefix) ctx.fillText(l.prefix, x, y);
      ctx.fillText(l.text, x + l.indent, y);
      record.push({ text: l.prefix + l.text, x: x, w: l.indent + ctx.measureText(l.text).width, size: p.size });
      y += p.size * 1.5;
    });
  }

  // 見出しのアイコン（白い丸の中に描く）
  var ICONS = {
    moon: function (ctx, x, y, r) { moon(ctx, x - r * 0.1, y + r * 0.05, r * 1.05, "#f0c43c"); },
    star: function (ctx, x, y, r) { star(ctx, x, y + r * 0.08, r * 1.05, "#a68ce8"); },
    bow: function (ctx, x, y, r) { bow(ctx, x, y - r * 0.2, r * 0.78, "#f7a1c4", "#f07fb2"); },
    heart: function (ctx, x, y, r) { heart(ctx, x, y + r * 0.08, r * 0.95, "#f07fb2"); }
  };

  // 1回分の描画。step.cat で白猫の大きさ、step.gap で余白、step.font で文字の大きさを変える。描いた範囲を返す
  function render(canvas, type, catImg, siteText, step) {
    var ctx = canvas.getContext("2d");
    var theme = type.color, records = [];
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    background(ctx, theme);

    // 1. サービス名と見出し
    ctx.font = "700 48px " + FONT;
    var title = ctx.createLinearGradient(W / 2 - 180, 0, W / 2 + 180, 0);
    title.addColorStop(0, "#f59cc4");
    title.addColorStop(0.55, LAVENDER);
    title.addColorStop(1, "#8cc3ee");
    ctx.fillStyle = title;
    ctx.fillText("推しルナ占い", W / 2, 86);
    var tw = ctx.measureText("推しルナ占い").width;
    star(ctx, W / 2 - tw / 2 - 40, 110, 16, "#f6d36b");
    heart(ctx, W / 2 + tw / 2 + 40, 110, 16, "#f7a1c4");
    var y = banner(ctx, "推し活タイプ取扱説明書", 154, 30);
    ctx.font = "400 30px " + FONT;
    ctx.fillStyle = INK_SOFT;
    ctx.textAlign = "center";
    ctx.fillText("あなたの推し活タイプは", W / 2, y + 26);

    // 2. タイプの白猫（主役。タイプの色の輪の中に、縦横比を保って描く）
    var extra = step.extra || 0; // 説明が短いタイプは、余った高さを余白に分ける
    var R = Math.round(176 * step.cat), cy = y + 26 + 30 + 40 + Math.round(10 * step.gap) + extra + R;
    var glow = ctx.createRadialGradient(W / 2, cy, R * 0.6, W / 2, cy, R + 150);
    glow.addColorStop(0, rgba(theme, 0.38));
    glow.addColorStop(1, rgba(theme, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(W / 2 - R - 150, cy - R - 150, (R + 150) * 2, (R + 150) * 2);
    ctx.beginPath();
    ctx.arc(W / 2, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = rgba(theme, 0.6);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W / 2, cy, R - 14, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, cy, R - 26, 0, Math.PI * 2);
    ctx.setLineDash([8, 10]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(theme, 0.9);
    ctx.stroke();
    ctx.restore();
    var size = (R - 14) * 1.8;
    var k = Math.min(size / catImg.naturalWidth, size / catImg.naturalHeight);
    var iw = catImg.naturalWidth * k, ih = catImg.naturalHeight * k;
    ctx.drawImage(catImg, W / 2 - iw / 2, cy - ih / 2, iw, ih);
    bow(ctx, W / 2, cy - R + 4, 36, "#f7a1c4", "#f07fb2");
    // 白猫のまわりの飾り（文字にかからない左右の余白だけ）
    var L = W / 2 - R, Rt = W / 2 + R;
    moon(ctx, L - 100, cy - 70, 52, "#f6d36b");
    sparkle(ctx, L - 165, cy + 10, 16, "#c9b8f0");
    star(ctx, L - 80, cy + 92, 22, "#c9b8f0");
    heart(ctx, L - 150, cy + 128, 16, "#ffc6dd");
    star(ctx, Rt + 92, cy - 88, 32, "#f6d36b");
    sparkle(ctx, Rt + 160, cy - 20, 15, "#9fd0f2");
    heart(ctx, Rt + 88, cy + 56, 28, "#f7a1c4");
    sparkle(ctx, Rt + 150, cy + 122, 12, "#f6d36b");

    // 3. タイプ名（タイプの色のマーカーつき）とキャッチコピー（吹き出し）
    var name = fitPhrase(ctx, type.name, "700", [76, 70, 64, 60], [66, 62, 58, 54], TEXT_W, "のなと");
    ctx.font = "700 " + name.size + "px " + FONT;
    ctx.textAlign = "center";
    y = cy + R + Math.round(26 * step.gap);
    name.lines.forEach(function (line, i) {
      var ly = y + i * name.size * 1.22, lw = ctx.measureText(line).width;
      roundRect(ctx, W / 2 - lw / 2 - 14, ly + name.size * 0.6, lw + 28, name.size * 0.42, name.size * 0.2);
      ctx.fillStyle = rgba(theme, 0.55);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.fillText(line, W / 2, ly);
    });
    y += name.lines.length * name.size * 1.22;

    var catchText = fitPhrase(ctx, type.catch, "700", [40, 38, 36], [38, 36, 34, 32], TEXT_W - 100, "、。");
    var cs = catchText.size, clh = cs * 1.42;
    ctx.font = "700 " + cs + "px " + FONT;
    var cw = Math.max.apply(null, catchText.lines.map(function (l) { return ctx.measureText(l).width; })) + 84;
    var ch = (catchText.lines.length - 1) * clh + cs + 36, cyTop = y + Math.round(12 * step.gap);
    roundRect(ctx, W / 2 - cw / 2, cyTop, cw, ch, Math.min(40, ch / 2));
    ctx.fillStyle = "#fff2f8";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(PINK, 0.55);
    ctx.stroke();
    heart(ctx, W / 2 - cw / 2 + 4, cyTop + 6, 14, "#f7a1c4");
    sparkle(ctx, W / 2 + cw / 2 - 4, cyTop + ch - 6, 14, "#f6d36b");
    ctx.fillStyle = "#e3649e";
    centerLines(ctx, catchText.lines, cyTop + 18, clh);
    y = cyTop + ch;

    // 4. 取扱説明書：パネルを3段（どんな人？／推し活で輝くところ／取り扱いのコツ＋仲良くなるヒント）
    // 文字は読みやすさを優先して下限を決める（見出し28px・本文30px以上）
    var ls = Math.max(28, Math.round(30 * step.font)), bs = Math.max(30, Math.round(32 * step.font));
    var tab = Math.round(ls * 1.75), gap = Math.round(16 * step.gap) + tab / 2;
    var half = (PW - COL_GAP) / 2;
    function make(x, w, title, icon, items) {
      var size = w < PW ? 30 : bs; // 2列のパネルは30px（読める大きさの下限）
      return { x: x, w: w, title: title, icon: ICONS[icon], ls: ls, size: size, tab: tab, lines: panelLines(ctx, items, size, w - panelPad(w) * 2) };
    }
    var rows = [
      [make(PX, PW, "どんな人？", "moon", [type.card.traits])],
      [make(PX, PW, "推し活で輝くところ", "star", type.strengths.slice(0, 2))],
      [make(PX, half, "取り扱いのコツ", "bow", [type.card.care]), make(PX + half + COL_GAP, half, "仲良くなるヒント", "heart", [type.card.friend])]
    ];
    y += Math.round(22 * step.gap) + extra + tab / 2;
    rows.forEach(function (row, i) {
      var h = Math.max.apply(null, row.map(panelHeight));
      row.forEach(function (p) { p.y = y; p.h = h; panel(ctx, p, theme, records); });
      y += h + (i < rows.length - 1 ? gap + extra : 0);
    });
    var sectionsBottom = y;

    // 5. 診断への誘導・ハッシュタグ・サイトのアドレス（カードの下にそろえる）
    ctx.textAlign = "center";
    var boxY = CTA_TOP + 16, boxH = 136;
    var cta = ctx.createLinearGradient(PX, 0, PX + PW, 0);
    cta.addColorStop(0, "#ffe3f0");
    cta.addColorStop(1, "#ebe2ff");
    roundRect(ctx, PX, boxY, PW, boxH, 34);
    ctx.fillStyle = cta;
    ctx.fill();
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(PINK, 0.6);
    ctx.stroke();
    ctx.restore();
    heart(ctx, PX + 52, boxY + boxH / 2, 22, "#f7a1c4");
    heart(ctx, PX + PW - 52, boxY + boxH / 2, 22, "#c9b8f0");
    ctx.font = "700 34px " + FONT;
    ctx.fillStyle = INK;
    ctx.fillText("あなたは何タイプ？", W / 2, boxY + 20);
    ctx.font = "700 38px " + FONT;
    ctx.fillStyle = "#e3649e";
    ctx.fillText("無料の推し活タイプ診断はこちら♡", W / 2, boxY + 72);
    ctx.font = "700 38px " + FONT;
    ctx.fillStyle = LAVENDER;
    ctx.fillText("#推しルナ占い", W / 2, boxY + boxH + 20);
    var site = fitText(ctx, siteText, "700", [32, 30, 28, 24], TEXT_W, 1);
    ctx.font = "700 " + site.size + "px " + FONT;
    ctx.fillStyle = INK;
    var siteY = boxY + boxH + 74;
    ctx.fillText(site.lines.join(""), W / 2, siteY);

    return {
      scale: step, sectionsBottom: sectionsBottom, ctaTop: CTA_TOP, siteBottom: siteY + site.size,
      cardBottom: CARD.y + CARD.h - 16, catRadius: R, nameLines: name.lines, catchLines: catchText.lines, bodyLines: records,
      minFont: Math.min(bs, ls, site.size, cs, 30)
    };
  }

  // type: data.js の TYPES の1タイプ、siteText: 画像に入れるサイトのアドレス
  // 説明が下の誘導エリアにかからない大きさになるまで、少しずつ小さくして描き直す
  function draw(canvas, type, catImg, siteText) {
    canvas.width = W;
    canvas.height = H;
    // 大きい順に試す。入らなければ、まず余白、次に白猫を少し小さくし、最後に文字を小さくする（下限あり）
    var steps = [
      { cat: 1.12, gap: 1.3, font: 1.06 }, { cat: 1.06, gap: 1.15, font: 1.06 }, { cat: 1.0, gap: 1.0, font: 1.03 },
      { cat: 1.0, gap: 0.8, font: 1.0 }, { cat: 0.94, gap: 0.65, font: 1.0 }, { cat: 0.9, gap: 0.5, font: 0.97 },
      { cat: 0.86, gap: 0.4, font: 0.94 }
    ], layout, step;
    for (var i = 0; i < steps.length; i++) {
      step = steps[i];
      canvas.getContext("2d").clearRect(0, 0, W, H);
      layout = render(canvas, type, catImg, siteText, step);
      if (layout.sectionsBottom <= CTA_TOP) break;
    }
    // まだ下が空いていたら、その分を4か所の余白に分けて描き直す（下の誘導との間が空きすぎないように）
    var slack = CTA_TOP - layout.sectionsBottom;
    if (slack > 24) {
      canvas.getContext("2d").clearRect(0, 0, W, H);
      layout = render(canvas, type, catImg, siteText, { cat: step.cat, gap: step.gap, font: step.font, extra: Math.floor(Math.min(slack - 16, 160) / 4) });
    }
    canvas.layout = layout;
    return canvas;
  }

  function toBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error("画像を作れませんでした")); }, "image/png");
      } else {
        var data = atob(canvas.toDataURL("image/png").split(",")[1]);
        var bytes = new Uint8Array(data.length);
        for (var i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
        resolve(new Blob([bytes], { type: "image/png" }));
      }
    });
  }

  // タイプのシェア画像を作って PNG の Blob を返す
  function create(type, siteText) {
    return loadImage(type.image).then(function (img) {
      return toBlob(draw(document.createElement("canvas"), type, img, siteText));
    });
  }

  // レイアウトの確認用（テストで、文字がはみ出していないかを調べる）
  function layout(type, siteText) {
    var fake = { naturalWidth: 1, naturalHeight: 1 };
    var c = document.createElement("canvas");
    var ctx = c.getContext("2d");
    var orig = ctx.drawImage;
    ctx.drawImage = function () {};
    draw(c, type, fake, siteText);
    ctx.drawImage = orig;
    return c.layout;
  }

  root.OshiLunaShareCard = { create: create, layout: layout, wrap: wrap, size: { width: W, height: H } };
})(window);
