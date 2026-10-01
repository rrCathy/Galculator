/**
 * 走查：**拖拽连线**与**子群集的操作入口**（第四批 = 缺口 ⑩⑤）—— 真浏览器、真指针。
 *
 * 用户提的两件事：
 *   \\cdot"把 H 移到 f 上做 f(H)"（`USABILITY.md` 缺口 ③ 的原话）
 *   \\cdot`Syl_p(G) \\to 底集(S) \\to 共轭作用在` 那条链**中间必须打字**（缺口 ⑤）
 *
 * 这一套用真 `page.mouse` 拖（不是 dispatchEvent）——手势走的是
 * `onPointerDown` + window 上的原生 move/up，只有真事件能验到那条通路。
 *
 * 验证的四条：
 *   ① 唯一候选**直接执行**：把 A₄ 拖到 `f` 那条箭头上 \\to 立刻长出 `f(A)`
 *   ② 多候选**弹菜单**：把 A₄ 拖到 S₄ 上 \\to 菜单第一条是「包含 \\subseteq」\\to 点它长出关系边
 *   ③ 落点可以是**边**（映射不占节点，但正是要拖过去的目标）
 *   ④ 子群集的操作入口（U44）：`Syl` 那一行的「操作」→ 一键 `底集`
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/connect.mjs`
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
await page.waitForTimeout(1200)

/* ── 输入辅助 ─────────────────────────────────────────── */

const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) > 0) return
  // 冷启动时 vite 要现场转模块，React 挂载可能比 1200ms 慢 —— 等它出现再点，
  // 并且等不到就把 DOM 打出来（否则只看到一句 "waiting for locator"，无从下手）
  try {
    await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
  } catch {
    const html = await page.evaluate(
      () => (document.querySelector('#root')?.innerHTML ?? '(no #root)').slice(0, 200),
    )
    console.log(`    [no composer orb] root=${JSON.stringify(html)}`)
    console.log(`    [console] ${logs.slice(0, 10).join(' || ')}`)
    const scripts = await page.evaluate(() => [...document.scripts].map((s) => s.src || '(inline)'))
    console.log(`    [scripts] ${scripts.join(' , ')}`)
    throw new Error('composer orb 始终没出现')
  }
  await page.click('.composer-orb .orb-center')
  await page.waitForTimeout(220)
}

const addLine = async (name, expr) => {
  await ensureCard()
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(180)
  const btn = page.locator('.composer-orb .composer-row button')
  if (await btn.isDisabled()) {
    const st = await page.evaluate(() => document.querySelector('.composer-status')?.textContent ?? '')
    console.log(`    [blocked] ${name}: ${st}`)
    return false
  }
  await btn.click()
  await page.waitForTimeout(300)
  return true
}

const ensureOpsDock = async () => {
  const body = '.dock:has(.dock-title:text-is("操作")) .dock-body'
  if ((await page.locator(body).count()) === 0) {
    await page.locator('.dock-toggle:has-text("操作")').first().click()
    await page.waitForTimeout(240)
  }
}

const clickRow = async (id) => {
  await ensureOpsDock()
  return page.evaluate((want) => {
    const rows = [...document.querySelectorAll('.dock-topleft .row-click')]
    const hit = rows.find((r) => r.querySelector('.row-name')?.textContent?.trim() === want)
    if (!hit) return false
    hit.click()
    return true
  }, id)
}

const rowIds = async () => {
  await ensureOpsDock()
  return page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .row-name')].map((e) => e.textContent.trim()),
  )
}

const rowErrs = () =>
  page.evaluate(() => [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()))

/** 画布上的节点 / 边（带**屏幕坐标**，供真指针用）。 */
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
      cls: g.getAttribute('class') ?? '',
      ...rect(g.querySelector('.gnode-hit')),
    }))
    const edges = [...svg.querySelectorAll('g.gedge')].map((g) => {
      return {
        id: g.dataset.edgeId ?? '',
        objectId: g.dataset.objectId ?? '',
        // `data-label` 是**原始形态**（`\hookrightarrow`）；DOM 里那个 foreignObject
        // 才是渲染结果，比不了源码串
        label: g.dataset.label ?? '',
        cls: g.getAttribute('class') ?? '',
        // 落点要按**标签**算（不是整条边组的包围盒）：边组横跨两个对象，
        // 包围盒中心可能离标签很远，而 `hitAt` 认的是标签点。
        //（标签从前的 `<text>` 换成了 foreignObject 里的 `.gedge-label`）
        ...rect(g.querySelector('.gedge-label') ?? g),
      }
    })
    return {
      nodes,
      edges,
      notices: [...document.querySelectorAll('.notice')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    }
  })

