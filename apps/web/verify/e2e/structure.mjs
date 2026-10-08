/**
 * 走查：**代数结构**（S2）—— 从"三阶集自配运算"走到"画布上的圆变方"。
 *
 * ── 这一套守的是什么 ────────────────────────────────────────────
 * `verify/suites/u60.ts` 测的是**函数对不对**（语义层）。这一套测的是
 * **用户能不能做成这件事**（真浏览器，从入口走到产物）。项目教训
 * （`verify/README.md` 第 74 条）：**"入口通了 ≠ 进去能用"**、
 * **"一次改动只跑覆盖它的那一套 = 没验过"**。
 *
 * 七条对应 DEVPLAN §12.1：
 *   ① 目录「造结构」点得开，编辑器 DOM 真的出现（载体那一行也真的落了）
 *   ② 集合球上有「给它一个运算」
 *   ③ 填 V₄ 表 → 确认 → 画布 id 差集非空，且 M 的 `data-shape` 是 `group`（方）
 *   ④ 实时公理档案：逐条与手算一致（不是"有个东西显示了"）
 *   ⑤ **正例**：群结构的球上点得到 `Sub`，且**点下去真长出节点**
 *   ⑥ **负例**：半群结构的球上**没有**任何群操作（`Sub` / `Z` 都不在）
 *   ⑦ 非群结构的形状是**双线圆**（`data-shape=structure` + `.gnode-ring` 在）
 *
 * 形状与菜单**必须同时变**（§11.6）—— 只对一边就是病根漏到了画布。
 *
 * 跑法（先起 dev server 5273，cwd 必须是 apps/web）：`node verify/e2e/structure.mjs`
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.setDefaultTimeout(6000)

const logs = []
page.on('console', (m) => {
  if (m.type() === 'error') logs.push(m.text())
})
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1400)

/* ── 输入与探测辅助 ─────────────────────────────────────── */

const addLine = async (name, expr) => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(220)
  }
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(260)
  await page.evaluate(() => {
    const b = document.querySelector('.composer-orb .composer-row button')
    if (b && !b.disabled) b.click()
  })
  await page.waitForTimeout(420)
}

const nodeIds = () =>
  page.evaluate(() => [...document.querySelectorAll('svg.canvas g.gnode')].map((g) => g.dataset.id))

/** 节点的形状读数（成对：`data-shape` + 内环 `.gnode-ring` 的有无）。 */
const nodeShape = (id) =>
  page.evaluate((nid) => {
    const g = document.querySelector(`svg.canvas g.gnode[data-id="${nid}"]`)
    if (!g) return null
    return {
      shape: g.getAttribute('data-shape'),
      hit: g.querySelector('.gnode-hit')?.tagName ?? null,
      ring: !!g.querySelector('.gnode-ring'),
    }
  }, id)

const edgeIds = () =>
  page.evaluate(() => [...document.querySelectorAll('svg.canvas g.gedge')].map((g) => g.getAttribute('data-edge-id')))

const notice = () =>
  page.evaluate(() => {
    const n = document.querySelector('.notice')
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : null
  })

const isError = (t) => !!t && /需要|不是|不能|没有|算不了|失败|必须/.test(t)

const escapeAll = async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(280)
}

const rows = async () => {
  await page.evaluate(() => {
    for (const label of ['对象', '操作']) {
      const t = [...document.querySelectorAll('.dock-topleft .dock-toggle')].find((b) =>
        b.textContent.includes(label),
      )
      if (t && !t.closest('.dock').className.includes('open')) t.click()
    }
  })
  await page.waitForTimeout(360)
  return page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .row')].map((r) => ({
      name: r.querySelector('.row-name')?.textContent?.trim() ?? '?',
      def: r.querySelector('.row-def')?.textContent?.trim() ?? '',
      err: r.querySelector('.row-err')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    })),
  )
}

