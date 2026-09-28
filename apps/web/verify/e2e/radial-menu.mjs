/**
 * 走查：**对象悬浮球**（径向菜单，U2 落地 / U3.1 扩展）。
 *
 * 三个操作入口（左栏表 \\cdot 悬浮球 \\cdot \\oplus球）里最早的这一个，一直没有独立走查。
 * 它写着几条用户直接摸得到的主张：
 *   \\cdot 球挂在节点**左上角**（右侧和下方是出边的地方，不遮箭头）
 *   \\cdot **映射没有节点**，球改挂在箭头中点上方 —— 于是"点箭头 \\to 点 ker"成立
 *   \\cdot 环绕按钮**按值类型定**：群给三个"看" + 一个「操作」；其它值给「信息」+ 直接铺开的单对象操作
 *   \\cdot 面板里**点一下直接创建**（不是"列出来看看"）
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/radial-menu.mjs`
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

/** 画布上的节点/边是 SVG（`stroke: transparent` 的命中层 Playwright 判 not visible）\\to 派发事件 */
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
  page.evaluate(() => {
    const orb = document.querySelector('.orb:not(.orb-center)')
    const rb = orb?.getBoundingClientRect()
    return {
      orb: !!orb,
      orbOn: orb?.classList.contains('on') ?? false,
      orbAt: rb ? { x: rb.left + rb.width / 2, y: rb.top + rb.height / 2 } : null,
      sats: [...document.querySelectorAll('.orb-sat')].map((e) => e.textContent.trim()),
      opsPanel: document.querySelectorAll('.orb-ops-panel:not(.orb-center-panel)').length,
      ops: [...document.querySelectorAll('.orb-ops-panel:not(.orb-center-panel) .orb-op-label')].map((e) =>
        e.textContent.trim(),
      ),
      centerPanel: document.querySelectorAll('.orb-center-panel').length,
      centerOps: [...document.querySelectorAll('.orb-center-panel .orb-op-label')].map((e) => e.textContent.trim()),
      pending: document.querySelectorAll('.pending-bar').length,
      hint: document.querySelector('.pending-hint')?.textContent?.trim() ?? null,
      fillFields: document.querySelectorAll('.fill-field input').length,
      infoTab: document.querySelector('.info-tab.on')?.textContent?.trim() ?? null,
      infoOpen: document.querySelectorAll('.insights').length > 0,
      nodes: [...document.querySelectorAll('svg.canvas g.gnode')].map((g) => g.dataset.id),
      dim: document.querySelectorAll('g.gnode.dim').length,
      errs: [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()),
    }
  })

/* ══ 舞台 ═══════════════════════════════════════════════ */

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1300)

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
  await page.click('.composer-orb .composer-row button')
  await page.waitForTimeout(300)
}

await addLine('G', 'S_4')
await addLine('H', 'S_3')
await addLine('f', '映射(G, H, s12->23, c->13)')
await addLine('A', 'A_4')
await page.keyboard.press('Escape')
await page.waitForTimeout(450)

let st = await ui()
ok('四个对象都上了画布', st.nodes.length >= 4, st.nodes.join(','))
ok('一开始没有任何悬浮球（要先选中）', !st.orb)

/* ══ ① 选中 \\to 球出现，且挂在对的位置 ═══════════════════ */

console.log('')
console.log('== ① 选中一个对象 -> 球出现 ==')
{
  ok('点得中 S_4 的节点', await selectNode('G'))
  st = await ui()
  ok('球出现了', st.orb)
  ok('球是"收起"态（只露一个 \\cdot s）', !st.orbOn)

  // 挂在**左上角**：右侧与下方是出边的地方，球不该压在那儿
  const rel = await page.evaluate(() => {
    const orb = document.querySelector('.orb:not(.orb-center)')?.getBoundingClientRect()
    const node = document.querySelector('g.gnode[data-id="G"] .gnode-hit')?.getBoundingClientRect()
    if (!orb || !node) return null
    return {
      dx: orb.left + orb.width / 2 - (node.left + node.width / 2),
      dy: orb.top + orb.height / 2 - (node.top + node.height / 2),
    }
  })
  ok('球挂在节点的**左上角**（不遮出边）', !!rel && rel.dx < 0 && rel.dy < 0, JSON.stringify(rel))
}

/* ══ ② 点球 \\to 环绕按钮按值类型定 ═══════════════════════ */

console.log('')
console.log('== ② 点球 -> 环绕按钮 ==')
{
  ok('点得中球', await clickEl('.orb:not(.orb-center)'))
  st = await ui()
  ok('球变成"展开"态', st.orbOn)
  ok(
    '群给四个环：基本 / 元素 / 子群 / 操作',
    st.sats.join('|') === '基本|元素|子群|操作',
    st.sats.join('|'),
  )
}

/* ══ ③ 「基本」\\to 信息面板跟着切 ════════════════════════ */

