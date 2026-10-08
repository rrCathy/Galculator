/**
 * 走查：**目录面板**（U56）—— 从库里挑群 / 凭空造集合。
 *
 * 起因是用户的一句质问（2026-10-03）：
 *
 *   「所以呢，怎么创建任意集合？也没看到像 groupviz 一样的导入群的手风琴啊」
 *
 * 侦察确认这不是错觉：U55 的 `smallGroup(8, 3)` 与 U53 的 `pointSet(5)` /
 * `labeledSet(a, b, c)` 三条 op **在界面上一个入口都没有** —— 三个手势入口
 * （径向菜单 / ⊕ 球 / 拖拽）筛的都是"选中了什么"，而这仨的实参全是标量。
 * 那时的走查（`point-set.mjs` / `small-group.mjs`）自己就写着"全不通"，
 * 全靠 `addLine` 直接往输入球里灌字绕过 —— 所以**回归全绿而用户摸不到**。
 *
 * 本套钉的就是"摸得到"这件事：
 *   ① 左栏有「目录」这一栏，点得开；
 *   ② 展开即 31 阶 / 93 群，集合分区排在群列表**前面**（它是起手动作）；
 *   ③ 点一个群名 → 画布长出节点，且**落成一行可读可改的定义**；
 *   ④ 造点集 / 按标号造同理；
 *   ⑤ 阶标题真的折叠（手风琴）；
 *   ⑥ 纯文本面零泄漏（判据与 `no-unicode-leak.mjs` 逐字相同）。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/catalog.mjs`
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

/** 左栏的抽屉胶囊（标题 + 开着没有）。 */
const toggles = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .dock-toggle')].map((b) => ({
      text: b.textContent.trim(),
      open: b.closest('.dock').className.includes('open'),
    })),
  )

/** 幂等地展开「目录」（收起时 body 根本不渲染 —— U45 的规矩）。 */
const openCatalog = async () => {
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.dock-topleft .dock-toggle')].find((b) =>
      b.textContent.includes('目录'),
    )
    if (t && !t.closest('.dock').className.includes('open')) t.click()
  })
  // 首次展开要现算 `smallGroupCatalog()`（~311ms），留够
  await page.waitForTimeout(1600)
}

/** 目录里的阶标题（顺序即 DOM 顺序）。 */
const catOrders = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.cat-order')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
  )

/** 当前**可见**的群条目（收起的阶不渲染条目）。 */
const catItems = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.cat-g')].map((b) => ({
      t: b.textContent.replace(/\s+/g, ' ').trim(),
      title: b.getAttribute('title') ?? '',
    })),
  )

/** 点目录里的某个群条目（按 `title` 里的调用串定位）。 */
const clickCatGroup = async (call) => {
  const hit = await page.evaluate((want) => {
    const b = [...document.querySelectorAll('.cat-g')].find((x) => x.getAttribute('title') === want)
    if (!b) return false
    b.scrollIntoView({ block: 'center' })
    b.click()
    return true
  }, call)
  await page.waitForTimeout(500)
  return hit
}

/** 点目录里的某颗按钮（「造点集」/「按标号造」）。 */
const clickCatGo = async (label) => {
  const hit = await page.evaluate((want) => {
    const b = [...document.querySelectorAll('.cat-go')].find((x) => x.textContent.trim() === want)
    if (!b) return false
    b.click()
    return true
  }, label)
  await page.waitForTimeout(500)
  return hit
}

/** 目录里的分区标题（DOM 顺序）—— 用来验「集合在群前面」。 */
const catSubtitles = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.dock-body .dock-subtitle')]
      .filter((n) => n.closest('.dock')?.querySelector('.dock-title')?.textContent.trim() === '目录')
      .map((n) => n.textContent.trim()),
  )

/** 画布节点 id 列表。 */
const nodeIds = () =>
  page.evaluate(() => [...document.querySelectorAll('svg.canvas g.gnode')].map((g) => g.dataset.id))

/**
 * 左栏定义行（`名字 = 定义`）。
 *
 * ⚠️ 两个抽屉都要**先展开** —— 抽屉收起时 body 根本不渲染（U45 的规矩），
 * 而 `smallGroup(...)` / `pointSet(...)` 都是 **op 调用**，`origin` 是 `derived`
 * ⇒ 它们落在「操作」抽屉，不是手输声明那个「对象」抽屉（U55 走查踩过同一条）。
 */
