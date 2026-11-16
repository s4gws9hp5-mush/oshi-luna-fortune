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
    check('Q7：基準位置5は保存されない（開き直しても未回答）', (await q(p)) === '7／7' && (await p.textContent('#h-q7-value')) === '未回答' && JSON.parse(await stored(p)).answers.q7 === null && (await face()) === 'moon');
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
    check('結果：注意文・Coming Soon（料金・受付日・申込みリンクなし）', (await p.textContent('#h-result-notice')) === D.ui.resultNotice &&
      (await p.textContent('#h-soon')).includes('✨ 個別鑑定 Coming Soon') && (await p.locator('#h-soon a').count()) === 0 && !/円|￥|受付開始|申し込む/.test(await p.textContent('#h-soon')));
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
    await p.click('#h-start'); await answerQ1toQ6(p); await p.click('#h-q7-skip');
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
    await p.goto(H); await p.click('#h-start');
    check('保存があるときの「はじめる」も削除の確認へ（上書きしない）', await p.isVisible('#h-confirm'));
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
    await p.click('#h-soon button');
    const area = await p.evaluate(() => { const a = document.getElementById('h-copy-area-soon'); const t = a.querySelector('textarea'); return { msg: a.querySelector('.h-copy-status').textContent, text: t && t.value, ro: t && t.readOnly }; });
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

  // 8) トップと診断結果画面の入口（未診断・診断済みのどちらでも、診断カードの直後）
  {
    const order = (p) => p.evaluate(() => [...document.querySelectorAll('#screen-top > section, #screen-top > button')].map((e) => e.id).filter(Boolean));
    const p = await open();
    await p.goto(BASE);
    const o1 = await order(p);
    check('トップ（未診断）：診断カード → こころ整理 → 今日の占い', o1.indexOf('heart-entry') === o1.indexOf('type-card') + 1 && o1.indexOf('daily-entry') === o1.indexOf('heart-entry') + 1, o1.join(','));
    await p.evaluate(() => localStorage.setItem('oshi-luna-type', JSON.stringify({ version: 2, type: 'research', sub: null, answers: [], date: '2026-11-16' })));
    await p.reload();
    const o2 = await order(p);
    check('トップ（診断済み）：今日の占い → 診断カード → こころ整理', o2.indexOf('daily-entry') + 1 === o2.indexOf('type-card') && o2.indexOf('heart-entry') === o2.indexOf('type-card') + 1, o2.join(','));
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