/** 真指针拖一次：从 (x1,y1) 到 (x2,y2)。`shift` = 按着 Shift（不改模式的快捷方式）。 */
const dragPointer = async (a, b, shift = false) => {
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  // 分段移动：手势里有个 4px 阈值（手抖不该算拖动），一步到位反而可能只发一次 move
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 })
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.waitForTimeout(90)
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(380)
}

/* ══ 场景 ═══════════════════════════════════════════════ */

await addLine('G', 'S_4')
await addLine('H', 'S_3')
await addLine('f', '映射(G, H, s12->23, c->13)')
await addLine('A', 'A_4')
await addLine('Syl', 'Syl_p(G, 3)')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

ok('前置六行全部求值成功', (await rowErrs()).length === 0, JSON.stringify(await rowErrs()))

const before = await canvasState()
const nodeA = before.nodes.find((n) => n.id === 'A')
const nodeG = before.nodes.find((n) => n.id === 'G')
const edgeF = before.edges.find((e) => e.objectId === 'f')
ok('画布上有 A_4 节点', !!nodeA, before.nodes.map((n) => n.id).join(','))
ok('画布上有 f 那条边（映射不占节点）', !!edgeF, before.edges.map((e) => `${e.objectId}:${e.label}`).join(','))

/* ── ① 唯一候选直接执行：A₄ 拖到 f 上 ── */

await dragPointer(nodeA, edgeF, true) // Shift 拖 = 连线（不必先开开关）
const afterOne = await canvasState()
const newLabels = afterOne.nodes.map((n) => n.label).join(' | ')
ok('拖 A_4 到 f 上 -> 直接长出 f(A)（唯一候选，没弹菜单）', /f\(A\)/.test(newLabels), newLabels)
ok('没有多出错误行', (await rowErrs()).length === 0, JSON.stringify(await rowErrs()))
ok('也没弹菜单', (await page.locator('.connect-menu').count()) === 0)

/* ── ② 多候选弹菜单：A₄ 拖到 S₄ 上（这次用底栏的「连线」开关） ── */

await page.click('.ct-btn:has-text("连线")')
await page.waitForTimeout(200)
ok('底栏的「连线」开关打开了', (await page.locator('.canvas.linking').count()) === 1)

const idsBefore = (await rowIds()).length
const mid = await canvasState()
await dragPointer(
  mid.nodes.find((n) => n.id === 'A'),
  mid.nodes.find((n) => n.id === 'G'),
)
const menu = await page.locator('.connect-menu').count()
ok('多候选 -> 弹出候选菜单', menu === 1)
if (menu === 0) {
  const st = await canvasState()
  console.log(`    [diag] notices=${JSON.stringify(st.notices)}`)
  console.log(`    [diag] 起点 A=${JSON.stringify(mid.nodes.find((n) => n.id === 'A'))}`)
  console.log(`    [diag] 终点 G=${JSON.stringify(mid.nodes.find((n) => n.id === 'G'))}`)
  console.log(`    [diag] nodes=${st.nodes.map((n) => n.id).join(',')}`)
  console.log(`    [diag] linking=${await page.locator('.canvas.linking').count()}`)
}
const items = await page.evaluate(() =>
  [...document.querySelectorAll('.connect-item .connect-label')].map((e) => e.textContent.trim()),
)
ok('菜单第一条是「包含 \\subseteq」（按数学意图排序）', (items[0] ?? '').includes('包含'), items.join(' | '))

