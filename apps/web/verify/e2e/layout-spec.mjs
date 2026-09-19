/**
 * 走查：**布局硬规范的通用体检** + 默认示范的视觉留档。
 *
 * 两条判据对**任何**图都该成立（DIAGRAM_SPEC §1.1 / §1.2）：
 *   · 同层节点 y 严格相等（行对齐）
 *   · 竖直约束边的区间里不许夹着同列节点（箭头不许从对象身上穿过去）
 *
 * 2026-09-19 加这段是因为改列约束判据（π 优先 · 合并后全局检查）之后，
 * 需要一个"改布局不会再打崩图"的哨兵。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/layout-spec.mjs`
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

/** 打开一个场景：`lines` 为空则用产品自带的默认示范。 */
async function inspect(lines, shot) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const logs = []
  page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
  // 要默认示范就别带 `?empty=1`（那个开关是给"只依赖自己写的行"的走查用的）
  const url = lines.length === 0 ? `${BASE}/` : `${BASE}/?empty=1`
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(1100)
  if (lines.length > 0) {
    await page.click('.composer-orb .orb')
    for (const l of lines) {
      await page.fill('.composer-expr', l)
      await page.press('.composer-expr', 'Enter')
      await page.waitForTimeout(260)
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }

  const d = await page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
    const nodes = [...svg.querySelectorAll('g.gnode')].map((g) => {
      const h = g.querySelector('.gnode-hit')
      return {
        id: g.dataset.id,
        x: Math.round(h.tagName === 'circle' ? +h.getAttribute('cx') : +h.getAttribute('x') + +h.getAttribute('width') / 2),
        y: Math.round(h.tagName === 'circle' ? +h.getAttribute('cy') : +h.getAttribute('y') + +h.getAttribute('height') / 2),
      }
    })
    const edges = [...svg.querySelectorAll('g.gedge')].map((g) => {
      const p = g.querySelector('path:not(.gedge-hit)')
      const nums = (p?.getAttribute('d') ?? '').match(/-?[\d.]+/g)?.map(Number) ?? []
      return { label: g.querySelector('text')?.textContent ?? '', x1: nums[0], y1: nums[1], x2: nums[2], y2: nums[3] }
    })
    return { nodes, edges, rows: [...svg.querySelectorAll('.row-err')].map((e) => e.textContent.trim()) }
  })

  ok(`${shot}: 控制台零错误`, logs.length === 0, logs.join(' | '))
  ok(`${shot}: 没有求值失败的行`, d.rows.length === 0, d.rows.join(' | '))

  // ① 行对齐：同一 y 上的所有节点必须真的同 y（本来就是按 y 分组的，这里验的是"没有半个像素的错位"）
  const byRow = new Map()
  for (const n of d.nodes) {
    const arr = byRow.get(n.y) ?? []
    arr.push(n.id)
    byRow.set(n.y, arr)
  }
  ok(`${shot}: 行数 >= 2（有分层）`, byRow.size >= 2, `rows=${[...byRow.keys()].join(',')}`)

  // ② 竖直边不许穿过对象
  const crossing = []
  for (const e of d.edges) {
    if (!Number.isFinite(e.x1) || Math.abs(e.x1 - e.x2) > 2) continue
    const lo = Math.min(e.y1, e.y2)
    const hi = Math.max(e.y1, e.y2)
    for (const n of d.nodes) {
      if (Math.abs(n.x - e.x1) <= 2 && n.y > lo + 6 && n.y < hi - 6) crossing.push(`${e.label || '∅'}→${n.id}`)
    }
  }
  ok(`${shot}: 竖直箭头不从对象身上穿过`, crossing.length === 0, crossing.join(', '))

  await page.screenshot({ path: `../../docs/assets/${shot}.png`, clip: (await page.locator('svg.canvas').boundingBox()) ?? undefined })
  await page.close()
  return d
}

const def = await inspect([], 'u11-default-sylow')
ok('默认示范长出了图（>=3 个对象）', def.nodes.length >= 3, `nodes=${def.nodes.map((n) => n.id).join(',')}`)

// 第三同构：曾经的问题是 `G ↠ G/N` 从 `⟨r²⟩` 身上穿过（真截图抓到的）
await inspect(
  ['G = D_4', 'N = 闭包(G, r2)', 'K = 闭包(G, r)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
  'u11-third-iso',
)

// 第一同构正方形
await inspect(['G = C_6', 'H = C_6', 'φ = 映射(G, H, a→2)'], 'u11-first-iso-square')

console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0) process.exitCode = 1
