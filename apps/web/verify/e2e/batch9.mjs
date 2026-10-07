/**
 * 走查：第十七批（2026-09-30 用户实测反馈）—— 四条。
 *
 *   ① 刷新时保存画布（`gal/board.ts`）—— 从前只有钉住位置落盘，定义行不落盘
 *   ② 「清空画布」入口 —— 定义行落盘之后，刷新不再等于"重来"，得有个明面上的出口
 *   ③ `N_G` / `C_G` 的**反序兜底** —— 用户"先点 A₄ 再点 S₄"拼出 `N_G(A₄, S₄)`，
 *      core 静默返空集 ⇒ 画布上长出 **0 阶的"群"**（用户报的就是这条）。
 *      反序兜底靠 `tryOrder` 判"正序真的不成立"，而正序的假成功正是这次修掉的。
 *   ④ 子群列表可区分 —— 共轭类代表每行给**代表子群**、`Sub(G)` 按结构分组折叠
 *
 * ⚠️ ① ② 两段用**不带** `?empty=1` 的地址（要测落盘），所以进出一律清 localStorage，
 * 免得污染后面那些用 `?empty=1` 的走查。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/batch9.mjs`
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

/* ── 辅助 ─────────────────────────────────────────────── */

const clickSvg = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return false
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, sel)

const clickEl = async (sel) => {
  const n = await page.locator(sel).count()
  if (n === 0) return false
  await page.click(sel, { timeout: 6000 })
  await page.waitForTimeout(340)
  return true
}

const selectNode = async (id) => {
  const done = await clickSvg(`g.gnode[data-id="${id}"] .gnode-hit`)
  await page.waitForTimeout(380)
  return done
}

const ui = () =>
  page.evaluate(() => ({
    nodes: [...document.querySelectorAll('svg.canvas g.gnode')].map((g) => g.dataset.id),
    labels: [...document.querySelectorAll('svg.canvas g.gnode')].map((g) => g.dataset.label ?? ''),
    rows: [...document.querySelectorAll('.row-name')].map((e) => e.textContent.trim()),
    infoOpen: document.querySelectorAll('.insights').length > 0,
    infoText: document.querySelector('.insights')?.textContent ?? '',
    genCols: [...document.querySelectorAll('.insp-sub-gen')].map((e) => e.textContent.trim()),
    subRows: [...document.querySelectorAll('.insp-sub')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    groupHeads: [...document.querySelectorAll('.sub-group-head')].map((e) =>
      e.textContent.replace(/\s+/g, ' ').trim(),
    ),
    status: document.querySelector('.composer-status')?.textContent?.trim() ?? null,
    hint: document.querySelector('.pending-hint')?.textContent?.trim() ?? null,
    pending: document.querySelectorAll('.pending-bar').length,
  }))

const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(220)
  }
}
/**
 * 写一行定义。
 *
 * `expectFail` = 这一行**本来就该失败**（测报错文案用）：失败时输入卡片
 * 保持打开（它本来就是"预览不 ok 就不提交"），把状态行的文字读回来。
 */
const addLine = async (name, expr, expectFail = false) => {
  await ensureCard()
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(200)
  const btn = page.locator('.composer-orb .composer-row button').first()
  const enabled = await btn.isEnabled()
  if (enabled) {
    await btn.click()
    await page.waitForTimeout(420)
  }
  const status = await page.evaluate(
    () => document.querySelector('.composer-status')?.textContent?.trim() ?? null,
  )
  if (!expectFail && (await page.locator('.composer-card').count()) > 0) {
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(200)
  }
  return { status, enabled }
}

