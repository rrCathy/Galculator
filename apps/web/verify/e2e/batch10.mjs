/**
 * 走查：第十八批（U38，2026-09-30）—— **独立构造的群之间的包含**。
 *
 * 用户实测原话：
 *   「A₄ 能拉包含箭头到 S₄ 上，V₄ 却做不到……C₃ 也拉不了包含箭头到 S₄/V₄，
 *     能不能把 V₄ 修完？」
 *
 * 根因是 `containment` 只认"元素 id 逐个对得上"：`S_4`/`A_4` 的元素 id 是置换本身
 * （自证式），`V_4`/`C_3` 是抽象记号 —— 于是只有前者能拉出箭头。
 * 修法是给它加第二关（嵌入）：G 里有没有与 H 同构的子群。
 *
 * 这一套只验**用户看得见的那条路**：
 *   ① 真指针拖 V₄ → S₄：菜单里有「contains」，点一下长出 `V₄ ⊆ S₄` 的边
 *   ② 拖 C₃ → S₄：同样能拉出来
 *   ③ 拖 C₃ → V₄：**不该**列出包含（3 ∤ 4），但菜单里要说清"为什么"
 *   ④ 手打 `contains(V_4, S_4)` 也成；`contains(C_3, V_4)` 报拉格朗日
 *   ⑤ 信息面板的「子群」折叠节：同构类分组 + ⊴ 渲染 + 文案不泄漏
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/batch10.mjs`
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
await page.waitForTimeout(1300)

/* ── 辅助（与 batch9 / connect 同一套）────────────────── */

const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(220)
  }
}

/** 写一行定义。`expectFail` = 本来就该失败（读状态行看措辞）。 */
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

const canvasState = () =>
  page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
    if (!svg) return { nodes: [], edges: [], notices: [] }
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    const nodes = [...svg.querySelectorAll('g.gnode')].map((g) => ({
      id: g.dataset.id,
      label: g.dataset.label,
      ...rect(g.querySelector('.gnode-hit')),
    }))
    const edges = [...svg.querySelectorAll('g.gedge')].map((g) => ({
      id: g.dataset.edgeId ?? '',
      objectId: g.dataset.objectId ?? '',
      // `data-label` 是**原始形态**（`\subseteq`），DOM 里那层才是渲染结果
      label: g.dataset.label ?? '',
      ...rect(g.querySelector('.gedge-label') ?? g),
    }))
    return {
      nodes,
      edges,
      notices: [...document.querySelectorAll('.notice')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    }
  })

/** 真指针拖一次（手势有 4px 阈值，所以分段移动）。 */
const dragPointer = async (a, b) => {
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 })
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.waitForTimeout(90)
  await page.mouse.up()
  await page.waitForTimeout(420)
}

/** 连线菜单里的候选条目文字（第一项在最前）。 */
const menuItems = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.connect-menu .connect-item')].map((b) =>
      (b.querySelector('.connect-label')?.textContent ?? b.textContent).trim(),
    ),
  )

/** 菜单里那句"为什么没有包含"。 */
const menuMiss = () =>
  page.evaluate(() => document.querySelector('.connect-menu .connect-miss')?.textContent?.trim() ?? null)

const linkOn = async () => {
  if ((await page.locator('.canvas.linking').count()) === 0) {
    await page.click('.ct-btn:has-text("连线")', { timeout: 6000 })
    await page.waitForTimeout(220)
  }
}
const closeMenu = async () => {
  if ((await page.locator('.connect-menu').count()) > 0) {
    await page.click('.connect-close')
    await page.waitForTimeout(250)
  }
}

/**
 * 左栏某个抽屉拉开的行数 —— **两个抽屉都要看**。
 *
 * ⚠️ 拖拽建出来的对象 origin 是 `derived` ⇒ 落「操作」抽屉，而它**默认收着、
 * 收起时 body 整个不渲染**（batch9 记过的坑）。只数「对象」抽屉会漏掉关系对象。
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
  await page.waitForTimeout(320)
  return hit
}

const rowIds = () =>
  page.evaluate(() => [...document.querySelectorAll('.row-name')].map((e) => e.textContent.trim()))

/* ══ 场景：S₄ + V₄ + C₃ + A₄ ═══════════════════════════ */

await addLine('S4', 'S_4')
await addLine('V', 'V_4')
await addLine('C', 'C_3')
await addLine('A', 'A_4')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

const st0 = await canvasState()
ok(
  '四行都长成了画布节点',
  ['S4', 'V', 'C', 'A'].every((id) => st0.nodes.some((n) => n.id === id)),
  st0.nodes.map((n) => n.id).join(','),
)

await linkOn()
ok('底栏「连线」开关打开了', (await page.locator('.canvas.linking').count()) === 1)
// 先把「操作」抽屉拉开：拖出来的关系对象落这里，收起时一行都不渲染
ok('「操作」抽屉展开得了', await openDock('操作'))

/* ── ① 拖 V₄ → S₄：用户报的那条，必须能拉出箭头 ── */

