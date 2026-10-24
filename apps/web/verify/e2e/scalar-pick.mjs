/**
 * 走查：**补参条的标量候选**（U8-b，2026-10-23）—— 把"手打元素记号"换成"点着选"。
 *
 * ## 这一套守的是 U8 那句话的最后一块
 *
 * 「点着就能做，不用记语法」。菜单早就列全了，卡壳的地方一直是**标量参数**：
 * `ord(G, ▢)` 那个 ▢ 从前是个空 input，用户得先知道「`S_3` 的对换叫 `12`」——
 * 而这个记号只在元素表里出现过，选 op 的那一刻看不到。
 *
 * ## 守的七件事
 *   ① `element` 位：按**阶升序**列出上下文群的元素（单位元在最前，常用的就在眼前）；
 *   ② 默认值给 `e`（不是 `1`）且对应的 chip 高亮 —— `1` 在 `S_3` 里根本不是元素；
 *   ③ **单标量位点 chip 就执行**（`ord`/`Syl`/`pointSet` 都是这种），值落进数值区；
 *   ④ `prime` 位：列出 ≤ |G| 的素数（`S_3` ⇒ 2、3）；
 *   ⑤ **没有上下文群就不列候选**（`pointSet(n)` 的 n 无上限，列 2/3/5 会教错）；
 *   ⑥ 搜索能按标号筛（`(12)` 与 `12` 都算命中）；
 *   ⑦ 文案零泄漏 + 全程零 console 错误。
 *
 * 跑法（先起 dev server 5273，**cwd 必须是 apps/web**）：`node verify/e2e/scalar-pick.mjs`
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
page.setDefaultTimeout(6000)

const ALLOWED = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const badChars = (s) => [...new Set([...String(s ?? '')].filter((c) => !ALLOWED.test(c)))]
const clean = (s) => String(s ?? '').replace(/[\u200b-\u200f\u00a0]/g, '').replace(/\s+/g, ' ').trim()

const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) > 0) return
  await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
  await page.click('.composer-orb .orb-center')
  await page.waitForTimeout(220)
}
const addLine = async (name, expr) => {
  await ensureCard()
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(200)
  await page.locator('.composer-orb .composer-row button').click()
  await page.waitForTimeout(450)
}

/**
 * 点节点拿焦点（**动态算坐标**）。
 *
 * 两个坑都在这儿：
 *   ① 输入球的「添加」只 `setLines`，**不设焦点**（`App` 的 `onAdd`）——
 *      所以 `addLine` 之后焦点还是空的，必须点节点；
 *   ② 坐标不能用开头算的那一份 —— 补参条出现、工作台升降都会挪布局。
 */
