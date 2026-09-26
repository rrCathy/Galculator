/**
 * 走查：**子群像 f(H)** 与 **声明包含 H ⊆ G**（U20）—— 用户的原始诉求。
 *
 * 投诉原话两条：
 *   "我想拉个箭头表示 A₄ 和 K 的包含关系，但做不到，没这个功能"
 *   "f(A₄) 怎么创建？直接拖到 f 上？没这个功能"
 *
 * 这里在真浏览器里把两条都做出来，并验几何层：
 *   - `FA = 像(f, A)` 长出 `f(A) ↪ S₃` 的顶点与边
 *   - `R = A ⊆ G` 长出**可点选**的关系边（A₄ ⊴ S₄ → 标签 `⊴`）
 *   - 点那条边 → 信息面板给出「关系」的账（指数 24/12 = 2）
 *   - 假声明（D₄ ⊆ S₄）被拦在行里
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/relation-ops.mjs`
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

/** `M x y L x y` → 端点（曲线返回 null）。 */
function seg(d) {
  const m = /^M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*L\s*(-?[\d.]+)[\s,]+(-?[\d.]+)$/.exec((d ?? '').trim())
  if (!m) return null
  const [x1, y1, x2, y2] = m.slice(1).map(Number)
  return { x1, y1, x2, y2 }
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
  const btn = page.locator('.composer-orb .composer-row button')
  if (await btn.isDisabled()) {
    const st = await page.evaluate(() => document.querySelector('.composer-status')?.textContent ?? '')
    console.log(`    [blocked] name=${JSON.stringify(name)} status=${JSON.stringify(st)}`)
    return false
  }
  await btn.click()
  await page.waitForTimeout(320)
  return true
}

/**
 * 点画布上的一条边 / 一个节点。
 *
 * `.gedge-hit` 的 stroke 是 `transparent`，Playwright 的动作性检查判它
 * "not visible"（截图里它确实什么都不画），所以只能派发事件。
 * React 18 把监听挂在根容器上，`bubbles: true` 能到。
 */
const clickSvg = (selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return true
  }, selector)

const rowErrs = () =>
  page.evaluate(() => [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()))

/** 画布上的节点与边（一次性读完，几何判据都在里面）。 */
const canvasState = () =>
  page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
    if (!svg) return { nodes: [], edges: [] }
    const nodes = [...svg.querySelectorAll('g.gnode')].map((g) => {
      const hit = g.querySelector('.gnode-hit')
      let cx, cy
      if (hit.tagName === 'circle') {
        cx = Number(hit.getAttribute('cx'))
        cy = Number(hit.getAttribute('cy'))
      } else {
        cx = Number(hit.getAttribute('x')) + Number(hit.getAttribute('width')) / 2
        cy = Number(hit.getAttribute('y')) + Number(hit.getAttribute('height')) / 2
      }
      return { id: g.dataset.id, cx, cy }
    })
    const edges = [...svg.querySelectorAll('g.gedge')].map((g) => {
      const path = g.querySelector('path:not(.gedge-hit)')
      return {
        cls: g.getAttribute('class') ?? '',
        label: g.querySelector('text')?.textContent ?? '',
        d: path?.getAttribute('d') ?? '',
        end: path?.getAttribute('marker-end') ?? '',
        start: path?.getAttribute('marker-start') ?? '',
        hit: !!g.querySelector('.gedge-hit'),
      }
    })
    return { nodes, edges }
  })

const infoState = () =>
  page.evaluate(() => ({
    chip: document.querySelector('.info-target .chip')?.textContent?.trim() ?? '',
    head: document.querySelector('.info-target')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    keys: [...document.querySelectorAll('.insp-row .insp-k')].map((e) => e.textContent.trim()),
    vals: [...document.querySelectorAll('.insp-row .insp-v')].map((e) =>
      e.textContent.replace(/[\u200b\u2061\u2062]/g, '').replace(/\s+/g, ' ').trim(),
    ),
  }))

/* ══ 剧本 ═══════════════════════════════════════════════ */

await addLine('G', 'S_4')
await addLine('H', 'S_3')
await addLine('f', '映射(G, H, s12→23, c→13)')
await addLine('K', 'ker(f)')
await addLine('A', 'A_4')
await addLine('FA', '像(f, A)')
await addLine('R', 'A ⊆ G')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

