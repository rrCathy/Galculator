/**
 * 走查：**映射构建器**（`ui/MapBuilder`）—— USABILITY §7 最后一块零覆盖的面。
 *
 * ── 为什么现在补它 ────────────────────────────────────────────
 * 它是 U3 落地至今**唯一**没被任何走查碰过的编辑器（`USABILITY §7` 原话：
 * 「`ui/MapBuilder` ⏳ 仍未覆盖 —— 那条路目前只有手点」）。
 * 而 [PROPOSAL-zones.md](../../../docs/PROPOSAL-zones.md) 的 P0 第一步就是动它
 * （三个模态编辑器 → 常驻卡片）⇒ **零覆盖的组件不许先搬**。
 *
 * ── 这一套守的是什么 ──────────────────────────────────────────
 * 三件事，缺一不可：
 *   ① **入口通**（⊕ 球 → 映射 → 点源群 → 点靶群 → 编辑器打开）；
 *   ② **进去能用**（逐个生成元填像 → 边填边判 → 提交真长出对象）；
 *   ③ **填错能说清**（不是"提交后报错"，是**当场**指出哪两个元素的关系坏了）。
 *
 * ── 为什么不能只验 ①② ────────────────────────────────────────
 * 映射编辑器最容易坏在**中间态**：填了一半、填了个非同态、名字撞了。
 * 那三态都不产生对象，所以"进去能用"那条断言**照不到**它们 —— 必须单独钉。
 * （同款教训：U58 那次"入口通了 ≠ 进去能用"，与 `USABILITY §7` 第三条教训。）
 *
 * ── 期望值全部手算（而且是第一版就写错、被真跑打回来才改对的）──
 *
 * `C_6` 的元素 label 是 **0…5**（core 给的是 Z/6Z 的代表元，**不是** `a²` 那种循环形态），
 * 生成元 `a`（元素 id `e1`）。于是下拉里找 `a²` 是**找不到的** —— v1 的期望值栽在这。
 *
 * 循环群上 `a ↦ k` 的读数（手算 `gcd(k, 6)` = d ⇒ 核的阶 = d、像的阶 = 6/d）：
 *
 * | 像 | gcd | \|ker\| | \|im\| | 判定 | 类型 |
 * |---|---|---|---|---|---|
 * | `0`（单位元）| 6 | **6** | **1** | 平凡映射 | 一般（同态）|
 * | `1` | 1 | **1** | **6** | 恒等 ⇒ **同构** | 同构 |
 * | `2` | 2 | **2** | **3** | | 一般（**不是满射**：像的阶 3 ≠ 6）|
 * | `3` | 3 | **3** | **2** | | 一般 |
 * | `4` | 2 | **2** | **3** | | 一般 |
 * | `5` | 5 | **1** | **6** | `a ↦ a⁵` 也是同构 | 同构 |
 *
 * ⚠️ **`a ↦ 2` 不是满射** —— v1 我按「`gcd(2,6)=2` ⇒ 像是阶 3 的子群」推成"满射"，
 * 被真跑打回：满射要求**像满**（阶 6），这里阶 3 ⇒ 只是"一般同态"。同款教训见
 * §3「单射 / 满射 / 同构」那行判据。
 *
 * `C_6 → C_4` 那组（场景 3 用）**手算**：`a` 的阶 6、`b = 1` 的阶 4，`6 ∤ 4`
 * ⇒ `a ↦ 1` 要求 `b⁶ = e`，而 `b⁶ = b² ≠ e` ⇒ **延拓得出来但不是同态**，
 * 违反关系的见证是 `a · a⁵ = e`（左 `0`、右 `2`）。所以场景 3 挑 `1` 这个像。
 *
 * 跑法（先起 dev server 5273，**cwd 必须是 apps/web**）：`node verify/e2e/map-builder.mjs`
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(6000)
const logs = []
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

/* ── 辅助 ──────────────────────────────────────────────────── */

const addLine = async (name, expr) => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(240)
  }
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(260)
  await page.evaluate(() => {
    const b = document.querySelector('.composer-orb .composer-row button')
    if (b && !b.disabled) b.click()
  })
  await page.waitForTimeout(400)
}