if (menu === 1) {
  await page.screenshot({ path: '../../docs/assets/u21-connect-menu.png' })
  await page.click('.connect-item >> nth=0')
}
await page.waitForTimeout(420)
const afterTwo = await canvasState()
const relEdge = afterTwo.edges.find((e) => e.cls.includes('gedge-relation'))
ok('点「包含」后长出关系边', !!relEdge, afterTwo.edges.map((e) => e.label).join(','))
ok('关系边标签是 \\trianglelefteq（A_4 \\trianglelefteq S_4，正规性是算出来的）', relEdge?.label === '\\trianglelefteq', relEdge?.label)
ok('对象表里多了一行（那条关系是个一等对象）', (await rowIds()).length > idsBefore, (await rowIds()).join(','))
ok('没有错误行', (await rowErrs()).length === 0, JSON.stringify(await rowErrs()))

/* ── ③ 子群集的操作入口（U44：从信息面板的「可做」挪到「操作」抽屉那一行）── */

/* 子群集（`list` 档）不上画布 ⇒ 没有悬浮球，操作入口就在 OpDock 那一行上 */
await ensureOpsDock()
const opsBtn = page.locator('.dock-topleft .row:has(.row-name:text-is("Syl")) .ops')
ok('子群集那一行带「操作」按钮（它不上画布，没有悬浮球）', (await opsBtn.count()) === 1)
await opsBtn.click()
await page.waitForTimeout(260)
const ops = await page.evaluate(() =>
  [...document.querySelectorAll('.row-ops .row-op')].map((e) => e.textContent.trim()),
)
ok('展开后列出它能做的操作', ops.length > 0, ops.join(' | '))
ok('里面就有「底集」(underlyingSet)', ops.some((x) => x.includes('底集')), ops.join(' | '))

await page.screenshot({ path: '../../docs/assets/u44-row-ops.png' })

const nodesBefore = (await canvasState()).nodes.length
await page.locator('.row-ops .row-op', { hasText: '底集' }).first().click()
await page.waitForTimeout(460)
const afterSet = await canvasState()
ok(
  '点一下就长出「底集」那一行（Sylow 链的中间那步）',
  afterSet.nodes.some((n) => /底集/.test(n.label)),
  afterSet.nodes.map((n) => n.label).join(' | '),
)
ok('画布上多出一个集合节点 \\Omega', afterSet.nodes.length > nodesBefore, `${nodesBefore} -> ${afterSet.nodes.length}`)
ok('没有错误行', (await rowErrs()).length === 0, JSON.stringify(await rowErrs()))

/* ── ④ 关掉连线模式后，普通拖动仍是"移动 + 钉住"（U10 零回归） ── */

await page.click('.ct-btn:has-text("连线")')
await page.waitForTimeout(200)
ok('再点一下关掉了', (await page.locator('.canvas.linking').count()) === 0)
/**
 * 挑一个**落点上没有浮层**的节点。
 *
 * 左上面板是浮层（画布不让位），节点可能正好压在它底下 ——
 * 那时 `page.mouse.down` 打到的是面板，拖动当然不动。
 * 这是**走查的坑不是产品的坑**，所以这里主动挑一个露在外面的节点。
 */
const pickClear = async () => {
  for (const n of (await canvasState()).nodes) {
    const hit = await page.evaluate((p) => {
      const el = document.elementFromPoint(p.x, p.y)
      return el?.closest?.('g.gnode')?.getAttribute('data-id') ?? null
    }, n)
    if (hit === n.id) return n
  }
  return null
}
const n1 = await pickClear()
ok('有节点露在面板外面可以拖', !!n1, '全被浮层压住了，测试前提不成立')
if (n1) await dragPointer(n1, { x: n1.x + 220, y: n1.y + 170 })
ok('普通拖动仍是移动（没有连线菜单）', (await page.locator('.connect-menu').count()) === 0)
// 判据取**钉住**而不是位移：松手要被吸附到最近的空格点，
// 小位移会被拉回原点（那是对的行为），看位移会误判。
const pinCount = await page.evaluate(
  () => [...document.querySelectorAll('.ct-btn')].map((b) => b.textContent).join(' | '),
)
ok('拖动把它钉住了（U10 的行为一个像素没动）', /恢复自动布局（1）/.test(pinCount), pinCount)

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