const openOrb = async (id) => {
  await escapeAll()
  await page.evaluate((nid) => {
    const el = document.querySelector(`svg.canvas g.gnode[data-id="${nid}"] .gnode-hit`)
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, id)
  await page.waitForTimeout(380)
  await page.evaluate(() => {
    const o = document.querySelector('.orb:not(.orb-center)')
    if (o) o.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(440)
}

const ringLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.orb-sat')].map((e) => e.textContent.trim()),
  )

/** 环上"直接是 op"的那些（带 `data-op` 的）—— 按 op id 比，不按显示文本。 */
const ringOpIds = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.orb-sat[data-op]')].map((e) => e.dataset.op),
  )

const clickRingItem = async (label) => {
  const hit = await page.evaluate((want) => {
    const it = [...document.querySelectorAll('.orb-sat')].find(
      (e) => e.textContent.trim() === want,
    )
    if (!it) return false
    it.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, label)
  await page.waitForTimeout(600)
  return hit
}

/** 点左栏「操作」抽屉里那条（悬浮球展开后的面板：`.orb-ops-panel .orb-op`）。 */
// 按 data-op 找，不按显示文本（显示名 2026-10-06 起是中文，会随文案漂移）。
const clickOrbOp = async (opId) => {
  const hit = await page.evaluate((want) => {
    const b = [...document.querySelectorAll('.orb-ops-panel .orb-op')].find(
      (x) => x.dataset.op === want,
    )
    if (!b) return false
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, opId)
  await page.waitForTimeout(900)
  return hit
}

/** 展开「目录」抽屉并点某一个 `.cat-go`（按按钮文字找 —— 有三个：造点集/按标号造/造结构）。*/
const clickCatalogGo = async (label) => {
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.dock-topleft .dock-toggle')].find((b) =>
      b.textContent.includes('目录'),
    )
    if (t && !t.closest('.dock').className.includes('open')) t.click()
  })
  await page.waitForTimeout(380)
  const hit = await page.evaluate((want) => {
    const b = [...document.querySelectorAll('.cat-go')].find((x) => x.textContent.trim() === want)
    if (!b) return false
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, label)
  await page.waitForTimeout(600)
  return hit
}

/** 编辑器里那张 n×n 网格的读数（逐格 `data-cell` + 值）。 */
const gridState = () =>
  page.evaluate(() => {
    const root = document.querySelector('.struct-builder')
    if (!root) return null
    return {
      head: root.querySelector('.mb-head')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      cells: [...root.querySelectorAll('.sb-cell')].map((s) => ({
        at: s.getAttribute('data-cell'),
        v: s.value,
      })),
      check: root.querySelector('.mb-check')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    }
  })

/** 实时公理档案（`v`/`x`/`-` + 每行的读数正文）。 */
const readout = () =>
  page.evaluate(() => {
    const root = document.querySelector('.sb-axioms')
    if (!root) return null
    const v = root.querySelector('.sb-verdict')
    return {
      level: v?.getAttribute('data-verdict') ?? null,
      verdict: v?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      rows: [...root.querySelectorAll('.sb-ax')].map((r) => ({
        k: r.querySelector('.sb-ax-k')?.textContent?.trim() ?? '',
        mark: r.querySelector('.sb-mark')?.textContent?.trim() ?? '',
        v: r.querySelector('.sb-ax-v')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      })),
    }
  })

const markOf = (r, k) => r?.rows.find((x) => x.k === k)?.mark ?? '(缺行)'
const textOf = (r, k) => r?.rows.find((x) => x.k === k)?.v ?? '(缺行)'

/* ══ 场景 ①：目录「造结构」这条路 ══════════════════════════════ */

console.log('\n== 场景 1：目录「造结构」点得开，编辑器真的出现 ==')
let carrierId = null
{
  const hit = await clickCatalogGo('造结构')
  ok('点得中目录里的「造结构」按钮', hit)
  const st = await gridState()
  ok('编辑器 DOM 真的出现（.struct-builder）', !!st, JSON.stringify(st))
  if (st) {
    // 默认标号 `1, 2, 3` ⇒ 3×3 = 9 格，全空
    ok('载体是 3 个点 ⇒ 9 个格子', st.cells.length === 9, `cells=${st.cells.length}`)
    ok('格子初始全空（不预填"看起来像群"的表）', st.cells.every((c) => c.v === ''))
    ok('状态行说清还差几格', /还有 9 格没填/.test(st.check), st.check)
  }
  // 载体那一行真的落了（先有载体才有运算，§11.3：两个节点）
  // ⚠️ def 含花括号 ⇒ KaTeX 渲染吃空格 ⇒ 对空格宽容
  const rs = await rows()
  const carrier = rs.find((r) => /\{1,\s*2,\s*3\}/.test(r.def))
  ok('载体真的落成一行定义（{1, 2, 3}）', !!carrier && !carrier.err, JSON.stringify(carrier))
  carrierId = carrier?.name ?? null
  ok('载体在画布上有节点', !!carrierId && (await nodeIds()).includes(carrierId), String(carrierId))
  await escapeAll()
}

/* ══ 场景 ②：从集合球上起 —— 与目录是同一条路 ═════════════════ */

console.log('\n== 场景 2：集合球上的「给它一个运算」 ==')
{
  await openOrb(carrierId)
  const ring = await ringLabels()
  ok('点集的球上有「给它一个运算」', ring.includes('给它一个运算'), ring.join(', '))
  // 翻账（W1，2026-10-06）：显示名改中文，断言改按 data-op。
  ok('球上没有裸露的 `structure` 按钮（实现名不该当入口名）', !(await ringOpIds()).includes('structure'), ring.join(', '))
  const hit = await clickRingItem('给它一个运算')
  ok('点得中，编辑器打开', hit && (await gridState()) !== null)
  await escapeAll()
}

/* ══ 场景 ③④：填 V₄ 表 —— 实时读数 + 确认 ════════════════════ */

console.log('\n== 场景 3/4：填 V4 表，实时读数与手算一致 ==')
/*
 * 手算的 V4（载体 `1, 2, 3, 4`，1-based 行优先）：
 *   [1 2 3 4;  2 1 4 3;  3 4 1 2;  4 3 2 1]
 * 它是群：封闭 ✓ 结合 ✓ 单位元 1 ✓ 逆 ✓ 交换 ✓ 拉丁方 ✓。
 */
const V4_TABLE = [
  [1, 2, 3, 4],
  [2, 1, 4, 3],
  [3, 4, 1, 2],
  [4, 3, 2, 1],
]
let structId = null
{
  // 重开一页只做这一件事（前面场景留下的节点会把新节点挤到窗口外）
  await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await addLine('P', 'labeledSet(1, 2, 3, 4)')
  await escapeAll()
  await openOrb('P')
  await clickRingItem('给它一个运算')
  const opened = await gridState()
  ok('4 点载体 ⇒ 16 格', opened?.cells.length === 16, `cells=${opened?.cells.length}`)

  const before = await nodeIds()
  // 逐格填（selectOption 是真事件，React 收得到）
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      await page.selectOption(`.sb-cell[data-cell="${i}-${j}"]`, String(V4_TABLE[i][j]))
    }
  }
  await page.waitForTimeout(420)

  const live = await readout()
  console.log('  [诊断] 实时读数 ' + JSON.stringify(live))
  ok('填满后出现实时公理档案', !!live)
  ok('  逐条：封闭 ✓', markOf(live, '封闭') === 'v', markOf(live, '封闭'))
  ok('  逐条：结合 ✓', markOf(live, '结合') === 'v', markOf(live, '结合'))
  ok('  逐条：单位元 ✓', markOf(live, '单位元') === 'v', markOf(live, '单位元'))
  ok('  逐条：逆元 ✓', markOf(live, '逆元') === 'v', markOf(live, '逆元'))
  ok('  逐条：交换 ✓', markOf(live, '交换') === 'v', markOf(live, '交换'))
  ok(
    '  结合的读数与手算一致（不是"有个东西显示了"）',
    textOf(live, '结合') === '(ab)c = a(bc) 恒成立',
    textOf(live, '结合'),
  )
  ok('  结论 = 群', live?.level === 'group' && /群/.test(live.verdict), live?.verdict)
  ok('  单位元的读数指名 e = 1（手算）', textOf(live, '单位元') === 'e = 1', textOf(live, '单位元'))

  // 确认
  await page.click('.struct-builder .mb-btn.primary')
  await page.waitForTimeout(900)
  const after = await nodeIds()
  const fresh = after.filter((id) => !before.includes(id))
  ok('确认后画布多出节点（比 id 差集，不看"节点数 +1"）', fresh.length > 0, `before=[${before}] after=[${after}]`)
  structId = fresh[0] ?? null
  ok('没有报错提示', !isError(await notice()), String(await notice()))

  const sh = structId ? await nodeShape(structId) : null
  console.log('  [诊断] M 的形状 ' + JSON.stringify(sh))
  ok('M 的形状是方（data-shape=group）—— 够格成群', sh?.shape === 'group', JSON.stringify(sh))
  ok('  M 上没有内环（升格的可见形式 = 内环消失 + 圆变方）', sh?.ring === false, JSON.stringify(sh))

  const es = await edgeIds()
  ok('载体 -> 结构 有一条来源线（§11.3）', !carrierId || es.includes(`P->${structId}`), es.join(', '))
}

