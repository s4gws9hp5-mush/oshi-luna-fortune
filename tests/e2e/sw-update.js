// 公開中の版（既定は origin/main）から、このリポジトリの今の版へ更新したときのブラウザテスト（Playwright + Chromium）
//
// 実行（リポジトリのいちばん上で）:
//   node tests/e2e/sw-update.js              # 古い版 = origin/main（git fetch origin main をしておく）
//   node tests/e2e/sw-update.js <コミット>   # 古い版を指定する
// 必要なもの: Node.js 18 以上、playwright パッケージと Chromium、git（くわしくは tests/e2e/README.md）
//
// 1. 古い版を、127.0.0.1 の同じアドレスで配信し、Service Worker が動いている状態で、診断（14問）と今日の占いを保存する
// 2. 配信する中身を今の版に入れ替えて開き直し、次を確かめる
//    - Service Worker が新しい版に替わり、古いキャッシュが消えて、新しいキャッシュ（sw.js の CACHE）だけになる
//    - 保存した診断・占いの記録・ブラウザごとのID（localStorage）が、1文字も変わらずに残る
//    - トップに保存したタイプが出て、今日の占いは更新前と同じ結果になる
//    - 今日の一枚（タロット）の入口が通常のアドレスで出て、プレビュー専用の案内は出ない
//    - オフラインでも、新しい版の画面が出る
// - Google アナリティクス（googletagmanager.com）への通信は空のスクリプトに差し替え、実際には送らない
// - 一時フォルダに古い版を取り出し、終わったら消す。リポジトリには何も書かない
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const { chromium, devices } = require('playwright');
const REF = process.argv[2] || 'origin/main';
const res = []; const check = (n, ok, x = '') => res.push([ok ? 'PASS' : 'FAIL', n, x]);
const errs = [];
const OLD = fs.mkdtempSync(path.join(os.tmpdir(), 'oshi-luna-old-'));
const cleanup = () => fs.rmSync(OLD, { recursive: true, force: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };
let docRoot = OLD;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(docRoot, path.normalize(p));
  if (!file.startsWith(docRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  // GitHub Pages と同じく、ブラウザが毎回確かめに来る（max-age=0 相当）
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  // 古い版を一時フォルダに取り出す
  const tar = execFileSync('git', ['-C', ROOT, 'archive', '--format=tar', REF]);
  execFileSync('tar', ['-x', '-C', OLD], { input: tar });
  const oldSha = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', REF]).toString().trim();
  const cacheOf = (dir) => (fs.readFileSync(path.join(dir, 'sw.js'), 'utf8').match(/var CACHE = "([^"]+)"/) || [])[1];
  const OLD_CACHE = cacheOf(OLD), NEW_CACHE = cacheOf(ROOT);
  check('古い版（' + REF + ' = ' + oldSha + '）と今の版で、キャッシュの名前が違う', !!OLD_CACHE && !!NEW_CACHE && OLD_CACHE !== NEW_CACHE, OLD_CACHE + ' → ' + NEW_CACHE);

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port + '/';
  const b = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8' } });
  const ctx = await b.newContext({ ...devices['iPhone 13'], timezoneId: 'Asia/Tokyo' }); // Service Worker は止めない
  await ctx.route(/^https:\/\/www\.googletagmanager\.com\//, (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  // キャッシュが want だけになり、Service Worker が動いている（activated）まで待つ（最大20秒）。
  // evaluate は Promise の結果を待つので、毎回の状態を見てから判定する（waitForFunction は Promise をそのまま「真」とみなすため使わない）
  const swState = () => p.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration(); if (reg) reg.update().catch(() => {});
    const c = navigator.serviceWorker.controller;
    return { keys: await caches.keys(), controller: c ? c.state : null, script: c ? new URL(c.scriptURL).pathname : null };
  });
  const waitCaches = async (want) => {
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await swState();
      if (st.controller === 'activated' && st.keys.length === 1 && st.keys[0] === want) return { ok: true, st };
      await p.waitForTimeout(500);
    }
    return { ok: false, st };
  };
  const storage = () => p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });

  // 1. 古い版で、Service Worker が動いている状態にして、診断と今日の占いを保存する
  await p.goto(BASE);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); // Service Worker の管理下で開き直す
  { const w = await waitCaches(OLD_CACHE); check('古い版：Service Worker が動き、古いキャッシュ（' + OLD_CACHE + '）だけがある', w.ok, JSON.stringify(w.st)); }
  await p.tap('#start-btn');
  for (let i = 0; i < 30 && !(await p.isVisible('#screen-result.is-active')); i++) {
    const opt = p.locator('#screen-quiz.is-active .option').first();
    if (await opt.isVisible()) await opt.tap();
    await p.waitForTimeout(450);
  }
  await p.waitForSelector('#screen-result.is-active', { timeout: 8000 });
  const typeName = (await p.textContent('#type-name')).trim();
  await p.goto(BASE); await p.tap('#daily-btn');
  await p.waitForSelector('#screen-daily.is-active', { timeout: 8000 }); await p.waitForTimeout(300);
  const oldDaily = { date: await p.textContent('#daily-date'), message: await p.textContent('#daily-message'), luck: await p.textContent('#daily-luck-title') };
  const before = await storage();
  check('古い版：診断と今日の占いを保存した', !!before['oshi-luna-type'] && !!before['oshi-luna-daily'] && !!before['oshi-luna-device'], Object.keys(before).join(','));

  // 2. 配信する中身を今の版に入れ替えて、開き直す
  docRoot = ROOT;
  await p.goto(BASE); await p.waitForTimeout(500); await p.reload();
  { const w = await waitCaches(NEW_CACHE);
    check('更新：Service Worker が新しい版になり、古いキャッシュ（' + OLD_CACHE + '）が消えて新しいキャッシュ（' + NEW_CACHE + '）だけになる', w.ok, JSON.stringify(w.st)); }
  await p.reload(); await p.waitForTimeout(500);
  const after = await storage();
  const kept = Object.keys(before).filter((k) => after[k] !== before[k]);
  check('更新：保存した診断・占いの記録・ブラウザごとのIDが変わらずに残る', kept.length === 0, kept.length ? 'changed: ' + kept.join(',') : Object.keys(before).join(','));
  check('更新：トップに保存したタイプが出る', (await p.textContent('#top-type-name')).includes(typeName), typeName);
  check('更新：今日の一枚の入口が通常のアドレスで出る・プレビューの案内は出ない',
    await p.isVisible('#tarot-entry') && await p.isVisible('#tarot-open') && !(await p.isVisible('#tarot-preview-note')) && !(await p.evaluate(() => location.search)));
  await p.tap('#daily-btn'); await p.waitForSelector('#screen-daily.is-active', { timeout: 8000 }); await p.waitForTimeout(300);
  const newDaily = { date: await p.textContent('#daily-date'), message: await p.textContent('#daily-message'), luck: await p.textContent('#daily-luck-title') };
  check('更新：今日の占いが更新前と同じ結果', JSON.stringify(newDaily) === JSON.stringify(oldDaily), newDaily.date + ' ' + newDaily.luck);
  // 今日の一枚を開く（引くのは押したときだけ。ここでは開くだけ）
  await p.goto(BASE); await p.tap('#tarot-open'); await p.waitForTimeout(400);
  check('更新：今日の一枚の画面が開き、プレビューの案内は出ない', await p.isVisible('#screen-tarot.is-active') && !(await p.isVisible('#tarot-preview-note')));
  const cached = await p.evaluate(async (c) => { const cache = await caches.open(c); return (await cache.keys()).map((r) => new URL(r.url).pathname); }, NEW_CACHE);
  check('更新：新しいキャッシュに、差し替えた絵と今日の一枚のファイルが入っている',
    ['/images/types/cheer-penlight-sparkle.png', '/images/types/talk-heart-bubble.png', '/images/types/heal-cushion-mug-cozy.png', '/images/types/research-telescope-book.png', '/js/tarot-ui.js', '/js/tarot-public.js']
      .every((f) => cached.includes(f)), cached.length + '件');
  // オフラインでも新しい版が出る
  await ctx.setOffline(true);
  await p.goto(BASE).catch(() => {}); await p.waitForTimeout(500);
  check('オフライン：新しい版の画面（今日の一枚の入口つき）が出る', await p.isVisible('#tarot-entry').catch(() => false) && (await p.textContent('#top-type-name').catch(() => '')).includes(typeName));
  await ctx.setOffline(false);

  await b.close(); server.close(); cleanup();
  check('エラーなし', errs.length === 0, errs.slice(0, 5).join(' | '));
  for (const r of res) console.log(r[0], r[1], r[2] ? '｜' + r[2] : '');
  const fails = res.filter(r => r[0] === 'FAIL').length;
  console.log(fails + ' FAIL / ' + res.length);
  process.exitCode = fails ? 1 : 0;
})().catch((e) => {
  // 途中で止まったとき：ブラウザが残って終わらなくならないよう、すぐ終了する
  console.error(e); cleanup();
  process.exit(1);
});
