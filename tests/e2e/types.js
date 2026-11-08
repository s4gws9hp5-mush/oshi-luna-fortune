// 全8タイプの確認用の回答（tests/type-answers.js）で、実際の画面から診断して目的のタイプになるかのブラウザテスト
//
// 実行（リポジトリのいちばん上で）:
//   node tests/e2e/types.js                        # このリポジトリを 127.0.0.1 の空きポートで配信してテスト
//   node tests/e2e/types.js http://localhost:8000/  # すでに起動しているサーバーを使う（末尾の / まで）
// 必要なもの: Node.js 18 以上、playwright パッケージと Chromium（くわしくは tests/e2e/README.md）
//
// - トップの「🎀 推し活タイプ診断をはじめる」から14問に答え、結果画面のタイプ名・絵文字・サブタイプコードと、保存したタイプを見る
// - 各質問で、画面の質問の番号・文・選択肢の並び（上から data.js の順、印は 🌙=① ✨=② 🌠=③ 🐾=④）が同じことを確かめてから、番号の選択肢を押す
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