const nodeIds = () =>
  page.evaluate(() => [...document.querySelectorAll('svg.canvas g.gnode')].map((g) => g.dataset.id))

/** 点画布节点（走命中圈 `.gnode-hit`，径向菜单那条入口要真点在它上面）。 */
const clickNode = async (id) => {
  const done = await page.evaluate((nid) => {
    const el = document.querySelector(`svg.canvas g.gnode[data-id="${nid}"] .gnode-hit`)
    if (!el) return false
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, id)
  await page.waitForTimeout(420)
  return done
}

/** 从「⊕ 多对象球」里点一个 op（按 `.orb-op-label` 匹配，label 是纯 ASCII 操作名）。 */
const pickMultiOp = async (label) =>
  page.evaluate((lb) => {
    const hit = [...document.querySelectorAll('.orb-center-panel .orb-op')].find(
      (b) => b.querySelector('.orb-op-label')?.textContent?.trim() === lb,
    )
    if (!hit) return false
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, label)

/** 编辑器的当前状态（一次读完，避免多次往返）。 */
const mb = () =>
  page.evaluate(() => {
    const root = document.querySelector('.map-builder')
    if (!root) return null
    const nameEl = root.querySelector('.mb-name')
    return {
      gens: [...root.querySelectorAll('.mb-row .mb-gen')].map((e) => e.textContent.trim()),
      selects: [...root.querySelectorAll('.mb-row select')].map((s) => ({
        options: s.options.length,
        options_text: [...s.options].map((o) => o.textContent.trim()),
        picked: s.selectedIndex >= 0 ? s.options[s.selectedIndex].textContent.trim() : '',
      })),
      checkClass: root.querySelector('.mb-check')?.className ?? '',
      checkText: root.querySelector('.mb-check')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      nameTag: nameEl?.tagName ?? null,
      nameValue: nameEl?.value ?? '',
      submitDisabled: root.querySelector('.mb-btn.primary')?.disabled ?? null,
      hasAutoBtn: !!root.querySelector('.mb-auto'),
    }
  })

/** 挑一个下拉选项（**按显示文本**，不按下标 —— 下标含那个空位，脆）。 */
const pickImage = async (text) => {
  const hit = await page.evaluate((t) => {
    const sel = document.querySelectorAll('.map-builder .mb-row select')[0]
    if (!sel) return false
    const i = [...sel.options].findIndex((o) => o.textContent.trim() === t)
    if (i < 0) return false
    sel.selectedIndex = i
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }, text)
  await page.waitForTimeout(400)
  return hit
}

const reset = async () => {
  await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
  await page.waitForTimeout(1300)
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* 无痕等场景拿不到，忽略 */
    }
  })
  await page.waitForTimeout(200)
}

/** 走完「⊕ 球 → map → 点两个群」，返回编辑器是否打开。 */
const openMapEditor = async (srcId, tgtId) => {
  await page.click('.multi-orb .orb-center')
  await page.waitForTimeout(420)
  const inMulti = await pickMultiOp('map')
  if (!inMulti) return { inMulti, opened: false }
  await page.waitForTimeout(420)
  await clickNode(srcId)
  await clickNode(tgtId)
  await page.waitForTimeout(500)
  return { inMulti, opened: (await page.locator('.map-builder').count()) > 0 }
}

/* ══ 场景 1：入口通（⊕ 球 → 映射 → 点两个群 → 编辑器打开）════════ */

