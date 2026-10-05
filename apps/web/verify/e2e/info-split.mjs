/**
 * 走查：信息面板的分区（U42 起 → U44 砍段 → **U45 改折叠**）。
 *
 * 用户原话（第三次报元素列表）：
 *   「元素列表呢？你不会不知道信息栏有限高吧，关系条目太多给元素列表挤没了不知道？」
 *
 * U41 治的是**表太宽**（当时把 24 行折成 5 个共轭类；**U43 已撤回** —— 折叠把
 * 单个元素藏进了展开态，用户 2026-10-01 否掉）。用户说的是另一个病：面板限高
 * `min(62vh, 540px)`，摘要区一路吃到底 —— 实测点 A₄ 时关系 2 条占 199px、
 * 可做 95px，tab 头落到 top 502，元素表只剩 **38px** 可见（还被 flex 压扁）。
 *
 * U44 把病根拔了：关系段与可做行整个砍掉（用户"我都不看"）。
 *
 * **U45（2026-10-01）把 tab 条换成可折叠分区**（用户：「重点还是不够突出，
 * 基本/元素/子群 tab 明显可以折叠起来不是吗」）。三条定案：**单开** ·
 * **默认全收** · 标题行**带摘要**。高度模型随之反转 —— U42 那条"容器高度必须钉死"
 * （`height: min(62vh, 540px)`）是给"tab 头要钉住、内容要吃满"定的；
 * 折叠之后全收本该矮，所以回到**内容驱动 + max-height 封顶**，滚动交给 `.info-acc`。
 *
 * 判据（读 DOM 几何，不读截图）：
 *   ① 默认**全收**：三节都收起、零个 body、面板比 540 矮；
 *   ② 标题行**有摘要**：基本 `|G| = 24 - 非交换` · 元素 `24 个元素` · 共轭类 `5 类` · 子群 `7 类`；
 *   ③ 点「元素」**才**展开，且**单开**（其余自动收）；
 *   ④ 展开的元素表 24 行**一个不落**，由折叠区滚（表格不被压扁）；
 *   ⑤ 再点一次同一节 = **收起**（回全收）；
 *   ⑥ 矮窗口（62vh = 384）照样成立。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/info-split.mjs`
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
const logs = []

/** 读信息面板的分区几何。**要按标题找面板** —— `.dock-topleft .dock-body` 的第一个
 *  是「对象」抽屉，不是信息面板（上一轮就在这里读错过一次）。 */
const GEO = () => {
  const dock = [...document.querySelectorAll('.dock-topleft .dock')]
    .find((d) => d.querySelector('.dock-title')?.textContent?.trim() === '信息')
  const body = dock?.querySelector('.dock-body')
  if (!body) return { err: 'no info dock' }
  const b = body.getBoundingClientRect()
  const box = (sel) => {
    const e = body.querySelector(sel)
    if (!e) return null
    const r = e.getBoundingClientRect()
    return {
      top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
      inBody: r.top >= b.top - 1 && r.bottom <= b.bottom + 1,
      /* 横向不越界才是真判据（纵向越出去是**正常**的：24 行的表比可视区高，
         由折叠区滚 —— U43 之前那条 `inBody` 是给 5 行折叠表定的，现在不适用） */
      inWidth: r.left >= b.left - 1 && r.right <= b.right + 1,
    }
  }
  const brief = body.querySelector('.info-brief')
  const acc = body.querySelector('.info-acc')
  const wrap = body.querySelector('.etable-wrap')
  return {
    bodyH: Math.round(b.height),
    bodyTop: Math.round(b.top), bodyBottom: Math.round(b.bottom),
    brief: box('.info-brief'),
    briefScroll: brief ? { c: brief.clientHeight, s: brief.scrollHeight, over: brief.scrollHeight > brief.clientHeight + 1 } : null,
    acc: box('.info-acc'),
    /* 折叠区（滚动容器）自己要不要滚 —— 与 U43 那条"`.etable-wrap` 恒不滚"不同，
       这一层是**真的会滚**的，所以它可以当判据 */
    accScroll: acc ? { c: acc.clientHeight, s: acc.scrollHeight, over: acc.scrollHeight > acc.clientHeight + 1 } : null,
    /* 四节：展开没有 / 标题行摘要写了什么 */
    secs: [...body.querySelectorAll('.info-sec')].map((s) => ({
      id: s.dataset.sec,
      on: !!s.querySelector('.info-sec-head.on'),
      sum: s.querySelector('.info-sec-sum')?.textContent?.trim() ?? '',
      hasBody: !!s.querySelector('.info-sec-body'),
    })),
    openBodies: body.querySelectorAll('.info-sec-body').length,
    /* 标题行几何 —— 钉"三个都在可视区里、点得中" */
    heads: [...body.querySelectorAll('.info-sec-head')].map((h) => {
      const r = h.getBoundingClientRect()
      return { sec: h.dataset.sec, h: Math.round(r.height), inBody: r.top >= b.top - 1 && r.bottom <= b.bottom + 1 }
    }),
    table: box('.etable-wrap'),
    /* ⚠️ 别再拿"表自己要不要内滚"当判据 —— `flex: none` 之后它恒为 false（恒真断言） */
    tableScroll: wrap ? { c: wrap.clientHeight, s: wrap.scrollHeight } : null,
    elRows: body.querySelectorAll('.etable tbody tr[data-el]').length,
    subHeads: body.querySelectorAll('.sub-group-head').length,
    /* U44：摘要区里**不该再有**关系段 / 可做行 */
    wikiBlocks: body.querySelectorAll('.relations, .info-ops').length,
  }
}

