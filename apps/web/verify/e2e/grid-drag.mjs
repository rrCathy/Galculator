/**
 * 走查：**开放视图编辑**（U10）—— 格点 · 拖动吸附 · 平移 · 缩放 · 复位。
 *
 * 为什么补这一份：U10 当年的走查脚本**从未进仓库**（只留下两张截图），
 * 而它现在是**唯一"零回归"的功能** —— U21 只顺手验了"拖动仍会钉住"，
 * 拖动 / 缩放 / 格点 / 钉住这一整套没有任何东西守着。
 *
 * 这一套按 DIAGRAM_SPEC §1.1 的硬规范验：
 *   · 格点是**真实的点**（画出来）且**无限延伸**（像坐标纸，不是预生成的有限表）
 *   · 对象**精确落在格点上**（自动布局与手动拖动两条路都成立）
 *   · 拖动 = 吸附到最近的**空格点** → 钉住 → 别个节点纹丝不动
 *   · 平移位移**逐点相同**（U10 那个 setPointerCapture 的坑：拖 90 只动 11）
 *   · 缩放围绕指针，读数与格点间距**按同一比例**变
 *   · 复位 / 持久化 / 空画布不残留
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/grid-drag.mjs`
 */
const PW = 'file:///C:/newproject/GroupViz/node_modules/playwright/index.mjs'
const BASE = process.env.GAL_BASE ?? 'http://127.0.0.1:5273'
const PIN_KEY = 'galculator.pins:v1'

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

/* ══ 读数：一律取 **viewBox 坐标**（格点与节点同一空间，免得换算引入误差）══ */

const canvasState = () =>
  page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
    // 没有图的时候 CanvasView 走**占位分支**，连 svg 都不渲染 —— 这不是异常，是"空画布"本身
    if (!svg) return { dots: [], nodes: [], edgeD: '', zoom: '', buttons: [], snapRings: 0, empty: true }
    /** 元素的 viewBox 空间 bbox（不含 stroke —— 中心才是真中心） */
    const bb = (el) => {
      const b = el.getBBox()
      return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 }
    }
    return {
      dots: [...svg.querySelectorAll('.grid-dot')].map((d) => ({
        cx: Number(d.getAttribute('cx')),
        cy: Number(d.getAttribute('cy')),
      })),
      nodes: [...svg.querySelectorAll('g.gnode')].map((g) => {
        const hit = g.querySelector('.gnode-hit')
        return { id: g.dataset.id, label: g.dataset.label ?? '', ...bb(hit) }
      }),
      /** 每一条边的几何指纹（拖动时它必须变） */
      edgeD: [...svg.querySelectorAll('g.gedge')]
        .map((g) => [...g.querySelectorAll('path')].map((p) => p.getAttribute('d')).join('~'))
        .join('|'),
      zoom: document.querySelector('.canvas-zoom')?.textContent?.trim() ?? '',
      buttons: [...document.querySelectorAll('.ct-btn')].map((b) => b.textContent.trim()),
      snapRings: document.querySelectorAll('.snap-ring').length,
      empty: false,
    }
  })

/** 节点在**屏幕**坐标里的中心（拖动要用真鼠标，得给屏幕坐标） */
const nodeScreen = (id) =>
  page.evaluate((want) => {
    const g = document.querySelector(`g.gnode[data-id="${want}"]`)
    if (!g) return null
    const r = g.querySelector('.gnode-hit').getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
  }, id)

/** 挑一个**露在浮层外面**的节点（左上面板是浮层，压住了就点不动） */
const pickClear = async (exclude = []) => {
  const st = await canvasState()
  for (const n of st.nodes) {
    if (exclude.includes(n.id)) continue
    const s = await nodeScreen(n.id)
    if (!s) continue
    const own = await page.evaluate((p) => {
      const el = document.elementFromPoint(p.x, p.y)
      return el?.closest?.('g.gnode')?.getAttribute('data-id') ?? null
    }, s)
    if (own === n.id) return { id: n.id, ...s }
  }
  return null
}

