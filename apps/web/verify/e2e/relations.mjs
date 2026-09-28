/**
 * 走查：**关系层**（U19）在真浏览器里的样子 —— 用户的原始剧本。
 *
 * 用户的投诉原话："我创建了 f: S₄\\to S₃ 的满同态，设出了 K = ker(f)，第一个问题：
 * K 是什么？(…) 第三个问题，我想拉个箭头表示 A₄ 和 K 的包含关系，但做不到"。
 *
 * 这一套就照着他那条路走一遍，验"关系"那一节真的把话说了：
 *   - K 的面板：`K = ker f` \\cdot \\trianglelefteq S₄ \\cdot 指数 24 / 4 = 6
 *   - K 的面板：`K \\le A`（V₄ \\le A₄）\\cdot 指数 12 / 4 = 3 \\cdot \\trianglelefteq 正规
 *   - A 的面板：`A \\le G`（A₄ \\le S₄）\\cdot 指数 24 / 12 = 2 \\cdot \\trianglelefteq 正规
 *   - 边界声明：只列"已经建出来"的对象
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/relations.mjs`
 */
const PW = 'file:///C:/newproject/GroupViz/node_modules/playwright/index.mjs'
const BASE = process.env.GAL_BASE ?? 'http://127.0.0.1:5273'

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) {
    pass++
    console.log(`  PASS  ${name}`)
  } else {
    fail++
    console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ''}`)
  }
}

const { chromium } = await import(PW)
const browser = await chromium.launch({ args: ['--no-proxy-server'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const logs = []
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

/* ── 输入辅助（与 usability-fixes.mjs 同一套约定） ──────── */

const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(220)
  }
}

const addLine = async (name, expr) => {
  await ensureCard()
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(200)
  const btn = page.locator('.composer-orb .composer-row button')
  if (await btn.isDisabled()) {
    const st = await page.evaluate(() => document.querySelector('.composer-status')?.textContent ?? '')
    console.log(`    [blocked] name=${JSON.stringify(name)} status=${JSON.stringify(st)}`)
    return false
  }
  await btn.click()
  await page.waitForTimeout(320)
  return true
}

/** 左上是两个抽屉：「操作」放 derived（映射 / 核 / 像都在这里），收起时 body 不渲染。 */
const ensureOpsDock = async () => {
  const body = '.dock:has(.dock-title:text-is("操作")) .dock-body'
  if ((await page.locator(body).count()) === 0) {
    await page.locator('.dock-toggle:has-text("操作")').first().click()
    await page.waitForTimeout(260)
  }
}

/** 按 `.row-name` 里的对象 id 匹配（展示形态与 id 不同，文本包含会匹错）。 */
const clickRow = async (id) => {
  await ensureOpsDock()
  return page.evaluate((want) => {
    const rows = [...document.querySelectorAll('.dock-topleft .row-click')]
    const hit = rows.find((r) => r.querySelector('.row-name')?.textContent?.trim() === want)
    if (!hit) return false
    hit.click()
    return true
  }, id)
}

/** 关系那一节的读数：tag 是纯文本标签，body 走 KaTeX（要把零宽字符与空白抹掉再比）。 */
const relState = () =>
  page.evaluate(() => {
    const clean = (s) => (s ?? '').replace(/[\u200b\u2061\u2062]/g, '').replace(/\s+/g, '')
    return {
      has: document.querySelectorAll('.relations').length > 0,
      tags: [...document.querySelectorAll('.rel-tag')].map((e) => e.textContent.trim()),
      bodies: [...document.querySelectorAll('.rel-body')].map((e) => clean(e.textContent)),
      // 附注读 `data-detail`（**原始形态**）：DOM 文本是 KaTeX 渲染后的结果，
      // 而且 `clean()` 会抹掉空白 —— `	rianglelefteq S_4` 那一个空格正是要比的东西
      details: [...document.querySelectorAll('.rel-detail')].map(
        (e) => e.dataset.detail ?? clean(e.textContent),
      ),
      note: clean(document.querySelector('.rel-note')?.textContent),
    }
  })

/** 只抹空白 —— 原始形态里 `24 / 4 = 6` 的空格是排版，比的时候得忽略。 */
const sq = (s) => String(s ?? '').replace(/\s+/g, '')

/* ══ 剧本：S₄ \\twoheadrightarrow S₃，取核，再手打 A₄ ═══════════════════ */

await addLine('G', 'S_4')
await addLine('H', 'S_3')
await addLine('f', '映射(G, H, s12->23, c->13)')
await addLine('K', 'ker(f)')
await addLine('A', 'A_4')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

const errs = await page.evaluate(() =>
  [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()),
)
ok('五行全部求值成功（含 S_4 ->> S_3 那个同态）', errs.length === 0, JSON.stringify(errs))

/* ══ K 的面板：核 + 子群关系 ═════════════════════════════ */

ok('点得中 K 那一行', await clickRow('K'))
await page.waitForTimeout(400)
const K = await relState()
ok('K 的面板里有「关系」节', K.has, JSON.stringify(K))
ok('关系里有一条「核」', K.tags.includes('核'), K.tags.join(','))
ok(
  '核那一行写着 K = ker f',
  K.bodies.some((b) => b.includes('K=kerf')),
  JSON.stringify(K.bodies),
)
ok(
  '核的附注说了「\\trianglelefteq S_4」与手算的 24 / 4 = 6',
  K.details.some((d) => d.includes('\\trianglelefteq S_4') && sq(d).includes('24/4=6')),
  JSON.stringify(K.details),
)
ok('关系里有一条「子群」（K \\le A_4）', K.tags.includes('子群'), K.tags.join(','))
ok(
  'K \\le A_4 那一行手算对上了 12 / 4 = 3 且判了 \\trianglelefteq 正规',
  K.details.some((d) => sq(d).includes('12/4=3') && d.includes('\\trianglelefteq 正规')),
  JSON.stringify(K.details),
)

await page.screenshot({ path: '../../docs/assets/u19-relations-ker.png' })

/* ══ A 的面板：包含 ══════════════════════════════════════ */

ok('点得中 A 那一行', await clickRow('A'))
await page.waitForTimeout(400)
const A = await relState()
ok(
  'A 的面板里列出 A \\le G（两个独立声明的群之间的包含）',
  A.details.some((d) => sq(d).includes('24/12=2')),
  JSON.stringify(A.details),
)
ok(
  '并且判出 \\trianglelefteq 正规（指数 2 的子群必正规）',
  A.details.some((d) => sq(d).includes('24/12=2') && d.includes('\\trianglelefteq 正规')),
  JSON.stringify(A.details),
)
ok(
  '边界声明在（只列已经建出来的对象）',
  A.note.includes('已经建出来') && A.note.includes('子群'),
  A.note,
)

/* ══ H（S₃）：派生出 f ══════════════════════════════════ */

ok('点得中 H 那一行', await clickRow('H'))
await page.waitForTimeout(400)
const H = await relState()
ok(
  'S_3 的面板里列出"谁由我而来"（f 的靶）',
  H.tags.includes('派生') && H.details.some((d) => d.includes('map')),
  JSON.stringify(H),
)

await page.screenshot({ path: '../../docs/assets/u19-relations-derive.png' })

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