const focusNode = async (id) => {
  /**
   * ⚠️ **先收台再点节点**：工作台升起时盖住画布下半部分，而 `derive` 排出来的
   * 第二、三个节点经常正好落在台里 —— 真实鼠标会点到台面板上（这不是 bug，
   * 是遮挡；`workbench.mjs#focusViaNode` 从 2026-10-05 起就守着这一条）。
   */
  const benchOpen = await page.evaluate(() => / open/.test(document.querySelector('.bench')?.className ?? ''))
  if (benchOpen) {
    await page.click('.bench-toggle')
    await page.waitForTimeout(420)
  }
  const p = await page.evaluate((nid) => {
    const el = document.querySelector(`svg.canvas g.gnode[data-id="${nid}"] .gnode-hit`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, id)
  if (!p) return false
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(480)
  return true
}

/** 从操作表开一个 op（比记键盘位置稳） */
const openOp = async (opId) => {
  if (!(await page.evaluate(() => !!document.querySelector('.optable')))) {
    await page.click('[aria-label="操作表"]')
    await page.waitForTimeout(320)
  }
  await page.click(`.optable-row[data-op="${opId}"]`)
  await page.waitForTimeout(560)
}

const fillInfo = () =>
  page.evaluate(() => {
    const chips = [...document.querySelectorAll('.fill-chip')]
    return {
      bar: !!document.querySelector('.pending-bar'),
      chips: chips.map((c) => c.textContent.trim()),
      onChip: document.querySelector('.fill-chip.on')?.textContent?.trim() ?? '',
      input: document.querySelector('.fill-elem input, .fill-field input')?.value ?? '',
      hasSearch: !!document.querySelector('.fill-search'),
      hasStep: !!document.querySelector('.fill-step'),
      barText: document.querySelector('.pending-bar')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    }
  })

/* ══ 场景 1：元素候选 ═══════════════════════════════════ */

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(700)
await addLine('G', 'S_3')

await focusNode('G')

await openOp('elementOrder')
let f = await fillInfo()
ok('ord(G, ▢) 进补参条', f.bar === true, f.barText.slice(0, 60))
ok('S_3 的 6 个元素全列出来', f.chips.length === 6, JSON.stringify(f.chips))
ok(
  '按阶升序：单位元在最前，然后 3 个对换，最后两个 3-循环',
  JSON.stringify(f.chips) === JSON.stringify(['e', '(12)', '(13)', '(23)', '(123)', '(132)']),
  JSON.stringify(f.chips),
)
/**
 * **默认值给 `e` 而不是 `1`**：`1` 在 `S_3` 里不是元素，从前点「执行」直接报
 * 「没有元素 1」。这一条同时钉住"默认值与候选对得上"（chip 高亮）。
 */
ok('默认值是 e（不是 1）', f.input === 'e', f.input)
ok('…且对应的 chip 高亮', f.onChip === 'e', f.onChip)
ok('带搜索框', f.hasSearch === true)

/* ══ 场景 2：点 chip 直接执行（单标量位）═══════════════════ */

await page.click('.fill-chip:nth-of-type(2)') // (12)
await page.waitForTimeout(760)
const done = await page.evaluate(() => ({
  bar: !!document.querySelector('.pending-bar'),
  nums: [...document.querySelectorAll('.num-row')].map((r) => ({
    label: r.querySelector('.num-label')?.textContent?.trim() ?? '',
    value: r.querySelector('.num-value')?.textContent?.trim() ?? '',
  })),
}))
ok('点 chip 后补参条收起（单标量位 ⇒ 直接执行）', !done.bar, JSON.stringify(done))
ok(
  '…结果进了数值区：ord(S_3, (12)) = 2',
  done.nums.some((n) => n.value === '2'),
  JSON.stringify(done.nums),
)

/* ══ 场景 3：搜索 ═══════════════════════════════════════ */

/**
 * 换一个新群拿焦点：`addLine` 成功时 `commitExpr` 会把焦点切到新对象
 * （`setInter({kind:'selected'})`），不必点节点 —— 这样也不受上一场景
 * "结果数值占着焦点"的影响。
 */
await addLine('H', 'C_6')
await focusNode('H')
await openOp('elementOrder')
f = await fillInfo()
ok('C_6 的 6 个元素也全列出来', f.chips.length === 6, JSON.stringify(f.chips))
await page.fill('.fill-search', '3')
await page.waitForTimeout(320)
f = await fillInfo()
ok('搜索 3 之后只剩标号含 3 的候选', f.chips.length === 1 && f.chips[0] === '3', JSON.stringify(f.chips))
await page.fill('.fill-search', 'zzz')
await page.waitForTimeout(320)
f = await fillInfo()
ok('搜不到时说清楚（不是空白一片）', /没有匹配/.test(f.barText), f.barText.slice(0, 80))
await page.keyboard.press('Escape')
await page.waitForTimeout(260)

/* ══ 场景 4：素数候选 ═══════════════════════════════════ */

await addLine('K', 'C_6')
await focusNode('K')
await openOp('sylow')
f = await fillInfo()
/**
 * **不是"≤ |G| 的素数"，是 |G| 的素因子**：`C_6` 只该给 2 与 3。
 * 第一版给了 `2 3 5` —— 而 `Syl(C_6, 5)` 数学上不存在（5 不整除 6），
 * 列它等于诱导用户点下去再吃报错（这条就是走查抓出来的）。
 */
ok('Syl(C_6, ▢) 只列 |G| 的素因子（2、3，不含 5）', JSON.stringify(f.chips) === JSON.stringify(['2', '3']), JSON.stringify(f.chips))
ok('素数候选上没有搜索框（就那么几个）', f.hasSearch === false)
await page.keyboard.press('Escape')
await page.waitForTimeout(260)

/* ══ 场景 5：没有上下文群就不列候选 ═══════════════════════ */

await page.click('[aria-label="操作表"]')
await page.waitForTimeout(300)
await page.click('.optable-row[data-op="pointSet"]')
await page.waitForTimeout(560)
f = await fillInfo()
ok('pointSet(▢) 也进补参条（零对象但有标量位）', f.bar === true, f.barText.slice(0, 60))
ok('…但**不列任何候选**（n 无上限，列 2/3/5 会教错）', f.chips.length === 0, JSON.stringify(f.chips))
ok('…给的是步进 − / +', f.hasStep === true)

/* ══ 场景 6：纯算术也点得开（不是"去 ＋ 面板"）════════════ */

await page.keyboard.press('Escape')
await page.waitForTimeout(240)
await page.click('[aria-label="操作表"]')
await page.waitForTimeout(300)
const gcdRow = await page.evaluate(() => {
  const r = document.querySelector('.optable-row[data-op="gcd"]')
  return { state: r?.dataset.state ?? '', text: r?.querySelector('.optable-state')?.textContent?.trim() ?? '' }
})
ok('gcd 在表里标"填参数"（不是"＋ 面板造"）', gcdRow.state === 'fill' || /填参数/.test(gcdRow.text), JSON.stringify(gcdRow))
await page.click('.optable-row[data-op="gcd"]')
await page.waitForTimeout(520)
f = await fillInfo()
ok('点 gcd 真的进补参条（两位，都能填）', f.bar === true, f.barText.slice(0, 60))
ok('两位时不列候选、也不自动执行', f.chips.length === 0)

/* ══ 场景 7：纪律 ═══════════════════════════════════════ */

const leaks = await page.evaluate(() =>
  [...document.querySelectorAll('.pending-bar, .pending-bar *')].map((x) => x.textContent ?? ''),
)
ok('补参条文案零泄漏', leaks.every((t) => badChars(t).length === 0), JSON.stringify(leaks.filter((t) => badChars(t).length).slice(0, 3)))
ok('全程零 console 错误', logs.length === 0, logs.slice(0, 3).join(' | '))

console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0) process.exitCode = 1
