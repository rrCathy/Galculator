/**
 * 走查：**M3 的两条新模板**（真浏览器）。
 *
 * M2 之前所有模板的参数恰好都是 `(群, p)`，面板可以把"群输入框 + p 按钮组"写死。
 * M3 的两条定理参数不一样：
 *   \\cdot **轨道–稳定子**：要多一个**点 x**（\\Omega = G 自身，共轭作用在自身上）
 *   \\cdot **第一同构定理**：要多一个**靶群**与一组**生成元的像**（\\varphi 由它们定出）
 * 于是控件改成由模板自己声明（`slots`）。这条走查验的就是这条链在真浏览器里真的通：
 *   \\cdot 两张卡各自长出该有的输入框，默认值是**模板算出来的建议**（不是写死的）；
 *   \\cdot 换群 \\to 建议值跟着重算（D₄ 的点是 `r`、C₁₂ 的像是 `a\\to2`）；
 *   \\cdot 填错了拦住并说明理由（红字），没填是**引导**（灰字）；
 *   \\cdot 起跑 \\to 走到底 \\to 画布上真长出图（OST：G 上的自环 + O/S；第一同构：正方形）；
 *   \\cdot 全程控制台零错误。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/proof-m3.mjs`
 */
const PW = 'file:///C:/newproject/GroupViz/node_modules/playwright/index.mjs'
const BASE = process.env.GAL_BASE ?? 'http://127.0.0.1:5273'

/**
 * **键盘打不出来的字符**（中文与中文标点除外）—— 这才是「不可接受」的东西。
 *
 * 2026-09-27 的形态约定反转之后，`\Omega` / `\times` 这样的反斜杠命令**是正确形态**
 *（复制出去能贴进 LaTeX 博客、也能敲回来），所以判据从"不含反斜杠"
 * 换成"不含键盘打不出的字符"。
 */
const hasNonAscii = (s) =>
  /[^\x00-\x7F\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2013\u2014\u2018-\u201D\u2026]/.test(
    String(s ?? ''),
  )

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

/** `M x y L x y` \\to 端点。曲线（自环）返回 null。 */
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
        label: g.dataset.label ?? '',
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
      /**
       * 步骤正文的**原始形态**（`data-text`，即 `s.text` 本身：`8 \\times 3 = 24`）。
       *
       * 为什么要另读一份：`.proof-text` 走 KaTeX，`textContent` 拿到的是**渲染结果**
       *（`\\times` 排成 ×、`\\varphi` 排成 φ、下标是 CSS）。判"文本形态对不对"要看原始串，
       * 判"渲染出来对不对"才看 `last` —— 两件事，两个字段。
       */
      lastRaw: document.querySelector('.proof-step.on')?.dataset.text ?? '',
      // 原始形态（见 ProofDock 的 `data-instance`）—— 渲染后 `\to` 成了 →、下标成了 CSS
      inst: document.querySelector('.proof-instance')?.dataset.instance ?? '',
      steps: document.querySelectorAll('.proof-step').length,
      allSteps: [...document.querySelectorAll('.proof-step .proof-text')].map((e) => e.textContent),
      allStepsRaw: [...document.querySelectorAll('.proof-step')].map((e) => e.dataset.text ?? ''),
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
ok('OST 的默认点 = A_4 的最大共轭类 (234)', ost0.fields[0] === '(234)', ost0.fields[0])
ok(
  '第一同构两个输入框（靶群 + 生成元的像）',
  iso0.fields.length === 2 && iso0.names[0] === '靶群 H' && iso0.names[1] === '生成元的像',
  JSON.stringify(iso0),
)
ok('第一同构默认靶群 = 源群 A_4', iso0.fields[0] === 'A_4', iso0.fields[0])
ok('第一同构默认像非空（非循环源给恒等映射兜底）', /\\to|->/.test(iso0.fields[1]), iso0.fields[1])
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

/* ══ 2. 换群 \\to 建议值跟着重算 ═══════════════════════════ */

await setGroup('D_4')
const ostD4 = await cardState(OST)
ok('换到 D_4：OST 的点重算成 r', ostD4.fields[0] === 'r', ostD4.fields[0])

await setGroup('C_12')
const isoC12 = await cardState(ISO)
ok('换到 C_12：靶群跟到 C_12', isoC12.fields[0] === 'C_12', isoC12.fields[0])
ok('换到 C_12：像重算成 a->2（新形态 a\\to 2）', /^a\\to 2$/.test(isoC12.fields[1]), isoC12.fields[1])
ok('C_12 上第一同构可起跑', isoC12.canStart, JSON.stringify(isoC12))