console.log('\n== 场景 1：入口通 ==')
{
  await reset()
  await addLine('G', 'C_6')
  await addLine('H', 'C_6')
  ok('两个源群都在画布上', (await nodeIds()).length === 2, (await nodeIds()).join(' '))

  const { inMulti, opened } = await openMapEditor('G', 'H')
  ok('⊕ 球里列得出「映射」（map）', inMulti)
  ok('**编辑器打开了**（.map-builder 在场）', opened)
  ok('标题写明是映射', (await page.locator('.map-builder .chip-map').count()) > 0)

  const m = await mb()
  ok('列出了 C_6 的生成元（手算：只有 1 个 `a`，C_6 是循环群）', m?.gens.length === 1, JSON.stringify(m?.gens))
  ok('生成元那个下拉有 **7** 项 = 6 个元素 + 1 个「不填」空位', m?.selects[0]?.options === 7, `options=${m?.selects[0]?.options}`)
  ok(
    '选项是 `--`（不填）+ Z/6Z 的代表元 **0…5**（core 的元素 label，不是 `a²` 那种形态）',
    (m?.selects[0]?.options_text ?? []).join(',') === '--,0,1,2,3,4,5',
    JSON.stringify(m?.selects[0]?.options_text),
  )
  ok('还没填像时状态是 empty', /mb-check empty/.test(m?.checkClass ?? ''), m?.checkClass)
  ok('提交按钮禁用（没填完不许提交）', m?.submitDisabled === true, String(m?.submitDisabled))
  ok('名字框留空即可（留空走自动命名 φ）', (m?.nameValue ?? '') === '', JSON.stringify(m?.nameValue))
}

/* ══ 场景 1b：常驻卡片形态（P0-1）—— 位置与形态，不只是"编辑器在" ═ */

console.log('\n== 场景 1b：常驻卡片形态（P0-1）==')
{
  // 场景 1 结束时编辑器正开着，接着量它的位置
  const box = await page.evaluate(() => {
    const el = document.querySelector('.map-builder')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      vh: window.innerHeight,
      vw: window.innerWidth,
      boxShadow: getComputedStyle(el).boxShadow,
      appClass: document.querySelector('.app')?.className ?? '',
    }
  })
  ok('卡片在场', box !== null)
  // 判据：**贴底**（不是居中）—— 底边距视口底 < 40px
  ok('**贴底常驻**（底边距视口底 < 40px，P0-1 把它从居中弹层改成了贴底）',
    box !== null && box.vh - box.bottom < 40, `距底 ${box === null ? '?' : Math.round(box.vh - box.bottom)}px`)
  // 判据：**不再居中**（上边距应显著大于下边距）
  ok('**不在居中**（上边距 > 下边距，这是从 `top:46%` 改过来的）',
    box !== null && box.top > box.vh - box.bottom, `top=${box === null ? '?' : Math.round(box.top)} 距底=${box === null ? '?' : Math.round(box.vh - box.bottom)}`)
  // 判据：**没有投影**（投影是"浮在上层"的语言，常驻卡片不该有）
  ok('没有投影（常驻卡片的语言不是"浮在上层"）',
    box !== null && (box.boxShadow === 'none' || box.boxShadow === ''), box?.boxShadow)

  /*
   * **底部输入球让开了**（否则两者都在 `bottom: 12px` 居中 ⇒ 必然重叠）。
   *
   * ⚠️ 这条走的是 `ComposerOrb` 的 **`dockRight` prop**，不是 CSS：
   * `.composer-orb` 的 `left` 是**内联 style**（`max(50%, …)`，避开左下数值面板），
   * 内联样式压过任何样式表规则 ⇒ 我第一版写的 `.app.editor-open .composer-orb { left: auto }`
   * 浏览器里量出来仍是 `720px`（= 居中），**白查一轮**（还以为是 HMR 没生效，先重启了一次 dev server）。
   * **与内联样式共处只有一条路：改它自己。**
   */
  const orb = await page.evaluate(() => {
    const o = document.querySelector('.composer-orb')
    if (!o) return null
    const r = o.getBoundingClientRect()
    return { left: r.left, right: r.right, bottom: r.bottom, vw: window.innerWidth }
  })
  ok('底部输入球让到右侧去了（dockRight prop；不再与卡片同处居中）',
    orb !== null && orb.left > (box?.vw ?? 0) / 2, orb === null ? '' : `left=${Math.round(orb.left)} vw=${box?.vw}`)

  // **点画布空白不关编辑器**（常驻的核心承诺：用户还要点画布看别的对象）
  await page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
    svg?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(420)
  ok('**点画布空白不关编辑器**（填了一半不该被误触清掉 —— P0-1 特意保留这道）',
    (await page.locator('.map-builder').count()) > 0)

  // 右上角「×」仍然能关（常驻不等于关不掉）
  await page.click('.map-builder .mb-x')
  await page.waitForTimeout(420)
  ok('右上角「×」仍然关得掉（常驻 ≠ 不可关）', (await page.locator('.map-builder').count()) === 0)
  // 关掉后输入球要回到居中（dockRight 跟着退）
  const orbBack = await page.evaluate(() => {
    const o = document.querySelector('.composer-orb')
    if (!o) return null
    const r = o.getBoundingClientRect()
    return { left: r.left, vw: window.innerWidth }
  })
  ok('关掉后输入球回到居中（dockRight 跟着退）',
    orbBack !== null && Math.abs(orbBack.left - orbBack.vw / 2) < 40,
    orbBack === null ? '' : `left=${Math.round(orbBack.left)} vw=${orbBack.vw}`)
}