/** 点「对象」抽屉里的一行（子群集是 list，**不上画布**，只能在抽屉里点） */
const clickObjectRow = async (id) => {
  const hit = await page.evaluate((want) => {
    const rows = [...document.querySelectorAll('.row')]
    const row = rows.find((r) => r.querySelector('.row-name')?.textContent?.trim() === want)
    if (!row) return false
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, id)
  await page.waitForTimeout(420)
  return hit
}

/**
 * 展开某个抽屉（`对象` / `操作` / `信息`）。
 *
 * ⚠️ `Sub(G)` 这类**手打的运算行** origin 是 `derived` ⇒ 落「操作」抽屉，
 * 而它**默认收着、收起时 body 整个不渲染** —— 不展开就一行都读不到。
 */
const openDock = async (title) => {
  const hit = await page.evaluate((want) => {
    const btn = [...document.querySelectorAll('.dock-toggle')].find(
      (b) => b.querySelector('.dock-title')?.textContent?.trim() === want,
    )
    if (!btn) return false
    const dock = btn.closest('.dock')
    if (!dock?.classList.contains('open')) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, title)
  await page.waitForTimeout(360)
  return hit
}

/* ══ ① 刷新时保存画布 ═══════════════════════════════════ */

console.log('== ① 刷新时保存画布 ==')
await page.goto(BASE, { waitUntil: 'load' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(1200)
{
  // 先清掉默认示范页（这会写下一份"空存档"），再从零摆两个对象
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.canvas-toolbar .ct-btn')].find(
      (x) => x.textContent.trim() === '清空画布',
    )
    b?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(420)

  await addLine('A', 'S_4')
  await addLine('B', 'A_4')
  const before = await ui()
  ok('先摆两个对象', before.nodes.join(' ') === 'A B', before.nodes.join(' '))

  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1400)
  const after = await ui()
  ok('刷新后画布还在（定义行落盘了）', after.nodes.join(' ') === 'A B', after.nodes.join(' '))
  ok('定义行也在', after.rows.join(' ').includes('A') && after.rows.join(' ').includes('B'), after.rows.join(' '))

  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1400)
  ok('再刷一次还稳', (await ui()).nodes.join(' ') === 'A B', (await ui()).nodes.join(' '))
}

/* ══ ② 清空画布（含钉住与视口）═══════════════════════════ */

console.log('')
console.log('== ② 清空画布 ==')
{
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.canvas-toolbar .ct-btn')].find(
      (x) => x.textContent.trim() === '清空画布',
    )
    if (!b) return false
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  ok('工具条上有「清空画布」', clicked)
  await page.waitForTimeout(500)
  ok('画布空了', (await ui()).nodes.length === 0, (await ui()).nodes.join(' '))

  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1400)
  ok('刷新之后**没有**回来（清空 = 删档）', (await ui()).nodes.length === 0, (await ui()).nodes.join(' '))
  await page.evaluate(() => localStorage.clear())
}

/* ══ ③ 反序兜底：先点 A₄ 再点 S₄ ═══════════════════════ */

