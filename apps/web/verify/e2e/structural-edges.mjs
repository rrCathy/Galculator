/**
 * 走查：**结构伴生边可点**（缺口 ⑧）—— 画布上 π / π_1 / ↪ / ⊴ / = / ≅ 的账。
 *
 * 缺口原话（docs/USABILITY.md §6 第 ⑧ 条）：
 *   "想点 π 看商映射的信息 → 点不动（它们不是一等对象）"
 *
 * 从前这些线是画布上唯一点不动的东西：一眼看去全是箭头，有的点得开
 * （映射 / 声明的关系），有的石沉大海（伴生箭头）。而**默认示范页面上
 * 就有两条**——`O = Ω` 与 `N ↪ G`——一进页面就撞。
 *
 * 这一套钉住它，也钉住三条边界：
 *   ① 能点、能看账（类型 / 两端 / 指数 / 核 / 正规性）
 *   ② **不挂悬浮球**（不是对象 → 没有 ker / im 可点；U21 纪律：菜单不撒谎）
 *   ③ 在图里的分量不变（仍是蓝灰细线，不抢用户画的主角）
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/structural-edges.mjs`
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

/** `.gedge-hit` 是 transparent，Playwright 判 "not visible" -> 派发事件（React 18 监听在根容器） */
const clickSvg = (selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return true
  }, selector)

/** 画布上的边（只取走查要的字段）。 */
const edgesState = () =>
  page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
    if (!svg) return []
    return [...svg.querySelectorAll('g.gedge')].map((g) => {
      const path = g.querySelector('path:not(.gedge-hit)')
      return {
        structural: g.dataset.structural ?? '',
        label: g.dataset.label ?? '',
        hit: !!g.querySelector('.gedge-hit'),
        stroke: path?.getAttribute('stroke') ?? '',
      }
    })
  })

const infoState = () =>
  page.evaluate(() => ({
    chip: document.querySelector('.info-target .chip')?.textContent?.trim() ?? '',
    pair: document.querySelector('.edge-target')?.getAttribute('data-pair') ?? '',
    kind: document.querySelector('.edge-target')?.getAttribute('data-edge-kind') ?? '',
    doc: document.querySelector('.edge-doc')?.textContent?.trim() ?? '',
    keys: [...document.querySelectorAll('.edge-facts .insp-k')].map((e) => e.textContent.trim()),
    vals: [...document.querySelectorAll('.edge-facts .insp-v')].map((e) =>
      e.textContent.replace(/[\u200b\u2061\u2062]/g, '').replace(/\s+/g, '').trim(),
    ),
    note: document.querySelector('.rel-note')?.textContent?.trim() ?? '',
  }))

const orbCount = () => page.evaluate(() => document.querySelectorAll('.orb:not(.orb-center)').length)

