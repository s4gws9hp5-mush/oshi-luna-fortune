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

  var CARD = { x: 60, y: 70, w: W - 120, h: H - 140 };   // 白いカード
  var LEFT = 130, TEXT_W = W - 260;                       // 本文の左端と幅
  var CTA_TOP = H - 400;                                  // 下の誘導エリア（ここより上に本文を収める）

  function background(ctx) {
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#ffe3f0");
    bg.addColorStop(0.5, "#efe4ff");
    bg.addColorStop(1, "#dcefff");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    [[90, 40, 16, "#ffffff"], [990, 46, 13, "#f6d36b"], [40, 1880, 14, "#c9b8f0"], [1030, 1878, 16, "#ffffff"], [960, 36, 7, "#ffb3cf"]]
      .forEach(function (p) { sparkle(ctx, p[0], p[1], p[2], p[3]); });
    ctx.save();
    ctx.shadowColor = "rgba(166, 140, 232, 0.28)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 12;
    roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 60);
    ctx.fillStyle = "rgba(255, 255, 255, 0.93)";
    ctx.fill();
    ctx.restore();
  }

  // 左寄せの見出し（タイプの色のラベル）
  function label(ctx, text, y, color, size) {
    ctx.font = "700 " + size + "px " + FONT;
    var w = ctx.measureText(text).width + size * 1.6, h = size * 1.7;
    roundRect(ctx, LEFT, y, w, h, h / 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
    sparkle(ctx, LEFT + size * 0.55, y + h / 2, size * 0.28, "#ffffff");
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(text, LEFT + size * 0.95, y + (h - size) / 2);
    return y + h;
  }

  // 本文の改行：1行に入らなければ、句読点 → 助詞の順に、2行の長さがいちばんそろう位置で分ける
  function wrapBody(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return [text];
    var groups = ["、。！？♡」”", "をがはのも"];
    for (var i = 0; i < groups.length; i++) {
      var s = splitTwo(ctx, text, groups[i]);
      if (s && s.w <= maxWidth) return s.lines;
    }
    return wrap(ctx, text, maxWidth);
  }

  // 左寄せの本文（prefix があれば2行目以降を字下げ）
  function body(ctx, text, y, size, prefix, record) {
    ctx.font = "400 " + size + "px " + FONT;
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    var indent = prefix ? ctx.measureText(prefix).width : 0;
    var lines = wrapBody(ctx, text, TEXT_W - indent);
    var lh = size * 1.55;
    lines.forEach(function (line, i) {
      if (prefix && i === 0) ctx.fillText(prefix, LEFT, y);
      ctx.fillText(line, LEFT + indent, y);
      record.push({ text: (prefix && i === 0 ? prefix : "") + line, x: LEFT, w: indent + ctx.measureText(line).width, size: size });
      y += lh;
    });
    return y;
  }

  // 1回分の描画。step.cat で白猫と余白、step.font で文字の大きさを変える。描いた範囲を返す
  function render(canvas, type, catImg, siteText, step) {
    var scale = step.cat;
    var ctx = canvas.getContext("2d");
    var lines = [];
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    background(ctx);

    // 1. サービス名と見出し
    ctx.font = "700 46px " + FONT;
    var title = ctx.createLinearGradient(W / 2 - 180, 0, W / 2 + 180, 0);
    title.addColorStop(0, "#f59cc4");
    title.addColorStop(0.55, LAVENDER);
    title.addColorStop(1, "#8cc3ee");
    ctx.fillStyle = title;
    ctx.fillText("推しルナ占い", W / 2, 118);
    ctx.font = "400 28px " + FONT;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText("─ 推し活タイプ取扱説明書 ─", W / 2, 178);
    ctx.font = "400 36px " + FONT;
    ctx.fillText("あなたの推し活タイプは", W / 2, 232);

    // 2. タイプの白猫（タイプの色の円の中に、縦横比を保って描く）
    var r = Math.round(150 * scale), cy = 290 + r + 14;
    ctx.beginPath();
    ctx.arc(W / 2, cy, r + 14, 0, Math.PI * 2);
    ctx.fillStyle = type.color;
    ctx.globalAlpha = 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(W / 2, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    var size = r * 1.8;
    var k = Math.min(size / catImg.naturalWidth, size / catImg.naturalHeight);
    var iw = catImg.naturalWidth * k, ih = catImg.naturalHeight * k;
    ctx.drawImage(catImg, W / 2 - iw / 2, cy - ih / 2, iw, ih);

    // 3. タイプ名とキャッチコピー（いちばん目立たせる）
    var name = fitPhrase(ctx, type.name, "700", [76, 70, 64, 60], [64, 58, 54], TEXT_W, "のなと");
    ctx.font = "700 " + name.size + "px " + FONT;
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    var y = centerLines(ctx, name.lines, cy + r + 34, name.size * 1.25);
    var catchText = fitPhrase(ctx, type.catch, "700", [40, 36], [38, 34, 32], TEXT_W, "、。");
    ctx.font = "700 " + catchText.size + "px " + FONT;
    ctx.fillStyle = PINK;
    y = centerLines(ctx, catchText.lines, y + 16, catchText.size * 1.45);

    // 4. 取扱説明書（どんな人？・輝くところ・取り扱いのコツ・仲良くなるヒント）
    // 文字は読みやすさを優先して下限を決める（見出し28px・本文30px以上）
    var ls = Math.max(28, Math.round(30 * step.font)), bs = Math.max(30, Math.round(34 * step.font)), gap = Math.round(24 * scale);
    y += Math.round(36 * scale);
    y = label(ctx, "どんな人？", y, type.color, ls) + 12;
    y = body(ctx, type.card.traits, y, bs, "", lines) + gap;
    y = label(ctx, "推し活で輝くところ", y, type.color, ls) + 12;
    type.strengths.slice(0, 2).forEach(function (t) { y = body(ctx, t, y, bs, "・", lines); });
    y += gap;
    y = label(ctx, "取り扱いのコツ", y, type.color, ls) + 12;
    y = body(ctx, type.card.care, y, bs, "", lines) + gap;
    y = label(ctx, "仲良くなるヒント", y, type.color, ls) + 12;
    y = body(ctx, type.card.friend, y, bs, "", lines);
    var sectionsBottom = y;

    // 5. 診断への誘導・ハッシュタグ・サイトのアドレス（カードの下にそろえる）
    ctx.textAlign = "center";
    var boxY = CTA_TOP + 20, boxH = 150;
    var cta = ctx.createLinearGradient(LEFT, 0, LEFT + TEXT_W, 0);
    cta.addColorStop(0, "#ffe3f0");
    cta.addColorStop(1, "#ebe2ff");
    roundRect(ctx, LEFT - 10, boxY, TEXT_W + 20, boxH, 34);
    ctx.fillStyle = cta;
    ctx.fill();
    ctx.font = "700 36px " + FONT;
    ctx.fillStyle = INK;
    ctx.fillText("あなたは何タイプ？", W / 2, boxY + 26);
    ctx.font = "700 38px " + FONT;
    ctx.fillStyle = PINK;
    ctx.fillText("無料の推し活タイプ診断はこちら♡", W / 2, boxY + 82);
    ctx.font = "700 40px " + FONT;
    ctx.fillStyle = LAVENDER;
    ctx.fillText("#推しルナ占い", W / 2, boxY + boxH + 30);
    var site = fitText(ctx, siteText, "400", [32, 28, 24], TEXT_W, 1);
    ctx.font = "400 " + site.size + "px " + FONT;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(site.lines.join(""), W / 2, boxY + boxH + 90);

    return {
      scale: step, sectionsBottom: sectionsBottom, ctaTop: CTA_TOP, siteBottom: boxY + boxH + 90 + site.size,
      cardBottom: CARD.y + CARD.h, nameLines: name.lines, catchLines: catchText.lines, bodyLines: lines,
      minFont: Math.min(bs, ls, site.size, catchText.size)
    };
  }

  // type: data.js の TYPES の1タイプ、siteText: 画像に入れるサイトのアドレス
  // 本文が下の誘導エリアにかからない大きさになるまで、少しずつ小さくして描き直す
  function draw(canvas, type, catImg, siteText) {
    canvas.width = W;
    canvas.height = H;
    // まず白猫と余白を小さくし、それでも入らないときだけ文字を小さくする
    var steps = [
      { cat: 1.1, font: 1.1 }, { cat: 1.0, font: 1.06 }, { cat: 0.9, font: 1.02 },
      { cat: 0.8, font: 0.98 }, { cat: 0.72, font: 0.94 }, { cat: 0.66, font: 0.9 }
    ], layout;
    for (var i = 0; i < steps.length; i++) {
      canvas.getContext("2d").clearRect(0, 0, W, H);
      layout = render(canvas, type, catImg, siteText, steps[i]);
      if (layout.sectionsBottom <= CTA_TOP) break;
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
