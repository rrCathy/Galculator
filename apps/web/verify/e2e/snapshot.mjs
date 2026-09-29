/**
 * 走查：**视图快照**（缺口 ⑫）—— 用户实测反馈的第 1 条。
 *
 * 用户原话："可以把视图保存起来，下次打开网站还能导入视图"。
 *
 * 语义层（`verify/suites/snapshot.ts`）只能验"文本写出来又读回来不丢东西"，
 * 验不了这一条里**最要紧的那半**：贴回来之后，画布上**节点的位置**是不是原来那张图。
 * 所以这份走最真实的路径：
 *
 *   建图 \to 拖一个节点（钉住）\to 平移画布（视口归用户）\to 记下这个节点的屏幕位置
 *   \to 导出快照 \to **把图改掉**（加一行 + 删掉）\to 贴回快照 \to 位置必须分毫不差地回来
 *
 * 为什么"屏幕位置"而不是"世界坐标"：世界坐标只验了钉住，屏幕位置把
 * **钉住 + 视口（pan/zoom）**一起验了 —— 那两样正是快照要装的东西。
 *
 * 还顺手钉住坏快照的行为：报错、且**不动当前的图**。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/snapshot.mjs`
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

/* ══ 小工具 ══════════════════════════════════════════════ */

/** 定义行（底部输入球）。与 copy-label / grid-drag 同一套动作。 */
const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(220)
  }
}
const addLine = async (name, expr) => {
  await ensureCard()
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(180)
  const btn = page.locator('.composer-orb .composer-row button')
  if (await btn.isDisabled()) return false
  await btn.click()
  await page.waitForTimeout(320)
  return true
}
const closeCard = async () => {
  if ((await page.locator('.composer-card').count()) > 0) {
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(200)
  }
}

/**
 * 画布上现在有哪些节点（对象 id）。
 *
 * **不数对象区那两行**：手写的 `Q = G / K` 会被归到「操作」抽屉（`origin = 'derived'`），
 * 只数对象区就少一个（实测踩过：明明三行，对象区只有 2）。画布才是"图"本身。
 */
const graphIds = () =>
  page.$$eval('svg.canvas g.gnode', (els) =>
    els.map((e) => e.getAttribute('data-id') ?? '').filter(Boolean),
  )

/** 某个节点在**屏幕**坐标里的中心（拖动与断言都用它）。 */
const nodeScreen = (id) =>
  page.evaluate((want) => {
    const g = document.querySelector(`g.gnode[data-id="${want}"]`)
    if (!g) return null
    const r = g.querySelector('.gnode-hit')?.getBoundingClientRect() ?? g.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, id)

/** 真鼠标拖（down \to 分步 move \to up）。 */
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await page.waitForTimeout(10)
  }
  await page.mouse.up()
  await page.waitForTimeout(340)
}

const openSnap = async () => {
  await page.click('button:has-text("视图快照")')
  await page.waitForSelector('.snap-card', { timeout: 10000 })
}
const clickIn = async (label) => {
  await page.click(`.snap-card button:has-text("${label}")`)
  await page.waitForTimeout(320)
}

/* ══ 场地 ═══════════════════════════════════════════════ */

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1300)

// 空画布时整条工具条不渲染 —— 所以入口是 `canvas-empty` 里那颗按钮（空画布最需要导入）
ok('空画布上也有「视图快照」入口', (await page.locator('button:has-text("视图快照")').count()) === 1)

await addLine('G', 'S_4')
await addLine('K', 'A_4')
await addLine('Q', 'G / K')
await closeCard()
await page.waitForTimeout(400)

// 有了图之后入口回到工具条上（这一条钉的是"两个入场都够得着"）
ok('有图时工具条上也有「视图快照」', (await page.locator('.canvas-toolbar button:has-text("视图快照")').count()) === 1)

const built = await graphIds()
ok('画布上长出了三个节点', built.length === 3, built.join(','))
ok('三个节点就是 G / K / Q', ['G', 'K', 'Q'].every((n) => built.includes(n)), built.join(','))

/* ── 把图弄成"用户自己的样子"：钉住一个节点 + 平移画布 ────── */

const q0 = await nodeScreen('Q')
ok('找得到 Q 这个节点', !!q0)
await drag(q0, { x: q0.x + 150, y: q0.y + 96 })