async function boot(page) {
  await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
  await page.waitForTimeout(1300)
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
    const b = page.locator('.composer-orb .composer-row button')
    if (await b.isDisabled()) return false
    await b.click()
    await page.waitForTimeout(400)
    return true
  }
  await addLine('G', 'S_4')
  /* 再造两个子群：让「子群」这一节里有真东西可看（同构类分组要成得了组） */
  await addLine('A', 'closure(G, (123), (234))')
  await addLine('V', 'closure(G, (12)(34), (13)(24))')
  if ((await page.locator('.composer-card').count())) {
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(250)
  }
  return page.$$eval('svg.canvas g.gnode', (gs) =>
    gs.map((g) => {
      const r = g.querySelector('.gnode-hit').getBoundingClientRect()
      return { id: g.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }),
  )
}

async function pickNode(page, nodes, id) {
  const n = nodes.find((x) => x.id === id) ?? nodes[0]
  await page.mouse.click(n.x, n.y)
  await page.waitForTimeout(500)
  const t = page.locator('.dock-topleft .dock-toggle', { hasText: '信息' })
  if (!(await t.evaluate((b) => b.closest('.dock').className.includes('open')))) {
    await t.click({ timeout: 5000 })
    await page.waitForTimeout(500)
  }
  /* 「子群」那一节的数字是**延迟算**的（`SUB_COUNT_CAP` 那段注释）—— 等它落位 */
  await page.waitForTimeout(600)
}

/* ── ① 宽屏（1500×950）：点 S₄，**默认全收** ───────────────── */
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
const nodes = await boot(page)
ok('画布上 S₄ 建出来了', nodes.length >= 1, JSON.stringify(nodes.map((n) => n.id)))
await pickNode(page, nodes, 'G')

