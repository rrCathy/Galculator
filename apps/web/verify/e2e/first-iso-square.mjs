/**
 * 走查：第一同构定理的**正方形**（G8）——几何层。
 *
 * 语义层由 `verify/suites/firstIso.ts` 保证（"该有的边都存在"）；
 * 这里管的是 DIAGRAM_SPEC §1 的几何硬规范：
 *   ① 水平箭头同高、垂直箭头同列（同层 y 严格相等 / 同列 x 严格相等）
 *   ② 箭头形状 = 映射类型（`↠` 双箭头 / `↪` 尾钩 / `≅` 双向）
 *
 * 跑法（先起 dev server 5273）：
 *   node verify/e2e/first-iso-square.mjs
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

/** `M x y L x y` → 端点。遇到曲线（自环）返回 null。 */
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

// ── 铺前置行：C₆ --φ(a↦2)--> C₆，非满射（|im| = 3 < |H| = 6）──
const LINES = ['G = C_6', 'H = C_6', 'φ = 映射(G, H, a→2)']
await page.click('.composer-orb .orb')
for (const line of LINES) {
  await page.fill('.composer-expr', line)
  await page.press('.composer-expr', 'Enter')
  await page.waitForTimeout(300)
}
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

const data = await page.evaluate(() => {
  const svg = document.querySelector('svg.canvas')
  // 节点中心：群节点是 rect（x/y/宽高）、集合是 circle（cx/cy）
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
    }
  })
  return { nodes, edges, rows: [...svg.querySelectorAll('.row-err')].map((e) => e.textContent.trim()) }
})

// 出错行不该存在
ok('没有求值失败的行', data.rows.length === 0, data.rows.join(' | '))

// ── 顶点 ──
const at = Object.fromEntries(data.nodes.map((n) => [n.id, n]))
const nodes = data.nodes.map((n) => n.id).sort()
ok('补出 im φ 顶点', nodes.includes('φ/im'), `nodes=${nodes.join(',')}`)
ok('补出 G/ker φ 顶点', nodes.includes('φ/ker'))
ok('顶点集合正确', nodes.join(' ') === 'G H φ/im φ/ker', `nodes=${nodes.join(',')}`)

// ── **正方形**（直接判据：四个顶点中心构成矩形）──
{
  const { G, H } = at
  const ker = at['φ/ker']
  const im = at['φ/im']
  if (G && H && ker && im) {
    ok('顶行：G 与 H 同高', Math.abs(G.cy - H.cy) <= 1, `${G.cy} vs ${H.cy}`)
    ok('底行：G/ker φ 与 im φ 同高', Math.abs(ker.cy - im.cy) <= 1, `${ker.cy} vs ${im.cy}`)
    ok('左列：G 与 G/ker φ 同列', Math.abs(G.cx - ker.cx) <= 1, `${G.cx} vs ${ker.cx}`)
    ok('右列：im φ 与 H 同列', Math.abs(im.cx - H.cx) <= 1, `${im.cx} vs ${H.cx}`)
    ok('两行分开（非退化）', Math.abs(G.cy - ker.cy) > 10, `${G.cy} vs ${ker.cy}`)
    ok('两列分开（非退化）', Math.abs(G.cx - H.cx) > 10, `${G.cx} vs ${H.cx}`)
  } else {
    ok('四个顶点齐备', false, `nodes=${nodes.join(',')}`)
  }
}

// ── 边：标签 → 记录 ──
const byLabel = Object.fromEntries(data.edges.map((e) => [e.label, e]))
ok('画布上有 4 条实线边', data.edges.length === 4, `labels=${data.edges.map((e) => e.label).join(',')}`)
ok('有 π 边', !!byLabel['π'])
ok('有 ≅ 边', !!byLabel['≅'])
ok('有 ↪ 边', !!byLabel['↪'])
ok('有 φ 边（用户画的）', !!byLabel['φ'])

// ── 边的轴向（DIAGRAM_SPEC §1.1：水平箭头同高、垂直箭头同列）──
// 注意：边端点被节点尺寸裁过，所以只能比**轴向**（两端 y/x 相等），
// 不能比"端点重合"——那需要节点中心，已经由上面那段断言了。
{
  const phi = seg(byLabel['φ']?.d ?? '')
  const iso = seg(byLabel['≅']?.d ?? '')
  const pi = seg(byLabel['π']?.d ?? '')
  const inj = seg(byLabel['↪']?.d ?? '')
  if (phi) ok('φ（G→H）水平', Math.abs(phi.y1 - phi.y2) <= 1, `Δy=${Math.abs(phi.y1 - phi.y2)}`)
  if (iso) ok('≅（G/ker→im）水平', Math.abs(iso.y1 - iso.y2) <= 1, `Δy=${Math.abs(iso.y1 - iso.y2)}`)
  if (pi) ok('π（G→G/ker）垂直', Math.abs(pi.x1 - pi.x2) <= 1, `Δx=${Math.abs(pi.x1 - pi.x2)}`)
  if (inj) ok('↪（im→H）垂直', Math.abs(inj.x1 - inj.x2) <= 1, `Δx=${Math.abs(inj.x1 - inj.x2)}`)
}

// ── 箭头形状（DIAGRAM_SPEC §1.6）──
ok('π 是满射（双箭头）', /-surj\b/.test(byLabel['π']?.end ?? ''), byLabel['π']?.end)
ok('↪ 是单射（起点尾钩）', /-hook\b/.test(byLabel['↪']?.start ?? ''), byLabel['↪']?.start)
ok('≅ 是同构（两端都是普通箭头）', /-head\b/.test(byLabel['≅']?.end ?? '') && /-head\b/.test(byLabel['≅']?.start ?? ''), `${byLabel['≅']?.start} / ${byLabel['≅']?.end}`)
ok('≅ 不是满射形状（与 ↠ 可分）', !/-surj\b/.test(byLabel['≅']?.end ?? ''))
ok('≅ 不是单射形状（与 ↪ 可分）', !/-hook\b/.test(byLabel['≅']?.start ?? ''))

// ── 截图留档（仓库根的 docs/assets —— 脚本 cwd 是 apps/web）──
const box = await page.locator('svg.canvas').boundingBox()
const shot = box ?? { x: 0, y: 0, width: 1440, height: 900 }
await page.screenshot({ path: '../../docs/assets/u11-first-iso-square.png', clip: shot })
console.log(`截图：docs/assets/u11-first-iso-square.png`)

console.log('')
console.log(`ERRORS: ${logs.length ? logs.join(' | ') : 'none'}`)
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