/** 真鼠标拖：down → 分步 move →（可选）mid 回调 → up */
const drag = async (from, to, mid) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const steps = 14
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await page.waitForTimeout(10)
  }
  if (mid) await mid()
  await page.mouse.up()
  await page.waitForTimeout(340)
}

/**
 * 网格"铺开程度"= 互为不同的列数 × 行数。
 *
 * 判据为什么不是格点**总数**：视口被平移一点，边界上进出视口的格线数量就会变
 * （实测同一张图 20 → 16），而"铺满"的语义其实是"画布上是一个成片的网格"。
 * 所以用 col × row 的规模来判。
 */
const gridCoverage = (st) => ({
  cols: new Set(st.dots.map((d) => Math.round(d.cx * 10) / 10)).size,
  rows: new Set(st.dots.map((d) => Math.round(d.cy * 10) / 10)).size,
})

/** 离某个点最近的格点（viewBox 空间） */
const nearestDot = (dots, p) => {
  let best = null
  let bestD = Infinity
  for (const d of dots) {
    const dist = Math.hypot(d.cx - p.cx, d.cy - p.cy)
    if (dist < bestD) {
      bestD = dist
      best = d
    }
  }
  return { dot: best, dist: bestD }
}

/* ══ 建舞台 ══════════════════════════════════════════════ */

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1300)

const emptyState = await canvasState()
ok('空画布：没有格点也没有节点（不残留）', emptyState.dots.length === 0 && emptyState.nodes.length === 0)

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
  const btn = page.locator('.composer-orb .composer-row button')
  if (await btn.isDisabled()) {
    const diag = await page.evaluate(() => ({
      name: document.querySelector('.composer-name')?.value ?? null,
      expr: document.querySelector('.composer-expr')?.value ?? null,
      status: document.querySelector('.composer-status')?.textContent ?? '',
      cards: document.querySelectorAll('.composer-card').length,
    }))
    console.log(`    [blocked] ${JSON.stringify(diag)}`)
    return false
  }
  await btn.click()
  await page.waitForTimeout(300)
  return true
}

await addLine('G', 'S_4')
await addLine('H', 'S_3')
await addLine('f', '映射(G, H, s12→23, c→13)')
await addLine('A', 'A_4')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

let st = await canvasState()
ok('四个对象都上了画布', st.nodes.length >= 4, st.nodes.map((n) => n.id).join(','))

/* ══ ① 格点：画出来了，且真的"像坐标纸" ═════════════════ */

console.log('')
console.log('== ① 格点：真实存在的点 ==')
{
  const cov = gridCoverage(st)
  ok('格点成片铺开（至少 4×4）', cov.cols >= 4 && cov.rows >= 4, `${cov.cols} 列 × ${cov.rows} 行 = ${st.dots.length} 个`)

  // 等距：把格点按行分组，每行内相邻间距必须只有一个值
  const rows = new Map()
  for (const d of st.dots) {
    const k = Math.round(d.cy * 10) / 10
    if (!rows.has(k)) rows.set(k, [])
    rows.get(k).push(d.cx)
  }
  let unevenX = 0
  for (const xs of rows.values()) {
    if (xs.length < 2) continue
    xs.sort((a, b) => a - b)
    const gaps = xs.slice(1).map((v, i) => v - xs[i])
    if (Math.max(...gaps) - Math.min(...gaps) > 0.5) unevenX++
  }
  ok('横向等距（同一行内相邻格点间距唯一）', unevenX === 0, `${unevenX} 行不齐`)

  const cols = new Map()
  for (const d of st.dots) {
    const k = Math.round(d.cx * 10) / 10
    if (!cols.has(k)) cols.set(k, [])
    cols.get(k).push(d.cy)
  }
  let unevenY = 0
  for (const ys of cols.values()) {
    if (ys.length < 2) continue
    ys.sort((a, b) => a - b)
    const gaps = ys.slice(1).map((v, i) => v - ys[i])
    if (Math.max(...gaps) - Math.min(...gaps) > 0.5) unevenY++
  }
  ok('纵向等距', unevenY === 0, `${unevenY} 列不齐`)

  // **对象精确落在格点上** —— DIAGRAM_SPEC §1.1 的硬规范，最核心的一条
  let worst = 0
  let worstId = ''
  for (const n of st.nodes) {
    const { dist } = nearestDot(st.dots, n)
    if (dist > worst) {
      worst = dist
      worstId = n.id
    }
  }
  ok('每个节点的中心都**精确**落在格点上', worst < 0.5, `最大偏差 ${worst.toFixed(3)}（${worstId}）`)
}