const collapsed = await page.evaluate(GEO)
ok('信息面板在（折叠分区结构就位）', !collapsed.err && collapsed.brief && collapsed.acc, JSON.stringify(collapsed))
ok(
  '默认全收：四节都收起、一个 body 都没渲染',
  collapsed.secs.length === 4 && collapsed.secs.every((s) => !s.on) && collapsed.openBodies === 0,
  JSON.stringify(collapsed.secs),
)
ok(
  '全收时面板是**矮的**（内容驱动，不再钉死 540）',
  collapsed.bodyH < 540,
  `bodyH=${collapsed.bodyH}`,
)
ok(
  '四个标题行都在面板里（点得中）—— 基本/元素/共轭类/子群',
  collapsed.heads.length === 4 && collapsed.heads.every((h) => h.inBody),
  JSON.stringify(collapsed.heads),
)
ok(
  '标题行带摘要：基本 = 阶 + 交换性 / 元素 = 个数 / 共轭类 = 类数 / 子群 = 同构类数',
  collapsed.secs.find((s) => s.id === 'basic')?.sum === '|G| = 24 - 非交换' &&
    collapsed.secs.find((s) => s.id === 'elements')?.sum === '24 个元素' &&
    collapsed.secs.find((s) => s.id === 'conj')?.sum === '5 类' &&
    collapsed.secs.find((s) => s.id === 'subgroups')?.sum === '7 类',
  JSON.stringify(collapsed.secs.map((s) => `${s.id}:${s.sum}`)),
)
ok(
  '摘要区里已经没有「关系」段与「可做」行了（U44 砍掉，面板不再当 wiki）',
  collapsed.wikiBlocks === 0,
  JSON.stringify({ wikiBlocks: collapsed.wikiBlocks }),
)
ok('摘要区不超过封顶 268px', collapsed.brief.h <= 268, JSON.stringify(collapsed.brief))

/* ── U46：字号层级（用户「字体还是太小了，重点没有突出啊」）──────
   这一批把面板字号排成了三档：**头条结论**（20px/600）> 对象名 / 分区标题 >
   附注结论 / 正文。上面那条"识别 S₄ 是 13px 常规体"就是病根，钉住它别再退回去。 */
const FONT = () => {
  const dock = [...document.querySelectorAll('.dock-topleft .dock')].find(
    (d) => d.querySelector('.dock-title')?.textContent?.trim() === '信息',
  )
  const body = dock?.querySelector('.dock-body')
  const px = (sel) => {
    const e = body?.querySelector(sel)
    return e ? parseFloat(getComputedStyle(e).fontSize) : null
  }
  const lead = body?.querySelector('.insight-lead .katex')
  const note = body?.querySelector('.insight-note .katex')
  const b = body.getBoundingClientRect()
  const lr = lead?.getBoundingClientRect()
  return {
    lead: px('.insight-lead .insight-body'),
    note: px('.insight-note .insight-body'),
    name: px('.info-target strong'),
    sec: px('.info-sec-label'),
    leadFont: lead ? parseFloat(getComputedStyle(lead).fontSize) : null,
    noteFont: note ? parseFloat(getComputedStyle(note).fontSize) : null,
    leadInWidth: lr ? lr.left >= b.left - 1 && lr.right <= b.right + 1 : null,
  }
}
const font = await page.evaluate(FONT)
ok(
  '头条结论是 panel 里最大的一档（≥ 18px）——"结果"要跳出来',
  font.lead !== null && font.lead >= 18,
  JSON.stringify({ lead: font.lead, note: font.note }),
)
ok(
  '三档层级成立：头条 > 对象名/分区标题 > 附注',
  font.lead > font.name && font.name > font.note && font.lead > font.sec,
  JSON.stringify({ lead: font.lead, name: font.name, sec: font.sec, note: font.note }),
)
ok(
  '头条的**实际字形**也更大（KaTeX 撑过 17px），且不越界',
  font.leadFont !== null && font.leadFont >= 17 && font.leadInWidth === true,
  JSON.stringify({ leadFont: font.leadFont, noteFont: font.noteFont, inWidth: font.leadInWidth }),
)

await page.screenshot({ path: '../../docs/assets/u45-info-accordion.png' })

/* ── ② 点「元素」才展开（且单开）──────────────────────────── */
await page.locator('.info-sec-head[data-sec="elements"]').click({ timeout: 8000 })
await page.waitForTimeout(600)
const el = await page.evaluate(GEO)
ok(
  '点「元素」才展开，且**单开**（展开的就是它一个）',
  el.secs.find((s) => s.id === 'elements')?.on === true && el.openBodies === 1,
  JSON.stringify(el.secs),
)
ok('展开后顶到面板限高 540px', el.bodyH === 540, `bodyH=${el.bodyH}`)
ok(
  '元素表横向不越界（纵向比可视区高是对的：由折叠区滚下去）',
  el.table?.inWidth === true,
  JSON.stringify(el.table),
)
ok(
  '元素表 24 个元素**全部画得出来**（逐元素一行，S_4 一个不落）',
  el.elRows === 24,
  JSON.stringify({ rows: el.elRows }),
)
ok(
  '滚动落在折叠区上（不是把表格压扁）',
  el.accScroll.s > el.accScroll.c,
  JSON.stringify({ acc: el.accScroll, table: el.tableScroll }),
)

