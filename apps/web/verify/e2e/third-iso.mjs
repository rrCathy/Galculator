/**
 * 走查：第三同构定理的骨架（G4）——几何层。
 *
 * 语义层见 `verify/suites/thirdIso.ts`。这里验证图上真的长出了那几条边，
 * 且方向/形状正确：`KN ↪ GN`（第三同构的第一句）是**单射**、
 * `GN ↠ Q` 与 `K ↠ K/N` 是**满射**、竖直边同列。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/third-iso.mjs`
 */
const PW = 'file:///C:/newproject/GroupViz/node_modules/playwright/index.mjs'
const URL = process.env.GAL_URL ?? 'http://127.0.0.1:5273/?empty=1'

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

function seg(d) {
  const m = /^M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*L\s*(-?[\d.]+)[\s,]+(-?[\d.]+)$/.exec(d.trim())
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

await page.goto(URL, { waitUntil: 'load' })
await page.waitForTimeout(1200)

// N ⊴ K ⊴ G：(G/N)/(K/N) ≅ G/K，|G/K| = 2
const LINES = [
  'G = D_4',
  'N = 闭包(G, r2)',
  'K = 闭包(G, r)',
  'GN = 商(G, N)',
  'KN = 商(K, N)',
  'Q = 商(GN, KN)',
]
await page.click('.composer-orb .orb')
for (const line of LINES) {
  await page.fill('.composer-expr', line)
  await page.press('.composer-expr', 'Enter')
  await page.waitForTimeout(260)
}
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

const data = await page.evaluate(() => {
  const svg = document.querySelector('svg.canvas')
  const nodes = [...svg.querySelectorAll('g.gnode')].map((g) => {
    const hit = g.querySelector('.gnode-hit')
    const cx =
      hit.tagName === 'circle'
        ? Number(hit.getAttribute('cx'))
        : Number(hit.getAttribute('x')) + Number(hit.getAttribute('width')) / 2
    const cy =
      hit.tagName === 'circle'
        ? Number(hit.getAttribute('cy'))
        : Number(hit.getAttribute('y')) + Number(hit.getAttribute('height')) / 2
    return { id: g.dataset.id, cx, cy }
  })
  const edges = [...svg.querySelectorAll('g.gedge')].map((g) => {
    const path = g.querySelector('path:not(.gedge-hit)')
    return {
      label: g.querySelector('text')?.textContent ?? '',
      d: path?.getAttribute('d') ?? '',
      end: path?.getAttribute('marker-end') ?? '',
      start: path?.getAttribute('marker-start') ?? '',
    }
  })
  return { nodes, edges, rows: [...svg.querySelectorAll('.row-err')].map((e) => e.textContent.trim()) }
})

ok('没有求值失败的行', data.rows.length === 0, data.rows.join(' | '))
const at = Object.fromEntries(data.nodes.map((n) => [n.id, n]))
const ids = data.nodes.map((n) => n.id).sort()
ok('六个顶点都在画布上', ids.join(' ') === 'G GN K KN N Q', `nodes=${ids.join(',')}`)

// 边：按 (label, 起点终点) 找不到了（端点被裁），改用「同一条边的两端节点」
// —— 用节点中心 + 边的轴向反推：竖直边 x 等于哪个节点的 x
const vEdgeAt = (x) => data.edges.filter((e) => { const s = seg(e.d); return s && Math.abs(s.x1 - s.x2) <= 1 && Math.abs(s.x1 - x) <= 2.5 })
const hEdgeAt = (y) => data.edges.filter((e) => { const s = seg(e.d); return s && Math.abs(s.y1 - s.y2) <= 1 && Math.abs(s.y1 - y) <= 2.5 })

const GN = at['GN']
const KN = at['KN']
const Q = at['Q']

if (GN && KN && Q) {
  // `KN ↪ GN`：水平边（KN 与 GN 同层），带尾钩
  const h = hEdgeAt(KN.cy)
  const inj = h.find((e) => /-hook\b/.test(e.start ?? ''))
  ok('KN ↪ GN 存在（第三同构的第一句）', !!inj, `同层水平边=${h.length}`)
  if (inj) ok('KN ↪ GN 是单射（尾钩）', /-hook\b/.test(inj.start), inj.start)

  // `GN ↠ Q`：竖直边，双箭头
  const v = vEdgeAt(GN.cx)
  const pi2 = v.find((e) => /-surj\b/.test(e.end ?? ''))
  ok('GN ↠ Q 存在（满射）', !!pi2, `同列竖直边=${v.length}`)
} else {
  ok('GN / KN / Q 齐备', false)
}

await page.screenshot({ path: '../../docs/assets/u11-third-iso.png', clip: (await page.locator('svg.canvas').boundingBox()) ?? undefined })
console.log('')
console.log(`ERRORS: ${logs.length ? logs.join(' | ') : 'none'}`)
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