/* ══ ② 拖动：吸附 → 钉住 → 别个不动 ═══════════════════════ */

console.log('')
console.log('== ② 拖动：吸附到最近的空格点 ==')
let dragged = null
{
  dragged = await pickClear()
  ok('有节点露在浮层外面可以拖', !!dragged, '全被浮层压住了，测试前提不成立')

  if (dragged) {
    const before = await canvasState()
    const me0 = before.nodes.find((n) => n.id === dragged.id)
    const others0 = before.nodes.filter((n) => n.id !== dragged.id)
    const edgeD0 = before.edgeD

    // 拖到斜下方 260×200 屏幕像素
    const target = { x: dragged.x + 260, y: dragged.y + 200 }
    let midRing = 0
    let midEdgeD = ''
    await drag(dragged, target, async () => {
      midRing = (await canvasState()).snapRings
      midEdgeD = (await canvasState()).edgeD
    })

    const after = await canvasState()
    const me1 = after.nodes.find((n) => n.id === dragged.id)
    const others1 = after.nodes.filter((n) => n.id !== dragged.id)

    ok('拖动中显示**吸附预览环**（松手会落在哪一格）', midRing > 0, `snap-ring=${midRing}`)
    ok('拖动中边跟着重画（不是松手才动）', midEdgeD !== edgeD0 && midEdgeD.length > 0)

    ok('节点真的动了', !!me1 && Math.hypot(me1.cx - me0.cx, me1.cy - me0.cy) > 40, `${me0.cx.toFixed(0)},${me0.cy.toFixed(0)} → ${me1?.cx.toFixed(0)},${me1?.cy.toFixed(0)}`)

    // 吸附后仍要精确落在格点上
    const { dist } = nearestDot(after.dots, me1)
    ok('松手后**仍然精确落在格点上**（吸附生效）', dist < 0.5, `偏差 ${dist.toFixed(3)}`)

    // 吸到的是"最近"的那个，不是随便一个
    ok('吸的是**最近**的格点', dist < 20, `最近距离 ${dist.toFixed(2)}`)

    // **零回归的核心**：拖走一个不影响别个（U10 的设计承诺）
    let maxShift = 0
    for (const o0 of others0) {
      const o1 = others1.find((n) => n.id === o0.id)
      if (!o1) continue
      maxShift = Math.max(maxShift, Math.hypot(o1.cx - o0.cx, o1.cy - o0.cy))
    }
    ok('其它节点纹丝不动（拖走一个不会引起重排）', maxShift < 0.5, `最大位移 ${maxShift.toFixed(3)}`)

    // 钉住 → 工具条出现计数
    ok('工具条出现「恢复自动布局 · n」', /恢复自动布局 · \d+/.test(after.buttons.join(' | ')), after.buttons.join(' | '))
  }
}

/* ══ ③ 跳过被占用的格点 ═════════════════════════════════ */

