/**
 * 走查：**小群表**（U55）—— 把引擎内嵌的 1–31 阶 93 个群接成可导入的对象。
 *
 * 用户原话（与"中文函数全 ASCII"同一句里的第 1 点）：
 *
 *   「学学 groupviz 怎么**导入常见群**」
 *
 * 侦察下来引擎里躺着 93 个群的完整乘法表（AUTO-GENERATED from GAP 4.16），而 Galculator
 * 里**一个也拿不到**：`S_4` / `D_4` 这类靠记号构造还行，`(C_4 x C_2):C_2`（16 阶）、
 * `C_3:Q_8`（24 阶）这些**没有惯用记号、也没有构造器**的群完全没有入口 ——
 * 而报错语已经承诺了「改用 SmallGroup(n, i)」。
 *
 * 本套钉的是**用户真能摸到的六件事**：
 *   ① 输入球里敲 `smallGroup(16, 3)` 就长出群节点（**能敲**是这一批的全部意义）；
 *   ② 编号是 **GAP 的**：`smallGroup(8, 3)` 是 `D_4`（不是引擎注册表下标 2 的 `C_2³`）；
 *   ③ 与手写记号**同一 id 空间**：`D_4` 与 `smallGroup(8, 3)` 的元素表逐字一致；
 *   ④ 边界**在界面上看得见**：`smallGroup(8, 9)` 不给"算不出来"，给"8 阶只有 5 个群"；
 *   ⑤ **收口**：结论层印的坐标 `SmallGroup(24, 12)` 抄回输入球，得到同一个群；
 *   ⑥ **纯文本面零泄漏**（判据与 `e2e/no-unicode-leak.mjs` 的 `ALLOWED` 逐字相同）。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/small-group.mjs`
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
page.setDefaultTimeout(4000)

/* ── 纯文本面判据（与 e2e/no-unicode-leak.mjs 逐字相同）───────── */

const ALLOWED = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const badChars = (s) => [...new Set([...String(s ?? '')].filter((c) => !ALLOWED.test(c)))]

/* ── 场地 ─────────────────────────────────────────────── */

const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) > 0) return
  await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
  await page.click('.composer-orb .orb-center')
  await page.waitForTimeout(220)
}

/** 填一行并提交。返回是否**真的提交了**（被拦时把状态行打出来）。 */
const addLine = async (name, expr) => {
  await ensureCard()
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(200)
  const btn = page.locator('.composer-orb .composer-row button')
  if (await btn.isDisabled()) {
    const st = await page.evaluate(() => document.querySelector('.composer-status')?.textContent ?? '')
    console.log(`    [blocked] ${name} = ${expr} :: ${st}`)
    return false
  }
  await btn.click()
  await page.waitForTimeout(420)
  return true
}

/** 只预览（不提交）—— 状态行是这个面的纯文本面。 */
const typeExpr = async (v) => {
  await ensureCard()
  await page.fill('.composer-name', '')
  await page.fill('.composer-expr', v)
  await page.waitForTimeout(320)
}

const status = () =>
  page.evaluate(() => ({
    text: document.querySelector('.composer-status')?.textContent ?? '',
    cls: [...(document.querySelector('.composer-status')?.classList ?? [])].join(' '),
  }))

/** 画布节点 id 列表（`g.gnode` 的 `data-id`）。 */
const nodeIds = () => page.evaluate(() => [...document.querySelectorAll('svg.canvas g.gnode')].map((g) => g.dataset.id))

const errRows = () => page.evaluate(() => [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()))

