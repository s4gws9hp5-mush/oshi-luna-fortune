// 画像の保存・シェア（結果画面の「画像を保存・シェアする」）のブラウザテスト（Playwright + Chromium）
//
// 実行（リポジトリのいちばん上で）:
//   node tests/e2e/share.js                       # このリポジトリを 127.0.0.1 の空きポートで配信してテスト
//   node tests/e2e/share.js http://localhost:8000/ # すでに起動しているサーバーを使う（末尾の / まで）
//   node tests/e2e/share.js "" /path/to/out       # ダウンロードした PNG と画面の画像を残す（既定は一時フォルダに作って消す）
// 必要なもの: Node.js 18 以上、playwright パッケージと Chromium（くわしくは tests/e2e/README.md）
//
// - 共有メニュー（navigator.share）は本物を使わず、成功・キャンセル・失敗をテスト用に差し替えて確かめる
// - Google アナリティクス（googletagmanager.com）への通信は空のスクリプトに差し替え、実際には送らない
// - ブラウザは LANG=C.UTF-8 で起動する（下の launch のコメントを参照）
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const { chromium, devices } = require('playwright');
// 既存の10問のあとのサブタイプの4問（Q11〜Q14）も答える
const withAxes = (arr) => arr.length === 10 ? arr.concat([0, 0, 0, 0]) : arr;
// 未診断のときは診断の案内が出るので、「このまま今日の占いを見る」で占いへ
const tapDaily = async (p) => { await p.tap('#daily-btn'); if (await p.isVisible('#invite-popup')) await p.tap('#invite-daily-btn'); };
require(path.join(ROOT, 'js', 'data.js'));
const F = require(path.join(ROOT, 'js', 'fortune.js'));
const D = globalThis.OshiLunaData;
const idOf = (p) => p.evaluate(() => (JSON.parse(localStorage.getItem('oshi-luna-device') || 'null') || {}).id || null);
let BASE = process.argv[2] || '';
// ダウンロードした PNG・画面の画像の置き場所。指定がなければ一時フォルダに作り、終わったら消す（リポジトリには残さない）
const KEEP = !!process.argv[3];
const OUT = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'oshi-luna-share-'));
if (KEEP) fs.mkdirSync(OUT, { recursive: true });
const res = []; const check = (n, ok, x = '') => res.push([ok ? 'PASS' : 'FAIL', n, x]);
const JST = (iso) => new Date(iso + '+09:00');
const typical = (k) => D.QUESTIONS.map((q) => { const i = q.options.findIndex((o) => o.main === k); return i >= 0 ? i : Math.max(0, q.options.findIndex((o) => o.sub === k)); });
const errs = [];
// キャンバスに描いた文字と画像を記録する
const SPY = () => {
  window.__drawn = [];
  const ft = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { window.__drawn.push({ text: String(t), w: this.measureText(t).width, x, y, font: this.font, align: this.textAlign }); return ft.apply(this, arguments); };
  const di = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img) { window.__drawn.push({ img: img.getAttribute ? img.getAttribute('src') : '' }); return di.apply(this, arguments); };
};
// ダウンロードした PNG を検証：署名・各チャンクの CRC・IHDR・IDAT を展開した大きさ（幅×高さ分の行データ）・IEND まで
const zlib = require('zlib');
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return (buf) => { let c = 0xffffffff; for (const x of buf) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
const pngCheck = (buf) => {
  if (!buf || buf.length < 33 || buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return { ok: false, why: 'signature' };
  let o = 8, ihdr = null, idat = [], end = false;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.slice(o + 4, o + 8).toString('latin1'), data = buf.slice(o + 8, o + 8 + len);
    if (CRC(buf.slice(o + 4, o + 8 + len)) !== buf.readUInt32BE(o + 8 + len)) return { ok: false, why: 'crc ' + type };
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    if (type === 'IDAT') idat.push(data);
    o += 12 + len; if (type === 'IEND') { end = true; break; }
  }
  if (!ihdr || !end || !idat.length) return { ok: false, why: 'chunks' };
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.color];
  let raw; try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return { ok: false, why: 'inflate' }; }
  const expect = ihdr.interlace ? null : ihdr.h * (1 + Math.ceil(ihdr.w * ch * ihdr.depth / 8));
  return { ok: expect === null || raw.length === expect, w: ihdr.w, h: ihdr.h, bytes: buf.length, why: 'idat ' + raw.length + '/' + expect };
};
const savedPng = async (download, label) => {
  if (!download) return { ok: false, why: 'no download' };
  const fp = OUT + '/dl-' + label + '.png'; await download.saveAs(fp);
  return pngCheck(fs.readFileSync(fp));
};
// リポジトリをそのまま配信する小さなサーバー（python3 -m http.server と同じく、ファイルを返すだけ）
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };
const serve = () => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, path.normalize(p));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  server.listen(0, '127.0.0.1', () => resolve(server));
});
(async () => {
  // テストのブラウザは UTF-8 のロケールで起動する。
  // Linux の Chromium は、ダウンロードのファイル名をロケールの文字コードに変換する。この環境は LANG が未設定（C/POSIX）のため、
  // 日本語の download 属性が変換できず「download」に置き換わっていた（アプリの外で、ASCII 名は通り日本語名だけ失敗・LANG=C.UTF-8 で通ることを確認済み）。
  const b = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8' } });
  { // Google アナリティクスへの通信は空のスクリプトに差し替える（実際の Google には送らない）
    const nc = b.newContext.bind(b);
    b.newContext = async (...o) => { const c = await nc(...o); await c.route(/^https:\/\/www\.googletagmanager\.com\//, (r) => r.fulfill({ contentType: 'application/javascript', body: '' })); return c; };
  }
  const server = BASE ? null : await serve();
  if (server) BASE = 'http://127.0.0.1:' + server.address().port + '/';
  const open = async ({ time, init, url = BASE, device = 'iPhone 13' } = {}) => {
    const ctx = await b.newContext({ ...devices[device], timezoneId: 'Asia/Tokyo', acceptDownloads: true });
    if (time) await ctx.clock.install({ time });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    p.on('response', r => r.status() >= 400 && errs.push(r.status() + ' ' + r.url()));
    await p.addInitScript(SPY); if (init) await p.addInitScript(init);
    await p.goto(url); return p;
  };
  const setType = (p, k) => p.evaluate((k) => localStorage.setItem('oshi-luna-type', JSON.stringify({ version: 2, type: k, sub: null, answers: [], date: '2026-10-18' })), k);
  const answer = async (p, arr) => { for (const i of withAxes(arr)) { await p.locator('#screen-quiz.is-active .option').nth(i).tap(); await p.waitForTimeout(260); } };
  const waitPreview = (p) => p.waitForFunction(() => { const i = document.getElementById('share-preview'); return i.src.startsWith('blob:') && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });

  // 1) 8タイプのシェア画像：名前・キャッチコピー・イラスト・タグ・URL、はみ出しなし
  {
    const p = await open({ device: 'iPhone SE' });
    const contents = new Set();
    for (const k of D.TYPE_ORDER) {
      const t = D.TYPES[k];
      await setType(p, k); await p.reload();
      await p.evaluate(() => { window.__drawn = []; });
      await p.tap('#mytype-btn'); await p.tap('#share-btn'); await waitPreview(p);
      const d = await p.evaluate(() => window.__drawn);
      const texts = d.filter(x => x.text).map(x => x.text);
      const imgs = d.filter(x => x.img !== undefined).map(x => x.img);
      const nameLines = texts.filter(x => t.name.includes(x) && x.length > 1 && x !== '推しルナ占い');
      const lay = await p.evaluate((k) => window.OshiLunaShareCard.layout(window.OshiLunaData.TYPES[k]), k);
      const inside = d.filter(x => x.text).every(x => x.align === 'left' ? (x.x >= 70 && x.x + x.w <= 1010) : (x.x - x.w / 2 >= 70 && x.x + x.w / 2 <= 1010));
      const size = await p.evaluate(() => [document.getElementById('share-preview').naturalWidth, document.getElementById('share-preview').naturalHeight]);
      check('シェア画像 ' + k + '：サービス名・見出し・タグ・URL・診断への誘導', texts.includes('推しルナ占い') && texts.includes('あなたの推し活タイプは') && texts.includes('#推しルナ占い') &&
        texts.includes('あなたは何タイプ？') && texts.includes('無料の推し活タイプ診断') && !texts.some(x => x.includes('はこちら')));
      // 画像のアドレスは、テストで開いているアドレス（プレビューやローカル）ではなく、いつも本番のアドレス
      // 文字の大きさを合わせるために、消して描き直すことがあるので、同じ文字は1つにまとめて数える
      const urlTexts = [...new Set(texts)].filter(x => /https?:|\.com|\.dev|\.io|localhost|127\.0\.0\.1/.test(x));
      check('シェア画像 ' + k + '：本番のアドレス https://oshi-luna.com/ だけを入れる（開いているアドレスは入れない）',
        urlTexts.length === 1 && urlTexts[0] === 'https://oshi-luna.com/' && !texts.some(x => x.includes(new URL(BASE).host)), JSON.stringify(urlTexts));
      const at = (t) => d.find(x => x.text === t);
      const cta = at('無料の推し活タイプ診断'), url = at('https://oshi-luna.com/'), tag = at('#推しルナ占い');
      const px = (x) => parseInt(/(\d+)px/.exec(x.font)[1], 10);
      check('シェア画像 ' + k + '：診断の誘導の直下にアドレス、その下にタグ（重ならない・枠の中・読める大きさ）',
        cta && url && tag && cta.y + px(cta) <= lay.urlPill.y && url.y >= lay.urlPill.y && url.y + px(url) <= lay.urlPill.y + lay.urlPill.h &&
        lay.urlPill.y + lay.urlPill.h <= lay.ctaBoxBottom && lay.urlPill.x >= 96 + 90 && lay.urlPill.x + lay.urlPill.w <= 1080 - 96 - 90 &&
        tag.y >= lay.ctaBoxBottom && tag.y + px(tag) <= lay.cardBottom && px(url) >= 32,
        JSON.stringify({ cta: cta && [cta.y, px(cta)], pill: lay.urlPill, url: url && [url.y, px(url)], box: lay.ctaBoxBottom, tag: tag && tag.y, card: lay.cardBottom }));
      const bodyText = lay.bodyLines.map(l => l.text).join('').replace(/・/g, '');
      const labels = ['どんな人？', '推し活で輝くところ', '取り扱いのコツ', '仲良くなるヒント'];
      check('シェア画像 ' + k + '：取扱説明書（性格・輝くところ・取り扱いのコツ・仲良くなるヒント）', labels.every(l => texts.includes(l)) &&
        [t.card.traits, t.strengths[0], t.strengths[1], t.card.care, t.card.friend].every(x => bodyText.includes(x)), bodyText.slice(0, 40) + '…');
      contents.add(bodyText);
      check('シェア画像 ' + k + '：文字の大きさ（最小' + lay.minFont + 'px）', lay.minFont >= 28);
      check('シェア画像 ' + k + '：タイプ名・キャッチコピー', lay.nameLines.join('') === t.name && lay.catchLines.join('') === t.catch && lay.nameLines.length <= 2, lay.nameLines.join(' / ') + ' ｜ ' + lay.catchLines.join(' / '));
      check('シェア画像 ' + k + '：専用イラスト（描き直しても同じ絵）', imgs.length >= 1 && imgs.every(x => x === t.image), imgs[0]);
      check('シェア画像 ' + k + '：文字がはみ出さない・重ならない', inside && lay.sectionsBottom <= lay.ctaTop && lay.siteBottom <= lay.cardBottom && size.join('x') === '1080x1920',
        JSON.stringify({ step: lay.scale, sec: Math.round(lay.sectionsBottom), cta: lay.ctaTop, site: lay.siteBottom, card: lay.cardBottom }));
      check('シェア画像 ' + k + '：ボタンは「画像を保存・シェアする」とコピーの2つだけ', await p.isVisible('#share-save-btn') && await p.isVisible('#share-copy-btn') &&
        (await p.locator('#share-panel button:visible, #share-panel a:visible').count()) === 2 && (await p.textContent('#share-save-btn')) === '📥 画像を保存・シェアする' &&
        (await p.locator('#share-image-btn, #share-save-link').count()) === 0);
      check('シェア画像 ' + k + '：白猫を大きく（半径170px以上）・文字30px以上', lay.catRadius >= 150 && lay.minFont >= 30, 'R=' + lay.catRadius + ' min=' + lay.minFont);
      check('シェア画像 ' + k + '：SE 横スクロールなし', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    check('8タイプで説明がすべて違う', contents.size === 8);
    // 画像を共有できない環境（このブラウザ）
    const steps = await p.locator('#share-steps li').allTextContents();
    check('iPhone・画像共有に非対応 → 長押しで「写真」に追加する手順・ボタンはダウンロード（「ファイル」アプリ）', steps[0].includes('長押し') && steps[1].includes('“写真”に追加') &&
      (await p.textContent('#share-guide-note')).includes('「ファイル」アプリ') && !(await p.textContent('#share-hint')), steps.join(' / '));
    check('プレビュー画像の大きさの指定（1080×1920）', (await p.getAttribute('#share-preview', 'width')) === '1080' && (await p.getAttribute('#share-preview', 'height')) === '1920');
    // 共有できない環境：ボタンでダウンロード。完了とは言わない
    const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await p.tap('#share-save-btn'); const download = await dl;
    let dlBytes = null; if (download) { const fp = await download.path(); dlBytes = require('fs').readFileSync(fp); }
    check('「画像を保存・シェアする」（共有できない）→ 生成した PNG（1080×1920）をダウンロード・日本語のファイル名', !!dlBytes && download.suggestedFilename() === '推しルナ占い_情報キャッチの星読みリサーチャー.png' &&
      dlBytes.slice(1, 4).toString() === 'PNG' && dlBytes.readUInt32BE(16) === 1080 && dlBytes.readUInt32BE(20) === 1920, download && download.suggestedFilename());
    { const v = await savedPng(download, 'ios-nosupport'); check('↑ 保存したファイルが空でなく、PNG として最後まで読める（1080×1920・' + v.bytes + 'バイト）', v.ok && v.w === 1080 && v.h === 1920 && v.bytes > 10000, JSON.stringify(v)); }
    const dlStatus = await p.textContent('#share-status');
    check('ダウンロード（iPhone）→ 保存先は「ファイル」・写真は長押しと案内、成功と断定しない', dlStatus.includes('「ファイル」アプリ') && dlStatus.includes('長押し') && !/保存しました|保存できました|保存できたよ/.test(dlStatus), dlStatus);
    // コピー：成功と失敗。コピーした文章は、文章・タグはそのままで、アドレスは開いているアドレスではなく本番の https://oshi-luna.com/
    await p.evaluate(() => { window.__copied = []; window.__clip = navigator.clipboard; const orig = navigator.clipboard && navigator.clipboard.writeText && navigator.clipboard.writeText.bind(navigator.clipboard);
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied.push(t); return orig ? orig(t).catch(() => {}) : Promise.resolve(); } } }); });
    await p.tap('#share-copy-btn'); await p.waitForTimeout(200);
    check('コピー成功 → コピーした案内', (await p.textContent('#share-status')).includes('コピーしたよ'));
    {
      const t = D.TYPES.research, copied = await p.evaluate(() => window.__copied);
      const head = '【推しルナ占い】私の推し活タイプは\n' + t.emoji + '「' + t.name + '」\n' + t.catch + '\n';
      const ok = copied.length === 1 && copied[0].startsWith(head) && /^(サブタイプコード：[A-Z]{4}\n)?#推しルナ占い\nhttps:\/\/oshi-luna\.com\/$/.test(copied[0].slice(head.length)) &&
        !copied[0].includes(new URL(BASE).host) && (copied[0].match(/https?:\/\//g) || []).length === 1;
      check('コピーした文章：タイプ名・キャッチコピー・#推しルナ占い はそのまま、アドレスは本番の https://oshi-luna.com/ だけ（開いているアドレスは入れない）', ok, JSON.stringify(copied));
    }
    await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: window.__clip }); }); // 記録用の差し替えを元に戻す
    await p.evaluate(() => { document.execCommand = () => false; });
    await p.tap('#share-copy-btn'); await p.waitForTimeout(200);
    check('コピー失敗 → 失敗の案内（成功と表示しない）', (await p.textContent('#share-status')).includes('コピーできませんでした'));
    await p.screenshot({ path: OUT + '/share-panel-se.png', fullPage: true });
    await p.context().close();
  }

  // 2) 画像共有に対応した環境：「画像を保存・シェアする」の成功・キャンセル・失敗の案内
  const MOCK = (mode) => new Function(`window.__shared = []; navigator.canShare = (d) => !!(d && d.files && d.files.length); navigator.share = (d) => { window.__shared.push(d);
    return '${mode}' === 'ok' ? Promise.resolve() : '${mode}' === 'slow' ? new Promise((r) => setTimeout(r, 400)) :
      Promise.reject(Object.assign(new Error('x'), { name: { abort: 'AbortError', notallowed: 'NotAllowedError', fail: 'DataError' }['${mode}'] })); };`);
  const BAD = /保存しました|保存できました|保存できたよ|シェアできたよ|必ず/;
  for (const [mode, exp] of [['ok', '「画像を保存」を選んだときは、写真アプリに入っているか確認'], ['abort', 'キャンセルしました。もう一度押すと、メニューが開きます'],
    ['notallowed', '共有メニューを開けませんでした'], ['fail', '共有メニューを開けませんでした']]) {
    const p = await open({ init: MOCK(mode) });
    await setType(p, 'cheer'); await p.reload(); await p.tap('#mytype-btn'); await p.tap('#share-btn');
    await p.waitForSelector('#share-save-btn:not([hidden])', { timeout: 8000 }); await waitPreview(p);
    if (mode === 'ok') {
      const steps = await p.locator('#share-steps li').allTextContents();
      check('iPhone・画像共有に対応 → 「画像を保存」を選ぶ手順（直接保存は約束しない）', steps[0].includes('画像を保存・シェアする') && steps[1].includes('「画像を保存」') &&
        (await p.textContent('#share-guide-note')).includes('写真へのアクセス'), steps.join(' / '));
    }
    const dl = p.waitForEvent('download', { timeout: 1500 }).catch(() => null);
    await p.tap('#share-save-btn'); await p.waitForTimeout(250);
    const st = await p.textContent('#share-status');
    const sh = await p.evaluate(() => window.__shared.map(d => ({ files: d.files.map(f => f.name + ' ' + f.type + ' ' + f.size), text: d.text, title: d.title, keys: Object.keys(d) })));
    check('保存・シェア（' + mode + '）→ 共有メニューに渡すのは画像ファイルだけ（アドレスや文章は渡さない＝開いているアドレスは入らない）',
      sh.length === 1 && sh[0].keys.join() === 'files', JSON.stringify(sh.map(x => x.keys)));
    check('保存・シェア（' + mode + '）→ 生成した画像ファイルを共有メニューへ・結果どおりの案内（成功と言わない）', sh.length === 1 && sh[0].files.length === 1 &&
      sh[0].files[0].startsWith('推しルナ占い_ときめき全力応援隊長.png image/png') && !(await dl) && st.includes(exp) && !BAD.test(st), st + ' ' + (sh[0] && sh[0].files[0]));
    if (mode === 'abort') {
      await p.tap('#share-save-btn'); await p.waitForTimeout(250);
      check('キャンセルのあとは、また共有メニューが開く', (await p.evaluate(() => window.__shared.length)) === 2);
    }
    if (mode === 'fail' || mode === 'notallowed') {
      const steps = await p.locator('#share-steps li').allTextContents();
      const dl2 = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
      await p.tap('#share-save-btn'); const d2 = await dl2;
      check('共有メニューが失敗（' + mode + '）→ 次はダウンロードに切り替え・手順も長押しに', !!d2 && d2.suggestedFilename() === '推しルナ占い_ときめき全力応援隊長.png' &&
        (await p.evaluate(() => window.__shared.length)) === 1 && steps[0].includes('長押し'), (d2 ? d2.suggestedFilename() : 'no download') + ' / ' + steps[0]);
      { const v = await savedPng(d2, 'ios-' + mode); check('↑ 保存したファイルが空でなく、PNG として最後まで読める（' + mode + '・' + v.bytes + 'バイト）', v.ok && v.w === 1080 && v.h === 1920 && v.bytes > 10000, JSON.stringify(v)); }
    }
    await p.context().close();
  }
  // 共有メニューを開いている間に連打しても、二重に開かない
  {
    const p = await open({ init: MOCK('slow') });
    await setType(p, 'talk'); await p.reload(); await p.tap('#mytype-btn'); await p.tap('#share-btn');
    await p.waitForSelector('#share-save-btn:not([hidden])', { timeout: 8000 }); await waitPreview(p);
    await p.tap('#share-save-btn'); await p.tap('#share-save-btn'); await p.tap('#share-save-btn'); await p.waitForTimeout(600);
    const n1 = await p.evaluate(() => window.__shared.length);
    await p.tap('#share-save-btn'); await p.waitForTimeout(600);
    check('連打しても共有メニューは1回だけ・閉じたあとはまた開ける', n1 === 1 && (await p.evaluate(() => window.__shared.length)) === 2, String(n1));
    await p.context().close();
  }
  // Android（共有できる）
  {
    const p = await open({ device: 'Pixel 7', init: MOCK('ok') });
    await setType(p, 'memory'); await p.reload(); await p.tap('#mytype-btn'); await p.tap('#share-btn');
    await p.waitForSelector('#share-save-btn:not([hidden])', { timeout: 8000 }); await waitPreview(p);
    const steps = await p.locator('#share-steps li').allTextContents();
    check('Android・共有できる → 共有メニューで送り先・保存先を選ぶ手順', steps[1].includes('送り先のアプリや保存先のアプリ') && steps[2].includes('長押し'), steps.join(' / '));
    await p.tap('#share-save-btn'); await p.waitForTimeout(250);
    const st = await p.textContent('#share-status');
    check('Android・共有メニュー完了 → 写真アプリと言わず、保存先で確認する案内', st.includes('選んだアプリや保存先') && !st.includes('写真アプリ') && !BAD.test(st), st);
    await p.context().close();
  }
  // Android（共有できない）：ボタンでダウンロード
  {
    const p = await open({ device: 'Pixel 7' });
    await setType(p, 'create'); await p.reload(); await p.tap('#mytype-btn'); await p.tap('#share-btn'); await waitPreview(p);
    const steps = await p.locator('#share-steps li').allTextContents();
    check('Android・共有できない → ダウンロードと長押しの手順', steps[0].includes('ダウンロード') && steps[1].includes('Download') && steps[2].includes('長押し'), steps.join(' / '));
    const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await p.tap('#share-save-btn'); const download = await dl;
    const st = await p.textContent('#share-status');
    check('Android・ダウンロード → ファイル名・ダウンロード一覧で確認の案内', !!download && download.suggestedFilename() === '推しルナ占い_ときめき探究クリエイター.png' && st.includes('ダウンロード一覧') && !BAD.test(st), (download ? download.suggestedFilename() : 'no download') + ' / ' + st);
    { const v = await savedPng(download, 'android'); check('↑ 保存したファイルが空でなく、PNG として最後まで読める（Android・' + v.bytes + 'バイト）', v.ok && v.w === 1080 && v.h === 1920 && v.bytes > 10000, JSON.stringify(v)); }
    await p.context().close();
  }
  // iPhone の LINE などのアプリ内ブラウザ：Safari で開く案内
  {
    const ua = devices['iPhone 13'].userAgent + ' Line/14.0.0';
    const ctx = await b.newContext({ ...devices['iPhone 13'], userAgent: ua });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE); await setType(p, 'heal'); await p.reload(); await p.tap('#mytype-btn'); await p.tap('#share-btn'); await waitPreview(p);
    check('アプリ内ブラウザ → Safari で開く案内', (await p.textContent('#share-guide-note')).includes('Safari で開く'));
    await ctx.close();
  }

  // 3) タイプ保存の確認文・完了メッセージ・翌日の占いへの反映
  {
    const p = await open({ time: JST('2026-10-18T09:00:00') });
    await setType(p, 'cheer'); await p.reload();
    await tapDaily(p); await p.clock.runFor(1200);
    const d18 = F.getDailyFortune(JST('2026-10-18T09:00:00'), 'cheer', await idOf(p));
    check('保存済みタイプ（応援隊長）で今日の占い', (await p.textContent('#daily-message')) === d18.message && (await p.textContent('#daily-omamori-type')).includes(d18.typeOmamori));
    await p.tap('#daily-mytype-btn'); await p.tap('#retry-btn'); await answer(p, typical('heal')); await p.clock.runFor(1500);
    const confirmText = await p.textContent('#type-confirm-text');
    check('確認文：新しい説明文', confirmText.includes('このタイプを保存すると、明日からの推し活占いにあなたのタイプが反映されます。毎日の運勢やラッキーアクションを、あなたの推し活スタイルに合わせてお届けします♡'));
    check('確認ボタン2つ', (await p.textContent('#type-save-btn')) === 'この新しいタイプを保存する' && (await p.textContent('#type-keep-btn')) === '前のタイプのままにする');
    await p.tap('#type-save-btn');
    check('保存完了メッセージ', (await p.textContent('#type-status-text')) === '保存できたよ♡ 明日からの推し活占いに、このタイプが反映されるよ🌙' && JSON.parse(await p.evaluate(() => localStorage.getItem('oshi-luna-type'))).type === 'heal');
    // 同じ日はそのまま、翌日に反映
    await p.tap('#to-daily-btn'); await p.clock.runFor(1200);
    check('保存した日：今日の占いは最初に見た内容のまま', (await p.textContent('#daily-message')) === d18.message && await p.isVisible('#daily-locked'));
    await p.clock.setSystemTime(JST('2026-10-19T08:00:00')); await p.reload();
    await tapDaily(p); await p.clock.runFor(1200);
    const d19 = F.getDailyFortune(JST('2026-10-19T08:00:00'), 'heal', await idOf(p));
    const shown = { msg: await p.textContent('#daily-message'), actions: await p.locator('#daily-actions li').allTextContents(), chip: await p.textContent('#daily-type-chip'), om: await p.textContent('#daily-omamori-type') };
    check('翌日：保存したタイプ（癒やし系）が占いに反映', shown.msg === d19.message && D.TYPES.heal.daily.messages.includes(shown.msg) && JSON.stringify(shown.actions) === JSON.stringify(d19.actions) &&
      shown.actions.every(a => D.TYPES.heal.daily.actions.includes(a)) && shown.chip.includes(D.TYPES.heal.name) && shown.om.includes(d19.typeOmamori), shown.msg);
    check('翌日：運勢はタイプに関係なく同じ（公平）', (await p.textContent('#daily-luck-text')) === F.getDailyFortune(JST('2026-10-19T08:00:00'), null, await idOf(p)).luck.text);
    // 日付が変わっても診断結果は変わらない
    await p.tap('#daily-mytype-btn');
    check('日付が変わっても保存したタイプのまま', (await p.textContent('#type-name')) === D.TYPES.heal.name);
    // 「前のタイプのまま」→ 保存は変わらず、翌々日も前のタイプ
    await p.tap('#retry-btn'); await answer(p, typical('solo')); await p.clock.runFor(1500);
    await p.tap('#type-keep-btn');
    check('「前のタイプのまま」→ 保存済みタイプは変わらない', JSON.parse(await p.evaluate(() => localStorage.getItem('oshi-luna-type'))).type === 'heal');
    await p.clock.setSystemTime(JST('2026-10-20T08:00:00')); await p.reload();
    await tapDaily(p); await p.clock.runFor(1200);
    check('翌々日も前のタイプ（癒やし系）の占い', (await p.textContent('#daily-message')) === F.getDailyFortune(JST('2026-10-20T08:00:00'), 'heal', await idOf(p)).message);
    await p.context().close();
  }

  // 4) 保存済みタイプがない → 一般向けの占い
  {
    const p = await open({ time: JST('2026-10-19T08:00:00') });
    await tapDaily(p); await p.clock.runFor(1200);
    const g = F.getDailyFortune(JST('2026-10-19T08:00:00'), null, await idOf(p));
    check('未診断：一般向けの占い', (await p.textContent('#daily-message')) === g.message && D.DAILY.messages.includes(g.message) &&
      !(await p.isVisible('#daily-type-chip')) && !(await p.isVisible('#daily-omamori-type')) && await p.isVisible('#daily-invite'));
    await p.context().close();
  }

  // 5) 保存に失敗したときは「保存できた」と言わない
  {
    const p = await open({ init: () => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'oshi-luna-type') throw new Error('QuotaExceeded'); return set.call(this, k, v); }; } });
    await p.tap('#start-btn'); await answer(p, typical('talk')); await p.waitForSelector('#screen-result.is-active', { timeout: 5000 });
    check('保存できないとき → 失敗の案内', (await p.textContent('#type-status-text')).includes('保存できませんでした'));
    await p.context().close();
  }

  // 6) 日付のお試し表示（?preview-date=）：翌日の占いを確認できる・保存しない
  {
    const p = await open({ time: JST('2026-10-18T09:00:00') });
    await setType(p, 'watch');
    await tapDaily(p); await p.clock.runFor(1200);
    await p.goto(BASE + '?preview-date=2026-10-19'); await tapDaily(p); await p.clock.runFor(1200);
    const exp = F.getDailyFortune(JST('2026-10-19T12:00:00'), 'watch', await idOf(p));
    check('お試し表示：翌日の占い（保存したタイプが反映）', (await p.textContent('#daily-date')).includes('10月19日') && (await p.textContent('#daily-message')) === exp.message &&
      (await p.textContent('#daily-preview')).includes('お試し表示') && !(await p.isVisible('#daily-past')));
    const h = JSON.parse(await p.evaluate(() => localStorage.getItem('oshi-luna-daily'))).history.map(x => x.date);
    check('お試し表示は保存しない', h.join() === '2026-10-18', h.join());
    await p.goto(BASE + '?preview-date=nope'); await tapDaily(p); await p.clock.runFor(1200);
    check('おかしな日付の指定は無視して今日の占い', (await p.textContent('#daily-date')).includes('10月18日') && !(await p.isVisible('#daily-preview')));
    await p.context().close();
  }

  // 7) 今日の占いの「シェアする」：送るアドレスはいつも本番の https://oshi-luna.com/。文章は変えない
  //    開いているアドレス（?preview-date= や # のつく、プレビュー・ローカルのアドレス）は入れない
  {
    const RECORD = () => { window.__shared = []; window.__copied = [];
      navigator.share = (d) => { window.__shared.push(d); return Promise.resolve(); }; };
    const NOSHARE = () => { window.__copied = []; navigator.share = undefined;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } } }); };
    const dailyText = (date, d) => { const [, m, dd] = date.split('-').map(Number);
      return '【推しルナ占い】' + m + '月' + dd + '日の推し活占い\n今日の運勢：' + '★'.repeat(d.luck.stars) + '（' + d.luck.title + '）\nラッキーカラー：' + d.lucky.color + '\n💌 ' + d.message; };
    const host = new URL(BASE).host;
    for (const [label, init] of [['共有メニュー', RECORD], ['共有メニューがない→コピー', NOSHARE]]) {
      const p = await open({ time: JST('2026-10-18T09:00:00'), init, url: BASE + '?preview-date=2026-10-19#x' });
      await setType(p, 'watch');
      await tapDaily(p); await p.clock.runFor(1200);
      const exp = dailyText('2026-10-19', F.getDailyFortune(JST('2026-10-19T12:00:00'), 'watch', await idOf(p)));
      await p.tap('#daily-share-btn'); await p.clock.runFor(300);
      const r = await p.evaluate(() => ({ shared: (window.__shared || []).map(d => ({ title: d.title, text: d.text, url: d.url })), copied: window.__copied }));
      const all = JSON.stringify(r);
      if (label === '共有メニュー') {
        check('今日の占いをシェア（' + label + '）→ アドレスは本番の https://oshi-luna.com/・タイトルと占いの文章はそのまま',
          r.shared.length === 1 && r.shared[0].url === 'https://oshi-luna.com/' && r.shared[0].title === '推しルナ占い' && r.shared[0].text === exp, all);
      } else {
        check('今日の占いをシェア（' + label + '）→ 占いの文章のあとに本番の https://oshi-luna.com/ だけ',
          r.copied.length === 1 && r.copied[0] === exp + '\nhttps://oshi-luna.com/' && (await p.textContent('#daily-toast')).includes('コピーしました'), all);
      }
      check('今日の占いをシェア（' + label + '）→ 開いているアドレス（' + host + '・?preview-date=）は入らない', !all.includes(host) && !all.includes('preview-date') && !all.includes('#x'), all);
      await p.context().close();
    }
  }

  await b.close();
  check('エラーなし', errs.length === 0, errs.slice(0, 5).join(' | '));
  for (const r of res) console.log(r[0], r[1], r[2] ? '｜' + r[2] : '');
  const fails = res.filter(r => r[0] === 'FAIL').length;
  console.log(fails + ' FAIL / ' + res.length);
  if (server) server.close();
  if (!KEEP) fs.rmSync(OUT, { recursive: true, force: true });
  process.exitCode = fails ? 1 : 0;
})().catch((e) => {
  // 途中で止まったとき（サーバーにつながらない など）：ブラウザが残って終わらなくならないよう、すぐ終了する
  console.error(e);
  if (!KEEP) fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(1);
});
