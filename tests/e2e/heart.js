// ルナのこころ整理（heart/）のブラウザテスト（Playwright + Chromium）
//
// 実行（リポジトリのいちばん上で）:
//   node tests/e2e/heart.js                        # このリポジトリを 127.0.0.1 の空きポートで配信してテスト
//   node tests/e2e/heart.js http://localhost:8000/  # すでに起動しているサーバーを使う（末尾の / まで）
//   node tests/e2e/heart.js "" /path/to/out         # 画面の画像を残す（既定は一時フォルダに作って消す）
// 必要なもの: Node.js 18 以上、playwright パッケージと Chromium（くわしくは tests/e2e/README.md）
//
// 仕様書 v0.1 の16章のうち、ブラウザで確かめられること：質問の操作（最大2件・単独・戻る・テーマ変更）、Q7（端・±・未回答・
// スキップ・表情の境目・動きを減らす設定・数値の読み上げ）、結果とコピー（成功／失敗・表示との一致）、端末内保存・再開・
// 日付の保持・削除の確認・読み込めない場合・保存に失敗した場合、ほかの保存データに触れないこと、外部へ送らないこと、
// 320・375・390px のはみ出し、トップと診断結果画面の入口の位置、オフライン表示。
// iPhone の Safari（WebKit）そのものでは確かめていない（この環境は Chromium だけ）
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const { chromium, devices } = require('playwright');
const D = require(path.join(ROOT, 'js', 'heart-data.js'));
const R = require(path.join(ROOT, 'js', 'heart-rules.js'));
const KEY = 'oshi-luna-heart-state-v1';
let BASE = process.argv[2] || '';
const KEEP = !!process.argv[3];
const OUT = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'oshi-luna-heart-'));
if (KEEP) fs.mkdirSync(OUT, { recursive: true });
const res = []; const check = (n, ok, x = '') => res.push([ok ? 'PASS' : 'FAIL', n, x]);
const errs = [], external = [];

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
  const H = BASE + 'heart/';
  const open = async ({ device = 'iPhone 13', viewport, init, sw = 'block', reduce, time } = {}) => {
    const opts = { ...devices[device], timezoneId: 'Asia/Tokyo', serviceWorkers: sw };
    if (viewport) opts.viewport = viewport;
    if (reduce) opts.reducedMotion = 'reduce';
    const ctx = await b.newContext(opts);
    // トップの Google アナリティクスは空のスクリプトに差し替える（実際には送らない）。外部への通信は記録する
    await ctx.route(/^https:\/\/www\.googletagmanager\.com\//, (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
    // こころ整理のページ（/heart/）から出た、ほかのサイトへの通信を記録する
    ctx.on('request', (r) => { let from = ''; try { from = r.frame().url(); } catch (e) { from = ''; }
      if (from.includes('/heart/') && !r.url().startsWith(BASE) && !r.url().startsWith('data:')) external.push(r.url()); });
    if (time) await ctx.clock.install({ time });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    p.on('response', (r) => r.status() >= 400 && errs.push(r.status() + ' ' + r.url()));
    if (init) await p.addInitScript(init);
    return p;
  };
  const opt = (p, label) => p.locator('#h-options .h-option', { hasText: label }).first();
  const pick = async (p, labels) => { for (const l of labels) await opt(p, l).click(); };
  const next = (p) => p.click('#h-next');
  const stored = (p) => p.evaluate((k) => localStorage.getItem(k), KEY);
  const q = (p) => p.textContent('#h-q-count');
  // 標準の回答：ticket・Q3=申し込むか迷っている・Q4=チケット代・Q5=暮らしの安心・Q6=まだ分からない
  const answerQ1toQ6 = async (p) => {
    await pick(p, ['チケットの申込み']); await next(p);
    await pick(p, ['好きなはずなのに', '疲れた']); await next(p);
    await pick(p, ['申し込むか迷っている']); await next(p);
    await pick(p, ['チケット代']); await next(p);
    await pick(p, ['暮らしの安心']); await next(p);
    await pick(p, ['まだ分からない']); await next(p);
  };

  // 1) 質問の操作
  {
    const p = await open();
    await p.goto(H);
    check('開始前：採用文の説明・はじめるボタン', (await p.textContent('#h-intro-text')).includes('回答と結果は、この端末のブラウザに保存されます。運営側には送信されません') && await p.isVisible('#h-start'));
    // 開始前の並び：画像 → 題 → ひとこと → はじめる → 入力不要 → 保存の要点 → 折りたたみ（詳しい説明）
    const order = await p.evaluate(() => ['.h-intro-art', '#h-intro-title', '#h-intro-lead', '#h-start', '#h-intro-free', '#h-intro-privacy', '#h-details'].map((sel) => document.querySelector(sel).getBoundingClientRect().top));
    check('開始前：ご指定の順に並ぶ', order.every((v, i) => i === 0 || v > order[i - 1]), JSON.stringify(order.map(Math.round)));
    check('開始前：要点の文', (await p.textContent('#h-intro-lead')) === D.ui.introLead && (await p.textContent('#h-intro-free')) === D.ui.introFree && (await p.textContent('#h-intro-privacy')) === D.ui.introPrivacy && (await p.textContent('#h-details-summary')) === D.ui.introDetailsLabel);
    const det = await p.textContent('#h-intro-text');
    check('詳しい説明：折りたたみ（最初は閉じている）・コピー案内と判定しない説明を残し、送信の文は1回だけ', !(await p.getAttribute('#h-details', 'open') !== null) && !(await p.isVisible('#h-intro-text')) &&
      det.includes('大切な結果はコピーして残してね') && det.includes('推しご本人の気持ちを判定するものではありません') && (det.match(/送信されません/g) || []).length === 1);
    await p.click('#h-details-summary');
    check('詳しい説明：押すと開く', await p.isVisible('#h-intro-text'));
    await p.click('#h-start');
    check('Q1：1／7・未選択では次へ進めない', (await q(p)) === '1／7' && await p.isDisabled('#h-next'));
    await pick(p, ['チケットの申込み']); await next(p);
    check('Q2：2／7・最大2件の表示', (await q(p)) === '2／7' && (await p.textContent('#h-q-pick')) === '選択中 0／2');
    await pick(p, ['好きなはずなのに', '疲れた']);
    await opt(p, 'お金や時間').dispatchEvent('click'); // 選べない表示（aria-disabled）でも押してみる
    const chosen = await p.locator('#h-options .h-option.is-chosen').count();
    check('Q2：3件目は選ばれない・ほかは選べない表示', chosen === 2 && (await p.locator('#h-options .h-option.is-full').count()) === 7 && (await p.textContent('#h-q-pick')) === '選択中 2／2');
    await pick(p, ['うまく選べない']);
    check('Q2：単独の選択肢を選ぶとほかは外れる', (await p.locator('#h-options .h-option.is-chosen').count()) === 1 && (await opt(p, 'うまく選べない').getAttribute('aria-pressed')) === 'true');
    await pick(p, ['疲れた', '好きなはずなのに']); // 逆順に選ぶ
    const st = JSON.parse(await stored(p));
    check('Q2：選択は番号順に保存（クリック順を残さない）', JSON.stringify(st.answers.q2) === '["q2-01","q2-02"]', JSON.stringify(st.answers.q2));
    await next(p); check('Q3：ticket のテーマの質問', (await p.textContent('#h-q-text')) === D.themes.ticket.q3.text);
    await pick(p, ['申し込むか迷っている']); await next(p); await pick(p, ['チケット代']); await next(p);
    await pick(p, ['睡眠や体力']); await next(p);
    await pick(p, ['今、どんな気持ち']); await next(p);
    // 戻って Q1 を別テーマに変える：Q3・Q4 だけ消える
    for (let i = 0; i < 6; i++) await p.click('#h-back');
    check('戻る：Q1 まで戻れる・回答が残る', (await q(p)) === '1／7' && (await opt(p, 'チケットの申込み').getAttribute('aria-pressed')) === 'true');
    await pick(p, ['遠征に行くかどうか']);
    const a = JSON.parse(await stored(p)).answers;
    check('Q1 を変えると Q3・Q4 だけリセット（Q2・Q5・Q6 は残る）', a.q1 === 'travel' && a.q3 === null && a.q4 === null && a.q2.length === 2 && a.q5[0] === 'q5-rest' && a.q6[0] === 'q6-emotion', JSON.stringify(a));
    await next(p); await next(p);
    check('Q3：遠征の質問になる・未回答で次へ進めない', (await p.textContent('#h-q-text')) === D.themes.travel.q3.text && await p.isDisabled('#h-next'));
    check('URL に回答を載せない', !/[?#]/.test(p.url()), p.url());
    await p.context().close();
  }

  // 2) Q7：未回答・±・端・表情の境目・スキップ・読み上げ・動きを減らす設定
  {
    const p = await open();
    await p.goto(H); await p.click('#h-start'); await answerQ1toQ6(p);
    const face = () => p.evaluate(() => { const i = document.getElementById('h-face'); return i.hidden ? 'moon' : i.getAttribute('src').split('/').pop(); });
    check('Q7：初期は未回答（🌙・結果ボタンは押せない・スキップあり）', (await q(p)) === '7／7' && (await face()) === 'moon' && await p.isDisabled('#h-next') &&
      (await p.textContent('#h-q7-value')) === '未回答' && (await p.getAttribute('#h-q7-range', 'aria-valuetext')) === '未回答' && await p.isVisible('#h-q7-skip') && !(await p.isVisible('#h-q-pick')) && JSON.parse(await stored(p)).answers.q7 === null);
    // 表示上の基準位置（5）は回答・保存値にしない：開き直しても未回答のまま。スキップした結果も未回答
    await p.reload(); await p.click('#h-resume-main');
    check('Q7：未回答の中央表示は保存されない（開き直しても未回答）', (await q(p)) === '7／7' && (await p.textContent('#h-q7-value')) === '未回答' && JSON.parse(await stored(p)).answers.q7 === null && (await face()) === 'moon');
    await p.click('#h-q7-minus');
    const m4 = [await p.textContent('#h-q7-value'), JSON.parse(await stored(p)).answers.q7];
    check('Q7：未回答で − を押すと4（押した時点で回答として保存）', m4[0] === '4' && m4[1] === 4, JSON.stringify(m4));
    await p.click('#h-back'); await p.click('#h-next');
    check('Q7：説明・目盛りの文', (await p.textContent('#h-q7-note')) === D.q7.note && (await p.textContent('#h-q7-low')) === '1 ほとんど疲れていない' && (await p.textContent('#h-q7-high')) === '10 とても疲れている');
    const seen = [];
    for (let i = 0; i < 12; i++) { await p.click('#h-q7-minus'); }
    seen.push([await p.textContent('#h-q7-value'), await face()]);
    for (let v = 2; v <= 10; v++) { await p.click('#h-q7-plus'); seen.push([await p.textContent('#h-q7-value'), await face()]); }
    await p.click('#h-q7-plus'); seen.push([await p.textContent('#h-q7-value'), await face()]);
    const want = [['1', '01'], ['2', '01'], ['3', '02'], ['4', '02'], ['5', '03'], ['6', '03'], ['7', '04'], ['8', '04'], ['9', '05'], ['10', '05'], ['10', '05']];
    check('Q7：±で1〜10（端で止まる）・2段階ごとに5つの表情', JSON.stringify(seen.map(([v, f]) => [v, f.replace(/^luna-face-|\.png$/g, '')])) === JSON.stringify(want), JSON.stringify(seen));
    check('Q7：読み上げ用の値', (await p.getAttribute('#h-q7-range', 'aria-valuetext')) === '10（とてもお疲れの顔）');
    await p.fill('#h-q7-range', '3'); await p.dispatchEvent('#h-q7-range', 'input');
    check('Q7：スライダーで選べる', (await p.textContent('#h-q7-value')) === '3' && (await face()) === 'luna-face-02.png' && JSON.parse(await stored(p)).answers.q7 === 3);
    const anim = await p.evaluate(() => getComputedStyle(document.getElementById('h-face')).animationName);
    check('Q7：表情が変わるときだけ、ぽんっと動く', anim === 'h-pop', anim);
    // スライダーの線とつまみが描かれている（線の色・つまみの色の画素がある）
    const box = await p.locator('#h-q7-range').boundingBox();
    const shot = await p.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    check('Q7：スライダーの線とつまみが見える（大きさ）', box.height >= 40 && box.width >= 180, JSON.stringify(box));
    fs.writeFileSync(OUT + '/q7-slider.png', shot);
    await p.click('#h-q7-skip'); await p.waitForSelector('#h-result:not([hidden])');
    const st = JSON.parse(await stored(p));
    check('スキップ：Q7 は未回答のまま結果へ', st.phase === 'result' && st.answers.q7 === null && st.resultSnapshot.action.actionId === 'action-common-reflect', st.resultSnapshot.action.actionId);
    await p.context().close();
    const p2 = await open({ reduce: true });
    await p2.goto(H); await p2.click('#h-start'); await answerQ1toQ6(p2); await p2.click('#h-q7-plus');
    const anim2 = await p2.evaluate(() => getComputedStyle(document.getElementById('h-face')).animationName);
    check('動きを減らす設定では、表情の動きを止める', anim2 === 'none', anim2);
    check('Q7：未回答で ＋ を押すと6（押した時点で回答として保存）', (await p2.textContent('#h-q7-value')) === '6' && JSON.parse(await p2.evaluate((k) => localStorage.getItem(k), KEY)).answers.q7 === 6);
    await p2.context().close();
  }

  // 3) 結果・コピー・保存・日付・削除
  {
    const p = await open({ time: new Date('2026-11-16T23:50:00+09:00'), init: () => {
      // ほかの機能の保存データ（こころ整理では触れない）
      localStorage.setItem('oshi-luna-type', JSON.stringify({ version: 2, type: 'cheer', sub: null, answers: [], date: '2026-11-01' }));
      localStorage.setItem('oshi-luna-tarot-daily-v1', '{"keep":true}');
    } });
    await p.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await p.goto(H); await p.click('#h-start'); await answerQ1toQ6(p);
    await p.click('#h-q7-minus'); await p.click('#h-q7-minus'); // 3
    await p.click('#h-next'); await p.waitForSelector('#h-result:not([hidden])');
    const shown = await p.evaluate(() => document.getElementById('h-action').innerText);
    check('結果：Q7=3・ticket の申し込み検討・Q6 非回答・Q5 不適合 → 期限専用文（共通補足は重ねない）',
      shown.includes('まずは期限をひとつ確かめてみて') && !shown.includes(D.deadlineSupplement), shown.slice(0, 40));
    check('結果：整理した日（日本時間）', (await p.textContent('#h-date')) === '整理した日：2026年11月16日');
    const sections = await p.locator('.h-section .card-title').allTextContents();
    check('結果：4区分の順番', sections.join('|') === Object.values(R.SECTIONS).join('|'), sections.join('|'));
    const shop = p.getByRole('link', { name: 'STORESで個別鑑定を見る' });
    check('結果：注意文と有料鑑定へのリンク', (await p.textContent('#h-result-notice')) === D.ui.resultNotice &&
      await shop.isVisible() && await shop.getAttribute('href') === 'https://oshirunauranai.stores.jp/' &&
      await shop.getAttribute('rel') === 'noreferrer' && (await p.textContent('#h-reading-title')).includes('有料'));
    check('結果：コピーは1つだけ・もう一度整理できる',
      await p.getByRole('button', { name: '整理結果をコピーする', exact: true }).count() === 1 && await p.locator('#h-again').isVisible());
    // コピー成功：コピーした文章 = 表示と同じ内容
    await p.click('#h-copy'); await p.waitForTimeout(200);
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    const st = JSON.parse(await stored(p));
    check('コピー成功：成功の案内', (await p.textContent('#h-copy-area-main')) === D.ui.copySuccess);
    check('コピー：タイトル・整理した日・4区分（表示と同じ文章）', clip === R.copyText(st.resultSnapshot, st.resultDate) && clip.startsWith('ルナのこころ整理\n2026年11月16日') &&
      st.resultSnapshot.action.paragraphs.every((x) => clip.includes(R.plain(x))) && st.resultSnapshot.message.paragraphs.every((x) => clip.includes(x)), clip.slice(0, 30));
    // 日付をまたいで開き直しても、元の結果と日付のまま
    await p.clock.runFor(30 * 60 * 1000); await p.reload();
    check('再訪：前回の結果があると案内（ほかの操作の前）', (await p.textContent('#h-resume-text')) === D.ui.resumeResult && (await p.textContent('#h-resume-main')) === '前回の結果を見る' && (await p.textContent('#h-resume-sub')) === '新しく整理する');
    await p.click('#h-resume-main');
    check('再訪：日付をまたいでも整理した日は元のまま（2026年11月16日）', (await p.textContent('#h-date')) === '整理した日：2026年11月16日' && (await p.evaluate(() => document.getElementById('h-action').innerText)) === shown);
    // 削除の確認：キャンセルでは消さない
    await p.click('#h-again');
    check('もう一度整理する → 削除の確認（開いただけでは消さない）', await p.isVisible('#h-confirm') && (await p.textContent('#h-confirm-text')) === D.ui.deleteConfirm && !!(await stored(p)));
    await p.click('#h-confirm-no');
    check('キャンセル：保存内容はそのまま', !(await p.isVisible('#h-confirm')) && JSON.parse(await stored(p)).phase === 'result');
    await p.click('#h-result-delete'); await p.click('#h-confirm-yes');
    const after = await p.evaluate(() => ({ heart: localStorage.getItem('oshi-luna-heart-state-v1'), type: localStorage.getItem('oshi-luna-type'), tarot: localStorage.getItem('oshi-luna-tarot-daily-v1') }));
    check('消して最初から：こころ整理の保存だけ消え、開始前へ（診断・タロットの保存は残る）', after.heart === null && !!after.type && after.tarot === '{"keep":true}' && await p.isVisible('#h-intro') && !(await p.isVisible('#h-resume')));
    // 新しく整理すると日付も新しくなる
    await p.click('#h-start'); await answerQ1toQ6(p); await p.click('#h-q7-skip'); await p.waitForSelector('#h-result:not([hidden])');
    check('新しく整理した結果は、その日の日付', (await p.textContent('#h-date')) === '整理した日：2026年11月17日');
    await p.context().close();
  }

  // 4) 回答途中の再開
  {
    const p = await open();
    await p.goto(H); await p.click('#h-start');
    await pick(p, ['同担やSNS']); await next(p); await pick(p, ['周りと比べて落ち込む']); await next(p);
    await pick(p, ['SNSのフォロワー数', '同担とのやり取り']); await next(p);
    await p.reload();
    check('再訪：回答途中なら続きからの案内', (await p.textContent('#h-resume-text')) === D.ui.resumeProgress && (await p.textContent('#h-resume-main')) === '続きから' && (await p.textContent('#h-resume-sub')) === '最初から');
    await p.click('#h-resume-main');
    check('続きから：同じ質問（Q4）から再開', (await q(p)) === '4／7' && (await p.textContent('#h-q-text')) === D.themes.social.q4.text);
    await p.click('#h-back');
    check('続きから：前の回答も残っている', (await p.locator('#h-options .h-option.is-chosen').count()) === 2);
    await p.goto(H);
    check('保存があるときは「はじめる」を重ねて出さない（上書きしない）', !(await p.isVisible('#h-start')) && await p.isVisible('#h-resume-sub'));
    await p.click('#h-resume-sub');
    check('［最初から］は削除の確認へ（上書きしない）', await p.isVisible('#h-confirm'));
    await p.context().close();
  }

  // 5) 読み込めない保存内容・保存できない環境
  {
    const p = await open({ init: () => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('oshi-luna-heart-state-v1', '{"schemaVersion":99}'); } } });
    await p.goto(H);
    check('読み込めない：案内と［最初から］［今はやめる］', (await p.textContent('#h-resume-text')) === D.ui.unreadable && (await p.textContent('#h-resume-main')) === '最初から' && (await p.textContent('#h-resume-sub')) === '今はやめる');
    await p.click('#h-resume-sub');
    check('今はやめる：保存内容は変えず、同じ案内をくり返さない', (await stored(p)) === '{"schemaVersion":99}' && !(await p.isVisible('#h-resume')));
    await p.click('#h-start');
    check('読み込めない内容があるときの「はじめる」は削除の確認へ', await p.isVisible('#h-confirm') && (await stored(p)) === '{"schemaVersion":99}');
    await p.click('#h-confirm-yes');
    check('消して最初から：読み込めない内容を消せる', (await stored(p)) === null && await p.isVisible('#h-intro'));
    await p.context().close();

    const q2 = await open({ init: () => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'oshi-luna-heart-state-v1') throw new Error('QuotaExceededError'); return orig.call(this, k, v); };
    } });
    await q2.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await q2.goto(H); await q2.click('#h-start'); await pick(q2, ['チケットの申込み']);
    check('保存できない：案内を出し、そのまま進める（モーダルではない）', (await q2.textContent('#h-save-failed')) === D.ui.saveFailed && await q2.isVisible('#h-save-failed') && !(await q2.isVisible('#h-confirm')) && await q2.isEnabled('#h-next'));
    await next(q2); await pick(q2, ['好きなはずなのに']); await next(q2); await pick(q2, ['申し込むか迷っている']); await next(q2); await pick(q2, ['チケット代']); await next(q2);
    await pick(q2, ['暮らしの安心']); await next(q2); await pick(q2, ['まだ分からない']); await next(q2); await q2.click('#h-q7-skip');
    await q2.click('#h-copy'); await q2.waitForTimeout(200);
    check('保存できない：結果とコピーは使える・保存の案内が出たまま', await q2.isVisible('#h-result') && (await q2.textContent('#h-copy-area-main')) === D.ui.copySuccess && await q2.isVisible('#h-save-failed') && (await stored(q2)) === null);
    await q2.context().close();
  }

  // 6) コピーできないとき：成功と言わず、全文を選んで手動でコピーできる
  {
    const p = await open({ init: () => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('NotAllowedError')) } });
      document.execCommand = () => false;
    } });
    await p.goto(H); await p.click('#h-start'); await answerQ1toQ6(p); await p.click('#h-q7-skip');
    await p.click('#h-copy');
    const area = await p.evaluate(() => { const a = document.getElementById('h-copy-area-main'); const t = a.querySelector('textarea'); return { msg: a.querySelector('.h-copy-status').textContent, text: t && t.value, ro: t && t.readOnly }; });
    const st = JSON.parse(await stored(p));
    check('コピー失敗：案内と、コピーする予定だった全文（成功表示なし）', area.msg === D.ui.copyFailed && area.text === R.copyText(st.resultSnapshot, st.resultDate) && area.ro && !(await p.textContent('#h-result')).includes(D.ui.copySuccess));
    check('コピー失敗でも回答・結果は消えない', st.phase === 'result');
    await p.context().close();
  }

  // 7) 320・375・390px：横にはみ出さない・ボタンと表情画像が収まる
  for (const w of [320, 375, 390]) {
    const p = await open({ viewport: { width: w, height: 760 } });
    const over = async () => p.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('.btn, .h-option, .h-face, .h-slider-row, .h-copy-text')].some((e) => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 0.5));
    await p.goto(H); let bad = await over(); await p.screenshot({ path: `${OUT}/intro-${w}.png`, fullPage: true });
    await p.click('#h-start'); await pick(p, ['なんとなくモヤモヤ']); bad = bad || await over(); await next(p);
    await pick(p, ['落ち着かなくて']); bad = bad || await over(); await p.screenshot({ path: `${OUT}/q2-${w}.png`, fullPage: true }); await next(p);
    await pick(p, ['何が気になるのか']); await next(p); await pick(p, ['答えたくない']); await next(p);
    await pick(p, ['推しへの「好き」']); await next(p); await pick(p, ['これから、どんなペース']); await next(p);
    await p.click('#h-q7-plus'); bad = bad || await over(); await p.screenshot({ path: `${OUT}/q7-${w}.png`, fullPage: true });
    await p.click('#h-next'); await p.waitForSelector('#h-result:not([hidden])'); bad = bad || await over();
    await p.screenshot({ path: `${OUT}/result-${w}.png`, fullPage: true });
    check(w + 'px：開始前・質問・Q7・結果で横にはみ出さない', !bad);
    await p.context().close();
  }

  // 7b) 開始前：iPhone の最初の画面（スクロールなし）で、開始・続きから・前回の結果のボタンが見える
  for (const dev of ['iPhone SE', 'iPhone 13', 'iPhone 15 Pro Max']) {
    const mid = JSON.stringify({ schemaVersion: 1, questionVersion: 1, resultVersion: 1, phase: 'question', questionId: 'q3', answers: Object.assign(R.emptyAnswers(), { q1: 'ticket', q2: ['q2-01'] }), resultSnapshot: null, resultDate: null });
    const ans = { q1: 'ticket', q2: ['q2-01'], q3: 'ticket-q3-02', q4: ['ticket-q4-07'], q5: ['q5-none'], q6: ['q6-none'], q7: null };
    const done = JSON.stringify({ schemaVersion: 1, questionVersion: 1, resultVersion: 1, phase: 'result', questionId: 'q7', answers: ans, resultSnapshot: R.buildResult(ans), resultDate: '2026-11-17' });
    const seen = [];
    for (const [label, seed, ids] of [['新規', null, ['h-start']], ['回答途中', mid, ['h-resume-main', 'h-resume-sub']], ['結果あり', done, ['h-resume-main', 'h-resume-sub']]]) {
      const p = await open({ device: dev, init: seed ? new Function('localStorage.setItem(' + JSON.stringify(KEY) + ',' + JSON.stringify(seed) + ')') : undefined });
      await p.goto(H);
      const r = await p.evaluate((ids) => ({ vh: innerHeight, start: !document.getElementById('h-start').hidden, b: ids.map((id) => document.getElementById(id).getBoundingClientRect().bottom) }), ids);
      seen.push(label + ':' + r.b.map(Math.round).join('/') + '≤' + r.vh);
      const okStart = label === '新規' ? r.start : !r.start; // 保存内容があるときは、開始ボタンを重ねて出さない
      if (!(r.b.every((x) => x <= r.vh) && okStart)) seen.push('NG');
      await p.context().close();
    }
    check(dev + '：最初の画面で主要なボタンが見える（新規＝はじめる、回答途中＝続きから／最初から、結果あり＝前回の結果を見る／新しく整理する）', !seen.includes('NG'), seen.join(' '));
  }

  // 7c) Q7：未回答は見た目の中央・月／顔／数値と同じ中心線・タップした位置と回答値が合う
  {
    const p = await open();
    await p.goto(H); await p.click('#h-start'); await answerQ1toQ6(p);
    const geo = () => p.evaluate(() => {
      const r = document.getElementById('h-q7-range'), rr = r.getBoundingClientRect(), T = 30; // つまみの幅（css/heart.css）
      const v = Number(r.value), thumb = rr.left + T / 2 + (v - 1) / 9 * (rr.width - T);
      const c = (id) => { const e = document.getElementById(id); if (e.hidden) return null; const b = e.getBoundingClientRect(); return b.left + b.width / 2; };
      return { thumb, track: rr.left + rr.width / 2, row: c('h-q7') , moon: c('h-face-moon'), face: c('h-face'), value: c('h-q7-value'), raw: r.value, step: r.step };
    });
    const near = (a, b) => a !== null && Math.abs(a - b) <= 1;
    const g0 = await geo();
    check('Q7 未回答：つまみはスライダーの見た目の中央（専用表示・step=any）', near(g0.thumb, g0.track) && g0.step === 'any' && JSON.parse(await stored(p)).answers.q7 === null, JSON.stringify(g0));
    check('Q7 未回答：月・数値表示・つまみが同じ中心線', near(g0.moon, g0.track) && near(g0.value, g0.track) && near(g0.row, g0.track), JSON.stringify(g0));
    // つまみを動かさずに押して離しただけ → 未回答のまま
    const rb = await p.locator('#h-q7-range').boundingBox();
    await p.mouse.move(g0.thumb, rb.y + rb.height / 2); await p.mouse.down(); await p.mouse.up();
    check('Q7 未回答：中央のつまみを押しただけでは回答にしない', (await p.textContent('#h-q7-value')) === '未回答' && JSON.parse(await stored(p)).answers.q7 === null);
    // 線の上の 8 の位置をタップ → 8
    const x8 = rb.x + 15 + (8 - 1) / 9 * (rb.width - 30);
    await p.mouse.click(x8, rb.y + rb.height / 2);
    const g8 = await geo();
    check('Q7：タップした位置（8）の値になり、つまみもその位置', (await p.textContent('#h-q7-value')) === '8' && JSON.parse(await stored(p)).answers.q7 === 8 && near(g8.thumb, x8) && g8.step === '1', JSON.stringify(g8));
    check('Q7 回答後：顔・数値も同じ中心線', near(g8.face, g8.track) && near(g8.value, g8.track), JSON.stringify(g8));
    // 1〜10 のすべての位置：未回答からタップしても、回答済みからタップしても、その値になり、つまみもその位置
    const mismatch = [];
    for (const from of ['unset', 'answered']) for (let v = 1; v <= 10; v++) {
      const t = await open();
      await t.goto(H); await t.click('#h-start'); await answerQ1toQ6(t);
      if (from === 'answered') await t.click(v <= 5 ? '#h-q7-plus' : '#h-q7-minus'); // 6 か 4 にしてから
      const b = await t.locator('#h-q7-range').boundingBox(), x = b.x + 15 + (v - 1) / 9 * (b.width - 30);
      await t.mouse.click(x, b.y + b.height / 2);
      const got = await t.evaluate(() => { const r = document.getElementById('h-q7-range'), rr = r.getBoundingClientRect();
        return { text: document.getElementById('h-q7-value').textContent, raw: r.value, thumb: rr.left + 15 + (Number(r.value) - 1) / 9 * (rr.width - 30) }; });
      const saved = JSON.parse(await stored(t)).answers.q7;
      if (got.text !== String(v) || saved !== v || Math.abs(got.thumb - x) > 1) mismatch.push(from + ':' + v + '→' + got.text + '/' + saved);
      await t.context().close();
    }
    check('Q7：1〜10 のどの位置をタップしても、その値になり、つまみもその位置（未回答から・回答済みから）', mismatch.length === 0, mismatch.join(' '));
    // 中央（5.5）のすぐ近く（5と6のちょうど間）を押しただけ → 未回答のまま。5・6 寄りなら 5・6
    {
      const t = await open();
      await t.goto(H); await t.click('#h-start'); await answerQ1toQ6(t);
      const b = await t.locator('#h-q7-range').boundingBox(), at = (v) => b.x + 15 + (v - 1) / 9 * (b.width - 30), y = b.y + b.height / 2;
      await t.mouse.click(at(5.6), y);
      const c = [await t.textContent('#h-q7-value')];
      await t.mouse.click(at(5.2), y); c.push(await t.textContent('#h-q7-value'));
      check('Q7：未回答で 5と6の間（5.6）を押しても未回答のまま、5寄り（5.2）を押すと5', c[0] === '未回答' && c[1] === '5', c.join(','));
      await t.context().close();
    }
    // ドラッグ：2 の位置まで動かす
    await p.mouse.move(g8.thumb, rb.y + rb.height / 2); await p.mouse.down();
    const x2 = rb.x + 15 + (2 - 1) / 9 * (rb.width - 30);
    await p.mouse.move(x2, rb.y + rb.height / 2, { steps: 8 }); await p.mouse.up();
    const g2 = await geo();
    check('Q7：ドラッグした位置（2）の値になり、つまみもその位置', (await p.textContent('#h-q7-value')) === '2' && near(g2.thumb, x2), JSON.stringify(g2));
    await p.context().close();
    // キーボード：未回答から → で6、← で4
    for (const [key, want] of [['ArrowRight', '6'], ['ArrowLeft', '4']]) {
      const k = await open();
      await k.goto(H); await k.click('#h-start'); await answerQ1toQ6(k);
      await k.focus('#h-q7-range'); await k.keyboard.press(key);
      check('Q7 未回答：キーボードの ' + key + ' で ' + want, (await k.textContent('#h-q7-value')) === want && String(JSON.parse(await stored(k)).answers.q7) === want);
      await k.context().close();
    }
  }

  // 7e) ±ボタン：素早く続けて押しても押した回数どおり・ダブルタップの拡大にしない設定（ピンチは禁止しない）
  {
    const p = await open();
    await p.goto(H); await p.click('#h-start'); await answerQ1toQ6(p);
    for (let i = 0; i < 3; i++) await p.click('#h-q7-plus', { delay: 0 });
    const a = await p.textContent('#h-q7-value');
    await p.dblclick('#h-q7-minus');
    const b = await p.textContent('#h-q7-value');
    const ta = await p.evaluate(() => [getComputedStyle(document.getElementById('h-q7-plus')).touchAction, getComputedStyle(document.getElementById('h-q7-minus')).touchAction]);
    const vp = await p.getAttribute('meta[name=viewport]', 'content');
    check('±ボタン：素早く3回＋で 6→7→8、続けて2回−で 6（押した回数どおり）', a === '8' && b === '6' && JSON.parse(await stored(p)).answers.q7 === 6, a + ',' + b);
    check('±ボタン：ダブルタップの拡大をしない（touch-action: manipulation）・ページのズーム禁止はしない', ta.every((x) => x === 'manipulation') && !/user-scalable\s*=\s*(no|0)|maximum-scale/.test(vp), ta.join(',') + ' | ' + vp);
    await p.context().close();
  }
  // 7f) 結果：見出しと本文の強弱（大きさ・太さ・色）と、見出しの蛍光ペン風のマーカー
  {
    const p = await open();
    await p.goto(H); await p.click('#h-start'); await answerQ1toQ6(p); await p.click('#h-q7-skip'); await p.waitForSelector('#h-result:not([hidden])');
    const st = await p.evaluate(() => {
      const cs = (sel) => { const e = document.querySelector(sel), c = getComputedStyle(e); return { size: parseFloat(c.fontSize), weight: Number(c.fontWeight), color: c.color, bg: c.backgroundColor, bgImage: c.backgroundImage, border: c.borderBottomWidth }; };
      return { h: cs('.h-section .card-title'), label: cs('.h-row-label'), value: cs('.h-row-values li'), text: cs('.h-text p') };
    });
    const ok = st.h.size >= st.value.size * 1.12 && st.h.weight >= 700 && st.h.color === 'rgb(91, 63, 176)' &&
      st.label.size < st.value.size && st.label.weight < 700 && st.value.weight < 700 && st.text.weight < 700;
    check('結果：大見出しは本文より大きく太く濃い紫／質問ラベルは回答より小さく／回答・本文は太字にしすぎない', ok, JSON.stringify(st));
    const mk = await p.evaluate(() => [...document.querySelectorAll('.h-section .card-title')].map((h) => {
      const c = getComputedStyle(h), m = h.querySelector('.h-hl'), e = h.querySelector('.h-sec-emoji'), mc = getComputedStyle(m), ec = getComputedStyle(e);
      const hr = h.getBoundingClientRect(), mr = m.getBoundingClientRect();
      return { text: h.textContent, band: c.backgroundColor === 'rgba(0, 0, 0, 0)' && c.backgroundImage === 'none' && parseFloat(c.borderBottomWidth) === 0,
        marker: /linear-gradient/.test(mc.backgroundImage) && /transparent|rgba\(0, 0, 0, 0\)/.test(mc.backgroundImage), lowerHalf: /38%/.test(mc.backgroundImage) && /92%/.test(mc.backgroundImage), markerColor: (mc.backgroundImage.match(/rgb\([^)]*\)/) || [''])[0],
        clone: (mc.boxDecorationBreak || mc.webkitBoxDecorationBreak) === 'clone', emojiPlain: ec.backgroundImage === 'none' && e.getAttribute('aria-hidden') === 'true',
        fitsText: mr.width < hr.width - 20, color: mc.color };
    }));
    const sections = Object.values(R.SECTIONS);
    // マーカーの色：気になっていること＝ラベンダー、大切にしたいこと＝ピンク、ひとこと＝レモン、小さな一歩＝水色
    const COLORS = ['rgb(220, 208, 255)', 'rgb(255, 211, 231)', 'rgb(255, 240, 166)', 'rgb(205, 230, 255)'];
    check('結果：マーカーの色（ラベンダー・ピンク・レモン・水色）', mk.length === 4 && mk.every((x, i) => x.markerColor === COLORS[i]), mk.map((x) => x.markerColor).join(' / '));
    check('結果：見出しの帯と下線を外し、文字の下半分にだけ文字の長さのマーカー（絵文字には付けない・文字は濃い紫・文は同じ）',
      mk.length === 4 && mk.every((x, i) => x.text === sections[i] && x.band && x.marker && x.lowerHalf && x.clone && x.emojiPlain && x.fitsText && x.color === 'rgb(91, 63, 176)'), JSON.stringify(mk));
    // 見出しが折り返すとき：行ごとに文字に沿ってマーカーが付く（狭い幅で折り返させて確かめる）
    await p.evaluate(() => { document.getElementById('h-sec-concern').style.width = '170px'; });
    const lines = await p.evaluate(() => document.querySelector('#h-sec-concern .h-hl').getClientRects().length);
    await p.locator('#h-sec-concern').screenshot({ path: OUT + '/heading-wrapped.png' });
    check('結果：見出しが折り返しても、各行の文字にマーカー（box-decoration-break: clone）', lines >= 2 && mk[0].clone, 'lines=' + lines);
    // 質問ラベルが折り返すとき：下線は text-decoration なので各行の文字に付く（狭い幅で折り返させて撮る）
    const labLines = await p.evaluate(() => { const l = document.querySelector('#h-concern .h-row-label'); l.style.width = '120px'; const r = document.createRange(); r.selectNodeContents(l); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; });
    await p.locator('#h-concern .h-row').first().screenshot({ path: OUT + '/label-wrapped.png' });
    check('結果：質問ラベルが折り返しても、各行の文字に下線', labLines >= 2 && (await p.evaluate(() => getComputedStyle(document.querySelector('#h-concern .h-row-label')).textDecorationLine)) === 'underline', 'lines=' + labLines);
    await p.context().close();
  }

  // 7g) トップのカード間隔 24px（未診断・診断済み）・今日の占いの中の2つのボタンの間隔は 10px のまま
  //     結果：質問→回答・回答→次の質問の余白（文字の端から）がそろう・項目の間に点線はない・質問ラベルに文字の長さの細い下線・