await page.screenshot({ path: '../../docs/assets/u45-info-accordion-open.png' })

/* ── ③ 点「子群」：单开（「元素」自动收）──────────────────── */
await page.locator('.info-sec-head[data-sec="subgroups"]').click({ timeout: 8000 })
await page.waitForTimeout(700)
const sg = await page.evaluate(GEO)
ok(
  '单开：展开「子群」时「元素」自己收起来了',
  sg.secs.find((s) => s.id === 'subgroups')?.on === true &&
    sg.secs.find((s) => s.id === 'elements')?.on === false &&
    sg.openBodies === 1,
  JSON.stringify(sg.secs),
)
ok('子群列表在这一节里（7 个同构类组头）', sg.subHeads === 7, `subHeads=${sg.subHeads}`)
ok('子群列表有自己的滚动区（不撑破面板）', sg.accScroll?.s > 0, JSON.stringify(sg.accScroll))

const FIRST_GROUP = () => {
  const dock = [...document.querySelectorAll('.dock-topleft .dock')].find(
    (d) => d.querySelector('.dock-title')?.textContent?.trim() === '信息',
  )
  const g = dock?.querySelector('.sub-group-head')
  if (!g) return null
  const b = dock.querySelector('.dock-body').getBoundingClientRect()
  const r = g.getBoundingClientRect()
  return { text: g.textContent.trim(), inBody: r.top >= b.top - 1 && r.bottom <= b.bottom + 1 }
}
const firstGroup = await page.evaluate(FIRST_GROUP)
ok('第一个同构类组头就在可视区里', firstGroup?.inBody === true, JSON.stringify(firstGroup))

/* ── ④ 再点一次同一节 = 收起（回全收，面板回矮）────────────── */
await page.locator('.info-sec-head[data-sec="subgroups"]').click({ timeout: 8000 })
await page.waitForTimeout(500)
const again = await page.evaluate(GEO)
ok(
  '再点同一节就收起：零个 body，面板回矮',
  again.openBodies === 0 && again.bodyH === collapsed.bodyH,
  `${collapsed.bodyH} → ${again.bodyH}（openBodies=${again.openBodies}）`,
)

/* ── ⑤ 矮窗口（1200×620 → 62vh = 384）同源，仍然成立 ───────── */
const low = await browser.newPage({ viewport: { width: 1200, height: 620 } })
const nodesLow = await boot(low)
await pickNode(low, nodesLow, 'G')
await low.locator('.info-sec-head[data-sec="elements"]').click({ timeout: 8000 })
await low.waitForTimeout(600)
const elLow = await low.evaluate(GEO)
ok(
  '矮窗口：摘要区一样装得下（不超 268，也不该再溢出）',
  elLow.brief.h <= 268 && elLow.briefScroll.over === false,
  JSON.stringify({ tall: el.brief.h, low: elLow.brief.h, scroll: elLow.briefScroll }),
)
ok(
  '矮窗口：元素表照样横向不越界、24 行一个不少',
  elLow.table?.inWidth === true && elLow.elRows === 24,
  JSON.stringify({ table: elLow.table, rows: elLow.elRows }),
)
ok(
  '矮窗口：折叠区顶到 62vh 上限后自己滚',
  elLow.bodyH <= 385 && elLow.accScroll.s > elLow.accScroll.c,
  JSON.stringify({ bodyH: elLow.bodyH, acc: elLow.accScroll }),
)

ok('无控制台报错', logs.length === 0, logs.slice(0, 3).join(' | '))

await browser.close()
console.log(`\n${pass} PASS / ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 1)
