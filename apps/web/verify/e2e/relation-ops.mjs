/**
 * 走查：**子群像 f(H)** 与 **声明包含 H \\subseteq G**（U20）—— 用户的原始诉求。
 *
 * 投诉原话两条：
 *   "我想拉个箭头表示 A₄ 和 K 的包含关系，但做不到，没这个功能"
 *   "f(A₄) 怎么创建？直接拖到 f 上？没这个功能"
 *
 * 这里在真浏览器里把两条都做出来，并验几何层：
 *   - `FA = image(f, A)` 长出 `f(A) \\trianglelefteq S₃` 的顶点与边（`A_3 \\trianglelefteq S_3`，指数 2）
 *   - `R = A \\subseteq G` 长出**可点选**的关系边（A₄ \\trianglelefteq S₄ \\to 标签 `\\trianglelefteq`）
 *   - 点那条边 \\to 信息面板给出「关系」的账（指数 24/12 = 2）
 *   - D₄ \\subseteq S₄ 现在建得出来（U38 嵌入判定：指数 3、非正规 \\to 单射钩）
 *
 * U31 增补：`f(H)` 的**菜单入口**（从前只有拖拽 / 打字两条路，用户"找不到入口"）——
 *   ① 点箭头 f → 悬浮球「im」（U44 起：信息面板那行「可做」已砍，改走同一条 singleOps）→ 条上停在"可选 H"（有"不填，直接执行"）
 *      \\to 再点 A₄ = `image(f, A)`（命中已有的 FA）；
 *   ② ⊕ 球 \\to 像 f(H) \\to 先点箭头 f \\to 点"不填 H，直接执行" \\to 长出 `im f`（6 阶）。
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

/** `M x y L x y` \\to 端点（曲线返回 null）。 */
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
        label: g.dataset.label ?? '',
        d: path?.getAttribute('d') ?? '',
        end: path?.getAttribute('marker-end') ?? '',
        start: path?.getAttribute('marker-start') ?? '',
        hit: !!g.querySelector('.gedge-hit'),
      }
    })
    return { nodes, edges }
  })

/**
 * U45：信息面板默认**全收**，而「阶」「生成元」这些属性栏住在「基本」这一节里 ——
 * 读数前先保证它开着（**幂等**：已经开着就不要再点，手风琴里再点一下是收起）。
 */
const ensureBasic = async () => {
  await page.evaluate(() => {
    const h = document.querySelector('.info-sec-head[data-sec="basic"]')
    if (h && !h.classList.contains('on')) h.click()
  })
  await page.waitForTimeout(240)
}

const infoState = async () => {
  await ensureBasic()
  return page.evaluate(() => ({
    chip: document.querySelector('.info-target .chip')?.textContent?.trim() ?? '',
    head: document.querySelector('.info-target')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    keys: [...document.querySelectorAll('.insp-row .insp-k')].map((e) => e.textContent.trim()),
    vals: [...document.querySelectorAll('.insp-row .insp-v')].map((e) =>
      e.textContent.replace(/[\u200b\u2061\u2062]/g, '').replace(/\s+/g, ' ').trim(),
    ),
  }))
}

/* ══ 剧本 ═══════════════════════════════════════════════ */

await addLine('G', 'S_4')
await addLine('H', 'S_3')
await addLine('f', 'map(G, H, s12->23, c->13)')
await addLine('K', 'ker(f)')
await addLine('A', 'A_4')
await addLine('FA', 'image(f, A)')
await addLine('R', 'A \\subseteq G')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

const errs = await rowErrs()
ok('七行全部求值成功', errs.length === 0, JSON.stringify(errs))

/* ── 几何：子群像的顶点 + 那条正规包含边 + 一条可点选的关系边 ── */

const cs = await canvasState()
const at = Object.fromEntries(cs.nodes.map((n) => [n.id, n]))
ok('画布上有 f(A) 顶点', !!at.FA, `nodes=${cs.nodes.map((n) => n.id).join(',')}`)
ok('画布上没有「关系」顶点（关系是边不是点）', !at.R, `nodes=${cs.nodes.map((n) => n.id).join(',')}`)

