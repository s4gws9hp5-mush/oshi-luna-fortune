// 全8タイプの確認用の回答（tests/type-answers.js）で、実際の画面から診断して目的のタイプになるかのブラウザテスト
//
// 実行（リポジトリのいちばん上で）:
//   node tests/e2e/types.js                        # このリポジトリを 127.0.0.1 の空きポートで配信してテスト
//   node tests/e2e/types.js http://localhost:8000/  # すでに起動しているサーバーを使う（末尾の / まで）
// 必要なもの: Node.js 18 以上、playwright パッケージと Chromium（くわしくは tests/e2e/README.md）
//
// - トップの「🎀 推し活タイプ診断をはじめる」から14問に答え、結果画面のタイプ名・絵文字・サブタイプコードと、保存したタイプを見る
// - 各質問で、画面の質問の番号・文・選択肢の並び（上から data.js の順、印は 🌙=① ✨=② 🌠=③ 🐾=④）が同じことを確かめてから、番号の選択肢を押す
// - タイプ名・キャッチコピー・お守りの言葉・質問が、言葉のまとまり（data.js の phrases）の境目でだけ改行し、横にはみ出さないこと
//   （320・375・390px、全8タイプ）。iPhone の Safari は word-break: auto-phrase に対応していないので、
//   Chromium でも auto-phrase を止めた状態（word-break: normal）で確かめる。WebKit（Safari）そのものでは確かめていない
// - Google アナリティクス（googletagmanager.com）への通信は空のスクリプトに差し替え、実際には送らない
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const { chromium, devices } = require('playwright');
require(path.join(ROOT, 'js', 'data.js'));
const D = globalThis.OshiLunaData;
const { ANSWERS } = require(path.join(ROOT, 'tests', 'type-answers.js'));
const ALL = D.QUESTIONS.concat(D.AXIS_QUESTIONS);
let BASE = process.argv[2] || '';
const res = []; const check = (n, ok, x = '') => res.push([ok ? 'PASS' : 'FAIL', n, x]);
const errs = [];