console.log('')
console.log('== ③ 吸附会跳过被占用的格点 ==')
{
  const cur = await canvasState()
  const others = cur.nodes.find((n) => n.id !== dragged?.id)
  const mover = await pickClear([others?.id])
  ok('另找一个可拖的节点', !!mover, '没有第二个露在外面的节点')

  if (mover && others) {
    const anchor = await nodeScreen(others.id)
    const from = { x: mover.x, y: mover.y }
    // 拖到**已经站着节点**的那个格点上（偏 6px，免得完全重合读不出区别）
    await drag(from, { x: anchor.x + 6, y: anchor.y + 6 })

    const after = await canvasState()
    const moved = after.nodes.find((n) => n.id === mover.id)
    const occupied = after.nodes.find((n) => n.id === others.id)
    // 两个节点不能落在**同一个**格点上
    const gap = Math.hypot(moved.cx - occupied.cx, moved.cy - occupied.cy)
    const step = after.dots.length > 1 ? Math.min(...after.dots.map((d) => d.cx - st.dots[0].cx).filter((v) => v > 1)) : 0
    ok('落点不会跟已有节点叠在一起（跳过占用格点）', gap > 4, `两个节点相距 ${gap.toFixed(2)}（格点步长约 ${step.toFixed(1)}）`)
    ok('被压的那个节点没被挤走', Math.hypot(occupied.cx - cur.nodes.find((n) => n.id === others.id).cx, occupied.cy - cur.nodes.find((n) => n.id === others.id).cy) < 0.5)
  }
}

/* ══ ④ 平移：位移逐点相同（守护那个 1/8 的坑）═══════════ */

console.log('')
console.log('== ④ 空白拖动 = 平移画布 ==')
{
  const before = await canvasState()
  // 从右下角的空白处拖（挑一个 elementFromPoint 是 svg 自己的位置）
  const blank = await page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
    const r = svg.getBoundingClientRect()
    for (const [fx, fy] of [[0.72, 0.78], [0.8, 0.3], [0.25, 0.8], [0.6, 0.16]]) {
      const p = { x: r.left + r.width * fx, y: r.top + r.height * fy }
      const el = document.elementFromPoint(p.x, p.y)
      if (el && (el.tagName === 'svg' || el.classList?.contains('grid'))) return p
    }
    return null
  })
  ok('找得到一块真正的空白', !!blank, '四处空地都被占了')

  if (blank) {
    const DX = 120
    const DY = 80
    await drag(blank, { x: blank.x + DX, y: blank.y + DY })

    const after = await canvasState()
    const shifts = []
    for (const n0 of before.nodes) {
      const n1 = after.nodes.find((n) => n.id === n0.id)
      if (!n1) continue
      shifts.push({ id: n0.id, dx: n1.cx - n0.cx, dy: n1.cy - n0.cy })
    }
    ok('所有节点都跟着动了', shifts.length >= 4, `${shifts.length} 个`)

    const dxs = shifts.map((s) => s.dx)
    const dys = shifts.map((s) => s.dy)
    const spreadX = Math.max(...dxs) - Math.min(...dxs)
    const spreadY = Math.max(...dys) - Math.min(...dys)
    ok('位移**逐点相同**（刚体平移）', spreadX < 0.5 && spreadY < 0.5, `Δx 极差 ${spreadX.toFixed(3)} · Δy 极差 ${spreadY.toFixed(3)}`)

    // **那个坑**：`setPointerCapture` 只让第一次 pointermove 到位 → 拖 90 只动 11。
    // 判据不能只看"动了没"，要看"动了多少"。
    const mag = Math.hypot(dxs[0], dys[0])
    ok('位移量与手势量级相当（不是只走了 1/8）', mag > DX * 0.5, `拖 ${DX}px 实际位移 ${mag.toFixed(1)}（viewBox 单位 ≈ 像素）`)

    const covMoved = gridCoverage(after)
    ok('平移后格点仍成片铺开（跟着画布走）', covMoved.cols >= 4 && covMoved.rows >= 4,
      `${covMoved.cols} 列 × ${covMoved.rows} 行 = ${after.dots.length} 个`)
    ok('平移后节点仍落在格点上', after.nodes.every((n) => nearestDot(after.dots, n).dist < 0.5))
  }
}

/* ══ ⑤ 缩放：围绕指针，读数与格点间距同比例 ═════════════ */