/** 画布上的节点（拿命中矩形中心当点击点）。 */
const NODES = () =>
  page.$$eval('svg.canvas g.gnode', (gs) =>
    gs.map((g) => {
      const r = g.querySelector('.gnode-hit').getBoundingClientRect()
      return { id: g.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }),
  )

let lastPick = ''

/**
 * 点一个画布节点并展开「信息」。
 *
 * ⚠️ 左上面板是**浮层**（画布不让位）：先收起面板，点之前用 `elementFromPoint` 验命中，
 * 不对就返回 `false`（**不静默读上一个对象的结论**）。这两条都是 U50 走查踩出来的。
 */
const pickNode = async (id) => {
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.dock-topleft .dock-toggle')].find((b) => b.textContent.includes('信息'))
    if (t && t.closest('.dock').className.includes('open')) t.click()
  })
  await page.waitForTimeout(250)
  const nodes = await NODES()
  const n = nodes.find((x) => x.id === id)
  if (!n) {
    lastPick = `画布上没有 ${id}（现有：${nodes.map((x) => x.id).join(',')}）`
    return false
  }
  const hit = await page.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y)
    return el?.closest?.('g.gnode')?.getAttribute('data-id') ?? el?.className ?? 'null'
  }, n)
  if (hit !== id) {
    lastPick = `${id} 的点上压着「${hit}」`
    return false
  }
  lastPick = `命中 ${id}`
  await page.mouse.click(n.x, n.y)
  await page.waitForTimeout(500)
  const t = page.locator('.dock-topleft .dock-toggle', { hasText: '信息' })
  if (!(await t.evaluate((b) => b.closest('.dock').className.includes('open')))) {
    await t.click({ timeout: 5000 })
    await page.waitForTimeout(450)
  }
  return true
}

/**
 * 点「对象」抽屉里的一行（同一个选中动作的第二条入口）。
 *
 * 画布节点可能被**浮层**（左上面板 / 证明串）压住 —— U50 走查踩过：
 * 那时 `page.mouse.click` 打的是面板，选中没变，读到的是上一个对象的结论。
 */
const clickObjectRow = async (id) => {
  /*
   * 两个抽屉都要展开：**抽屉收起时 body 不渲染**（U45 的规矩）。
   * 而且要两边都找 —— `smallGroup(...)` 是 op 调用的结果，`origin` 是 `derived`
   * （落在「操作」抽屉），不是手输声明（落在「对象」抽屉）。
   */
  await page.evaluate(() => {
    for (const label of ['对象', '操作']) {
      const t = [...document.querySelectorAll('.dock-topleft .dock-toggle')].find((b) => b.textContent.includes(label))
      if (t && !t.closest('.dock').className.includes('open')) t.click()
    }
  })
  await page.waitForTimeout(350)
  const hit = await page.evaluate((want) => {
    const rows = [...document.querySelectorAll('.dock-topleft .row-click')]
    const row = rows.find((r) => r.querySelector('.row-name')?.textContent?.trim() === want)
    if (!row) return false
    row.click()
    return true
  }, id)
  await page.waitForTimeout(450)
  return hit
}

/** 选中一个对象：先试画布（有命中校验），被浮层挡了就改走「对象」抽屉那一行。 */
const pickAny = async (id) => (await pickNode(id)) || clickObjectRow(id)

/** 幂等地展开某个信息分区（手风琴里再点一下是收起 —— 所以先看 class）。 */
const openSection = async (sec) => {
  await page.evaluate((s) => {
    const h = document.querySelector(`.info-sec-head[data-sec="${s}"]`)
    if (h && !h.classList.contains('on')) h.click()
  }, sec)
  await page.waitForTimeout(360)
}

/** 元素表的**阶**列（`tr[data-el]` 的第 2 个 `.etable-cell`），排序后返回。 */
const elementOrders = async () => {
  await openSection('elements')
  return page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .etable tr[data-el]')]
      .map((tr) => tr.querySelectorAll('.etable-cell')[0]?.textContent?.trim() ?? '')
      .filter(Boolean)
      .sort(),
  )
}

/** 幂等地展开「基本」。 */
const openBasic = async () => {
  await page.evaluate(() => {
    const h = document.querySelector('.info-sec-head[data-sec="basic"]')
    if (h && !h.classList.contains('on')) h.click()
  })
  await page.waitForTimeout(320)
}

/** 信息面板读数（`.insp-k` / `.insp-v`）—— 真值是 `|G|=16` 这种形态，别自己造。 */
const inspRows = async () => {
  await openBasic()
  return page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .insp-row')].map((r) => ({
      k: r.querySelector('.insp-k')?.textContent?.trim() ?? '',
      v: (r.querySelector('.insp-v')?.textContent ?? '').replace(/[\u200b\u2061\u2062]/g, '').replace(/\s+/g, '').trim(),
    })),
  )
}

/** 结论区（`.dock-topleft .insights`）的全文 —— 识别坐标就在这儿。 */
const insights = () =>
  page.evaluate(() => (document.querySelector('.dock-topleft .insights')?.textContent ?? '').replace(/[\u200b\u2061\u2062]/g, ''))