const defRows = async () => {
  await page.evaluate(() => {
    for (const label of ['对象', '操作']) {
      const t = [...document.querySelectorAll('.dock-topleft .dock-toggle')].find((b) =>
        b.textContent.includes(label),
      )
      if (t && !t.closest('.dock').className.includes('open')) t.click()
    }
  })
  await page.waitForTimeout(350)
  return page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .row')].map((r) => ({
      name: r.querySelector('.row-name')?.textContent?.trim() ?? '',
      def: r.querySelector('.row-def')?.textContent?.trim() ?? '',
      err: r.querySelector('.row-err')?.textContent?.trim() ?? '',
    })),
  )
}

/* ── 纯文本面扫描（含目录面板自己那些面）───────────────────── */

const PLAIN_SELECTORS = [
  '.dock-topleft .dock-title',
  '.dock-topleft .dock-subtitle',
  '.dock-topleft .cat-order',
  '.dock-topleft .cat-g',
  '.dock-topleft .cat-go',
  '.dock-topleft .row-err',
  '.composer-status',
]
const scanPlain = async (stage) => {
  const rows = await page.evaluate((sels) => {
    const out = []
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        /*
         * ⚠️ 2026-10-08：群名条目改走 **KaTeX 渲染**（标准群记号）——`.katex` 子树是
         * "显示靠排版、文本流要 ASCII"的豁免面（与 `no-unicode-leak` 同判据）。
         * 不剔除的话 `C₄×C₂` 的 `×`（KaTeX 字形）会被当成泄漏误报。
         */
        const clone = el.cloneNode(true)
        clone.querySelectorAll('.katex').forEach((k) => k.remove())
        const t = (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t) out.push({ t, where: el.className || el.tagName })
        const v = el.getAttribute('title')
        if (v?.trim()) out.push({ t: v, where: 'title' })
        const ph = el.getAttribute('placeholder')
        if (ph?.trim()) out.push({ t: ph, where: 'placeholder' })
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

/* ══ ① 左栏多了一栏「目录」 ═══════════════════════════════════ */

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(700)
console.log('== ① 左栏有「目录」这一栏 ==')

{
  const ts = await toggles()
  ok('左栏出现「目录」胶囊', ts.some((t) => t.text.includes('目录')), JSON.stringify(ts))
  ok('它默认是收起的（不占画布）', ts.find((t) => t.text.includes('目录'))?.open === false, JSON.stringify(ts))
}

await openCatalog()
{
  const ts = await toggles()
  ok('点得开', ts.find((t) => t.text.includes('目录'))?.open === true, JSON.stringify(ts))
  const orders = await catOrders()
  ok('展开即列出 31 个阶', orders.length === 31, `${orders.length}`)
  ok('第一个是阶 1', orders[0] === 'v阶 11', orders.slice(0, 3).join(' | '))
}

/* ══ ② 分区的优先级：集合在群列表**前面** ═══════════════════ */

console.log('== ② 集合分区排在群列表前面（用户问的就是造集合）==')

{
  const subs = await catSubtitles()
  ok(
    '「集合」在「群」之前',
    subs.length === 2 && subs[0].includes('集合') && subs[1].includes('群'),
    JSON.stringify(subs),
  )
  ok('群分区报出总数 93', (subs[1] ?? '').includes('93'), JSON.stringify(subs))
}

/* ══ ③ 点一个群名 → 画布长出对象 + 一行定义 ═════════════════ */

console.log('== ③ 点「阶 8」的第 3 条（= D_4）长出一个群 ==')

{
  const items = await catItems()
  // 手算：GAP 8 阶 5 个群 = C8, C4xC2, D8, Q8, C2^3 ⇒ 第 3 条是 D_8
  const eight = items.filter((x) => x.title.startsWith('smallGroup(8,'))
  ok('阶 8 列出 5 条（GAP 口径）', eight.length === 5, JSON.stringify(eight))
  ok(
    '第 3 条就是 smallGroup(8, 3)',
    eight.map((x) => x.title).join(',') ===
      'smallGroup(8, 1),smallGroup(8, 2),smallGroup(8, 3),smallGroup(8, 4),smallGroup(8, 5)',
    eight.map((x) => x.title).join(','),
  )
  // 条目上的结构串是**纯文本面**写法（`asciiSymbol`），不是 KaTeX 源
  ok('第 3 条显示 D_4 的记号（2026-10-08 起是 KaTeX 渲染形态，textContent 是 `D4`）',
    /D4/.test(eight[2]?.t ?? ''), JSON.stringify(eight[2]))
}

const beforeNodes = await nodeIds()
ok('点得到 smallGroup(8, 3)', await clickCatGroup('smallGroup(8, 3)'))
{
  const ids = await nodeIds()
  ok('画布上多了一个节点', ids.length === beforeNodes.length + 1, `${beforeNodes.join(',')} -> ${ids.join(',')}`)
  const rows = await defRows()
  const line = rows.find((r) => r.def === 'smallGroup(8, 3)')
  ok('落成一行定义「A = smallGroup(8, 3)」', !!line && line.name === 'A', JSON.stringify(rows))
  ok('这一行没报错', !!line && !line.err, line?.err ?? '')
}

/* ══ ④ 凭空造集合的两条 ═══════════════════════════════════════ */

console.log('== ④ 造点集 / 按标号造 ==')

{
  const before = await nodeIds()
  ok('点得到「造点集」', await clickCatGo('造点集'))
  const ids = await nodeIds()
  ok('长出集合节点', ids.length === before.length + 1, `${before.join(',')} -> ${ids.join(',')}`)
  const rows = await defRows()
  ok(
    '落成「B = pointSet(5)」（默认 5 个点）',
    rows.some((r) => r.name === 'B' && r.def === 'pointSet(5)'),
    JSON.stringify(rows),
  )
}
{
  const before = await nodeIds()
  ok('点得到「按标号造」', await clickCatGo('按标号造'))
  const ids = await nodeIds()
  ok('长出第二个集合节点', ids.length === before.length + 1, `${before.join(',')} -> ${ids.join(',')}`)
  const rows = await defRows()
  // ⚠️ def 含花括号 ⇒ 走 KaTeX 渲染，math mode 吃空格 ⇒ 断言对空格宽容
  const line = rows.find((r) => /^\{a,\s*b,\s*c\}$/.test(r.def))
  ok('落成一行 {a, b, c}（2026-10-07 花括号形态）', !!line, JSON.stringify(rows))
  /*
   * 名字不是 `C` 而是 `D` —— 因为 **`C` 是二项式系数 op 的调用名**
   * （`call: ['C', 'binomial', 'choose']`），`RESERVED_CALL_NAMES` 收全部 op 的
   * 调用名，自动命名得绕开它。这是**既有行为**，不是本批引入的 —— 钉在这儿，
   * 免得下次有人看见 A/B/D 连号断了就"顺手修"。
   */
  ok('第三个名字跳过了 C（被二项式 op 占着）', line?.name === 'D', JSON.stringify(rows.map((r) => r.name)))
}

/* ══ ⑤ 手风琴：阶标题真的收得起 ═══════════════════════════════ */

console.log('== ⑤ 折叠「阶 8」==')

{
  const clickOrder = async (label) => {
    const hit = await page.evaluate((want) => {
      const b = [...document.querySelectorAll('.cat-order')].find((x) => x.textContent.replace(/\s+/g, ' ').trim() === want)
      if (!b) return false
      b.click()
      return true
    }, label)
    await page.waitForTimeout(400)
    return hit
  }
  ok('点得到「阶 8」标题', await clickOrder('v阶 85'))
  ok('阶 8 的 5 条不见了', (await catItems()).filter((x) => x.title.startsWith('smallGroup(8,')).length === 0)
  ok('别的阶还在（只收这一阶）', (await catItems()).length > 0, `${(await catItems()).length}`)
  ok('箭头变成 >', (await catOrders()).includes('>阶 85'), (await catOrders()).join(' | '))
  ok('再点一次展开回来', await clickOrder('>阶 85'))
  ok('5 条回来了', (await catItems()).filter((x) => x.title.startsWith('smallGroup(8,')).length === 5)
}

/* ══ ⑥ 编号一定是 GAP 的（抄给用户的那串要能直接用）═════════ */

console.log('== ⑥ 目录里的编号 = 结论层印的编号 ==')

{
  // 手算：GAP `SmallGroup(24,12) ≅ S_4`；界面若照抄引擎注册表下标会给出 11
  const items = await catItems()
  const t24 = items.filter((x) => x.title.startsWith('smallGroup(24,'))
  ok('阶 24 列出 15 条（GAP 口径）', t24.length === 15, `${t24.length}`)
  ok('第 12 条的结构串说 S_4（渲染形态 `S4`）', /S4/.test(t24[11]?.t ?? ''), JSON.stringify(t24[11]))
}

/* ══ ⑦ 纯文本面 + 控制台 ═════════════════════════════════════ */

console.log('== ⑦ 纯文本面 ==')

{
  const scanned = await scanPlain('目录面板全流程之后')
  ok('真的扫到了面（不是空跑）', scanned >= 5, `${scanned}`)
}

// 截图前把「对象 / 操作 / 证明」收起来 —— 只留目录展开，画面才是这一批的主角
await page.evaluate(() => {
  for (const label of ['对象', '操作', '证明']) {
    const t = [...document.querySelectorAll('.dock-toggle')].find((b) =>
      b.textContent.includes(label),
    )
    if (t && t.closest('.dock').className.includes('open')) t.click()
  }
})
await page.waitForTimeout(400)
await page.screenshot({ path: '../../docs/assets/u56-catalog.png' })

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
