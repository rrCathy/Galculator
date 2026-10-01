/**
 * 走查：信息面板上下分区（U42，2026-09-30）。
 *
 * 用户原话（第三次报元素列表）：
 *   「元素列表呢？你不会不知道信息栏有限高吧，关系条目太多给元素列表挤没了不知道？
 *     你要么修好元素列表要么新开一个子信息栏来放元素列表。」
 *
 * U41 治的是**表太宽**（24 行折成 5 行）；用户说的是另一个病：面板限高
 * `min(62vh, 540px)`，摘要区（对象 / 结论 / 关系 / 可做）一路吃到底 ——
 * 实测点 A₄ 时关系 2 条占 199px、可做 95px，tab 头落到 top 502，
 * 元素表只剩 **38px** 可见（**还被 flex 压扁**，不是裁切）。
 *
 * 这一套钉的是「**够不够得着**」，不是「表有几行」：
 *   ① 摘要区封顶（自己滚），tab 区不被压缩；
 *   ② 切到「元素」表**完整画得出来**（表格自身不需要内滚）；
 *   ③ 切 tab 前后位置不动（面板高度稳定）；
 *   ④ 矮窗口（62vh 变小）同源缩，仍然看全。
 *
 * 判据读 DOM 几何，不读截图。
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
    }
  }
  const brief = body.querySelector('.info-brief')
  const panel = body.querySelector('.info-panel')
  const pbody = body.querySelector('.info-panel-body')
  const wrap = body.querySelector('.etable-wrap')
  return {
    bodyH: Math.round(b.height),
    bodyTop: Math.round(b.top), bodyBottom: Math.round(b.bottom),
    brief: box('.info-brief'),
    briefScroll: brief ? { c: brief.clientHeight, s: brief.scrollHeight, over: brief.scrollHeight > brief.clientHeight + 1 } : null,
    panel: box('.info-panel'),
    panelScroll: pbody ? { c: pbody.clientHeight, s: pbody.scrollHeight } : null,
    tabs: box('.info-tabs'),
    table: box('.etable-wrap'),
    /* 表格"看全"的判据：它自己不用内滚 —— 5 个共轭类都画得出来 */
    tableFits: wrap ? wrap.scrollHeight <= wrap.clientHeight + 1 : null,
    tableScroll: wrap ? { c: wrap.clientHeight, s: wrap.scrollHeight } : null,
    clsRows: body.querySelectorAll('.etable tbody tr').length,
    relCount: body.querySelectorAll('.relations .rel').length,
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
  /* 再造两个子群 + 一个商群：关系层与「可做」都会被撑起来 —— 这正是用户说的
     "关系条目太多"那个现场，摘要区必须自己消化，不能去挤 tab 区。 */
  await addLine('A', '闭包(G, (123), (234))')
  await addLine('V', '闭包(G, (12)(34), (13)(24))')
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
}

/* ── ① 宽屏（1500×950）：点 S₄（关系 / 可做最多）─────────── */
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
const nodes = await boot(page)
ok('画布上 S₄ 建出来了', nodes.length >= 1, JSON.stringify(nodes.map((n) => n.id)))
await pickNode(page, nodes, 'G')

await page.locator('.info-tab', { hasText: '元素' }).click({ timeout: 8000 })
await page.waitForTimeout(600)
const el = await page.evaluate(GEO)
const tabsTopElements = el.tabs?.top

ok('信息面板在（分区结构就位）', !el.err && el.brief && el.panel, JSON.stringify(el))
ok('面板撑满限高 540px（不是被内容压小）', el.bodyH === 540, `bodyH=${el.bodyH}`)
ok(
  '摘要区被夹在 240px 以内（自己滚，不往下长）',
  el.brief.h <= 240 && el.briefScroll.over,
  JSON.stringify({ brief: el.brief, scroll: el.briefScroll }),
)
ok(
  'tab 区 ≥ 240px（摘要区吃不到它）',
  el.panel.h >= 240,
  `panelH=${el.panel.h}`,
)
ok('tab 头在面板里（没被挤出去）', el.tabs?.inBody === true, JSON.stringify(el.tabs))
ok(
  '元素表整个在面板里（不越界、不被压扁）',
  el.table?.inBody === true,
  JSON.stringify(el.table),
)
ok(
  '元素表 5 个共轭类**全部画得出来**（表格自身不需要滚）',
  el.tableFits === true && el.clsRows === 5,
  JSON.stringify({ fits: el.tableFits, rows: el.clsRows, scroll: el.tableScroll }),
)
ok('这一屏确实有「可做」与关系（摘要区是真被撑满的）', el.relCount >= 1, `rel=${el.relCount}`)

/* ── ② 切到「子群」：tab 头位置不动（面板高度稳定）───────── */
await page.locator('.info-tab', { hasText: '子群' }).click({ timeout: 8000 })
await page.waitForTimeout(700)
const sg = await page.evaluate(GEO)
ok('切 tab 后 tab 头位置不变（面板高度稳定）', sg.tabs?.top === tabsTopElements, `${tabsTopElements} → ${sg.tabs?.top}`)
ok('子群列表有自己的滚动区（不撑破面板）', sg.panelScroll?.s > 0, JSON.stringify(sg.panelScroll))
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

/* ── ③ 矮窗口（1200×620 → 62vh = 384）同源缩，仍然看全 ────── */
const low = await browser.newPage({ viewport: { width: 1200, height: 620 } })
const nodesLow = await boot(low)
await pickNode(low, nodesLow, 'G')
await low.locator('.info-tab', { hasText: '元素' }).click({ timeout: 8000 })
await low.waitForTimeout(600)
const elLow = await low.evaluate(GEO)
ok(
  '矮窗口：摘要区跟着缩（28vh 同源）',
  elLow.brief.h <= 240 && elLow.brief.h < el.brief.h,
  JSON.stringify({ tall: el.brief.h, low: elLow.brief.h }),
)
ok(
  '矮窗口：元素表依然整个画得出来',
  elLow.table?.inBody === true && elLow.tableFits === true,
  JSON.stringify({ table: elLow.table, fits: elLow.tableFits }),
)

ok('无控制台报错', logs.length === 0, logs.slice(0, 3).join(' | '))

await browser.close()
console.log(`\n${pass} PASS / ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 1)