console.log('')
console.log('== ③ 「基本」是"看"这一类 ==')
{
  ok('点得中「基本」', await clickEl('.orb-sat:text-is("基本")'))
  st = await ui()
  ok('信息面板打开了', st.infoOpen)
  ok('而且切到了「基本」页', st.infoTab === '基本', String(st.infoTab))
  ok('看完自动把球收起（不挡路）', !st.orbOn)
}

/* ══ ④ 「操作」\\to 单对象操作面板 ════════════════════════ */

console.log('')
console.log('== ④ 「操作」铺出单对象操作 ==')
{
  await selectNode('G')
  await clickEl('.orb:not(.orb-center)')
  ok('点得中「操作」', await clickEl('.orb-sat:text-is("操作")'))

  st = await ui()
  ok('操作面板出现了', st.opsPanel === 1)
  ok('列出的条数够多（群上的单对象操作有一串）', st.ops.length >= 8, `${st.ops.length} 条：${st.ops.join(' / ')}`)
  ok('里面有「中心 Z」', st.ops.includes('中心 Z'), st.ops.join(','))
  ok('里面有「换位子群 [G,G]」', st.ops.includes('换位子群 [G,G]'), st.ops.join(','))
  ok('下面那一列是「元素阶 ord」不该在（产数值的不进菜单）', !st.ops.includes('元素阶 ord'), st.ops.join(','))

  await page.screenshot({ path: '../../docs/assets/u2-radial-menu.png' })
}

/* ══ ⑤ 点一条 \\to 真的创建（不是"列出来看看"）════════════ */

console.log('')
console.log('== ⑤ 点一下直接创建 ==')
{
  const before = (await ui()).nodes.length
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.orb-ops-panel:not(.orb-center-panel) .orb-op')]
    const hit = btns.find((b) => b.querySelector('.orb-op-label')?.textContent?.trim() === '中心 Z')
    if (!hit) return false
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  ok('点得中「中心 Z」', clicked)
  await page.waitForTimeout(520)

  st = await ui()
  ok('画布上真的多了一个对象', st.nodes.length === before + 1, `${before} -> ${st.nodes.length}`)
  ok('没有求值失败的行', st.errs.length === 0, JSON.stringify(st.errs))
}

/* ══ ⑥ 多对象球（\\oplus）：进 pending \\to 提示条说清下一位 ══════ */

console.log('')
console.log('== ⑥ 多对象球：进 pending ==')
{
  // 先收掉对象球，免得两个面板打架
  await page.keyboard.press('Escape')
  await page.waitForTimeout(320)

  ok('点得中 \\oplus 球', await clickEl('.multi-orb .orb-center'))
  st = await ui()
  ok('多对象面板出现了', st.centerPanel === 1)
  ok('列的是"多对象操作"', st.centerOps.length >= 10, `${st.centerOps.length} 条：${st.centerOps.join(' / ')}`)
  ok('里面有「商 /」', st.centerOps.includes('商 /'), st.centerOps.join(','))
  ok('单对象操作没混进来（中心 Z 不该在这儿）', !st.centerOps.includes('中心 Z'), st.centerOps.join(','))

  // 点「商 /」\\to 参数要 (G, N)，还没选任何对象 \\to pending
  const picked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.orb-center-panel .orb-op')]
    const hit = btns.find((b) => b.querySelector('.orb-op-label')?.textContent?.trim() === '商 /')
    if (!hit) return false
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  ok('点得中「商 /」', picked)
  await page.waitForTimeout(420)

  st = await ui()
  ok('进了 pending（出现提示条）', st.pending === 1)
  ok('提示条说清"还差哪一位"', st.hint === '选择「G」（群），第 1 / 2 个对象', String(st.hint))
  // 这一位要的是**群**，而画布上的节点清一色是群 \\to 压暗为 0 才说明"压暗不是乱来的"。
  //（`f` 填不进群的位置，但映射**不占节点**——它压根不在压暗的候选里，
  //  所以这里压暗 0 是对的，不是漏了。）
  ok('第一位要群、场上节点全是群 -> 压暗为 0（压暗不是乱来）', st.dim === 0, `dim=${st.dim}`)

  // 点第一个参数：S₃（挑它，好让"第二位"出现明显的合法/非法分野）
  await selectNode('H')
  st = await ui()
  ok('选完第一位，提示条走到第 2 位', st.hint === '选择「N」（元素集 / 子群），第 2 / 2 个对象', String(st.hint))
  ok('这一位要求"是它的子群"，所以有节点被压暗', st.dim > 0, `dim=${st.dim}`)

  await page.screenshot({ path: '../../docs/assets/u2-pending-hint.png' })
}

/* ══ ⑦ Esc 取消 ═══════════════════════════════════════ */

console.log('')
console.log('== ⑦ Esc 取消 pending ==')
{
  await page.keyboard.press('Escape')
  await page.waitForTimeout(360)
  const st2 = await ui()
  ok('提示条消失', st2.pending === 0)
  ok('压暗也一起清掉', st2.dim === 0, `dim=${st2.dim}`)
}