// 平移：在空白处拖（不能落在节点或浮层上）
const blank = await page.evaluate(() => {
  const w = window.innerWidth
  const h = window.innerHeight
  for (const p of [
    { x: w * 0.72, y: h * 0.34 },
    { x: w * 0.78, y: h * 0.62 },
    { x: w * 0.6, y: h * 0.78 },
  ]) {
    const el = document.elementFromPoint(p.x, p.y)
    if (el && (el.closest('g.gnode') || el.closest('.canvas-toolbar') || el.closest('.dock-topleft') || el.closest('.snap-card'))) continue
    return p
  }
  return null
})
ok('找到一块空白来平移画布', !!blank)
if (blank) await drag(blank, { x: blank.x - 90, y: blank.y - 40 })

const before = await nodeScreen('Q')

/* ── 导出 ─────────────────────────────────────────────── */

await openSnap()
await clickIn('生成当前视图')

const text = await page.inputValue('.snap-text')
let snap = null
try {
  snap = JSON.parse(text)
} catch {
  snap = null
}
ok('导出的是一段能解析的 JSON', !!snap, text.slice(0, 60))
if (snap) {
  ok('快照带上了三行定义', Array.isArray(snap.lines) && snap.lines.length === 3, String(snap.lines?.length))
  ok('快照里的定义行逐字就是这三行', (snap.lines ?? []).join(' | ') === 'G = S_4 | K = A_4 | Q = G / K', (snap.lines ?? []).join(' | '))
  ok('快照记下了被钉住的 Q', !!snap.pins && typeof snap.pins.Q?.x === 'number', JSON.stringify(snap.pins))
  ok('快照记下了用户平移过的视口', !!snap.view && typeof snap.view.k === 'number', JSON.stringify(snap.view))
}

await page.click('.snap-x')
await page.waitForTimeout(220)

/* ── 把图改掉：加一行、再删一行 ────────────────────────── */

await addLine('X', 'C_6')
await closeCard()
await page.waitForTimeout(400)
const changed = await graphIds()
ok('图确实被改掉了（多了 X）', changed.includes('X'), changed.join(','))

/* ── 贴回来 ───────────────────────────────────────────── */

await openSnap()
const kept = await page.inputValue('.snap-text')
ok('卡片关掉再打开，框里的快照还在', kept === text)

await clickIn('应用快照')
await page.waitForTimeout(500)

const restored = await graphIds()
ok('节点数回到三个', restored.length === 3, restored.join(','))
ok('X 被撤掉了', !restored.includes('X'), restored.join(','))
ok('三个节点还是原来那三个', ['G', 'K', 'Q'].every((n) => restored.includes(n)), restored.join(','))

const after = await nodeScreen('Q')
ok('Q 回到了拖动后的屏幕位置（钉住 + 视口一起回来了）', !!after && !!before && Math.hypot(after.x - before.x, after.y - before.y) < 1.5,
  `before=${before && `${before.x.toFixed(1)},${before.y.toFixed(1)}`} after=${after && `${after.x.toFixed(1)},${after.y.toFixed(1)}`}`)

/* ── 坏快照：报错，且不动当前的图 ──────────────────────── */

await page.fill('.snap-text', '{ 这不是一个快照')
await clickIn('应用快照')
const errText = (await page.textContent('.snap-err').catch(() => '')) ?? ''
ok('坏快照报出原因', errText.includes('JSON'), errText)
const afterBad = await graphIds()
ok('坏快照没有动当前的图', afterBad.length === 3 && !afterBad.includes('X'), afterBad.join(','))

// 提示语也得守"键盘打得出来"那条纪律（它就是给用户看的）
const BANNED = /[^\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const snapVisible = await page.evaluate(() => {
  const card = document.querySelector('.snap-card')
  if (!card) return ''
  const parts = [card.textContent ?? '']
  for (const el of card.querySelectorAll('[title], [placeholder], [aria-label]')) {
    for (const a of ['title', 'placeholder', 'aria-label']) parts.push(el.getAttribute(a) ?? '')
  }
  return parts.join(' ')
})
ok('卡片上的文案没有键盘打不出的字符', !BANNED.test(snapVisible), [...new Set([...snapVisible].filter((c) => BANNED.test(c)))].join(''))

ok('控制台零错误', logs.length === 0, logs.slice(0, 3).join(' | '))

console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)

await browser.close()
process.exitCode = fail > 0 ? 1 : 0