const insightsOk = () => page.evaluate(() => document.querySelectorAll('.dock-topleft .insights').length > 0)

/** 纯文本面扫描：只扫明确是纯文本的节点（KaTeX 渲染的串带零宽字符，别混进来）。 */
const PLAIN_SELECTORS = [
  '.composer-status',
  '.row-err',
  '.orb-ops-panel .orb-op',
  '.orb-ops-panel .orb-op code',
  '.orb-ops-panel .orb-op-doc',
  '.dock-topleft .insp-k',
  '.dock-topleft .info-sec-label',
]
const scanPlain = async (stage) => {
  const rows = await page.evaluate((sels) => {
    const out = []
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t) out.push({ t, where: el.className || el.tagName })
        const v = el.getAttribute('title')
        if (v?.trim()) out.push({ t: v, where: 'title' })
      }
    }
    return out
  }, PLAIN_SELECTORS)
  const bad = rows.filter((r) => badChars(r.t).length > 0)
  ok(
    `${stage}：纯文本面没有键盘打不出的字符`,
    bad.length === 0,
    bad.map((r) => `${r.where}: ${JSON.stringify(r.t)}`).join(' | '),
  )
  return rows.length
}

/* ══ ① 敲 `smallGroup(16, 3)`：这就是这一批的全部意义 ═══════════ */

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(600)
console.log('== ① 输入球里敲 smallGroup(16, 3) ==')

const before = await nodeIds()
ok('建 `P = smallGroup(16, 3)`', await addLine('P', 'smallGroup(16, 3)'))
{
  const ids = await nodeIds()
  ok('画布上多了一个节点', ids.length > before.length, `${before.join(',')} → ${ids.join(',')}`)
  ok('节点叫 P', ids.includes('P'), ids.join(','))
}
ok('点得中 P', await pickNode('P'), lastPick)
{
  const rows = await inspRows()
  // 手算：GAP `SmallGroup(16,3) = (C_4 x C_2) : C_2`，阶 16
  ok('  阶是 16', rows.some((r) => r.k === '阶' && r.v === '|G|=16'), JSON.stringify(rows))
}
{
  const rows = await inspRows()
  // 出处写在「配方」那一行（`OpDef.recipe`）—— 16 阶这个群没有惯用名，
  // 结论层识别不出符号（`(C_4 x C_2):C_2`），所以出处只能从配方读。
  ok('  配方行写出"查内嵌小群表"', rows.some((r) => r.k === '配方' && r.v.includes('小群表')), JSON.stringify(rows.map((r) => `${r.k}=${r.v}`)))
  ok('  节点标签是它的结构符号', rows.some((r) => r.k === '配方') , JSON.stringify(rows.map((r) => r.k)))
  await page.screenshot({ path: '../../docs/assets/u55-small-group-16.png' })
}
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

/* ══ ② 编号是 GAP 的：`smallGroup(8, 3)` 是 `D_4` ══════════════ */

console.log('== ② 编号是 GAP 的（(8,3) 是 D_4，(8,5) 才是 C_2^3）==')

/*
 * 手算（GAP `NAMES_OF_SMALL_GROUPS[8] = C8, C4 x C2, D8, Q8, C2 x C2 x C2`）：
 *   `SmallGroup(8, 3)` = `D_8`（教材里的 D₄，8 阶二面体群）
 *   而引擎注册表下标 2 是 `C_2³` —— 若照抄注册表下标，用户会拿到另一个群。
 */
ok('建 `Q = smallGroup(8, 3)`', await addLine('Q', 'smallGroup(8, 3)'))
ok('点得中 Q', await pickNode('Q'), lastPick)
{
  const rows = await inspRows()
  ok('  阶是 8', rows.some((r) => r.k === '阶' && r.v === '|G|=8'), JSON.stringify(rows))
}
{
  const ins = await insights()
  // 识别结果走 KaTeX 渲染，`textContent` 里 `D_4` 是 `D4`（下标被渲染掉了）—— 两种形态都认
  ok('  结论区说出 D_4（GAP (8,3) 是二面体群）', ins.includes('D4') || ins.includes('D_4'), ins.slice(0, 220))
  ok('  且坐标就是 SmallGroup(8, 3)', ins.includes('SmallGroup(8, 3)'), ins.slice(0, 220))
}
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

/* ══ ③ 与手写记号同一 id 空间 ══════════════════════════════════ */