// リポジトリをそのまま配信する小さなサーバー（share.js と同じ）
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
  const b = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8' } });
  const server = BASE ? null : await serve();
  if (server) BASE = 'http://127.0.0.1:' + server.address().port + '/';
  for (const k of D.TYPE_ORDER) {
    const t = D.TYPES[k], q = ANSWERS[k].q;
    const ctx = await b.newContext({ ...devices['iPhone 13'], timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
    await ctx.route(/^https:\/\/www\.googletagmanager\.com\//, (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    p.on('response', r => r.status() >= 400 && errs.push(r.status() + ' ' + r.url()));
    await p.goto(BASE);
    await p.tap('#start-btn');
    let sameScreen = true; const shown = [];
    for (let i = 0; i < q.length; i++) {
      await p.waitForFunction((n) => document.querySelector('#screen-quiz.is-active') && document.getElementById('q-count').textContent === 'Q' + n + ' / 14', i + 1, { timeout: 5000 });
      const s = await p.evaluate(() => ({ text: document.getElementById('q-text').textContent, labels: [...document.querySelectorAll('#options .option')].map(o => o.lastChild.textContent), marks: [...document.querySelectorAll('#options .option-mark')].map(m => m.textContent) }));
      if (s.text !== ALL[i].text || JSON.stringify(s.labels) !== JSON.stringify(ALL[i].options.map(o => o.label)) || s.marks.join('') !== '🌙✨🌠🐾') sameScreen = false;
      shown.push(q[i] + ':' + s.labels[q[i] - 1].slice(0, 8));
      await p.locator('#screen-quiz.is-active .option').nth(q[i] - 1).tap();
    }
    await p.waitForSelector('#screen-result.is-active', { timeout: 8000 });
    const r = await p.evaluate(() => ({ name: document.getElementById('type-name').textContent, emoji: document.getElementById('type-emoji').textContent,
      code: document.getElementById('subtype-code').textContent, saved: JSON.parse(localStorage.getItem('oshi-luna-type') || 'null') }));
    check(t.name + '：画面の14問（番号・文・選択肢の並び）がデータと同じ', sameScreen, shown.join(' '));
    check(t.name + '：確認用の回答で、結果画面がこのタイプ', r.name === t.name && r.emoji === t.emoji, r.emoji + ' ' + r.name);
    check(t.name + '：保存したタイプとサブタイプコード', !!r.saved && r.saved.type === k && r.code === ANSWERS[k].code && r.saved.subtype.code === ANSWERS[k].code &&
      JSON.stringify(r.saved.answers) === JSON.stringify(q.slice(0, 10).map(n => n - 1)), (r.saved && r.saved.type) + ' ' + r.code);
    await ctx.close();
  }
  // 改行の位置：auto-phrase を止めた状態（Safari と同じ）で、まとまりの境目以外で改行していないか・はみ出していないか
  const MEASURE = (sel) => [...document.querySelectorAll(sel)].filter(e => e.offsetParent).map(el => {
    const chars = [], bounds = new Set([0]); let pos = 0; const long = [];
    const walk = (node, inP) => { for (const ch of node.childNodes) {
      if (ch.nodeType === 3) { for (let i = 0; i < ch.data.length; i++) { const r = document.createRange(); r.setStart(ch, i); r.setEnd(ch, i + 1); const rc = r.getClientRects()[0]; chars.push(rc ? rc.top : null); pos++; if (!inP) bounds.add(pos); } }
      else if (ch.nodeType === 1) { const isP = ch.classList.contains('phrase'); if (isP) { bounds.add(pos); if (ch.getClientRects().length > 1) long.push(ch.textContent); } walk(ch, inP || isP); if (isP) bounds.add(pos); }
    } };
    walk(el, false);
    let top = null, bad = 0, lines = 1;
    chars.forEach((t, i) => { if (t === null) return; if (top !== null && t > top + 4) { lines++; if (!bounds.has(i)) bad++; } top = t; });
    return { id: (el.id + ' ' + el.className).trim(), text: el.textContent, phrased: el.classList.contains('phrased'), bad, lines, long: long.length, overflow: el.scrollWidth > el.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth };
  });
  const M = (sel) => '(' + MEASURE + ')(' + JSON.stringify(sel) + ')';
  const NORMAL = '*{word-break:normal !important}';
  for (const w of [320, 375, 390]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block', timezoneId: 'Asia/Tokyo' });
    await ctx.route(/^https:\/\/www\.googletagmanager\.com\//, (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await ctx.clock.install({ time: new Date('2026-11-09T09:00:00+09:00') });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE); const got = [];
    for (const k of D.TYPE_ORDER) {
      await p.evaluate((k) => { localStorage.removeItem('oshi-luna-daily'); localStorage.setItem('oshi-luna-type', JSON.stringify({ version: 2, type: k, sub: null, answers: [], date: '2026-11-09' })); }, k);
      await p.reload(); await p.addStyleTag({ content: NORMAL });
      got.push(...await p.evaluate(M('#top-type-name, #top-type-catch')));
      await p.tap('#mytype-btn'); await p.clock.runFor(700);
      got.push(...await p.evaluate(M('#type-name, #type-catch, #type-charm')));
      await p.goto(BASE); await p.addStyleTag({ content: NORMAL }); await p.tap('#daily-btn'); await p.clock.runFor(1600);
      got.push(...await p.evaluate(M('#daily-type-chip, #daily-actions-note, #daily-omamori-type')));
    }
    await p.evaluate(() => localStorage.clear()); await p.goto(BASE); await p.addStyleTag({ content: NORMAL }); await p.tap('#start-btn');
    for (let i = 0; i < 14; i++) { await p.clock.runFor(100); got.push(...await p.evaluate(M('#q-text'))); await p.locator('#screen-quiz.is-active .option').first().tap(); await p.clock.runFor(400); }
    await p.goto(BASE + 'types/'); await p.addStyleTag({ content: NORMAL });
    got.push(...await p.evaluate(M('.guide-type-name, .guide-type-catch')));
    const ng = got.filter(e => e.bad || e.long || e.overflow);
    const names = got.filter(e => /type-name|guide-type-name/.test(e.id)).length, catches = got.filter(e => /type-catch|guide-type-catch/.test(e.id)).length;
    check(w + 'px：タイプ名・キャッチコピー・お守りの言葉・質問が言葉の途中で改行しない・横にはみ出さない（auto-phrase なし＝Safari と同じ条件）',
      ng.length === 0 && got.length === 8 * 8 + 14 + 16 && names === 24 && catches === 24 && got.filter(e => e.phrased).length >= 8 * 8 + 14 + 8,
      ng.length ? ng.slice(0, 3).map(e => e.id + ' ' + e.text).join(' / ') : got.length + '要素・名前' + names + '・キャッチ' + catches + '・区切りあり' + got.filter(e => e.phrased).length);
    await ctx.close();
  }

  await b.close();
  check('エラーなし', errs.length === 0, errs.slice(0, 5).join(' | '));
  for (const r of res) console.log(r[0], r[1], r[2] ? '｜' + r[2] : '');
  const fails = res.filter(r => r[0] === 'FAIL').length;
  console.log(fails + ' FAIL / ' + res.length);
  if (server) server.close();
  process.exitCode = fails ? 1 : 0;
})().catch((e) => {
  // 途中で止まったとき（サーバーにつながらない など）：ブラウザが残って終わらなくならないよう、すぐ終了する
  console.error(e);
  process.exit(1);
});
