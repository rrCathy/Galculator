/**
 * 走查：**M3 的两条新模板**（真浏览器）。
 *
 * M2 之前所有模板的参数恰好都是 `(群, p)`，面板可以把"群输入框 + p 按钮组"写死。
 * M3 的两条定理参数不一样：
 *   · **轨道–稳定子**：要多一个**点 x**（Ω = G 自身，共轭作用在自身上）
 *   · **第一同构定理**：要多一个**靶群**与一组**生成元的像**（φ 由它们定出）
 * 于是控件改成由模板自己声明（`slots`）。这条走查验的就是这条链在真浏览器里真的通：
 *   · 两张卡各自长出该有的输入框，默认值是**模板算出来的建议**（不是写死的）；
 *   · 换群 → 建议值跟着重算（D₄ 的点是 `r`、C₁₂ 的像是 `a→2`）；
 *   · 填错了拦住并说明理由（红字），没填是**引导**（灰字）；
 *   · 起跑 → 走到底 → 画布上真长出图（OST：G 上的自环 + O/S；第一同构：正方形）；
 *   · 全程控制台零错误。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/proof-m3.mjs`
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

/** `M x y L x y` → 端点。曲线（自环）返回 null。 */
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

const OST = 'orbit-stabilizer'
const ISO = 'first-isomorphism'
const card = (id) => page.locator(`.proof-item[data-tpl="${id}"]`)

const cardState = (id) =>
  page.evaluate((tid) => {
    const el = document.querySelector(`.proof-item[data-tpl="${tid}"]`)
    if (!el) return null
    return {
      fields: [...el.querySelectorAll('.proof-field input')].map((i) => i.value),
      names: [...el.querySelectorAll('.proof-field-name')].map((s) => s.textContent.trim()),
      bad: el.querySelector('.proof-bad')?.textContent.trim() ?? '',
      hint: el.querySelector('.proof-hint')?.textContent.trim() ?? '',
      canStart: !el.querySelector('.proof-start')?.disabled,
    }
  }, id)

const setGroup = async (v) => {
  await page.fill('.proof-group input', v)
  await page.waitForTimeout(320)
}
const setField = async (id, i, v) => {
  await card(id).locator('.proof-field input').nth(i).fill(v)
  await page.waitForTimeout(320)
}

const canvas = () =>
  page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
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
    return {
      nodes,
      edges,
      rows: [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()),
      last: document.querySelector('.proof-step.on .proof-text')?.textContent ?? '',
      inst: document.querySelector('.proof-instance')?.textContent ?? '',
      steps: document.querySelectorAll('.proof-step').length,
      allSteps: [...document.querySelectorAll('.proof-step .proof-text')].map((e) => e.textContent),
    }
  })

const goAll = async (max = 20) => {
  for (let i = 0; i < max; i++) {
    const btn = page.locator('.proof-bar button.primary')
    if (await btn.isDisabled()) break
    await btn.click()
    await page.waitForTimeout(200)
  }
}
const exitProof = async () => {
  await page.click('.dock-topright .dock-mini')
  await page.waitForTimeout(300)
}

/* ══ 1. 卡片上该有的控件（默认群 A_4）════════════════════ */

ok('两条新模板都在面板上', (await card(OST).count()) === 1 && (await card(ISO).count()) === 1)
const ost0 = await cardState(OST)
const iso0 = await cardState(ISO)
ok('OST 只有一个输入框（点 x）', ost0.fields.length === 1, JSON.stringify(ost0.fields))
ok('OST 的槽名是「点 x」', ost0.names[0] === '点 x', ost0.names.join(','))
ok('OST 的默认点 = A₄ 的最大共轭类 (234)', ost0.fields[0] === '(234)', ost0.fields[0])
ok(
  '第一同构两个输入框（靶群 + 生成元的像）',
  iso0.fields.length === 2 && iso0.names[0] === '靶群 H' && iso0.names[1] === '生成元的像',
  JSON.stringify(iso0),
)
ok('第一同构默认靶群 = 源群 A_4', iso0.fields[0] === 'A_4', iso0.fields[0])
ok('第一同构默认像非空（非循环源给恒等映射兜底）', iso0.fields[1].includes('→'), iso0.fields[1])
ok('两张新卡默认都能起跑', ost0.canStart && iso0.canStart, `${ost0.canStart}/${iso0.canStart}`)
ok('两条 Sylow 卡仍在（p 按钮组没被改坏）', (await page.locator('.proof-item[data-tpl="sylow-1-wielandt"] .proof-prime').count()) === 2)

// 面板把 `text` 当纯文本渲染（只有 `tex` 走 KaTeX）—— 星号不会被吃掉，写了就是画面上多两颗星
ok(
  '卡片上的文案不含 Markdown 星号',
  !(await page.evaluate(() =>
    [...document.querySelectorAll('.proof-item-title, .proof-item-blurb, .proof-item-theorem')].some(
      (e) => e.textContent.includes('**'),
    ),
  )),
)