console.log('')
console.log('== ③ N_G / C_G 的反序兜底（用户报的那条）==')
{
  await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
  await page.waitForTimeout(1300)
  await addLine('A', 'S_4')
  await addLine('B', 'A_4')

  // ⊕ 球 → 「正规化子」（op id = normalizer）→ pending → **先点 A₄、再点 S₄**（用户的心智顺序）
  await clickEl('.multi-orb .orb-center')
  const picked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.orb-center-panel .orb-op')]
    const hit = btns.find((b) => b.dataset.op === 'normalizer')
    if (!hit) return false
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  // 翻账（W1，2026-10-06）：显示名改中文，断言改按 data-op。
  ok('⊕ 球里有「正规化子」', picked)
  await page.waitForTimeout(420)
  ok('进了 pending', (await ui()).pending === 1)

  await selectNode('B') // 先点 A₄
  await selectNode('A') // 再点 S₄
  await page.waitForTimeout(700)

  const st = await ui()
  ok('长出了新对象', st.nodes.length === 3, st.nodes.join(' '))
  /**
   * 参数顺序的判据：`N_G(G, H)` 的第二参才是"要算谁的正规化子"，
   * 所以**兜正之后** label 是 `N(B)`（B = A₄）；正序（没兜）会是 `N(A)` 且 0 阶。
   */
  ok('参数顺序被兜正（label 是 N(B)，即 N_{S_4}(A_4)）', st.labels.join('|').includes('N(B)'), st.labels.join('|'))
  ok('没有按正序算（不存在 N(A)）', !st.labels.join('|').includes('N(A)'), st.labels.join('|'))

  // 点开它看一眼：|N| 必须是 24（S₄ 里 A₄ 的正规化子就是 S₄）
  const newId = st.nodes.find((n) => !['A', 'B'].includes(n))
  await selectNode(newId)
  await page.waitForTimeout(420)
  const info = await ui()
  ok('信息面板里写着 24', info.infoText.includes('24'), info.infoText.slice(0, 80))
  ok('不是"0 阶"', !/阶\s*0|order=0|\|G\|\s*=\s*0/.test(info.infoText), info.infoText.slice(0, 80))

  await page.screenshot({ path: '../../docs/assets/u37-normalizer-order.png' })
}

/* ══ ③b 手打的错序**不许**替用户改（U21 的纪律）═══════════ */

console.log('')
console.log('== ③b 手打错序照旧报错 ==')
{
  const { status, enabled } = await addLine('X', 'N_G(B, A)', true)
  ok('提交按钮是禁用的（预览不 ok）', enabled === false, `enabled=${enabled}`)
  ok('状态行说了原因', !!status && status.length > 0, String(status))
  ok('报的是"不在同一个群里"', (status ?? '').includes('不在'), String(status))
  ok('没有偷偷替用户算出来', !(await ui()).nodes.includes('X'), (await ui()).nodes.join(' '))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(260)
}

/* ══ ④ 子群列表可区分 ═══════════════════════════════════ */

console.log('')
console.log('== ④ 子群列表 ==')
{
  await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
  await page.waitForTimeout(1300)
  await addLine('G', 'D_4')
  await selectNode('G')
  await page.locator('.info-sec-head[data-sec="subgroups"]').click()
  await page.waitForTimeout(420)

  const st = await ui()
  ok('「子群」tab 列出了共轭类代表', st.subRows.length >= 4, `${st.subRows.length} 行`)
  ok('每行都有"代表子群"', st.genCols.length === st.subRows.length, `${st.genCols.length}/${st.subRows.length}`)
  const c2rows = st.genCols.filter((g) => g.length > 0)
  ok(
    '三行 C_2 的代表互不相同（从前逐字相同）',
    new Set(c2rows).size === c2rows.length,
    c2rows.join(' / '),
  )
  ok('能看见 ⟨r2⟩ 这类生成元', c2rows.some((g) => /r/.test(g)), c2rows.join(' / '))

  // 「全部子群」按结构分组 —— 注意 `Sub(G)` 是 **list**，不上画布；
  // 手打的行 origin 是 derived ⇒ 落「操作」抽屉，得先把它展开
  await addLine('S', 'Sub(G)')
  ok('「操作」抽屉展开得了', await openDock('操作'))
  ok('对象抽屉里有 S 这一行', await clickObjectRow('S'), (await ui()).rows.join(' '))
  await page.waitForTimeout(420)
  const st2 = await ui()
  ok('Sub(G) 按结构折成组', st2.groupHeads.length >= 3, `${st2.groupHeads.length} 组：${st2.groupHeads.join(' / ')}`)
  ok('组头带计数（x3 这种）', st2.groupHeads.some((h) => /x\d/.test(h)), st2.groupHeads.join(' / '))

  await page.screenshot({ path: '../../docs/assets/u37-subgroup-groups.png' })
}

ok('全程零 console 错误', logs.length === 0, logs.slice(0, 3).join(' | '))

await browser.close()
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 1)