const { chromium } = await import(PW)
const browser = await chromium.launch({ args: ['--no-proxy-server'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// 走查不该有超过 8s 的单步等待——卡住就让它**响亮地**失败，而不是吊到总超时
page.setDefaultTimeout(8000)
const logs = []
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

/* ══ A. 默认示范页面（Sylow III 的故事）：一进页面就是那两条 ═══════════ */

console.error('[step] goto /')
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForSelector('svg.canvas', { timeout: 20000 })
console.error('[step] canvas up')
await page.waitForTimeout(900)

{
  const es = await edgesState()
  const str = es.filter((e) => e.structural)
  ok('默认页面有两条结构伴生边', str.length === 2, JSON.stringify(es.map((e) => `${e.label}:${e.structural}`)))
  const eq1 = str.find((e) => e.structural === 'equality')
  const incl = str.find((e) => e.structural === 'inclusion')
  ok('一条是 =（轨道吃下整个 Omega，即传递）', !!eq1 && eq1.label === '=', JSON.stringify(str.map((e) => `${e.label}:${e.structural}`)))
  ok('一条是 ↪（稳定子挂到 G）', !!incl && incl.label === '\\hookrightarrow', JSON.stringify(str.map((e) => `${e.label}:${e.structural}`)))
  ok('两条都有命中层（可点）', str.every((e) => e.hit))
  // 视觉身份不变：伴生边仍是蓝灰细线（ALONGSIDE_EDGE #4A6FA5），不是用户画的主角（#2C2C2A）
  ok('伴生边仍是蓝灰（不抢用户画的主角）', str.every((e) => e.stroke === '#4A6FA5'), JSON.stringify(str.map((e) => e.stroke)))
}

/* ── 点 N ↪ G：面板给出类型 / 两端 / 指数 / 正规性 ── */

console.error('[step] click inclusion')
ok('点得中那条 ↪', await clickSvg('g.gedge[data-structural="inclusion"] .gedge-hit'))
await page.waitForTimeout(420)
{
  const inf = await infoState()
  ok('面板顶部是「结构箭头」', inf.chip === '结构箭头', `${inf.chip} :: ${inf.pair}`)
  // 默认示范里 N 的画布**记号**是 `Stab_A(1)`（不是对象名 N）—— 两端与画布同源
  ok('两端与记号同源（Stab_A(1)|\\hookrightarrow|S_4）', inf.pair === 'Stab_A(1)|\\hookrightarrow|S_4', inf.pair)
  ok('一句话里有点击的意义（不是空文案）', inf.doc.length > 6, inf.doc)
  ok('账里有「指数」', inf.keys.includes('指数'), inf.keys.join(','))
  // |Stab| = |G| / |Orb| = 24 / 4 = 6 -> [S_4 : N] = 24 / 6 = 4（手算）
  ok('指数写着 24 / 6 = 4（手算：轨道-稳定子）', inf.vals.some((v) => v.includes('24/6=4')), JSON.stringify(inf.vals))
  // N_G(H) 有 4 个共轭 -> 不正规
  ok('账里明说非正规', inf.vals.some((v) => v.includes('非正规')), JSON.stringify(inf.vals))
  ok('面板底部有边界提示（它不是一等对象）', inf.note.includes('不是一等对象'), inf.note.slice(0, 60))
}
ok('点伴生边**不**挂悬浮球（菜单不撒谎）', (await orbCount()) === 0, `orbs=${await orbCount()}`)

/* ── 点 = 那条：传递的账 ── */

ok('点得中那条 =', await clickSvg('g.gedge[data-structural="equality"] .gedge-hit'))
await page.waitForTimeout(420)
{
  const inf = await infoState()
  ok('它的身份是 equality', inf.kind === 'equality', `${inf.kind} :: ${inf.pair}`)
  ok('一句话点名「传递」', inf.doc.includes('传递'), inf.doc)
  // |Orb| = 4 且 |Omega| = 4（手算 n_3 = 4）。KaTeX 渲染后 `\Omega` 成了字符 Ω，
  // 所以这里数"写 =4 的账"有两条（轨道的与点集的），不去比对渲染后的字形
  ok('账里轨道与 Omega 都写着 4（手算 n_3 = 4）', inf.vals.filter((v) => v.includes('=4')).length >= 2, JSON.stringify(inf.vals))
}
// 空白处收掉选中（信息面板回到空态）
await page.evaluate(() => document.querySelector('svg.canvas')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
await page.waitForTimeout(300)
ok('Esc 语义的空白点击后回到空态', (await page.evaluate(() => document.querySelector('.info-target')?.textContent ?? '')).length === 0)

/* ══ B. 空画布：商群的 π 与第一同构的 ≅ ═══════════════════════ */

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(900)

const addLine = async (line) => {
  await page.click('.composer-orb .orb')
  await page.waitForTimeout(220)
  await page.fill('.composer-expr', line)
  await page.press('.composer-expr', 'Enter')
  await page.waitForTimeout(320)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}

// 剧本注意（U17 的设计）：**不要**手建 `K = ker(f)` —— 手建后 firstIso 的整条
// 故事线（f/ker 顶点 + π + ≅）交还用户，`≅` 就不补了。这里让 f 自动补全，
// 商群用 `A_4` 当参数（与 f 的 ker 无关，两条 π 各去各的靶）。
for (const line of ['G = S_4', 'H = S_3', 'f = 映射(G, H, s12->23, c->13)', 'N = A_4', 'Q = 商(G, N)']) {
  await addLine(line)
}
await page.waitForTimeout(400)

{
  const es = await edgesState()
  const pis = es.filter((e) => e.structural === 'naturalProjection')
  ok('两条 π（一条去 f/ker、一条去 Q）', pis.length === 2, JSON.stringify(es.map((e) => `${e.label}:${e.structural}`)))
  ok('N ⊴ S_4 画成正规（商群的前提）', es.some((e) => e.label === '\\trianglelefteq' && e.structural === 'inclusion'), JSON.stringify(es.map((e) => `${e.label}:${e.structural}`)))
  const iso = es.find((e) => e.structural === 'isomorphism')
  ok('第一同构补出 ≅', !!iso, JSON.stringify(es.map((e) => `${e.label}:${e.structural}`)))
}

/* ── 点 π：商掉的是 f 的核（按边的 id 精确点到 f/ker 那条）── */

console.error('[step] click pi(f/ker)')
ok('点得中 π（去 f/ker 那条）', await clickSvg('.gedge[data-edge-id="G->f/ker:pi"] .gedge-hit'))
await page.waitForTimeout(420)
{
  const inf = await infoState()
  ok('面板顶部是「结构箭头」（naturalProjection）', inf.chip === '结构箭头' && inf.kind === 'naturalProjection', `${inf.chip} :: ${inf.kind}`)
  // KaTeX 渲染后 `\ker \pi = \ker f` 的 textContent 是 `kerπ=kerf`（math mode 吃空格，
  // 且 `\ker` 是 operator）—— 断言按渲染后的形态比
  ok('核写着 ker f（引用名，与那条边的标签同源）', inf.vals.some((v) => v.includes('kerπ=kerf')), JSON.stringify(inf.vals))
  // |S_4| / |V_4| = 24 / 4 = 6
  ok('阶写着 24 / 4 = 6（手算 |ker| = 4）', inf.vals.some((v) => v.includes('24/4=6')), JSON.stringify(inf.vals))
}
ok('点 π 同样不挂悬浮球', (await orbCount()) === 0, `orbs=${await orbCount()}`)

/* ── 点 ≅：第一同构定理的结论 ── */

ok('点得中 ≅', await clickSvg('.gedge[data-structural="isomorphism"] .gedge-hit'))
await page.waitForTimeout(420)
{
  const inf = await infoState()
  ok('它的身份是 isomorphism', inf.kind === 'isomorphism', inf.kind)
  // S_4/V_4 \cong S_3：两边都是 6 阶
  ok('两边同阶 6 = 6（手算：S_4/V_4 \cong S_3）', inf.vals.some((v) => v.includes('=6=')), JSON.stringify(inf.vals))
}

/* ── 回归：显式映射那一支没被碰坏（还能点、还有球）── */

ok('点得中显式映射 f', await clickSvg('.gedge[data-object-id="f"] .gedge-hit'))
await page.waitForTimeout(420)
{
  const chip = await page.evaluate(() => document.querySelector('.info-target .chip')?.textContent?.trim() ?? '')
  ok('点 f 看到的仍是映射对象', chip === '映射', chip)
}
ok('显式映射有悬浮球（对象待遇没变）', (await orbCount()) === 1, `orbs=${await orbCount()}`)

await page.screenshot({ path: '../../docs/assets/u26-structural-edges.png' })

await browser.close()

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
process.exitCode = fail > 0 ? 1 : 0