// 这一轮的交付物之一：参数界面（滚一下，让两条新卡进画面）
await card(ISO).scrollIntoViewIfNeeded()
await page.waitForTimeout(250)
await page.screenshot({ path: '../../docs/assets/u-m3-proof-params.png' })

/* ══ 2. 换群 → 建议值跟着重算 ═══════════════════════════ */

await setGroup('D_4')
const ostD4 = await cardState(OST)
ok('换到 D₄：OST 的点重算成 r', ostD4.fields[0] === 'r', ostD4.fields[0])

await setGroup('C_12')
const isoC12 = await cardState(ISO)
ok('换到 C₁₂：靶群跟到 C_12', isoC12.fields[0] === 'C_12', isoC12.fields[0])
ok('换到 C₁₂：像重算成 a→2', isoC12.fields[1] === 'a→2', isoC12.fields[1])
ok('C₁₂ 上第一同构可起跑', isoC12.canStart, JSON.stringify(isoC12))

await setGroup('S_4')
const ostS4 = await cardState(OST)
ok('换回 S₄：点回到 (234)', ostS4.fields[0] === '(234)', ostS4.fields[0])

/* ══ 3. 填错要拦住、没填是引导 ═══════════════════════════ */

await setField(OST, 0, '不存在的元素')
const badX = await cardState(OST)
ok('点不在群里 → 按钮禁用', badX.canStart === false, JSON.stringify(badX))
ok('理由写在卡片上（红字）', badX.bad.length > 2, badX.bad)
ok('理由里不含反斜杠', !badX.bad.includes('\\'), badX.bad)

await setGroup('S_4')
await setField(OST, 0, '(234)') // 把上一段填坏的点改回来（群没变，槽值不会自动重置）
await setField(ISO, 1, '') // 把「像」清空 → 这句该是**引导**（灰字）而不是报错
const blank = await cardState(ISO)
ok('槽空着时是引导（灰字 proof-hint）', blank.hint.length > 2 && blank.bad === '', JSON.stringify(blank))
ok('引导里点明了源群的生成元', /s12|s23|c\b/.test(blank.hint), blank.hint)
ok('空槽时按钮同样禁用', blank.canStart === false)

/* ══ 4. 轨道–稳定子：走到底，画布上长出 G 的自环 + O / S ══ */

await setGroup('S_4')
await card(OST).locator('.proof-start').click()
await page.waitForTimeout(700)

const ost1 = await canvas()
ok('实例行写明群与点', ost1.inst.includes('S_4') && ost1.inst.includes('(234)'), ost1.inst)
ok('OST 共 8 步', ost1.steps === 8, `got=${ost1.steps}`)

await goAll()
const ostEnd = await canvas()
ok('走到底没有求值失败的行', ostEnd.rows.length === 0, ostEnd.rows.join(' | '))
ok(
  '画布上是 G / O / S 三个节点',
  ['G', 'O', 'S'].every((x) => ostEnd.nodes.some((n) => n.id === x)) && ostEnd.nodes.length === 3,
  ostEnd.nodes.map((n) => n.id).join(','),
)
ok(
  'G 上有那条自环（共轭作用作用在自身上）',
  ostEnd.edges.some((e) => e.cls.includes('gedge-action')),
  ostEnd.edges.map((e) => `${e.cls}:${e.label}`).join(' | '),
)
ok('自环是曲线（不是直线段）', ostEnd.edges.filter((e) => e.cls.includes('gedge-action')).every((e) => seg(e.d) === null))
ok(
  'O 与 S 都挂到 G 上（两条 ↪）',
  ostEnd.edges.filter((e) => e.label === '↪').length === 2,
  ostEnd.edges.map((e) => e.label).join(','),
)
ok('结论文本写「8 × 3 = 24」', ostEnd.last.includes('8 × 3 = 24'), ostEnd.last)
ok('结论文本不含反斜杠', !ostEnd.last.includes('\\'), ostEnd.last)
ok('步骤文本不含 Markdown 星号', !ostEnd.allSteps.some((t) => t.includes('**')))

await page.screenshot({ path: '../../docs/assets/u-m3-orbit-stabilizer.png' })
await exitProof()

/* ══ 5. 第一同构：走到底 → 正方形 ═══════════════════════ */

await setGroup('C_6')
const isoC6 = await cardState(ISO)
ok('C₆ 上靶群与像都就位', isoC6.fields[0] === 'C_6' && isoC6.fields[1] === 'a→2', JSON.stringify(isoC6.fields))

await card(ISO).locator('.proof-start').click()
await page.waitForTimeout(700)
const isoStart = await canvas()
ok('实例行写明两个群与像', /C_6.*C_6.*a→2/.test(isoStart.inst), isoStart.inst)
ok('第一同构共 11 步', isoStart.steps === 11, `got=${isoStart.steps}`)

// 第 1 步画布上只有 G —— 走到「补出商群」那步再开始看顶点
await goAll()
const isoEnd = await canvas()
ok('走到底没有求值失败的行', isoEnd.rows.length === 0, isoEnd.rows.join(' | '))