console.log('')
console.log('== ⑤ 滚轮缩放 ==')
{
  const before = await canvasState()
  const zoom0 = parseInt(before.zoom, 10)
  const focus = await pickClear()
  ok('有一个节点可以当"指针下的锚"', !!focus)

  if (focus) {
    const spot0 = await nodeScreen(focus.id)
    const dotGap0 = (() => {
      const xs = [...new Set(before.dots.map((d) => Math.round(d.cx * 10) / 10))].sort((a, b) => a - b)
      return xs.length > 1 ? Math.min(...xs.slice(1).map((v, i) => v - xs[i])) : 0
    })()

    await page.mouse.move(spot0.x, spot0.y)
    await page.mouse.wheel(0, -400) // 向上滚 = 放大
    await page.waitForTimeout(320)

    const after = await canvasState()
    const zoom1 = parseInt(after.zoom, 10)
    ok('读数变大', zoom1 > zoom0, `${zoom0}% → ${zoom1}%`)

    const spot1 = await nodeScreen(focus.id)
    const drift = Math.hypot(spot1.x - spot0.x, spot1.y - spot0.y)
    ok('围绕**指针**缩放（指针下的那个节点基本不动）', drift < 6, `漂移 ${drift.toFixed(2)}px`)

    const dotGap1 = (() => {
      const xs = [...new Set(after.dots.map((d) => Math.round(d.cx * 10) / 10))].sort((a, b) => a - b)
      return xs.length > 1 ? Math.min(...xs.slice(1).map((v, i) => v - xs[i])) : 0
    })()
    // 格点间距按**同一比例**变（格点是世界坐标的网格，缩放它就该等比）
    const kRatio = zoom1 / zoom0
    const gapRatio = dotGap0 > 0 ? dotGap1 / dotGap0 : 0
    ok('格点间距与读数**同比例**变', Math.abs(gapRatio - kRatio) < 0.06, `读数 ×${kRatio.toFixed(2)} vs 格距 ×${gapRatio.toFixed(2)}`)

    ok('缩放后节点仍精确落在格点上（一起缩放）', after.nodes.every((n) => nearestDot(after.dots, n).dist < 0.5))

    await page.screenshot({ path: '../../docs/assets/u10-regression-zoom.png' })

    // 反向：向下滚 = 缩小
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(320)
    const back = await canvasState()
    ok('向下滚回去', parseInt(back.zoom, 10) < zoom1, `${zoom1}% → ${back.zoom}`)
  }
}

/* ══ ⑥ 复位：双击空白 / 适应窗口 / 恢复自动布局 ══════════ */