console.log('')
console.log('== ① 拖 V₄ → S₄（用户报的那条）==')
{
  const before = await canvasState()
  const edgesBefore = before.edges.length
  const rowsBefore = (await rowIds()).length
  await dragPointer(
    before.nodes.find((n) => n.id === 'V'),
    before.nodes.find((n) => n.id === 'S4'),
  )
  const items = await menuItems()
  ok('弹出了候选菜单', (await page.locator('.connect-menu').count()) === 1, items.join(' | '))
  ok('菜单第一条是「contains」（按数学意图排序；U54 前叫「包含」）', (items[0] ?? '').includes('contains'), items.join(' | '))
  ok('菜单里**没有**那句"为什么没有包含"（因为已经列出来了）', (await menuMiss()) === null)

  // 点第一条（contains）
  await page.click('.connect-menu .connect-item', { timeout: 6000 })
  await page.waitForTimeout(700)

  const after = await canvasState()
  ok('画布多了一条边', after.edges.length === edgesBefore + 1, `${edgesBefore} -> ${after.edges.length}`)
  ok('对象表也多了一行（真建出了关系对象）', (await rowIds()).length === rowsBefore + 1, `${rowsBefore} -> ${(await rowIds()).length}`)
  /**
   * 边的标签：正规性**未判定**（S₄ 的 4 个 Klein 里只有 1 个正规）⇒ 画 `↪`。
   * 这与 U20 定的规矩一致（`⊴` 只给**判出来正规**的），也和 A₄/S₄ 那条
   * （判得出正规 ⇒ `⊴`）形成对照 —— 见下面 ①b。
   */
  const rel = after.edges.find((e) => e.objectId && e.label === '\\hookrightarrow')
  ok('那条边是关系边（带 objectId）', !!rel, after.edges.map((e) => `${e.objectId}:${e.label}`).join(' , '))
  ok('标签是 `↪` 而不是 `⊴`（正规性未判定 ⇒ 不假装正规）', rel?.label === '\\hookrightarrow', rel?.label)
}

/* ── ①b 对照：拖 A₄ → S₄ 判得出正规 ⇒ 画 `⊴` ── */

console.log('')
console.log('== ①b 对照：A₄ → S₄（判得出正规）==')
{
  const before = await canvasState()
  await dragPointer(
    before.nodes.find((n) => n.id === 'A'),
    before.nodes.find((n) => n.id === 'S4'),
  )
  const items = await menuItems()
  ok('弹出候选菜单', (await page.locator('.connect-menu').count()) === 1, items.join(' | '))
  const idx = items.findIndex((t) => t.includes('contains'))
  ok('菜单里有「contains」', idx >= 0, items.join(' | '))
  await page.locator('.connect-menu .connect-item').nth(idx).click()
  await page.waitForTimeout(700)
  const after = await canvasState()
  const rel = after.edges.find((e) => e.objectId && e.label === '\\trianglelefteq')
  ok('A₄ 那条画成 `⊴`（指数 2 ⇒ 判得出正规）', !!rel, after.edges.map((e) => `${e.objectId}:${e.label}`).join(' , '))
  // 对照钉住：同一张图上 `↪` 与 `⊴` 并存，靠判据分，不靠猜
  ok(
    '同一张图上 `↪` 与 `⊴` 并存（判据分得开）',
    after.edges.some((e) => e.label === '\\hookrightarrow') && after.edges.some((e) => e.label === '\\trianglelefteq'),
    after.edges.map((e) => e.label).join(' , '),
  )
}

/* ── ② 拖 C₃ → S₄：也能拉出来（S₄ 的 Sylow 3-子群） ── */

console.log('')
console.log('== ② 拖 C₃ → S₄ ==')
{
  await closeMenu()
  const before = await canvasState()
  await dragPointer(
    before.nodes.find((n) => n.id === 'C'),
    before.nodes.find((n) => n.id === 'S4'),
  )
  const items = await menuItems()
  ok('弹出候选菜单', (await page.locator('.connect-menu').count()) === 1, items.join(' | '))
  ok('菜单里有「contains」', items.some((t) => t.includes('contains')), items.join(' | '))
  const idx = items.findIndex((t) => t.includes('contains'))
  await page.locator('.connect-menu .connect-item').nth(idx).click()
  await page.waitForTimeout(700)
  const after = await canvasState()
  const rel = after.edges.find((e) => e.objectId && e.label === '\\hookrightarrow')
  ok('C₃ 的包含边画成 `\\hookrightarrow`（S₄ 的 4 个 C₃ 全非正规）', !!rel, after.edges.map((e) => `${e.objectId}:${e.label}`).join(' , '))
}

/* ── ③ 拖 C₃ → V₄：**不该**列出包含，但要说清为什么 ── */