/* ══ ⑧ 补参档：缺标量的操作进"补参数" ═════════════════ */

console.log('')
console.log('== ⑧ 缺标量的操作进补参条 ==')
{
  await selectNode('G')
  await clickEl('.orb:not(.orb-center)')
  await clickEl('.orb-sat:text-is("操作")')
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.orb-ops-panel:not(.orb-center-panel) .orb-op')]
    const hit = btns.find((b) => b.querySelector('.orb-op-label')?.textContent?.trim() === 'Sylow p-子群')
    if (!hit) return false
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  ok('点得中「Sylow p-子群」', clicked)
  await page.waitForTimeout(420)

  const st2 = await ui()
  ok('出现补参条（不是 pending，也不是直接建）', st2.pending === 1 && st2.fillFields > 0, JSON.stringify({ pending: st2.pending, fields: st2.fillFields }))
  ok('补参条的标题是「补参数」', st2.hint === '补参数', String(st2.hint))

  // 填素数 \\to 回车执行
  await page.fill('.fill-field input', '3')
  await page.waitForTimeout(200)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(560)
  const st3 = await ui()
  ok('回车后真的建出来了（Syl_3(S_4)）', st3.pending === 0 && st3.errs.length === 0, JSON.stringify({ pending: st3.pending, errs: st3.errs }))

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

/* ══ ⑨ 映射没有节点 \\to 球挂在箭头上 ═════════════════════ */

console.log('')
console.log('== ⑨ 映射（只画箭头）的球 ==')
{
  const hit = await clickSvg('g.gedge[data-object-id="f"] .gedge-hit')
  ok('点得中 f 那条箭头', hit)
  await page.waitForTimeout(420)

  st = await ui()
  ok('球出现在箭头旁边（映射没有节点，这是唯一的入口）', st.orb)

  const rel = await page.evaluate(() => {
    const orb = document.querySelector('.orb:not(.orb-center)')?.getBoundingClientRect()
    const edge = document.querySelector('g.gedge[data-object-id="f"]')?.getBoundingClientRect()
    if (!orb || !edge) return null
    return {
      orbY: orb.top + orb.height / 2,
      edgeY: edge.top + edge.height / 2,
      // 锚点用的是**标签位置**（沿行进方向左侧，§1.5），本来就不在 bbox 正中 ——
      // 所以判据是"落在箭头的横向范围内"，不是"对齐中点"
      insideX: orb.left >= edge.left - 24 && orb.right <= edge.right + 24,
    }
  })
  ok('球挂在箭头的**上方**（不压线）', !!rel && rel.orbY < rel.edgeY, JSON.stringify(rel))
  ok('球落在箭头的横向范围内（没跑到线外）', !!rel && rel.insideX, JSON.stringify(rel))

  // 环绕按钮：信息 + 直接铺开的 ker / im（U3.1 的"点箭头、点 ker，完事"）
  await clickEl('.orb:not(.orb-center)')
  st = await ui()
  ok(
    '映射的环绕是「信息 + ker + im」（\\le 3 条就铺开，不收进下拉）',
    st.sats.join('|') === '信息|ker|im',
    st.sats.join('|'),
  )

  const beforeList = (await ui()).nodes
  ok('点得中「ker」', await clickEl('.orb-sat:text-is("ker")'))
  await page.waitForTimeout(560)
  const st3 = await ui()
  const changed = st3.nodes.join(',') !== beforeList.join(',')
  ok('点下去真有效果（画布上的对象换了，不是白点）', changed, `${beforeList.join(',')} -> ${st3.nodes.join(',')}`)
  // 判据为什么不是"节点数 +1"：建图时 `build.ts` 已经**自动补出**了一个核对象
  //（S₄ \\twoheadrightarrow S₃ 的第一同构那一套），显式建出的核会**取代**它 —— 所以数量不变才是对的。
  ok(
    '显式建出的核**取代**了自动补的那个（图上不留两份）',
    st3.nodes.length === beforeList.length,
    `${beforeList.length} -> ${st3.nodes.length}`,
  )
  ok('没有求值失败的行', st3.errs.length === 0, JSON.stringify(st3.errs))
}

/* ══ ⑩ 点空白收起 ═════════════════════════════════════ */

console.log('')
console.log('== ⑩ 点空白收起球 ==')
{
  const blank = await page.evaluate(() => {
    const r = document.querySelector('svg.canvas').getBoundingClientRect()
    for (const [fx, fy] of [[0.8, 0.82], [0.85, 0.2], [0.2, 0.85]]) {
      const p = { x: r.left + r.width * fx, y: r.top + r.height * fy }
      const el = document.elementFromPoint(p.x, p.y)
      if (el && (el.tagName === 'svg' || el.classList?.contains('grid'))) return p
    }
    return null
  })
  ok('找得到一块空白', !!blank)
  if (blank) {
    await page.mouse.click(blank.x, blank.y)
    await page.waitForTimeout(380)
    const st2 = await ui()
    ok('球收起了', !st2.orb)
  }
}

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