const at = Object.fromEntries(isoEnd.nodes.map((n) => [n.id, n]))
ok(
  '四个顶点齐备（G / H / φ/ker / φ/im）',
  ['G', 'H', 'φ/ker', 'φ/im'].every((x) => !!at[x]),
  isoEnd.nodes.map((n) => n.id).join(','),
)

// ── 正方形（几何硬规范：顶点中心构成矩形）──
if (at.G && at.H && at['φ/ker'] && at['φ/im']) {
  ok('顶行：G 与 H 同高', Math.abs(at.G.cy - at.H.cy) <= 1, `${at.G.cy} vs ${at.H.cy}`)
  ok(
    '底行：G/ker φ 与 im φ 同高',
    Math.abs(at['φ/ker'].cy - at['φ/im'].cy) <= 1,
    `${at['φ/ker'].cy} vs ${at['φ/im'].cy}`,
  )
  ok('左列：G 与 G/ker φ 同列', Math.abs(at.G.cx - at['φ/ker'].cx) <= 1, `${at.G.cx} vs ${at['φ/ker'].cx}`)
  ok('右列：im φ 与 H 同列', Math.abs(at['φ/im'].cx - at.H.cx) <= 1, `${at['φ/im'].cx} vs ${at.H.cx}`)
  ok('两行分开（非退化）', Math.abs(at.G.cy - at['φ/ker'].cy) > 10)
  ok('两列分开（非退化）', Math.abs(at.G.cx - at.H.cx) > 10)
}

const byLabel = Object.fromEntries(isoEnd.edges.map((e) => [e.label, e]))
ok('画布上有 4 条实线边', isoEnd.edges.length === 4, isoEnd.edges.map((e) => e.label).join(','))
ok('有 π / ≅ / ↪ / φ 四条边', ['π', '≅', '↪', 'φ'].every((x) => !!byLabel[x]), isoEnd.edges.map((e) => e.label).join(','))
{
  const pi = seg(byLabel['π']?.d)
  const inj = seg(byLabel['↪']?.d)
  const phi = seg(byLabel['φ']?.d)
  const iso = seg(byLabel['≅']?.d)
  if (pi) ok('π 是竖边', Math.abs(pi.x1 - pi.x2) <= 1, `Δx=${Math.abs(pi.x1 - pi.x2)}`)
  if (inj) ok('↪ 是竖边', Math.abs(inj.x1 - inj.x2) <= 1, `Δx=${Math.abs(inj.x1 - inj.x2)}`)
  if (phi) ok('φ 是横边', Math.abs(phi.y1 - phi.y2) <= 1, `Δy=${Math.abs(phi.y1 - phi.y2)}`)
  if (iso) ok('≅ 是横边', Math.abs(iso.y1 - iso.y2) <= 1, `Δy=${Math.abs(iso.y1 - iso.y2)}`)
}
ok('π 是满射（双箭头）', /-surj\b/.test(byLabel['π']?.end ?? ''), byLabel['π']?.end)
ok('↪ 是单射（起点尾钩）', /-hook\b/.test(byLabel['↪']?.start ?? ''), byLabel['↪']?.start)
ok(
  '≅ 两端都是普通箭头（同构，与 ↠ / ↪ 可分）',
  /-head\b/.test(byLabel['≅']?.end ?? '') && /-head\b/.test(byLabel['≅']?.start ?? ''),
  `${byLabel['≅']?.start} / ${byLabel['≅']?.end}`,
)
ok('结论写「3 = |im φ| = 3」', isoEnd.last.includes('3 = |im φ| = 3'), isoEnd.last)

await page.screenshot({ path: '../../docs/assets/u-m3-first-iso-square.png' })
await exitProof()

/* ══ 6. 换成满射（靶群 C₃）→ 三角形 ═════════════════════ */

await setGroup('C_6')
await setField(ISO, 0, 'C_3')
const isoC3 = await cardState(ISO)
ok('换靶群后像自动重算（C₆ → C₃ 只有一个满射）', isoC3.fields[1].startsWith('a→'), isoC3.fields[1])
ok('新组合可起跑', isoC3.canStart, JSON.stringify(isoC3))

await card(ISO).locator('.proof-start').click()
await page.waitForTimeout(700)
await goAll()
const tri = await canvas()
ok('满射时图上只有 3 个顶点（三角形，不补 im φ）', tri.nodes.length === 3, tri.nodes.map((n) => n.id).join(','))
ok('满射时没有 ↪ 边', !tri.edges.some((e) => e.label === '↪'), tri.edges.map((e) => e.label).join(','))
ok('满射时那一步在文本里说了「im φ = H」', tri.allSteps.some((t) => t.includes('im φ = H')))
ok(
  '满射时不多那一步（10 步 vs 非满射 11 步）',
  tri.steps === 10,
  `got=${tri.steps}`,
)
ok('结论仍是阶相等', /3 = \|im φ\| = 3/.test(tri.last), tri.last)
await exitProof()

/* ══ 7. 收尾 ═══════════════════════════════════════════ */

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