console.log('')
console.log('== ③ 拖 C₃ → V₄（3 ∤ 4，本来就不该有）==')
{
  await closeMenu()
  const before = await canvasState()
  await dragPointer(
    before.nodes.find((n) => n.id === 'C'),
    before.nodes.find((n) => n.id === 'V'),
  )
  const items = await menuItems()
  ok('菜单弹出来了（直积 / 映射）', (await page.locator('.connect-menu').count()) === 1, items.join(' | '))
  ok('菜单里**没有**「contains」（菜单不撒谎）', !items.some((t) => t.includes('contains')), items.join(' | '))
  const miss = await menuMiss()
  ok('但菜单里给了一句解释', !!miss, String(miss))
  ok('解释里点明"不整除 + 拉格朗日"', !!miss && miss.includes('不整除') && miss.includes('拉格朗日'), String(miss))
  await closeMenu()
}

/* ── ④ 手打：`contains(V_4, S_4)` 成、`contains(C_3, V_4)` 报拉格朗日 ── */

console.log('')
console.log('== ④ 手打的声明包含 ==')
{
  const good = await addLine('R1', 'contains(V, S4)')
  ok('`contains(V_4, S_4)` 求值成功（U38 第二关）', good.enabled === true, `enabled=${good.enabled} status=${good.status}`)

  const bad = await addLine('R2', 'contains(C, V)', true)
  ok('`contains(C_3, V_4)` 被拦（提交按钮禁用）', bad.enabled === false, `enabled=${bad.enabled}`)
  ok('报错点明"不整除 + 拉格朗日"', !!bad.status && bad.status.includes('不整除') && bad.status.includes('拉格朗日'), String(bad.status))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

/* ── ⑤ 子群列表的渲染与文案（2026-09-30 修的两个毛病；U45 起住折叠节里）── */

console.log('')
console.log('== ⑤ 信息面板「子群」这一节：⊴ 渲染 + 文案不泄漏 ==')
{
  const picked = await page.evaluate(() => {
    const g = document.querySelector('svg.canvas g.gnode[data-id="S4"] .gnode-hit')
    if (!g) return false
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  ok('点得中 S₄ 节点', picked, '画布上只有 S4/V/C 三个节点')
  await page.waitForTimeout(400)

  /* U45：标题行是折叠开关，`textContent` 现在是「子群 + 摘要」，按**标签**找 */
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.info-sec-head')].find(
      (x) => x.querySelector('.info-sec-label')?.textContent.trim() === '子群',
    )
    if (!b) return false
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  ok('开得了「子群」这一节', opened)
  await page.waitForTimeout(400)

  const dom = await page.evaluate(() => {
    const root = document.querySelector('.insp-subs')
    if (!root) return null
    return {
      rows: root.querySelectorAll('.insp-sub').length,
      note: root.querySelector('.insp-note')?.textContent ?? '',
      full: root.textContent ?? '',
    }
  })
  ok('子群列表渲染出来了', !!dom && dom.rows > 0, `rows=${dom?.rows ?? -1}`)
  // `\trianglelefteq` 必须渲染成 `⊴`；命令字面量漏到界面上就是 bug（用户报的"trianglelefteq 是？"）
  ok('正规标记渲染成 `⊴`', (dom?.full ?? '').includes('⊴'), (dom?.full ?? '').slice(0, 100))
  ok('界面上没有 `trianglelefteq` 这段命令字面量', !(dom?.full ?? '').includes('trianglelefteq'), (dom?.full ?? '').slice(0, 200))
  // 纯文本说明面不许写 LaTeX / markdown
  ok('文案里没有 `\\xn` 这类 LaTeX 泄漏', !(dom?.note ?? '').includes('\\x'), dom?.note)
  ok('文案里没有 markdown 星号', !(dom?.note ?? '').includes('**'), dom?.note)
}

console.log('')
console.log('== ⑦ 商群（陪集层）：拖 C₃ → S₄/V₄ ==')
{
  const built = await addLine('Q', 'quotient(S4, V)')
  ok('`quotient(S4, V_4)` 建得出来（V₄ 自动翻译成 S₄ 里的 Klein）', built.enabled === true, `enabled=${built.enabled}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // 建出来就是 6 阶商群；拖 C₃ 上去，菜单里该有 contains
  const qNode = await page.evaluate(() => {
    const el = document.querySelector('svg.canvas g.gnode[data-id="Q"] .gnode-hit')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  const cNode = await page.evaluate(() => {
    const el = document.querySelector('svg.canvas g.gnode[data-id="C"] .gnode-hit')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  ok('画布上有 S₄/V₄ 与 C₃ 两个节点', !!qNode && !!cNode)

  if (qNode && cNode) {
    await page.mouse.move(cNode.x, cNode.y)
    await page.mouse.down()
    await page.mouse.move((cNode.x + qNode.x) / 2, (cNode.y + qNode.y) / 2, { steps: 8 })
    await page.mouse.move(qNode.x, qNode.y, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    const items = await page.evaluate(() => {
      const m = document.querySelector('.connect-menu')
      if (!m) return null
      return [...m.querySelectorAll('button')].map((b) => b.textContent.trim())
    })
    ok(
      '拖 C₃ → S₄/V₄：菜单里列出「contains」（用户报的这条，U38 修好）',
      !!items && items.some((t) => t.includes('contains')),
      JSON.stringify(items),
    )
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
}

ok('全程零 console 错误', logs.length === 0, logs.slice(0, 3).join(' | '))

console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