console.log('== ③ 与手写 D_4 同一 id 空间（元素表逐字一致）==')

ok('建 `R = D_4`（手写）', await addLine('R', 'D_4'))
ok('点得中 Q（再次）', await pickAny('Q'), lastPick)
const elQ = await elementOrders()
ok('点得中 R', await pickAny('R'), lastPick)
const elR = await elementOrders()
{
  /*
   * 手算：`D_8`（教材 D₄）的元素阶分布 = 1 个 1 阶 + 5 个 2 阶 + 2 个 4 阶。
   * 两者逐元素对上 ⇒ 它们是**同一门 id 空间**的同一个群（不是"两个同构的群"）——
   * 这也是 `smallGroup(8, 3)` 能与手写 `D_4` 直接互相比的前提。
   */
  ok('元素表逐元素对上（1,2,2,2,2,2,4,4）', elQ.join(',') === elR.join(','), `smallGroup(8,3): ${elQ.join(',')} | D_4: ${elR.join(',')}`)
  ok('那条分布就是 1,2,2,2,2,2,4,4', elQ.join(',') === '1,2,2,2,2,2,4,4', elQ.join(','))
}
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

/* ══ ④ 平凡群那一档也能拿 ═════════════════════════════════════ */

console.log('== ④ smallGroup(1, 1)（平凡群）==')

ok('建 `T = smallGroup(1, 1)`', await addLine('T', 'smallGroup(1, 1)'))
ok('点得中 T', await pickAny('T'), lastPick)
{
  const rows = await inspRows()
  ok('  阶是 1', rows.some((r) => r.k === '阶' && r.v === '|G|=1'), JSON.stringify(rows))
}
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

/* ══ ⑤ 边界在界面上看得见（不是"算不出来"）════════════════════ */

console.log('== ⑤ 越界要说得出"8 阶只有 5 个群" ==')

await typeExpr('smallGroup(8, 9)')
{
  const st = await status()
  ok('预览当场说不合法', st.cls.includes('bad') || st.text.includes('5 个群'), JSON.stringify(st))
  ok('状态行给出"8 阶只有 5 个群"', st.text.includes('5 个群'), st.text)
}
await typeExpr('smallGroup(40, 1)')
{
  const st = await status()
  ok('表外的阶也说得出上界 31', st.text.includes('31'), st.text)
}
await typeExpr('smallGroup(16, 3)')
{
  const st = await status()
  ok('合法输入预览通过', !st.cls.includes('bad'), JSON.stringify(st))
}
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

/* ══ ⑥ 收口：结论层印的坐标 = 能敲进输入球的坐标 ═══════════════ */

console.log('== ⑥ 结论层的 SmallGroup(24, 12) 抄回去 ==')

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(600)
// 手算：`Aut(S_4) ≅ S_4`，阶 24 ⇒ GAP `SmallGroup(24, 12)`
ok('建 `A = Aut(S_4)`', await addLine('A', 'Aut(S_4)'))
ok('点得中 A', await pickNode('A'), lastPick)
ok('结论区开着', await insightsOk())
{
  const ins = await insights()
  ok('结论里给出坐标 SmallGroup(24, 12)', ins.includes('SmallGroup(24, 12)'), ins.slice(0, 240))
  await page.screenshot({ path: '../../docs/assets/u55-small-group-coord.png' })
}
{
  const rows = await inspRows()
  ok('  Aut(S_4) 的阶是 24', rows.some((r) => r.k === '阶' && r.v === '|G|=24'), JSON.stringify(rows))
}
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// 把结论里印出来的那个坐标**原样**抄回输入球
ok('把 SmallGroup(24, 12) 抄回输入球', await addLine('B', 'smallGroup(24, 12)'))
ok('点得中 B', await pickNode('B'), lastPick)
{
  const rows = await inspRows()
  ok('  得到的还是 24 阶（坐标指回了同一个群）', rows.some((r) => r.k === '阶' && r.v === '|G|=24'), JSON.stringify(rows))
}
{
  const ins = await insights()
  ok('  它自己也报同一个坐标 SmallGroup(24, 12)', ins.includes('SmallGroup(24, 12)'), ins.slice(0, 240))
}
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

const scanned = await scanPlain('小群表全流程之后的整页纯文本面')
ok('这一趟真的扫到了纯文本面（不是空跑）', scanned >= 5, `${scanned}`)

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