const relEdge = cs.edges.find((e) => e.cls.includes('gedge-relation'))
ok('画布上有关系边', !!relEdge, cs.edges.map((e) => e.cls).join(' | '))
ok('关系边标签是 \\trianglelefteq（A_4 \\trianglelefteq S_4）', relEdge?.label === '\\trianglelefteq', relEdge?.label)
ok('关系边可点选（有 hit 层）', !!relEdge?.hit)
ok('关系边带单射尾钩', /-hook/.test(relEdge?.start ?? ''), relEdge?.start)

const incl = cs.edges.find((e) => e.cls.includes('gedge-map') && e.label === '\\trianglelefteq')
// `f(A_4) \cong C_3 \le S_3`，而 `A_3 \trianglelefteq S_3`（指数 2）\to 标签是 `\trianglelefteq`
ok('画布上有 f(A) -> S_3 的包含边', !!incl, cs.edges.map((e) => `${e.cls}:${e.label}`).join(' | '))

// 轴向（DIAGRAM_SPEC §1.1）：A 与 G 同层（都是输入）\\to 画成水平箭头
{
  const s = seg(relEdge?.d)
  ok('A \\subseteq G 画成水平箭头', !!s && Math.abs(s.y1 - s.y2) <= 1, s ? `\\Delta y=${Math.abs(s.y1 - s.y2)}` : 'not a segment')
  ok('两个端点同高（同层 y 相等）', !!at.A && !!at.G && Math.abs(at.A.cy - at.G.cy) <= 1, `${at.A?.cy} vs ${at.G?.cy}`)
  ok('两列分开（非退化）', !!at.A && !!at.G && Math.abs(at.A.cx - at.G.cx) > 10, `${at.A?.cx} vs ${at.G?.cx}`)
}

/* ── 点那条关系边 \\to 信息面板给出「关系」的账 ── */

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

/* ── 点 f(A) 顶点 \\to 是群，且是靶群里的子群 ── */

ok('点得中 f(A) 顶点', await clickSvg('g.gnode[data-id="FA"] .gnode-hit'))
await page.waitForTimeout(400)
const fi = await infoState()
ok('点 f(A) 看到的是群', fi.chip === '群', `${fi.chip} :: ${fi.head}`)
ok('阶是 3（手算：A_4 的像 \\cong C_3）', fi.vals.some((v) => v.includes('|G| = 3')), JSON.stringify(fi.vals))

/* ── U38：D₄ 的包含现在真建得出来（旧判据下这条曾被当成"假声明"）── */

await addLine('D', 'D_4')
// U38 第二关（嵌入判定）之后，`D_4 \\subseteq S_4` 是**真声明**（指数 3、非正规）——
// 从前"拦住"是判据太窄（只认元素 id 逐个对得上），不是数学错。
const submitted = await addLine('R2', 'D \\subseteq G')
ok('`D \\subseteq G`（D_4 是 S_4 的子群，指数 3）被输入层接受', submitted === true, `submitted=${submitted}`)
{
  const cs2 = await canvasState()
  const dr = cs2.edges.find(
    (e) => e.cls.includes('gedge-relation') && e.label === '\\hookrightarrow',
  )
  ok(
    '新边是 D 到 G 的单射钩（非正规，不是正规包含）',
    !!dr,
    cs2.edges.map((e) => `${e.cls}:${e.label}`).join(' | '),
  )
}
ok('对象表里没有求值失败的行', (await rowErrs()).length === 0)

/* ── 对照：搜过真没有的一对（Q_8 ⊄ S_4）仍被拦住 ── */

await addLine('Q8', 'Q_8')
const badSubmitted = await addLine('R3', 'Q8 \\subseteq G')
const st = await page.evaluate(() => document.querySelector('.composer-status')?.textContent ?? '')
ok('`Q_8 \\subseteq G`（S_4 里没有同构于 Q_8 的子群）被拦住', badSubmitted === false, `submitted=${badSubmitted}`)
ok('拦的理由是"不是子群"（已枚举全部子群）', st.includes('不是') && st.includes('子群'), st)

await page.screenshot({ path: '../../docs/assets/u20-subgroup-image.png' })

/* ══ U31：f(H) 的**菜单入口**（箭头旁 / ⊕ 球）——不再只能拖拽或打字 ═══════ */

const nodeIds = () =>
  page.evaluate(() => [...document.querySelectorAll('g.gnode')].map((g) => g.dataset.id))
const barText = () =>
  page.evaluate(() =>
    document.querySelector('.pending-bar')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  )