const errs = await rowErrs()
ok('七行全部求值成功', errs.length === 0, JSON.stringify(errs))

/* ── 几何：子群像的顶点 + 两条 ↪ + 一条可点选的关系边 ── */

const cs = await canvasState()
const at = Object.fromEntries(cs.nodes.map((n) => [n.id, n]))
ok('画布上有 f(A) 顶点', !!at.FA, `nodes=${cs.nodes.map((n) => n.id).join(',')}`)
ok('画布上没有「关系」顶点（关系是边不是点）', !at.R, `nodes=${cs.nodes.map((n) => n.id).join(',')}`)

const relEdge = cs.edges.find((e) => e.cls.includes('gedge-relation'))
ok('画布上有关系边', !!relEdge, cs.edges.map((e) => e.cls).join(' | '))
ok('关系边标签是 ⊴（A₄ ⊴ S₄）', relEdge?.label === '⊴', relEdge?.label)
ok('关系边可点选（有 hit 层）', !!relEdge?.hit)
ok('关系边带单射尾钩', /-hook/.test(relEdge?.start ?? ''), relEdge?.start)

const incl = cs.edges.find((e) => e.cls.includes('gedge-map') && e.label === '↪')
ok('画布上有 f(A) ↪ S₃ 的包含边', !!incl, cs.edges.map((e) => `${e.cls}:${e.label}`).join(' | '))

// 轴向（DIAGRAM_SPEC §1.1）：A 与 G 同层（都是输入）→ 画成水平箭头
{
  const s = seg(relEdge?.d)
  ok('A ⊆ G 画成水平箭头', !!s && Math.abs(s.y1 - s.y2) <= 1, s ? `Δy=${Math.abs(s.y1 - s.y2)}` : 'not a segment')
  ok('两个端点同高（同层 y 相等）', !!at.A && !!at.G && Math.abs(at.A.cy - at.G.cy) <= 1, `${at.A?.cy} vs ${at.G?.cy}`)
  ok('两列分开（非退化）', !!at.A && !!at.G && Math.abs(at.A.cx - at.G.cx) > 10, `${at.A?.cx} vs ${at.G?.cx}`)
}

/* ── 点那条关系边 → 信息面板给出「关系」的账 ── */

ok('点得中关系边', await clickSvg('.gedge-relation .gedge-hit'))
await page.waitForTimeout(400)
const ri = await infoState()
ok('点关系边选中了关系对象', ri.chip === '关系', `${ri.chip} :: ${ri.head}`)
ok('面板里有「指数」一行', ri.keys.includes('指数'), ri.keys.join(','))
ok(
  '指数写着 24 / 12 = 2（手算）',
  ri.vals.some((v) => v.replace(/\s/g, '').includes('24/12=2')),
  JSON.stringify(ri.vals),
)
ok('面板里判了正规（是）', ri.keys.includes('正规') && ri.vals.includes('是'), JSON.stringify(ri.vals))

/* ── 点 f(A) 顶点 → 是群，且是靶群里的子群 ── */

ok('点得中 f(A) 顶点', await clickSvg('g.gnode[data-id="FA"] .gnode-hit'))
await page.waitForTimeout(400)
const fi = await infoState()
ok('点 f(A) 看到的是群', fi.chip === '群', `${fi.chip} :: ${fi.head}`)
ok('阶是 3（手算：A₄ 的像 ≅ C₃）', fi.vals.some((v) => v.includes('|G| = 3')), JSON.stringify(fi.vals))

/* ── 假声明被拦在行里 ── */

await addLine('D', 'D_4')
// 假声明是**输入层**就拦住的（按钮置灰 → 根本写不进对象表），
// 所以这里看的是状态行，不是 `.row-err`。这一点与"定义表里的行"是两条不同的路。
const submitted = await addLine('R2', 'D ⊆ G')
const st = await page.evaluate(() => document.querySelector('.composer-status')?.textContent ?? '')
ok('`D ⊆ G`（D₄ 不是 S₄ 的子群）被输入层拦住', submitted === false, `submitted=${submitted}`)
ok('拦的理由是"不是子群"', st.includes('不是') && st.includes('子群'), st)
ok('对象表里没有多出任何求值失败的行', (await rowErrs()).length === 0)

await page.screenshot({ path: '../../docs/assets/u20-subgroup-image.png' })

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