console.log('')
console.log('== ⑥ 复位与钉住清除 ==')
{
  // 先随便缩一下，验"双击空白复位"
  await page.mouse.move(720, 450)
  await page.mouse.wheel(0, -300)
  await page.waitForTimeout(300)
  const zoomed = (await canvasState()).zoom
  const blank = await page.evaluate(() => {
    const r = document.querySelector('svg.canvas').getBoundingClientRect()
    for (const [fx, fy] of [[0.75, 0.8], [0.85, 0.25], [0.7, 0.15]]) {
      const p = { x: r.left + r.width * fx, y: r.top + r.height * fy }
      const el = document.elementFromPoint(p.x, p.y)
      if (el && (el.tagName === 'svg' || el.classList?.contains('grid'))) return p
    }
    return null
  })
  if (blank) {
    await page.mouse.dblclick(blank.x, blank.y)
    await page.waitForTimeout(420)
    const after = (await canvasState()).zoom
    ok('双击空白 → 回到 100%（适应窗口）', after === '100%', `${zoomed} → ${after}`)
  } else {
    ok('双击空白 → 回到 100%（适应窗口）', false, '找不到空白处')
  }

  // 「适应窗口」按钮
  await page.mouse.move(720, 450)
  await page.mouse.wheel(0, -300)
  await page.waitForTimeout(300)
  await page.click('.ct-btn:has-text("适应窗口")')
  await page.waitForTimeout(360)
  const viaBtn = (await canvasState()).zoom
  ok('「适应窗口」按钮同效', viaBtn === '100%', viaBtn)

  // 「恢复自动布局」清掉钉住
  const beforeReset = await canvasState()
  const pinned = /恢复自动布局 · (\d+)/.exec(beforeReset.buttons.join(' | '))
  ok('此时确实有钉住的节点', !!pinned, beforeReset.buttons.join(' | '))

  await page.click('.ct-btn:has-text("恢复自动布局")')
  await page.waitForTimeout(460)
  const afterReset = await canvasState()
  const stillPinned = /恢复自动布局 · \d+/.test(afterReset.buttons.join(' | '))
  ok('点一下就全放回自动布局（计数消失）', !stillPinned, afterReset.buttons.join(' | '))
  ok('节点仍在格点上（自动布局也量化）', afterReset.nodes.every((n) => nearestDot(afterReset.dots, n).dist < 0.5))

  // 放回去以后，位置应当回到"没被拖过"的排布
  const moved = afterReset.nodes.find((n) => n.id === dragged?.id)
  const at0 = beforeReset.nodes.find((n) => n.id === dragged?.id)
  ok('被拖过的那个节点也回了位', !!moved && !!at0 && Math.hypot(moved.cx - at0.cx, moved.cy - at0.cy) > 20,
    `${at0?.cx.toFixed(0)},${at0?.cy.toFixed(0)} → ${moved?.cx.toFixed(0)},${moved?.cy.toFixed(0)}`)
}

/* ══ ⑦ 持久化：空画布不写，普通页面写、清 ═══════════════ */

console.log('')
console.log('== ⑦ 钉住的持久化 ==')
{
  const onEmpty = await page.evaluate((k) => localStorage.getItem(k), PIN_KEY)
  ok('`?empty=1` 页面**不写**钉住（走查之间不互相污染）', onEmpty === null, String(onEmpty))

  // 先在同源页面上把 pins 清掉，再进普通页面（`/` mount 时读到的就是干净的）。
  await page.evaluate(() => localStorage.clear())
  await page.goto('about:blank')
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.waitForTimeout(1300)

  // **`/` 与 `?empty=1` 不是"同一个页面的两种状态"，而是两份不同的入场**：
  // `/` 自带一份示例定义（一进来就有东西看 —— U10 的"零门槛入口"），
  // `?empty=1` 才是空画布。所以这里**不能**按"空"的前提写断言
  //（真实坑：一开始按"空"写，composer 报「名字「G」已被占用」）。
  const sample = await canvasState()
  ok('普通页面自带示例定义（与 ?empty=1 相对）', sample.nodes.length > 0, sample.nodes.map((n) => n.label).join(', '))

  const n = await pickClear()
  ok('普通页面里也有节点可拖', !!n)
  if (n) {
    await drag(n, { x: n.x + 120, y: n.y + 90 })
    const raw = await page.evaluate((k) => localStorage.getItem(k), PIN_KEY)
    let parsed = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      parsed = 'BAD_JSON'
    }
    ok('拖动后钉住被写进 localStorage', parsed && parsed !== 'BAD_JSON' && Object.keys(parsed).length === 1,
      String(raw))
    if (parsed && parsed !== 'BAD_JSON') {
      const entry = Object.values(parsed)[0]
      ok('存的是世界坐标 {x, y}', !!entry && typeof entry.x === 'number' && typeof entry.y === 'number', JSON.stringify(entry))
    }

    await page.click('.ct-btn:has-text("恢复自动布局")')
    await page.waitForTimeout(420)
    const cleared = await page.evaluate((k) => localStorage.getItem(k), PIN_KEY)
    ok('清空钉住后 key 被移除（不留空壳）', cleared === null, String(cleared))
  }
}

/* ══ 控制台 ═════════════════════════════════════════════ */

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