/* ══ 场景 2：进去能用（填像 → 边填边判 → 提交长出对象）══════════ */

console.log('\n== 场景 2：进去能用 ==')
{
  // 场景 1b 末尾把编辑器关掉了（点 ×）—— 这里重新开一次
  await openMapEditor('G', 'H')
  ok('编辑器重新打开（场景 1b 关过它）', (await page.locator('.map-builder').count()) > 0)
  const before = await nodeIds()
  // 手算：a ↦ 2 ⇒ gcd(2,6) = 2 ⇒ |ker| = 2、|im| = 3，判定是「一般同态」（**不是**满射）
  ok('选得到像 `2`', await pickImage('2'))

  const m2 = await mb()
  ok('填完状态变 ok', /mb-check ok/.test(m2?.checkClass ?? ''), `${m2?.checkClass} / ${m2?.checkText}`)
  ok('|ker| = 2（手算 gcd(2,6)=2）', m2?.checkText.includes('2'), m2?.checkText)
  ok('|im| = 3（手算 6/2 = 3）', m2?.checkText.includes('3'), m2?.checkText)
  ok(
    '判成「一般同态」而不是满射/单射（手算：像的阶 3 ≠ 6 ⇒ 不满；核的阶 2 ≠ 1 ⇒ 不单）',
    m2?.checkText.includes('同态') && !m2?.checkText.includes('满射') && !m2?.checkText.includes('单射'),
    m2?.checkText,
  )
  ok('提交按钮解禁', m2?.submitDisabled === false, String(m2?.submitDisabled))

  await page.click('.map-builder .mb-btn.primary')
  await page.waitForTimeout(700)
  const after = await nodeIds()
  /*
   * ⚠️ **映射本身不上画布** —— 它是 `sortOf = 'edge'`（DIAGRAM_SPEC §3）：
   * "能当映射的源或靶的才配当顶点"，而映射是**边**。所以提交后的可见形态是
   * ① 画布上一条 `G → H` 的箭头（点得中）②「操作」抽屉里多一行。
   * v1 我按"长出一个新节点"写断言，红了 —— 记忆里 `sortOf` 那条早写着这件事，
   * **写断言时没查**。
   */
  /*
   * ⚠️ **两处都要说清，v1 两条都写错了**：
   *   ① **映射自己不上画布**（`sortOf = 'edge'`，DIAGRAM_SPEC §3：能当源/靶的才配当顶点，
   *      而映射是边）⇒ 画布上多的是**一条箭头**，不是节点。
   *   ② 但 `autoFirstIso` **默认开着**（USABILITY ⑭：给出 φ 剩下两条自己长出来），
   *      所以提交后**确实**多出节点 —— 是 `ker φ` 与 `im φ` 两个（不是 φ 自己）。
   *      v1 我按"只多一个节点"写，红了；v2 按"一个都不多"写，也红了。
   */
  ok('提交后长出的是 ker 与 im 两个节点（autoFirstIso 默认开，USABILITY ⑭）',
    after.length === before.length + 2 && after.includes('\\phi/ker') && after.includes('\\phi/im'),
    `${before.join(' ')} -> ${after.join(' ')}`)
  ok('映射对象**自己不在画布上**（它是边 —— DIAGRAM_SPEC §3）',
    !after.includes('\\phi'), after.join(' '))
  const arrows = await page.evaluate(
    () => document.querySelectorAll('svg.canvas g.gedge, svg.canvas g.gnode[data-shape="edge"]').length,
  )
  ok('画布上多了一条映射边（点得中的那种）', arrows >= 1, `edges=${arrows}`)

  // 展开抽屉找那一行 —— 副行就该写着 |ker| / |im|（手算 2 / 3）
  await page.evaluate(() => {
    for (const label of ['对象', '操作']) {
      const t = [...document.querySelectorAll('.dock-topleft .dock-toggle')].find((b) =>
        b.textContent.includes(label),
      )
      if (t && !t.closest('.dock').className.includes('open')) t.click()
    }
  })
  await page.waitForTimeout(460)
  const rowText = await page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
  )
  const mapRow = rowText.find((t) => t.includes('map(') || t.includes('→'))
  ok('「操作」抽屉里多出映射那一行', mapRow !== undefined, JSON.stringify(rowText.slice(-2)))
  // ⚠️ 对象行**只有一行 `名字 = 定义`**（INTERACTION §5 v3.1：类型/标签/副行全搬进信息面板）
  // ⇒ 这里**不该**断言副行有 |ker|/|im|。v1 写了这条，红了 —— 那是规范定死的形态。
  ok('那一行就是「名字 = 定义」一行（副行按 v3.1 已搬进信息面板）',
    mapRow !== undefined && /=\s*map\(G,\s*H,\s*a→2\)/.test(mapRow),
    mapRow)

  // 点那条箭头（映射是一等对象，点得中）→ 信息面板
  const arrowHit = await page.evaluate(() => {
    const g = [...document.querySelectorAll('svg.canvas g.gnode')].find((n) => /phi|\\\\phi/.test(n.dataset.label ?? ''))
    if (!g) return false
    const hit = g.querySelector('.gnode-hit')
    if (!hit) return false
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  ok('点得到那条映射边（映射是一等对象）', arrowHit)
  await page.waitForTimeout(460)
  const info = await page.evaluate(() => ({
    open: document.querySelectorAll('.insights').length > 0,
    text: document.querySelector('.insights')?.textContent?.replace(/\s+/g, ' ') ?? '',
  }))
  ok('点开它：信息面板打开了', info.open, info.text.slice(0, 80))
  // ⚠️ 点箭头选中的是**映射对象**，而它的信息面板头条是「第一同构定理」那条
  // （`C_6/N ≅ C_3`，|C_3| = 3）—— 那个 3 是 **im φ 的阶**，与手算一致。
  // 核的阶 2 在 `ker φ` 那个**节点**上（点它自己看）。
  ok('面板头条是第一同构定理（C_6/N ≅ im φ，手算 |im| = 3）',
    /cong|≅/.test(info.text) && /3/.test(info.text), info.text.slice(0, 120))
  /*
   * ⚠️ `\\phi/ker` 那个节点**不是核本身** —— 它是 `C_6 / ker φ`（第一同构定理的**左端**）
   * ⇒ 它的阶是 **3**。v1/v2/v3 三次都栽在这：把 `\\phi/ker` 当成 `ker φ` 了。
   * **核的阶 2** 在**映射箭头**上（映射对象的元素表逐元素列 `|ker|`），不在结论区。
   * ⇒ 判据改成**商群那条**（阶 3）+ 核那条（阶 2）分别验，各验各的。
   */
  const kerId = after.find((n) => /ker/.test(n))
  ok('画布上找得到 \\phi/ker 节点', kerId !== undefined, after.join(' '))
  if (kerId) {
    await clickNode(kerId)
    await page.waitForTimeout(460)
    const kinfo = await page.evaluate(
      () => document.querySelector('.insights')?.textContent?.replace(/\s+/g, ' ') ?? '',
    )
    ok('它是**商** C_6/ker φ，阶 3（第一同构定理左端，手算 6/2 = 3）',
      /3/.test(kinfo), kinfo.slice(0, 120))
  }
  // 核的阶 2：点 im 那侧的元素表（`im φ` 是 C_3，阶 3；核的信息在映射对象上）——
  // 这条走语义层更稳（`suites/interaction.ts` 已钉 `|ker|`），这里只钉**画布上看得见**：
  const imId = after.find((n) => /im/.test(n))
  ok('画布上找得到 \\phi/im 节点（im φ，阶 3）', imId !== undefined, after.join(' '))
  if (imId) {
    await clickNode(imId)
    await page.waitForTimeout(460)
    const iinfo = await page.evaluate(
      () => document.querySelector('.insights')?.textContent?.replace(/\s+/g, ' ') ?? '',
    )
    ok('它是 im φ = C_3，阶 3（手算 6/2 = 3）', /3/.test(iinfo), iinfo.slice(0, 120))
  }
}

/* ══ 场景 3：填错能说清（当场，不是"提交后报错"）════════════════ */

console.log('\n== 场景 3：中间态与错误提示 ==')
{
  await reset()
  await addLine('G', 'C_6')
  await addLine('H', 'C_4')
  const { opened } = await openMapEditor('G', 'H')
  ok('C_6 → C_4 的编辑器也开得起来', opened)

  const m3 = await mb()
  ok('一个都没填：状态是 empty、提交禁用', /mb-check empty/.test(m3?.checkClass ?? '') && m3?.submitDisabled === true, `${m3?.checkClass} / ${m3?.submitDisabled}`)
  ok('C_4 的下拉有 5 项 = 4 个元素 + 空位', m3?.selects[0]?.options === 5, `options=${m3?.selects[0]?.options}`)

  // 手算：a 的阶 6、b=1 的阶 4，6 ∤ 4 ⇒ a ↦ 1 要求 b^6 = e 而 b^6 = b^2 ≠ e
  // ⇒ **延拓得出来但不是同态**，见证是 a · a^5 = e（左 0、右 2）
  ok('选得到像 `1`（那个不是同态的）', await pickImage('1'))
  const m4 = await mb()
  ok('填了非同态的像：状态是 bad', /mb-check bad/.test(m4?.checkClass ?? ''), `${m4?.checkClass} / ${m4?.checkText}`)
  ok('**提交按钮仍禁用**（不给提交错的机会）', m4?.submitDisabled === true, String(m4?.submitDisabled))
  ok(
    '状态行**当场**指出坏在哪两个元素上（不是空话）',
    /f\(|!=|违反|延拓|关系/.test(m4?.checkText ?? ''),
    m4?.checkText,
  )
  ok('状态行不泄漏 LaTeX（纯文本面）', !(m4?.checkText ?? '').includes('\\'), m4?.checkText)
  ok('全程零 console 错误', logs.length === 0, logs.slice(0, 2).join(' | '))
}

/* ══ 场景 4：自动填充（core 猜一个同态）══════════════════════ */

console.log('\n== 场景 4：自动填充 ==')
{
  await reset()
  await addLine('G', 'C_6')
  await addLine('H', 'C_6')
  await openMapEditor('G', 'H')

  ok('有「自动填充」按钮', (await mb())?.hasAutoBtn === true)
  await page.click('.map-builder .mb-auto')
  await page.waitForTimeout(560)
  const m5 = await mb()
  ok('点完自动填充：状态是 ok（core 猜的那个必然是同态）', /mb-check ok/.test(m5?.checkClass ?? ''), `${m5?.checkClass} / ${m5?.checkText}`)
  ok('自动填充后提交解禁', m5?.submitDisabled === false, String(m5?.submitDisabled))
  // C_6 → C_6 上 core 认出的是恒等（或某个自同构）⇒ 判成「同构」
  ok('C_6 → C_6 的自动填充判成同构（手算：恒等是这里最自然的那个）', m5?.checkText.includes('同构'), m5?.checkText)
}

console.log(`\n${pass} PASS / ${fail} FAIL`)
if (logs.length) {
  console.log('\n浏览器控制台有报错：')
  for (const l of logs.slice(0, 5)) console.log('  ' + l)
}
await browser.close()
process.exit(fail === 0 && logs.length === 0 ? 0 : 1)