const mapHit = 'g.gedge-map[data-object-id="f"] .gedge-hit'

/* ── ① 悬浮球：点 f 这条箭头 → 球 → 「im」→ 条上停在"可选 H" ── */

await page.keyboard.press('Escape')
await page.waitForTimeout(260)
ok('点得中 f 这条箭头', await clickSvg(mapHit))
await page.waitForTimeout(420)
{
  /* U44 起映射的操作走**悬浮球**（信息面板那一行「可做」已砍）。
     映射的单对象操作 ≤3 条，球面直接把它们铺出来（`ringItems` 的规矩）——
     标签取 `op.call[0]`，`像` 这条的别名首项是 `im`。
     ⚠️ 选择器要 `:not(.orb-center)` —— `ComposerOrb` / `MultiOrb` 也渲染 `.orb`
     按钮（带 `.orb-center`），光用 `.orb` 会命中好几个。对象球的 `.orb` 没有那个类。 */
  ok('点箭头后球出来了', (await page.locator('.orb:not(.orb-center)').count()) === 1)
  await page.evaluate(() => document.querySelector('.orb:not(.orb-center)')?.click())
  await page.waitForTimeout(300)
  const found = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.orb-sat')].find((x) => x.textContent?.trim() === 'im')
    if (!b) return false
    b.click()
    return true
  })
  ok('球上有「im」这颗（映射的单对象操作铺开）', found)
  await page.waitForTimeout(340)
  const bar = await barText()
  ok(
    '进入 pending：说的是"可选 H"、并点明"不选就直接执行"',
    bar.includes('可选') && bar.includes('不选就直接执行'),
    bar,
  )
  const skip = await page.locator('.pending-bar .pending-btn.primary').textContent()
  ok('条上有「不填 H，直接执行」', (skip ?? '').includes('不填 H'), skip ?? '')
  await page.screenshot({ path: '../../docs/assets/u31-image-entry.png' })

  // 再点 A₄ = 把可选位 H 填上 → 组装出 `image(f, A)` → 命中已有的 FA（同一次推导只留一个对象）
  const before = await nodeIds()
  ok('点得中 A₄ 顶点', await clickSvg('g.gnode[data-id="A"] .gnode-hit'))
  await page.waitForTimeout(440)
  const after = await nodeIds()
  ok('选 H 后没有新节点（FA 已经是这个对象）', after.length === before.length, `${before.length} -> ${after.length}`)
  const notice = await page.evaluate(() =>
    document.querySelector('.notice')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  )
  ok(
    '提示说"FA 已经是这个对象"（证明组装出来的就是 image(f, A)）',
    notice.includes('FA') && notice.includes('已经是这个对象'),
    notice,
  )
}

/* ── ② ⊕ 球：image → 先点 f → "不填 H，直接执行" = im f（新顶点，6 阶） ── */

await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.click('.multi-orb .orb-center')
await page.waitForTimeout(300)
{
  const item = page.locator('.orb-center-panel .orb-op', { hasText: 'image' }).first()
  ok('⊕ 多对象菜单里有「image」（U54 前叫「像 f(H)」）', (await item.count()) > 0)
  await item.click()
  await page.waitForTimeout(320)
  const bar1 = await barText()
  ok('先要 f：「选择「f」（映射），第 1 / 2 个对象」', bar1.includes('第 1 / 2 个对象'), bar1)

  ok('挑选 f：点得中箭头', await clickSvg(mapHit))
  await page.waitForTimeout(360)
  const bar2 = await barText()
  ok('选满 f 后条上说"可选 H"', bar2.includes('可选'), bar2)

  const before = await nodeIds()
  await page.locator('.pending-bar .pending-btn.primary').click()
  await page.waitForTimeout(460)
  const fresh = (await nodeIds()).filter((x) => !before.includes(x))
  ok('跳过 H 直接执行：长出 im f 顶点', fresh.length === 1, `fresh=${JSON.stringify(fresh)}`)
  if (fresh.length === 1) {
    ok('点得中新顶点', await clickSvg(`g.gnode[data-id="${fresh[0]}"] .gnode-hit`))
    await page.waitForTimeout(420)
    const ii = await infoState()
    ok(
      'im f 的阶 = 6（S_4 ->> S_3 满射）',
      ii.vals.some((v) => v.includes('|G| = 6')),
      JSON.stringify(ii.vals),
    )
  }
}

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