await setGroup('S_4')
const ostS4 = await cardState(OST)
ok('换回 S_4：点回到 (234)', ostS4.fields[0] === '(234)', ostS4.fields[0])

/* ══ 3. 填错要拦住、没填是引导 ═══════════════════════════ */

await setField(OST, 0, '不存在的元素')
const badX = await cardState(OST)
ok('点不在群里 -> 按钮禁用', badX.canStart === false, JSON.stringify(badX))
ok('理由写在卡片上（红字）', badX.bad.length > 2, badX.bad)
ok('理由里没有键盘打不出的字符', !hasNonAscii(badX.bad), badX.bad)

await setGroup('S_4')
await setField(OST, 0, '(234)') // 把上一段填坏的点改回来（群没变，槽值不会自动重置）
await setField(ISO, 1, '') // 把「像」清空 -> 这句该是**引导**（灰字）而不是报错
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
  'O 与 S 都挂到 G 上（两条 ->）',
  ostEnd.edges.filter((e) => e.label === '\\hookrightarrow').length === 2,
  ostEnd.edges.map((e) => e.label).join(','),
)
// 读**原始形态**（`data-text`）：`\times` 在 KaTeX 里排成 ×，`last` 里拿不到源码串
ok('结论文本写「8 \\times 3 = 24」', ostEnd.lastRaw.includes('8 \\times 3 = 24'), ostEnd.lastRaw)
ok('结论文本渲染后也真的成了 ×（不是漏了反斜杠没渲染）', ostEnd.last.includes('\u00d7'), ostEnd.last.slice(0, 80))
ok('步骤文本不含 Markdown 星号', !ostEnd.allSteps.some((t) => t.includes('**')))

await page.screenshot({ path: '../../docs/assets/u-m3-orbit-stabilizer.png' })
await exitProof()

/* ══ 5. 第一同构：走到底 \\to 正方形 ═══════════════════════ */

await setGroup('C_6')
const isoC6 = await cardState(ISO)
ok('C_6 上靶群与像都就位', isoC6.fields[0] === 'C_6' && isoC6.fields[1] === 'a\\to 2', JSON.stringify(isoC6.fields))

await card(ISO).locator('.proof-start').click()
await page.waitForTimeout(700)
const isoStart = await canvas()
ok('实例行写明两个群与像', /C_6[\s\S]*C_6[\s\S]*a\\to 2/.test(isoStart.inst), isoStart.inst)
ok('第一同构共 11 步', isoStart.steps === 11, `got=${isoStart.steps}`)

// 第 1 步画布上只有 G —— 走到「补出商群」那步再开始看顶点
await goAll()
const isoEnd = await canvas()
ok('走到底没有求值失败的行', isoEnd.rows.length === 0, isoEnd.rows.join(' | '))

const at = Object.fromEntries(isoEnd.nodes.map((n) => [n.id, n]))
ok(
  '四个顶点齐备（G / H / \\varphi/ker / \\varphi/im）',
  ['G', 'H', '\\varphi/ker', '\\varphi/im'].every((x) => !!at[x]),
  isoEnd.nodes.map((n) => n.id).join(','),
)

// ── 正方形（几何硬规范：顶点中心构成矩形）──
if (at.G && at.H && at['\\varphi/ker'] && at['\\varphi/im']) {
  ok('顶行：G 与 H 同高', Math.abs(at.G.cy - at.H.cy) <= 1, `${at.G.cy} vs ${at.H.cy}`)
  ok(
    '底行：G/ker \\varphi 与 im \\varphi 同高',
    Math.abs(at['\\varphi/ker'].cy - at['\\varphi/im'].cy) <= 1,
    `${at['\\varphi/ker'].cy} vs ${at['\\varphi/im'].cy}`,
  )
  ok('左列：G 与 G/ker \\varphi 同列', Math.abs(at.G.cx - at['\\varphi/ker'].cx) <= 1, `${at.G.cx} vs ${at['\\varphi/ker'].cx}`)
  ok('右列：im \\varphi 与 H 同列', Math.abs(at['\\varphi/im'].cx - at.H.cx) <= 1, `${at['\\varphi/im'].cx} vs ${at.H.cx}`)
  ok('两行分开（非退化）', Math.abs(at.G.cy - at['\\varphi/ker'].cy) > 10)
  ok('两列分开（非退化）', Math.abs(at.G.cx - at.H.cx) > 10)
}