/* ══ 场景 ⑤：正例 —— 群结构的球上点得到 Sub，且点下去真长出节点 ══ */

console.log('\n== 场景 5：群结构的球上有 Sub，点下去真算得出 ==')
{
  await openOrb(structId)
  const ring = await ringLabels()
  console.log('  [诊断] 结构节点的环 = ' + ring.join(', '))
  ok('群结构的球上有「操作」（操作不止三条，收进面板）', ring.includes('操作'), ring.join(', '))
  const opened = ring.includes('操作') ? await clickRingItem('操作') : false
  // 翻账（W1，2026-10-06）：显示名改中文，断言改按 data-op。
  ok('点得开「操作」面板', opened || (await ringOpIds()).includes('subgroups'))
  const opIds = await page.evaluate(() =>
    [...document.querySelectorAll('.orb-ops-panel .orb-op')].map((e) => e.dataset.op),
  )
  console.log('  [诊断] 面板里的操作 = ' + opIds.join(', '))
  // 翻账（W1，2026-10-06）：显示名改中文，断言改按 data-op。
  ok('面板里有「所有子群」（形状说方，菜单里就得有）', opIds.includes('subgroups'), opIds.join(', '))
  ok('面板里有「中心」', opIds.includes('center'), opIds.join(', '))

  // §12.2 的反证：**点一下**，不能只看标签（"形状对、菜单也对，但点下去报错"）
  //
  // ⚠️ 判据要**按结果的去处**选：`Sub(A)` 的产物是**子群集**（`sortOf = list`），
  // 它**不上画布**（DIAGRAM_SPEC §3）—— 所以拿"画布 id 差集"当判据会永远为空
  // （写了条看着很硬、其实恒假的断言）。它的落点是左栏「操作」抽屉的那一行。
  const rowsBefore = await rows()
  // 翻账（W1，2026-10-06）：显示名改中文，断言改按 data-op。
  const clicked = await clickOrbOp('subgroups')
  const nt = await notice()
  const rowsAfter = await rows()
  const subRow = rowsAfter.find((r) => /^Sub\(/.test(r.def))
  ok('点得中「所有子群」', clicked)
  ok(
    '「所有子群」真算得出（左栏多出 Sub(...) 那一行，且没报错）',
    !!subRow && !subRow.err && !isError(nt),
    `notice=${JSON.stringify(nt)} 新行=${JSON.stringify(rowsAfter.filter((r) => !rowsBefore.some((b) => b.name === r.name)))}`,
  )

  // 另一半：产**群**的操作（`center`）该在画布上真的多一个节点
  await openOrb(structId)
  const opened2 = (await ringLabels()).includes('操作') ? await clickRingItem('操作') : false
  const before2 = await nodeIds()
  const zHit = opened2 ? await clickOrbOp('center') : false
  const nt2 = await notice()
  const after2 = await nodeIds()
  // 翻账（W1，2026-10-06）：显示名改中文，断言改按 data-op。
  ok('点得中「中心」', zHit)
  ok(
    '「中心」真算得出（画布多了节点 —— 它产群，是顶点）',
    zHit && !isError(nt2) && after2.some((id) => !before2.includes(id)),
    `notice=${JSON.stringify(nt2)} before=[${before2}] after=[${after2}]`,
  )
}

/* ══ 场景 ⑥⑦：负例 —— 半群结构「双线圆 + 球上没有任何群操作」 ══ */

console.log('\n== 场景 6/7：半群结构 = 双线圆，球上没有群操作 ==')
{
  /*
   * 左零带 `{a, b}`（x*y = x）：结合 ✓、无单位元 ⇒ **半群**。
   * 手算：a*a=a, a*b=a, b*a=b, b*b=b ⇒ 表 1,1,2,2。
   */
  await escapeAll()
  await addLine('Q', 'labeledSet(a, b)')
  await addLine('S2', 'structure(Q, 1,1,2,2)')
  await escapeAll()
  const rs = await rows()
  const s2row = rs.find((r) => r.name === 'S2')
  ok('半群结构建成（行上没报错）', !!s2row && !s2row.err, JSON.stringify(s2row))

  const sh = await nodeShape('S2')
  console.log('  [诊断] S2 的形状 ' + JSON.stringify(sh))
  ok('半群结构的形状是 structure（不是方）', sh?.shape === 'structure', JSON.stringify(sh))
  ok('  内环在（双线圆的第二条判据，与 data-shape 成对）', sh?.ring === true, JSON.stringify(sh))
  ok('  外圈仍然是圆（不是矩形）', sh?.hit === 'circle', String(sh?.hit))

  await openOrb('S2')
  const ring = await ringLabels()
  const ringIds = await ringOpIds()
  console.log('  [诊断] 半群结构的环 = ' + ring.join(', '))
  // 翻账（W1，2026-10-06）：显示名改中文，断言改按 data-op。
  ok('半群结构的球上没有「所有子群」', !ringIds.includes('subgroups'), ring.join(', '))
  ok('半群结构的球上没有「中心」', !ringIds.includes('center'), ring.join(', '))
  ok('半群结构的球上也没有「操作」面板（一条群操作都列不出）', !ring.includes('操作'), ring.join(', '))
  ok('  但它不是死路：还有「信息」', ring.includes('信息'), ring.join(', '))

  /*
   * 面板：公理档案 + 运算表（§11.2：级别在面板，不在画布）。
   *
   * ⚠️ 2026-10-08：信息面板并入工作台、手风琴改**竖排节导航**（一次摊一节）——
   * 两节仍然要**分两趟读**：先切 `axioms` 读掉，再切 `table` 读表。
   */
  await clickRingItem('信息') // 升起工作台（球菜单的「信息」入口 = 升台 + basic）
  await page.evaluate(() => document.querySelector('.bench-tab[data-tab="axioms"]')?.click())
  await page.waitForTimeout(420)
  const axioms = await page.evaluate(() => {
    const secs = [...document.querySelectorAll('.bench-tab')].map((s) => s.dataset.tab)
    const v = document.querySelector('.bench .sb-verdict')
    const rows = [...document.querySelectorAll('.bench .sb-ax')].map((r) => ({
      k: r.querySelector('.sb-ax-k')?.textContent?.trim() ?? '',
      mark: r.querySelector('.sb-mark')?.textContent?.trim() ?? '',
    }))
    return {
      secs,
      verdict: v?.getAttribute('data-verdict') ?? null,
      header: v?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      /** 「单位元」那一行的读数（半群的关键反例就在这条上）*/
      unit: rows.find((r) => r.k === '单位元')?.mark ?? '(缺行)',
      assoc: rows.find((r) => r.k === '结合')?.mark ?? '(缺行)',
      rowCount: rows.length,
    }
  })
  console.log('  [诊断] 公理档案 ' + JSON.stringify(axioms))
  ok('面板里有「公理档案」节', axioms.secs.includes('axioms'), axioms.secs.join(','))
  ok('面板里有「运算表」节', axioms.secs.includes('table'), axioms.secs.join(','))
  ok('公理档案说：半群', axioms.verdict === 'semigroup', String(axioms.verdict))
  ok('  「就差一步：单位元」（failsAt 上了屏）', /单位元/.test(axioms.header), axioms.header)
  ok('  逐条都上屏（10 条读数）', axioms.rowCount === 10, String(axioms.rowCount))
  ok('  结合 ✓（左零带确实结合）', axioms.assoc === 'v', axioms.assoc)
  ok('  单位元 ✗（左零带没有单位元 —— 这就是它停在半群的原因）', axioms.unit === 'x', axioms.unit)

  await page.evaluate(() => document.querySelector('.bench-tab[data-tab="table"]')?.click())
  await page.waitForTimeout(400)
  const tbl = await page.evaluate(() => {
    const table = document.querySelector('.bench .struct-table')
    return {
      hasTable: !!table,
      tableSize: table?.getAttribute('data-size') ?? null,
      cell01: table?.querySelector('td[data-cell="0-1"]')?.textContent?.trim() ?? null,
    }
  })
  console.log('  [诊断] 运算表 ' + JSON.stringify(tbl))
  ok('  运算表在（2 x 2）', tbl.hasTable && tbl.tableSize === '2', String(tbl.tableSize))
  /*
   * 表里那一格也要对：左零带 a*b = a ⇒ 第 0 行第 1 列读到标号 `a`。
   * 只数"表在不在"是装饰性断言（表在、内容全错也能绿）。
   */
  ok('  表的内容对（a*b = a ⇒ [0][1] 读到 a）', tbl.cell01 === 'a', String(tbl.cell01))
}

/* ══ 场景 ⑧：界面文字不泄漏 LaTeX（新面也要过这一关）══════════ */

console.log('\n== 场景 8：新增界面的纯文本面 ==')
{
  const texts = await page.evaluate(() => {
    const out = []
    for (const sel of ['.notice', '.orb', '.bench', '.dock-topleft', '.map-builder']) {
      for (const el of document.querySelectorAll(sel)) {
        out.push(el.textContent.replace(/\s+/g, ' ').trim())
      }
    }
    return out
  })
  const leak = texts.filter((t) => t.includes('\\'))
  ok('界面文字里没有反斜杠（LaTeX 泄漏）', leak.length === 0, JSON.stringify(leak.slice(0, 3)))
  ok('没有未捕获的控制台错误', logs.length === 0, logs.slice(0, 2).join(' | '))
}

console.log(`\n${pass} PASS / ${fail} FAIL`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