//     大見出し→最初の文章が4カードとも同じ。320・375・390px、回答が複数行でも
  for (const w of [320, 375, 390]) {
    const p = await open({ viewport: { width: w, height: 760 } });
    const gaps = () => p.evaluate(() => { const ids = [...document.querySelectorAll('#screen-top > section')].map((e) => e.id).filter((id) => ['type-card', 'daily-entry', 'heart-entry'].includes(id));
      const r = ids.map((id) => document.getElementById(id).getBoundingClientRect());
      const t = [document.getElementById('daily-btn').getBoundingClientRect(), document.getElementById('tarot-open').getBoundingClientRect()];
      return { order: ids.join('>'), gaps: r.slice(1).map((x, i) => Math.round(x.top - r[i].bottom)), inner: Math.round(t[1].top - t[0].bottom) }; });
    await p.goto(BASE); await p.waitForTimeout(200);
    const g1 = await gaps();
    await p.evaluate(() => localStorage.setItem('oshi-luna-type', JSON.stringify({ version: 2, type: 'research', sub: null, answers: [], date: '2026-11-17' }))); await p.reload(); await p.waitForTimeout(200);
    const g2 = await gaps();
    check(w + 'px：トップのカード間隔は 24px（未診断・診断済み）・今日の占いの2つのボタンの間隔は 10px', [g1, g2].every((g) => g.gaps.length === 2 && g.gaps.every((x) => x === 24) && g.inner === 10), JSON.stringify([g1, g2]));
    await p.goto(H); await p.click('#h-start');
    await pick(p, ['同担やSNS']); await next(p); await pick(p, ['周りと比べて落ち込む', '疲れた']); await next(p);
    await pick(p, ['SNSのフォロワー数', '同担とのやり取り']); await next(p); await pick(p, ['楽しい・元気', 'やり取りや']); await next(p);
    await pick(p, ['睡眠や体力', '推しへの「好き」']); await next(p); await pick(p, ['少し落ち着く']); await next(p);
    await p.click('#h-q7-skip'); await p.waitForSelector('#h-result:not([hidden])');
    const m = await p.evaluate(() => {
      const tb = (el) => { const r = document.createRange(); r.selectNodeContents(el); const rs = [...r.getClientRects()].filter((x) => x.height > 0); return { top: Math.min(...rs.map((x) => x.top)), bottom: Math.max(...rs.map((x) => x.bottom)), lines: new Set(rs.map((x) => Math.round(x.top))).size }; };
      const out = { la: [], next: [], dashed: 0, multi: 0, ul: [], head: [] };
      document.querySelectorAll('#h-concern, #h-values').forEach((box) => { const rows = [...box.querySelectorAll('.h-row')];
        rows.forEach((row, i) => { const labEl = row.querySelector('.h-row-label'), lab = tb(labEl), ans = tb(row.querySelector('.h-row-values'));
          if (row.querySelectorAll('.h-row-values li').length < ans.lines) out.multi++;
          const rc = getComputedStyle(row); if (rc.borderTopStyle !== 'none' && parseFloat(rc.borderTopWidth) > 0) out.dashed++;
          const lc = getComputedStyle(labEl); out.ul.push([lc.textDecorationLine, lc.textDecorationStyle, lc.textDecorationColor, lc.textDecorationThickness].join(' '));
          out.la.push(Math.round(ans.top - lab.bottom));
          if (i < rows.length - 1) out.next.push(Math.round(tb(rows[i + 1].querySelector('.h-row-label')).top - ans.bottom)); }); });
      const first = (box) => { const t = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.data.trim() ? 1 : 3 }); return t.nextNode().parentElement; };
      ['concern', 'values', 'message', 'action'].forEach((k) => out.head.push(Math.round(tb(first(document.getElementById('h-' + k))).top - tb(document.querySelector('#h-sec-' + k + ' .h-hl')).bottom)));
      const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      return { ...out, label: lum(getComputedStyle(document.querySelector('.h-row-label')).color), value: lum(getComputedStyle(document.querySelector('.h-row-values li')).color), soft: lum(getComputedStyle(document.documentElement).getPropertyValue('--ink-soft').trim().replace(/^#(..)(..)(..)$/, (m, a, b, c) => 'rgb(' + parseInt(a, 16) + ',' + parseInt(b, 16) + ',' + parseInt(c, 16) + ')')) };
    });
    const same = (a) => a.length > 0 && a.every((x) => x === a[0]);
    check(w + 'px：結果の余白がそろう（質問→回答・回答→次の質問、複数行の回答を含む）・項目の間に点線はない', same(m.la) && same(m.next) && m.next[0] > m.la[0] + 8 && m.dashed === 0 && (w > 320 || m.multi > 0), JSON.stringify({ la: m.la, next: m.next, dashed: m.dashed, multi: m.multi }));
    check(w + 'px：質問ラベルに細いラベンダーの実線（1px）', m.ul.length > 0 && m.ul.every((x) => x === 'underline solid rgb(197, 180, 240) 1px'), m.ul[0]);
    check(w + 'px：大見出し→最初の文章の余白が4カードとも 24px', m.head.length === 4 && m.head.every((x) => x === 24), JSON.stringify(m.head));
    check(w + 'px：質問ラベルは前（--ink-soft）より濃く、回答より薄い', m.label < m.soft && m.label > m.value, JSON.stringify(m));
    await p.context().close();
  }

  // 7d) 整理中の画面：約3秒（動きを減らす設定では静止・約0.3秒）・計算と保存は1回・連打・再読み込み・保存済みの結果は演出なし
  {
    const countWrites = (key) => { window.__resultWrites = 0; const o = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === key && String(v).includes('"phase":"result"')) window.__resultWrites++; return o.call(this, k, v); }; };
    const p = await open({ time: new Date('2026-11-17T10:00:00+09:00') });
    await p.addInitScript(countWrites, KEY); await p.goto(H);
    await p.click('#h-start'); await answerQ1toQ6(p); await p.click('#h-q7-plus');
    await p.locator('#h-next').dblclick(); await p.click('#h-q7-skip', { force: true }).catch(() => {});
    const l0 = { loading: await p.isVisible('#h-loading'), text: await p.textContent('#h-loading-text'), art: await p.isVisible('.h-loading-art'), result: await p.isVisible('#h-result') };
    check('整理中：［整理した結果を見る］で整理中の画面（文・ルナ）', l0.loading && l0.text === 'ルナが、あなたの気持ちを整理しています……' && l0.art && !l0.result, JSON.stringify(l0));
    const st = JSON.parse(await stored(p));
    check('整理中：結果は押した時点で1回だけ作って保存（連打・スキップを重ねても1回、Q7 は回答のまま）', (await p.evaluate(() => window.__resultWrites)) === 1 && st.phase === 'result' && st.answers.q7 === 6, String(await p.evaluate(() => window.__resultWrites)));
    const anim = await p.evaluate(() => getComputedStyle(document.querySelector('.h-loading-art')).animationName);
    await p.clock.runFor(2800);
    check('整理中：約3秒のあいだは整理中のまま（ルナがふわっと動く）', await p.isVisible('#h-loading') && !(await p.isVisible('#h-result')) && anim === 'floaty', anim);
    await p.clock.runFor(300);
    check('整理中：約3秒で結果へ', await p.isVisible('#h-result') && !(await p.isVisible('#h-loading')) && (await p.evaluate(() => window.__resultWrites)) === 1);
    // 保存済みの結果を見返す：演出なし
    await p.reload();
    await p.evaluate(() => { window.__sawLoading = false; new MutationObserver(() => { if (!document.getElementById('h-loading').hidden) window.__sawLoading = true; }).observe(document.getElementById('h-loading'), { attributes: true }); });
    await p.click('#h-resume-main');
    check('保存済みの結果を見返す：整理中の画面なしですぐ表示', await p.isVisible('#h-result') && !(await p.evaluate(() => window.__sawLoading)));
    await p.context().close();
    // 整理中に再読み込み → 整理中で止まらず、前回の結果の案内
    const q = await open({ time: new Date('2026-11-17T10:00:00+09:00') });
    await q.goto(H); await q.click('#h-start'); await answerQ1toQ6(q); await q.click('#h-q7-skip');
    check('整理中：［答えずに結果を見る］からも整理中の画面', await q.isVisible('#h-loading') && JSON.parse(await stored(q)).answers.q7 === null);
    await q.reload();
    check('整理中に再読み込み：整理中の画面で止まらず、前回の結果の案内が出る', !(await q.isVisible('#h-loading')) && (await q.textContent('#h-resume-text')) === D.ui.resumeResult);
    await q.context().close();
    // 動きを減らす設定：静止・約0.3秒
    const r = await open({ reduce: true, time: new Date('2026-11-17T10:00:00+09:00') });
    await r.goto(H); await r.click('#h-start'); await answerQ1toQ6(r); await r.click('#h-q7-skip');
    const ra = await r.evaluate(() => [...document.querySelectorAll('#h-loading, #h-loading *')].map((e) => getComputedStyle(e).animationName).filter((n) => n !== 'none'));
    check('動きを減らす設定：整理中は静止', await r.isVisible('#h-loading') && ra.length === 0, ra.join(','));
    await r.clock.runFor(250);
    const still = await r.isVisible('#h-loading');
    await r.clock.runFor(100);
    check('動きを減らす設定：約0.3秒で結果へ', still && await r.isVisible('#h-result'));
    await r.context().close();
  }

  // 8) トップと診断結果画面の入口（未診断・診断済みのどちらでも、診断カードの直後）
  {
    const order = (p) => p.evaluate(() => [...document.querySelectorAll('#screen-top > section, #screen-top > button')].map((e) => e.id).filter(Boolean));
    const p = await open();
    await p.goto(BASE);
    const o1 = await order(p);
    check('トップ（未診断）：診断カード → 今日の占い → こころ整理', o1.indexOf('daily-entry') === o1.indexOf('type-card') + 1 && o1.indexOf('heart-entry') === o1.indexOf('daily-entry') + 1, o1.join(','));
    check('トップ：こころ整理は「今日の推し活占い」と「今日の一枚タロット」の間に入らない', await p.evaluate(() => !document.getElementById('daily-entry').contains(document.getElementById('heart-entry')) &&
      document.getElementById('tarot-entry').getBoundingClientRect().bottom < document.getElementById('heart-entry').getBoundingClientRect().top));
    await p.locator('#screen-top').screenshot({ path: OUT + '/top-order-new.png' });
    await p.evaluate(() => localStorage.setItem('oshi-luna-type', JSON.stringify({ version: 2, type: 'research', sub: null, answers: [], date: '2026-11-16' })));
    await p.reload();
    const o2 = await order(p);
    check('トップ（診断済み）：今日の占い → こころ整理 → 診断カード', o2.indexOf('heart-entry') === o2.indexOf('daily-entry') + 1 && o2.indexOf('type-card') === o2.indexOf('heart-entry') + 1, o2.join(','));
    await p.locator('#screen-top').screenshot({ path: OUT + '/top-order-done.png' });
    await p.locator('#heart-entry').screenshot({ path: OUT + '/top-entry.png' });
    await p.click('#mytype-btn'); await p.waitForTimeout(600);
    check('診断結果画面：お守りの後に小さな入口', await p.isVisible('.heart-invite') && (await p.textContent('.heart-invite-link')) === 'ルナのこころ整理へ');
    await p.locator('.heart-invite').screenshot({ path: OUT + '/result-entry.png' });
    await p.click('.heart-invite-link'); await p.waitForURL(/\/heart\/$/);
    check('入口から /heart/ へ', /\/heart\/$/.test(p.url()) && await p.isVisible('#h-intro'));
    await p.context().close();
  }

  // 9) オフライン：Service Worker が /heart/ を保存し、オフラインでもこのページを開ける（回答はキャッシュに入れない）
  {
    const p = await open({ sw: 'allow' });
    await p.goto(BASE); await p.evaluate(() => navigator.serviceWorker.ready);
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) { ok = await p.evaluate(async () => !!(await caches.match('heart/')) && !!(await caches.match('images/heart/luna-face-05.png'))); if (!ok) await p.waitForTimeout(250); }
    await p.goto(H); await p.click('#h-start'); await pick(p, ['チケットの申込み']);
    await p.context().setOffline(true);
    await p.goto(H).catch(() => {});
    const offline = await p.evaluate(() => ({ title: document.title, resume: document.getElementById('h-resume') && document.getElementById('h-resume-text').textContent }));
    await p.context().setOffline(false);
    const cached = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) { const t = await (await c.match(r)).text().catch(() => ''); if (t.includes('oshi-luna-heart-state-v1') && !/\.js$/.test(r.url)) out.push(r.url); } } return out; });
    check('オフライン：/heart/ を開けて、保存した回答から続きの案内が出る', ok && offline.title.startsWith('ルナのこころ整理') && offline.resume === D.ui.resumeProgress, JSON.stringify(offline));
    check('回答はキャッシュに入れない（ページ・画像のみ）', cached.length === 0, cached.join(','));
    await p.context().close();
  }

  // 10) 保存領域の読取・削除の失敗と回復（レビュー指摘の2件の再発防止）
  {
    const OLD = JSON.stringify({ schemaVersion: 1, questionVersion: 1, resultVersion: 1, phase: 'question', questionId: 'q2',
      answers: Object.assign(R.emptyAnswers(), { q1: 'ticket' }), resultSnapshot: null, resultDate: null });
    // A. 既存の保存内容があり、起動時の最初の読取だけ失敗する（その後は読み書きできる）
    const pA = await (async () => {
      const ctx = await b.newContext({ ...devices['iPhone 13'], timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
      ctx.on('request', (r) => { let from = ''; try { from = r.frame().url(); } catch (e) { from = ''; } if (from.includes('/heart/') && !r.url().startsWith(BASE)) external.push(r.url()); });
      const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
      await p.addInitScript(({ key, old }) => {
        if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, old); }
        if (sessionStorage.getItem('noThrow')) return;
        const orig = Storage.prototype.getItem; let first = true;
        Storage.prototype.getItem = function (k) { if (k === key && first) { first = false; throw new Error('SecurityError'); } return orig.call(this, k); };
      }, { key: KEY, old: OLD });
      return p;
    })();
    await pA.goto(H);
    check('起動時に読めない：保存なしと決めつけず、開始前の画面（続きの案内は出さない）', await pA.isVisible('#h-intro') && !(await pA.isVisible('#h-resume')));
    await pA.click('#h-start'); await pick(pA, ['遠征に行くかどうか']); await next(pA); await pick(pA, ['疲れた']);
    check('起動時に読めない → 質問に答えても、既存の保存内容を上書きしない', (await stored(pA)) === OLD);
    check('起動時に読めない → 保存できなかった案内を出し、そのまま使える', await pA.isVisible('#h-save-failed') && (await pA.textContent('#h-save-failed')) === D.ui.saveFailed && await pA.isEnabled('#h-next'));
    await pA.evaluate(() => sessionStorage.setItem('noThrow', '1')); await pA.reload();
    check('読めるようになったら、前回の保存内容から続きの案内が出る（元の回答のまま）', (await pA.textContent('#h-resume-text')) === D.ui.resumeProgress && JSON.parse(await stored(pA)).answers.q1 === 'ticket');
    await pA.context().close();

    // B. 以前の保存内容があり、保存領域にまったく入れない：削除は失敗として扱い、画面も保存内容もそのまま
    const ctxB = await b.newContext({ ...devices['iPhone 13'], timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
    const pB = await ctxB.newPage(); pB.on('pageerror', (e) => errs.push(e.message));
    await pB.addInitScript(({ key, old }) => {
      if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, old); }
      const P = Storage.prototype; window.__orig = { get: P.getItem, set: P.setItem, remove: P.removeItem };
      P.getItem = function (k) { if (k === key) throw new Error('SecurityError'); return window.__orig.get.call(this, k); };
      P.setItem = function (k, v) { if (k === key) throw new Error('SecurityError'); return window.__orig.set.call(this, k, v); };
      P.removeItem = function (k) { if (k === key) throw new Error('SecurityError'); return window.__orig.remove.call(this, k); };
    }, { key: KEY, old: OLD });
    await pB.goto(H); await pB.click('#h-start'); await answerQ1toQ6(pB); await pB.click('#h-q7-skip');
    await pB.waitForSelector('#h-result:not([hidden])');
    await pB.click('#h-result-delete'); await pB.click('#h-confirm-yes');
    const rawB = await pB.evaluate((k) => window.__orig.get.call(localStorage, k), KEY);
    check('保存領域に入れない：［消して最初から］は失敗の案内（完了扱いにしない）', await pB.isVisible('#h-confirm') && (await pB.textContent('#h-confirm-error')) === 'この端末に保存した内容を消せませんでした。');
    check('保存領域に入れない：以前の保存内容は残り、画面の結果もそのまま', rawB === OLD && await pB.isVisible('#h-result') && !(await pB.isVisible('#h-intro')));
    if (await pB.isVisible('#h-confirm')) await pB.click('#h-confirm-no'); // 失敗したとき（確認が閉じてしまったとき）も止まらないように
    check('キャンセルで確認を閉じると、結果の画面に戻る', !(await pB.isVisible('#h-confirm')) && await pB.isVisible('#h-result'));
    await ctxB.close();

    // C. 削除が反映されない（removeItem が何もしない）／D. 削除のあと読めない
    for (const [label, patch] of [
      ['削除が反映されない', (k) => { Storage.prototype.removeItem = function () {}; }],
      ['削除のあと読めない', (k) => { const o = { get: Storage.prototype.getItem, remove: Storage.prototype.removeItem }; let broke = false;
        Storage.prototype.removeItem = function (key) { o.remove.call(this, key); broke = true; };
        Storage.prototype.getItem = function (key) { if (broke && key === k) throw new Error('SecurityError'); return o.get.call(this, key); }; }]
    ]) {
      const p = await open();
      await p.goto(H); await p.click('#h-start'); await answerQ1toQ6(p); await p.click('#h-q7-skip');
      await p.waitForSelector('#h-result:not([hidden])');
      const before = await stored(p);
      await p.evaluate(patch, KEY);
      await p.click('#h-again'); await p.click('#h-confirm-yes');
      check(label + '：完了扱いにせず失敗の案内・画面の結果はそのまま', await p.isVisible('#h-confirm') && (await p.textContent('#h-confirm-error')) === 'この端末に保存した内容を消せませんでした。' && await p.isVisible('#h-result'));
      if (label === '削除が反映されない') check(label + '：保存内容は残る', (await stored(p)) === before);
      await p.context().close();
    }
  }

  await b.close();
  check('外部への通信なし（解析・外部サービスへ送らない）', external.length === 0, external.slice(0, 3).join(' | '));
  check('エラーなし', errs.length === 0, errs.slice(0, 5).join(' | '));
  for (const r of res) console.log(r[0], r[1], r[2] ? '｜' + r[2] : '');
  const fails = res.filter((r) => r[0] === 'FAIL').length;
  console.log(fails + ' FAIL / ' + res.length);
  if (server) server.close();
  if (!KEEP) fs.rmSync(OUT, { recursive: true, force: true });
  process.exitCode = fails ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
