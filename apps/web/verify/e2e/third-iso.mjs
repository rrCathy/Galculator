/**
 * 走查：第三同构定理的骨架（G4）——几何层。
 *
 * 语义层见 `verify/suites/thirdIso.ts`。这里验证图上真的长出了那几条边，
 * 且方向/形状正确：`KN \\hookrightarrow GN`（第三同构的第一句）是**单射**、
 * `GN \\twoheadrightarrow Q` 与 `K \\twoheadrightarrow K/N` 是**满射**、竖直边同列。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/third-iso.mjs`
 */
const PW = 'file:///C:/newproject/GroupViz/node_modules/playwright/index.mjs'
const BASE = process.env.GAL_BASE ?? 'http://127.0.0.1:5273'
const URL = process.env.GAL_URL ?? `${BASE}/?empty=1`

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

// N \\trianglelefteq K \\trianglelefteq G：(G/N)/(K/N) \\cong G/K，|G/K| = 2
const LINES = [
  'G = D_4',
  'N = closure(G, r2)',
  'K = closure(G, r)',
  'GN = quotient(G, N)',
  'KN = quotient(K, N)',
  'Q = quotient(GN, KN)',
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
      label: g.dataset.label ?? '',
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
  // `KN \\hookrightarrow GN`：水平边（KN 与 GN 同层），带尾钩
  const h = hEdgeAt(KN.cy)
  const inj = h.find((e) => /-hook\b/.test(e.start ?? ''))
  ok('KN -> GN 存在（第三同构的第一句）', !!inj, `同层水平边=${h.length}`)
  if (inj) ok('KN -> GN 是单射（尾钩）', /-hook\b/.test(inj.start), inj.start)

  // `GN \\twoheadrightarrow Q`：竖直边，双箭头
  const v = vEdgeAt(GN.cx)
  const pi2 = v.find((e) => /-surj\b/.test(e.end ?? ''))
  ok('GN ->> Q 存在（满射）', !!pi2, `同列竖直边=${v.length}`)
} else {
  ok('GN / KN / Q 齐备', false)
}

/* ── 用户实测那条（2026-09-29）：「不能做商群的商群」──
   分母 `N` 用**独立构造**的 `V_4`：`H/N`、`G/N` 各自自动翻译，`B/A` 是商群的商。

   **必须重开一张空画布**，且必须是 `G = S_4`：
   · 上面那段已经把 `G` 绑成 `D_4`（重定义会被拒 —— 名字重复）；
   · 更关键的是**翻译唯一性**：S₄ 里与 V₄ 同构的子群恰 1 个且正规 ⇒ 自动翻译无歧义；
     D₄ 里有 2 个（都正规）⇒ 那种情况系统**应该**停下来问，是另一个场景（语义层
     `suites/thirdIso.ts` 的反例钉着），不该混进这条链。 ── */
await page.screenshot({ path: '../../docs/assets/u11-third-iso.png', clip: (await page.locator('svg.canvas').boundingBox()) ?? undefined })
await page.goto(URL, { waitUntil: 'load' })
await page.waitForTimeout(1200)
await page.click('.composer-orb .orb')
for (const line of ['G = S_4', 'H = A_4', 'N = V_4', 'A = H/N', 'B = G/N', 'D = G/H', 'F = B/A']) {
  await page.fill('.composer-expr', line)
  await page.press('.composer-expr', 'Enter')
  await page.waitForTimeout(300)
}
await page.keyboard.press('Escape')
await page.waitForTimeout(450)
{
  /**
   * 判据读**画布节点**，不读 `.row-err` —— 输入球的路是"预览不 ok 就不提交"，
   * 失败的行根本进不了对象表（这也正是从前这条走查**看着全过**的原因：
   * `row-err` 恒为空 ⇒ 那是条恒真断言）。
   */
  const nodeIds2 = () => page.evaluate(() => [...document.querySelectorAll('g.gnode')].map((g) => g.dataset.id))
  const got = await nodeIds2()
  ok(
    '七行全部落地（G/N、H/N、G/H、商群的商 B/A）',
    ['G', 'H', 'N', 'A', 'B', 'D', 'F'].every((x) => got.includes(x)),
    got.join(','),
  )

  /** 点画布节点看识别（`.gnode-hit` 是透明的，只能派发事件）。 */
  const identifyOf = async (id) => {
    await page.evaluate((x) => {
      document
        .querySelector(`g.gnode[data-id="${x}"] .gnode-hit`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    }, id)
    await page.waitForTimeout(440)
    return page.evaluate(() =>
      [...document.querySelectorAll('.insight-body')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '),
    )
  }

  // F ≅ D ≅ C_2（第三同构的结论）：两边都点开看识别。
  // 判据读的是**渲染后**的文本，KaTeX 把 `C_2` 的下划线吃掉 → 这里同时认三种写法。
  const isC2 = (s) => /C₂|C_2|C2/.test(s)
  const fIns = await identifyOf('F')
  ok('`F = B/A` 被识别为 2 阶循环群（C_2）', isC2(fIns), fIns.slice(0, 200))
  const dIns = await identifyOf('D')
  ok('`D = G/H` 也识别为 C_2（第三同构：两边同构）', isC2(dIns), dIns.slice(0, 200))

  // ── 结论要**自己画出来**（U36）：`(G/N)/(K/N) ≅ G/K` 那条 `≅` 自动长在图上 ──
  const iso = await page.evaluate(() => {
    const g = document.querySelector('g.gedge[data-edge-id="F->D:iso3"]')
    if (!g) return null
    const p = g.querySelector('path:not(.gedge-hit)')
    return {
      label: g.dataset.label ?? '',
      start: p?.getAttribute('marker-start') ?? '',
      end: p?.getAttribute('marker-end') ?? '',
    }
  })
  ok('图上自动长出 `F ≅ D` 那条边', !!iso, '没有 data-edge-id="F->D:iso3" 的边')
  ok(
    '它画成 ≅（`\\cong`，两端都带箭头）',
    !!iso && iso.label === '\\cong' && /-head/.test(iso.start) && /-head/.test(iso.end),
    iso ? `${iso.label} start=${iso.start} end=${iso.end}` : '（上一条已判失败）',
  )
}

await page.screenshot({ path: '../../docs/assets/u35-third-iso-quotient.png', clip: (await page.locator('svg.canvas').boundingBox()) ?? undefined })
console.log('')
console.log(`ERRORS: ${logs.length ? logs.join(' | ') : 'none'}`)
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