const byLabel = Object.fromEntries(isoEnd.edges.map((e) => [e.label, e]))
ok('画布上有 4 条实线边', isoEnd.edges.length === 4, isoEnd.edges.map((e) => e.label).join(','))
ok('有 \\pi / \\cong / \\trianglelefteq / \\varphi 四条边', ['\\pi', '\\cong', '\\trianglelefteq', '\\varphi'].every((x) => !!byLabel[x]), isoEnd.edges.map((e) => e.label).join(','))
{
  const pi = seg(byLabel['\\pi']?.d)
  const incl = seg(byLabel['\\trianglelefteq']?.d)
  const phi = seg(byLabel['\\varphi']?.d)
  const iso = seg(byLabel['\\cong']?.d)
  if (pi) ok('\\pi 是竖边', Math.abs(pi.x1 - pi.x2) <= 1, `\\Delta x=${Math.abs(pi.x1 - pi.x2)}`)
  if (incl) ok('包含边是竖边', Math.abs(incl.x1 - incl.x2) <= 1, `\\Delta x=${Math.abs(incl.x1 - incl.x2)}`)
  if (phi) ok('\\varphi 是横边', Math.abs(phi.y1 - phi.y2) <= 1, `\\Delta y=${Math.abs(phi.y1 - phi.y2)}`)
  if (iso) ok('\\cong 是横边', Math.abs(iso.y1 - iso.y2) <= 1, `\\Delta y=${Math.abs(iso.y1 - iso.y2)}`)
}
ok('\\pi 是满射（双箭头）', /-surj\b/.test(byLabel['\\pi']?.end ?? ''), byLabel['\\pi']?.end)
// C_6 交换 \to 像必正规 \to `\trianglelefteq`；它仍是**单射**（尾钩），
// 只是"正规"这层信息由标签承担（U20 定的原则：正规的 `\trianglelefteq`、非正规的 `\hookrightarrow`）
ok('包含边是单射（起点尾钩）', /-hook\b/.test(byLabel['\\trianglelefteq']?.start ?? ''), byLabel['\\trianglelefteq']?.start)
ok(
  '\\cong 两端都是普通箭头（同构，与 ->> / -> 可分）',
  /-head\b/.test(byLabel['\\cong']?.end ?? '') && /-head\b/.test(byLabel['\\cong']?.start ?? ''),
  `${byLabel['\\cong']?.start} / ${byLabel['\\cong']?.end}`,
)
// 读**原始形态**：`|im \varphi|` 在 KaTeX 里排成 `∣imφ∣`，`last` 里拿不到源码串
ok('结论写「3 = |im \\varphi| = 3」', isoEnd.lastRaw.includes('3 = |im \\varphi| = 3'), isoEnd.lastRaw)

await page.screenshot({ path: '../../docs/assets/u-m3-first-iso-square.png' })
await exitProof()

/* ══ 6. 换成满射（靶群 C₃）\\to 三角形 ═════════════════════ */

await setGroup('C_6')
await setField(ISO, 0, 'C_3')
const isoC3 = await cardState(ISO)
ok('换靶群后像自动重算（C_6 -> C_3 只有一个满射）', /^a\\to|^a->/.test(isoC3.fields[1]), isoC3.fields[1])
ok('新组合可起跑', isoC3.canStart, JSON.stringify(isoC3))

await card(ISO).locator('.proof-start').click()
await page.waitForTimeout(700)
await goAll()
const tri = await canvas()
ok('满射时图上只有 3 个顶点（三角形，不补 im \\varphi）', tri.nodes.length === 3, tri.nodes.map((n) => n.id).join(','))
ok(
  '满射时没有包含边（三角形不补那条腰）',
  !tri.edges.some((e) => e.label === '\\hookrightarrow' || e.label === '\\trianglelefteq'),
  tri.edges.map((e) => e.label).join(','),
)
ok('满射时那一步在文本里说了「im \\varphi = H」', tri.allStepsRaw.some((t) => t.includes('im \\varphi = H')), tri.allStepsRaw.join(' | ').slice(0, 120))
ok(
  '满射时不多那一步（10 步 vs 非满射 11 步）',
  tri.steps === 10,
  `got=${tri.steps}`,
)
ok('结论仍是阶相等', /3 = \|im \\varphi\| = 3/.test(tri.lastRaw), tri.lastRaw)
await exitProof()

/* ══ 7. 收尾 ═══════════════════════════════════════════ */

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
