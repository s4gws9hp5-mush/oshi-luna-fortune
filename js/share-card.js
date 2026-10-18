/* 推しルナ占い：推し活タイプのシェア画像（1080×1350）をブラウザの中で作る */
(function (root) {
  "use strict";

  var W = 1080, H = 1350;
  var FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "BIZ UDPGothic", "Noto Sans CJK JP", "Yu Gothic", sans-serif';
  var INK = "#5a4a78", INK_SOFT = "#8a7aa6", PINK = "#f07fb2", LAVENDER = "#a68ce8";

  // 改行してよい位置（この文字のあと）と、行の先頭に置かない文字
  var BREAK_AFTER = "のなと、。！？♡ 」”";
  var NO_LINE_START = "ー、。！？」”ぁぃぅぇぉっゃゅょァィゥェォッャュョ";

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
    return lines;
  }

  // 言葉の切れ目（の・な・、など）のうち、2行の長さがいちばんそろう位置で分ける。切れ目がなければ null
  function splitTwo(ctx, text, chars) {
    var best = null;
    for (var i = 2; i < text.length - 1; i++) {
      if (chars.indexOf(text.charAt(i - 1)) < 0 || NO_LINE_START.indexOf(text.charAt(i)) >= 0) continue;
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

  // type: data.js の TYPES の1タイプ、siteText: 画像に入れるサイトのアドレス
  function draw(canvas, type, catImg, siteText) {
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // 背景：ピンク → ラベンダー → 水色
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#ffe3f0");
    bg.addColorStop(0.5, "#efe4ff");
    bg.addColorStop(1, "#dcefff");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    [[90, 80, 18, "#ffffff"], [990, 120, 14, "#f6d36b"], [60, 1250, 14, "#c9b8f0"], [1010, 1270, 18, "#ffffff"], [960, 60, 8, "#ffb3cf"]]
      .forEach(function (s) { sparkle(ctx, s[0], s[1], s[2], s[3]); });

    // 白いカード
    ctx.save();
    ctx.shadowColor = "rgba(166, 140, 232, 0.28)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 12;
    roundRect(ctx, 70, 110, W - 140, H - 220, 60);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fill();
    ctx.restore();

    // サービス名
    ctx.font = "700 46px " + FONT;
    var title = ctx.createLinearGradient(W / 2 - 180, 0, W / 2 + 180, 0);
    title.addColorStop(0, "#f59cc4");
    title.addColorStop(0.55, LAVENDER);
    title.addColorStop(1, "#8cc3ee");
    ctx.fillStyle = title;
    ctx.fillText("推しルナ占い", W / 2, 160);
    ctx.font = "400 28px " + FONT;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText("月と星と白猫の推し活占い", W / 2, 222);

    ctx.font = "400 40px " + FONT;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText("あなたの推し活タイプは", W / 2, 290);

    // タイプの白猫（タイプの色の円の中に、縦横比を保って描く）
    var cy = 545, r = 190;
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
    var size = 340;
    var scale = Math.min(size / catImg.naturalWidth, size / catImg.naturalHeight);
    var iw = catImg.naturalWidth * scale, ih = catImg.naturalHeight * scale;
    ctx.drawImage(catImg, W / 2 - iw / 2, cy - ih / 2, iw, ih);

    // タイプ名（1行に入らない長い名前は、言葉の切れ目で2行に）
    var maxWidth = W - 240;
    var name = fitPhrase(ctx, type.name, "700", [80, 74, 68, 64], [68, 62, 56], maxWidth, "のなと");
    ctx.font = "700 " + name.size + "px " + FONT;
    ctx.fillStyle = INK;
    var y = centerLines(ctx, name.lines, 775, name.size * 1.28);

    // キャッチコピー（句読点のところで2行に）
    var catchText = fitPhrase(ctx, type.catch, "700", [42, 38], [40, 36, 32], maxWidth, "、。");
    ctx.font = "700 " + catchText.size + "px " + FONT;
    ctx.fillStyle = PINK;
    y = centerLines(ctx, catchText.lines, y + 22, catchText.size * 1.5);

    // ハッシュタグとサイトのアドレス（文章のすぐ下。カードの下端より上に収める）
    var tagY = Math.min(Math.max(y + 34, H - 260), H - 210);
    ctx.font = "700 42px " + FONT;
    ctx.fillStyle = LAVENDER;
    ctx.fillText("#推しルナ占い", W / 2, tagY);
    var site = fitText(ctx, siteText, "400", [30, 26, 22], maxWidth, 1);
    ctx.font = "400 " + site.size + "px " + FONT;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(site.lines.join(""), W / 2, tagY + 60);
    canvas.layout = { textBottom: y, tagTop: tagY, siteBottom: tagY + 60 + site.size, cardBottom: H - 110, nameLines: name.lines, catchLines: catchText.lines };
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

  root.OshiLunaShareCard = { create: create, layout: layout, size: { width: W, height: H } };
})(window);
