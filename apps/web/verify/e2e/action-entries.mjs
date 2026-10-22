/**
 * 走查：**造群作用的入口**（U57）—— 真浏览器、真指针。
 *
 * 用户原话（2026-10-03）：「然后呢？我创建了群和点集，然后怎么创建群作用？
 * **到底在做什么……**」
 *
 * 侦察（`.tmp-act/` 五轮探针）证明：能造，但入口只有**群节点那颗球**一条。
 * 而用户手上正好有「群 + 点集」时，最自然的手势是画布上方那颗 **⊕ 球**
 * （"把两样凑一起"）—— 它偏偏没有 `customAction`（同族的 `conjOn` / `cosetAction`
 * 都在），点集那头也没有任何线索。这一套钉的就是补上的那两条路。
 *
 * 六节：
 *   ① ⊕ 球列得出 `customAction`（且排在 `conjOn` / `cosetAction` 之后 —— 注册表序）
 *   ② 从 ⊕ 球点它 → 空着手进 pending 要一个群 → 点群 → 编辑器弹出
 *   ③ 点集节点的环上有「被作用」⇒ 点它 → 提示 + pending
 *   ④ 点群 → 编辑器弹出来，**Ω 那一格已经是那个集合**（这是"从哪头进都不丢你指的东西"）
 *   ⑤ 填生成元的像 → 提交 → 画出 `G ↷ Omega`，零报错
 *   ⑥ Shift 拖 G 到集合上：只剩一条候选 ⇒ **直接执行** `customAction`（不弹菜单）
 *
 * 外加一条纪律：新写的文案全是纯文本面（判据与 `e2e/no-unicode-leak.mjs` 逐字相同）。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/action-entries.mjs`
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
const logs = []
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
// "不卡死"写成时间断言（U47 立的）
page.setDefaultTimeout(4000)

/* ── 纯文本面判据（与 e2e/no-unicode-leak.mjs 逐字相同）───────── */

const ALLOWED = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const badChars = (s) => [...new Set([...String(s ?? '')].filter((c) => !ALLOWED.test(c)))]

/* ── 场地 ─────────────────────────────────────────────── */

const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
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
    console.log(`    [blocked] ${name} = ${expr}`)
    return false
  }
  await btn.click()
  await page.waitForTimeout(420)
  return true
}

/** 画布上的节点（带**屏幕坐标**，供真指针用）。 */
const canvasNodes = () =>
  page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
    if (!svg) return []
    return [...svg.querySelectorAll('g.gnode')].map((g) => {
      const r = g.querySelector('.gnode-hit').getBoundingClientRect()
      return { id: g.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
  })

const edges = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('svg.canvas g.gedge')].map((g) => ({
      objectId: g.dataset.objectId ?? '',
      label: g.dataset.label ?? '',
    })),
  )

const errRows = () =>
  page.evaluate(() => [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()))

/** 画布上的节点/边是 SVG（命中层 transparent）—— 派发事件，别指望可见性判定。 */
const clickSvg = async (sel) => {
  const done = await page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return false
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, sel)
  await page.waitForTimeout(420)
  return done
}

const clickEl = async (sel) => {
  if ((await page.locator(sel).count()) === 0) return false
  await page.click(sel, { timeout: 6000 })
  await page.waitForTimeout(340)
  return true
}

/**
 * 台收着才能和画布说话（2026-10-08：**点节点会自动升起工作台** —— 升起的台会盖住
 * 球/环，真实鼠标点不动它们；走查里凡"点节点 -> 点球/拖拽"的链都要先收台）。
 */
const benchDown = async () => {
  if ((await page.locator('.bench.open').count()) > 0) {
    await page.click('.bench-toggle')
    await page.waitForTimeout(320)
  }
}

/** 选中画布节点 -> 点球 -> 铺开环。`orb-sat` 是球的**兄弟**节点，别写成 `.orb .orb-sat`。 */
const openRing = async (id) => {
  await benchDown()
  await clickSvg(`svg.canvas g.gnode[data-id="${id}"] .gnode-hit`)
  // 点节点（哪怕是合成事件）也会触发「自动升起工作台」—— 收掉，球才点得到
  await benchDown()
  await clickEl('.orb:not(.orb-center)')
}

const ringItems = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.orb-sat')].map((b) => ({
      opId: b.dataset.op ?? '',
      label: b.textContent.trim(),
      title: b.getAttribute('title') ?? '',
    })),
  )

const clickSat = (label) =>
  page.evaluate((want) => {
    const b = [...document.querySelectorAll('.orb-sat')].find((x) => x.textContent.trim() === want)
    if (!b) return false
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, label)

/** ⊕ 球（多对象操作）：打开 / 读条目 / 点一条。 */
const centerLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.orb-center-panel .orb-op-label')].map((e) => e.textContent.trim()),
  )

/** ⊕ 球的候选 op id（`data-op`）—— 找按钮/比集合一律按 id，不按显示文本。 */
const centerOpIds = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.orb-center-panel .orb-op')].map((e) => e.dataset.op),
  )

// 按 data-op 找，不按显示文本（显示名 2026-10-06 起是中文，会随文案漂移）。
const clickCenterOp = (opId) =>
  page.evaluate((want) => {
    const b = [...document.querySelectorAll('.orb-center-panel .orb-op')].find(
      (x) => x.dataset.op === want,
    )
    if (!b) return false
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, opId)

/** 编辑器的读数：Ω 那一格 + 高亮的那颗 chip + 生成元行数。 */
const editorState = () =>
  page.evaluate(() => ({
    open: document.querySelectorAll('.action-builder').length,
    omega: document.querySelector('.action-builder .ab-n input')?.value ?? null,
    onChip: [...document.querySelectorAll('.action-builder .ab-set-chip.on')].map((b) => b.textContent.trim()),
    rows: document.querySelectorAll('.action-builder .mb-row input.cycle-input').length,
  }))

const setCycles = async (vals) => {
  await page.evaluate((list) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const els = [...document.querySelectorAll('.action-builder .mb-row input.cycle-input')]
    list.forEach((v, i) => {
      if (!els[i]) return
      setter.call(els[i], v)
      els[i].dispatchEvent(new Event('input', { bubbles: true }))
    })
  }, vals)
  await page.waitForTimeout(420)
}

/** 真指针拖一次（Shift = 连线，不必先开底栏开关）。分段移动：手势里有 4px 阈值。 */
const dragPointer = async (a, b) => {
  await page.keyboard.down('Shift')
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 })
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.waitForTimeout(90)
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await page.waitForTimeout(420)
}

/**
 * 纯文本面扫描。只扫**明确是纯文本**的那些节点
 * （KaTeX 渲染的串会带零宽字符，别混进来）。
 */
const PLAIN_SELECTORS = [
  '.notice',
  '.orb-sat',
  '.orb-center-panel .orb-op',
  '.orb-center-panel .orb-op code',
  '.orb-center-panel .orb-op-doc',
  '.orb-center-panel [title]',
  '.orb-ops-panel:not(.orb-center-panel) .orb-op',
  '.orb-ops-panel:not(.orb-center-panel) .orb-op code',
  '.orb-ops-panel:not(.orb-center-panel) .orb-op-doc',
  '.orb-ops-panel:not(.orb-center-panel) [title]',
  '.connect-menu .connect-item',
  '.connect-menu .connect-item code',
  '.composer-status',
  '.action-builder .mb-hint',
  '.action-builder .mb-check',
  '.action-builder .mb-btn',
  '.action-builder .ab-set-chip',
  '.action-builder [title]',
]

const scanPlain = async (stage) => {
  const rows = await page.evaluate((sels) => {
    const out = []
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t) out.push({ t, where: el.className || el.tagName })
        const v = el.getAttribute('title')
        if (v?.trim()) out.push({ t: v, where: 'title' })
      }
    }
    return out
  }, PLAIN_SELECTORS)
  const bad = rows.filter((r) => badChars(r.t).length > 0)
  ok(
    `${stage}：没有键盘打不出的字符`,
    bad.length === 0,
    bad.map((b) => `${badChars(b.t).join('')} @ ${b.where}: ${b.t.slice(0, 60)}`).join(' | '),
  )
}

/* ══════════════════════════════════════════════════════════
 * 场地：G = D_4（8 阶、两个生成元 r/s），Ω = pointSet(5)
 * ══════════════════════════════════════════════════════════ */

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1300)

ok('建 `G = D_4`', await addLine('G', 'D_4'))
ok('建 `P = pointSet(5)`（5 个抽象点，不属于任何群）', await addLine('P', 'pointSet(5)'))
await page.keyboard.press('Escape')
await page.waitForTimeout(420)
ok('两条前置都求值成功', (await errRows()).length === 0, JSON.stringify(await errRows()))

/* ══════════════════════════════════════════════════════════
 * ① ⊕ 球列得出 customAction
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ① ⊕ 球（"把两样凑一起"）：U57 前它 15 条里偏偏没有 customAction ==')
await clickEl('.multi-orb .orb-center')
{
  const labels = await centerLabels()
  const ids = await centerOpIds()
  ok('⊕ 球列得出 16 条（U57 前是 15）', ids.length === 16, `${ids.length}: ${ids.join(' | ')}`)
  // 翻账（W1，2026-10-06）：显示名改中文，断言改按 data-op。
  ok('**含「自定义作用」**（这就是用户找不到的那条）', ids.includes('customAction'), ids.join(' | '))
  ok(
    '  排在「集合上的共轭」/「陪集作用」之后（注册表序，没被特殊插队）',
    ids.indexOf('customAction') > ids.indexOf('cosetAction'),
    ids.join(' | '),
  )
  // 翻账（W1，2026-10-06）：显示名改中文，断言改按 data-op。
  ok('  同族的两个内置作用照旧都在', ids.includes('conjugationOnSet') && ids.includes('cosetAction'), ids.join(' | '))
  ok('菜单里没有键盘打不出的字符', labels.every((l) => badChars(l).length === 0), badChars(labels.join('')).join(''))
  await page.screenshot({ path: '../../docs/assets/u57-multiorb.png' })
}

/* ══════════════════════════════════════════════════════════
 * ② 从 ⊕ 球点它 -> pending 要一个群 -> 点群 -> 编辑器
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ② 从 ⊕ 球点 `customAction` -> 空着手 pending，等你去点一个群 ==')
{
  ok('点得中「自定义作用」', await clickCenterOp('customAction'))
  await page.waitForTimeout(320)

  const pend = await page.evaluate(() => ({
    what: document.querySelector('.pending-what')?.textContent?.trim() ?? '',
    // `.pending-what` 的文本 2026-10-06 起是中文名，ASCII 记法进了 title。
    whatTitle: document.querySelector('.pending-what')?.getAttribute('title')?.trim() ?? '',
    hint: document.querySelector('.pending-hint')?.textContent?.trim() ?? '',
  }))
  // 翻账（W1，2026-10-06）：文本改中文，按 title 里的 ASCII 记法判。
  ok('提示条要的就是第一参 G', pend.whatTitle.includes('customAction'), JSON.stringify(pend))
  /*
   * U58 翻案：这条从前写的是「且没说"两个对象"（它只要一个群）」。
   * U58 起它**真的要两个** —— 第二位 Ω 也能在画布上点（提示条写「第 1 / 2 个对象」，
   * 而 Ω 那一格是"可选：不选就进编辑器填"）。详见 `e2e/action-omega.mjs`。
   */
  ok('  第 1 / 2 个对象（U58 翻案：Ω 也是一格）', pend.hint.includes('第 1 / 2'), JSON.stringify(pend))

  ok('点得中群节点 G', await clickSvg('svg.canvas g.gnode[data-id="G"] .gnode-hit'))
  // U58：点完 G 还停在 pending 等 Ω（可选）—— 回车 = 不选 Ω，直接进编辑器
  const mid = await page.evaluate(() => document.querySelector('.pending-hint')?.textContent?.trim() ?? '')
  ok('  停在 pending 等 Ω，措辞是"可选"', mid.includes('可选'), mid)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(520)
  const e = await editorState()
  ok('回车 → 编辑器弹出来了（不是补参条 / 不是 pending）', e.open === 1, JSON.stringify(e))
  ok('  生成元两行（D_4 是 r / s 两个生成元）', e.rows === 2, JSON.stringify(e))
  // 走这条路时用户没指过 Ω ⇒ 回落到老初值（|D_4| = 8 ≤ 12 ⇒ 取 |G|）
  ok('  Ω 回落到 `|G|` = 8（用户没指过 Ω）', e.omega === '8', JSON.stringify(e))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(320)
  /* 2026-10-08：编辑器开着时工作台是升起的（卡片嵌在右列）—— 收台才能继续点画布 */
  if ((await page.locator('.bench.open').count()) > 0) {
    await page.click('.bench-toggle')
    await page.waitForTimeout(300)
  }
}

/* ══════════════════════════════════════════════════════════
 * ③ 点集节点：环上有「被作用」
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ③ 点「点集」节点：环上给出「被作用」 ==')
await openRing('P')
{
  const items = await ringItems()
  const labels = items.map((i) => i.label)
  ok('环上有一颗「被作用」', labels.includes('被作用'), labels.join(' | '))
  const mine = items.find((i) => i.label === '被作用')
  ok('  它的 title 说清了它会干什么', !!mine && mine.title.includes('作用'), String(mine?.title))
  ok('  「信息」照旧在（没被顶掉）', labels.includes('信息'), labels.join(' | '))
  /*
   * ⚠️ **2026-10-04 翻（F1 修复）**：U57 加「被作用」时这里写的是"集合该有的操作照旧铺着
   * （asSet / closure）"。那两颗一直在撒谎 —— 点 `asSet` 报「P 没有底集可取」、
   * 点 `closure` 报「closure 需要一个集合」，因为 `paramAccepts` 单方面收 `set`、内核不收。
   *
   * F1 把判据收成一份（`ops.ts#setElementSetOf`）之后，**抽象点集不满足**（它没有母群）
   * ⇒ 这两颗不再铺出来。环上剩下 `信息 | 被作用`，对点集来说这是**正确的全部**：
   * 它能被作用（「被作用」），不能取底集、不能生成子群。
   */
  // 翻账（W1，2026-10-06）：显示名改中文，断言改按 data-op。
  ok(
    '  集合球上**不再铺**「底层集合」/「闭包」（F1：列出来必报错，本来就不该列）',
    !items.some((i) => i.opId === 'underlyingSet' || i.opId === 'closure'),
    labels.join(' | '),
  )
  ok(
    '  环上剩下「信息 + 被作用」—— 对抽象点集来说这就是全部正确的入口',
    labels.includes('信息') && labels.includes('被作用'),
    labels.join(' | '),
  )
  await page.screenshot({ path: '../../docs/assets/u57-set-ring.png' })
}

/* ══════════════════════════════════════════════════════════
 * ④ 点「被作用」-> 提示 -> 点群 -> 编辑器里 Ω **已经指好了**
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ④ 点「被作用」-> 选个群 -> 编辑器里 Ω 已经是那个集合 ==')
{
  ok('点得中「被作用」', await clickSat('被作用'))
  await page.waitForTimeout(320)

  const notice = await page.evaluate(() => document.querySelector('.notice')?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  ok('提示条说明白要选一个群当作用群', notice.includes('作用群') && notice.includes('G'), notice)
  const what = await page.evaluate(() => ({
    text: document.querySelector('.pending-what')?.textContent?.trim() ?? '',
    // `.pending-what` 的文本 2026-10-06 起是中文名，ASCII 记法进了 title。
    title: document.querySelector('.pending-what')?.getAttribute('title')?.trim() ?? '',
  }))
  // 翻账（W1，2026-10-06）：文本改中文，按 title 里的 ASCII 记法判。
  ok('  进的是同一条 op（customAction）', what.title.includes('customAction'), JSON.stringify(what))

  ok('点得中群节点 G', await clickSvg('svg.canvas g.gnode[data-id="G"] .gnode-hit'))
  const e = await editorState()
  ok('编辑器弹出来了', e.open === 1, JSON.stringify(e))
  /*
   * **这一条是这一节的正题**：从集合那头进来时，"我点的就是它"必须被记住 ——
   * Ω 那一格填着 `P`，而且那颗 chip 是**高亮**的。
   * （不这么做的话，他点完群之后 Ω 会被 `|G| = 8` 覆盖掉，等于把他指的东西弄丢。）
   */
  ok('Ω 那一格已经是 `P`（不是 |G| = 8）', e.omega === 'P', JSON.stringify(e))
  ok('  而且「画布上的集合」那颗 button 是**高亮**的', e.onChip.includes('P'), JSON.stringify(e))
  await page.screenshot({ path: '../../docs/assets/u57-editor-preset.png' })
}

/* ══════════════════════════════════════════════════════════
 * ⑤ 填生成元的像 -> 提交 -> 画出 G ↷ Omega
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ⑤ 填 r -> (1 2 3 4)、s -> (2 4) -> 提交 ==')
await setCycles(['(1 2 3 4)', '(2 4)'])
{
  // 手算：r 是 4 阶、像也是 4 阶 ⇒ 单射 ⇒ 忠实；s 是 2 阶、像 (2 4) 也是 2 阶 ✓
  const c = await page.evaluate(() => ({
    cls: [...(document.querySelector('.action-builder .mb-check')?.classList ?? [])].join(' '),
    text: document.querySelector('.action-builder .mb-check')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  }))
  ok('状态行说"是同态"（边填边判）', c.cls.includes('ok'), JSON.stringify(c))
  ok('  报「忠实」', c.text.includes('忠实'), c.text)
  await scanPlain('编辑器（从集合那头进来）')

  await page.fill('.action-builder .mb-name', 'AC')
  await page.waitForTimeout(200)
  ok('点得中「确认」', await clickEl('.action-builder .mb-foot .mb-btn.primary'))
  await page.waitForTimeout(620)

  ok('编辑器自己关掉了', (await page.locator('.action-builder').count()) === 0)
  ok('没有求值失败的行', (await errRows()).length === 0, JSON.stringify(await errRows()))
  const ids = await canvasNodes()
  ok('画布上还是 G 与 P（作用**不占节点**）', ids.map((n) => n.id).join(',') === 'G,P', ids.map((n) => n.id).join(','))
  const es = await edges()
  const act = es.find((x) => x.objectId === 'AC')
  ok('多了一条属于 AC 的边（`G ↷ Omega`）', !!act, JSON.stringify(es))
  ok('  它的标签是作用记号', act?.label === '\\curvearrowright', String(act?.label))
  await page.screenshot({ path: '../../docs/assets/u57-action-created.png' })
}

/* ══════════════════════════════════════════════════════════
 * ⑥ 拖拽：Shift 把 G 拖到集合上，菜单里也列得出
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ⑥ Shift 拖 G 到点集上：唯一候选（customAction）—— 先弹菜单，点它才进编辑器 ==')
await page.keyboard.press('Escape')
await page.waitForTimeout(320)
{
  /*
   * ⚠️ **2026-10-11 翻**（修"这一类问题"）：改前拖 G→点集只剩 1 条候选
   * （`customAction`）⇒ 走 `onConnect` 的 `cands.length === 1` 分支**直接执行**。
   * 而 customAction 是"要填表的 op"，直接执行 = 松手瞬间**台弹起 + 一张要填的
   * 表**，用户视角没有任何"我点了什么"的因果（用户原话：「当选中群和点集后，
   * 自动弹起工作台？反正这个群作用功能是卡没了」）。
   * 修后：**"立即出结果"的 op 才直接执行**（`image(f, ·)` 那条，connect.mjs ①
   * 守着）；**要编辑器的 op 先弹菜单**把它亮出来，用户点了再进编辑器 ——
   * 一步确认，换回因果。要守的变成两段："先弹菜单"、"点完真的进编辑器"。
   *
   * ⚠️ 靶子换成**新点集 Q**：⑤ 已经造了一条 `G ↷ Ω=P` 的作用，再拖 G→P 会被
   * "这条线已经有了"挡住（手画动作不会重复造同一条）。换 Q 才是"拖群到抽象点集"这条手势本身。
   */
  ok('另建一个干净点集 `Q = pointSet(3)` 当靶（P 上已经有作用了）', await addLine('Q', 'pointSet(3)'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(380)
  /* 2026-10-08：拖拽是画布手势 —— 先把工作台收掉（点节点会自动升起它） */
  await benchDown()

  const nodes = await canvasNodes()
  const g = nodes.find((n) => n.id === 'G')
  const q = nodes.find((n) => n.id === 'Q')
  await dragPointer(g, q)

  const menu = await page.evaluate(() =>
    [...document.querySelectorAll('.connect-menu .connect-item')].map((e) => e.dataset.op),
  )
  ok(
    '拖 G 到点集：只剩 1 条候选（customAction）但它要填表 ⇒ **弹菜单**（不直接跳编辑器）',
    menu.length === 1 && menu[0] === 'customAction',
    menu.join(' | ') || '(没弹)',
  )
  await scanPlain('连线菜单')
  await page.screenshot({ path: '../../docs/assets/u57-drag-menu.png' })

  /* 点菜单项 —— 这时才进编辑器 */
  await page.click('.connect-menu .connect-item')
  await page.waitForTimeout(520)
  const st = await page.evaluate(() => ({
    editor: document.querySelectorAll('.action-builder').length,
    notice: document.querySelector('.notice')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  }))
  ok('  点了菜单项：customAction 进编辑器', st.editor === 1, JSON.stringify(st))
  ok(
    '  不是 0 条候选那条路（"暂时没有可做的操作"）',
    !st.notice || !st.notice.includes('暂时没有'),
    JSON.stringify(st),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(260)
}

/* ══════════════════════════════════════════════════════════
 * ⑦ pending 里"点对象"的入口一致性（2026-10-11 修"这一类问题"）
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ⑦ pending 里点对象：能填的填、不能填的明说（不再切换焦点 / 清操作） ==')
await page.keyboard.press('Escape')
await page.waitForTimeout(320)
{
  /*
   * 用户原话：「你想点对象槽来导入对象，结果是切换对象，这谁想得到？」
   * 病灶：四个"点对象"的入口各养各的病——左栏对象行**无条件 selected**
   * （pending 被静默清掉 + 焦点切换）、对象槽里不能填的 chip **静默弹编辑器**。
   * 修后全部走 `App#onNodeClick` 的同一条门（`!picked.includes + canPick`，
   * 与候选区 `cands` **同一份判据**）。
   *
   * 本段守四件事（"旧的不许再出现"写在断言名里）：
   *   ① 左栏点不能填的行 → pending 保留 + 焦点不变 + 明说"不能填这一位"；
   *   ② 对象槽点不能填的 chip → 同上（且不弹编辑器）；
   *   ③ 对象槽点已在位的 chip → "已经在第 N 位了"；
   *   ④ 对象槽点能填的 chip → 照旧填进去（Ω 是最后一位 ⇒ 收尾进编辑器）。
   *
   * 名字用 X / Y / W（前文已用 G / P / Q）。
   */
  ok('建 `X = C_3`（作用群）', await addLine('X', 'C_3'))
  ok('建 `Y = pointSet(6)`（Ω 材料）', await addLine('Y', 'pointSet(6)'))
  ok('建 `W = S_3`（不能当 Ω 的群）', await addLine('W', 'S_3'))
  /*
   * ⚠️ 收起输入卡（真鼠标）：台升起时输入卡靠左向上展开（10-09 裁定，z15 最高），
   * 会把它下面的左栏对象行**盖住**——本段要真鼠标点 W 行，先把它收掉。
   * （repro 脚本里用合成事件"点得到"被盖的行；真鼠标点不到——这就是
   *  '点东西必须真实鼠标' 那条纪律的现场复读。）
   */
  await page.click('.composer-orb .orb-center')
  await page.waitForTimeout(300)
  /* 攒对象槽（"碰过就摆上台面"）：Y、W、X 各点一次、每次收台 */
  for (const id of ['Y', 'W', 'X']) {
    await clickSvg(`svg.canvas g.gnode[data-id="${id}"] .gnode-hit`)
    await benchDown()
  }
  /* 起 pending(1/2)：⊕ 球 → 自定义作用 → 台里候选把 X 填进第 1 位 */
  await clickEl('.multi-orb .orb-center')
  ok('⊕ 球里点「自定义作用」', await clickCenterOp('customAction'))
  await page.click('.bench-toggle') // 开台（此刻确定收着）
  await page.waitForTimeout(320)
  /* 候选 = 画布上所有能当作用群的群（前文的 G 也在列，X 未必排第一）——按 id 找 X 那一项 */
  const candIds = await page.evaluate(() =>
    [...document.querySelectorAll('.bench-cand-id')].map((e) => e.textContent.trim()),
  )
  const xi = candIds.indexOf('X')
  ok('候选里有 X（作用群；点集 Y 不在列）', xi >= 0 && !candIds.includes('Y'), candIds.join(', '))
  await page.click(`.bench-cand >> nth=${xi}`)
  await page.waitForTimeout(420)

  const benchRead = () =>
    page.evaluate(() => ({
      target: document.querySelector('.bench-target')?.textContent ?? null,
      slots: [...document.querySelectorAll('.bench-slot')].map((s) =>
        [...s.classList].filter((c) => c !== 'bench-slot').join('/'),
      ),
      editor: document.querySelectorAll('.action-builder').length,
      notice: document.querySelector('.notice')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    }))

  /* ① 左栏点不能填的行（W）——旧行为：无条件 selected（清掉 pending + 切焦点）
     ⚠️ 点 **`.row-name`** 而不是行中心：行尾现在有「存 / 改 / x」三颗按钮（P2 草稿区加的），
     行中心可能正好落在按钮上（按钮 stopPropagation ⇒ 行根本收不到这次点击）。 */
  await page.click('.dock-topleft .row:has(.row-name:text-is("W")) .row-name')
  await page.waitForTimeout(420)
  const b1 = await benchRead()
  ok('① 点 W 行：pending 没被清掉（槽位区还在）', b1.slots.length === 2, JSON.stringify(b1.slots))
  ok('① 焦点没有被切走（还是 X）—— 旧行为「切换对象」不再出现', b1.target === 'X', String(b1.target))
  ok('① 明说为什么：不能填这一位', (b1.notice ?? '').includes('不能填这一位'), String(b1.notice))

  /* ② 对象槽点不能填的 chip（W）——旧行为：静默弹编辑器 */
  await page.click('.bench-chip-main[title="填不进这一位"]')
  await page.waitForTimeout(420)
  const b2 = await benchRead()
  ok('② 点 W chip：没弹编辑器（旧行为：静默进编辑器）', b2.editor === 0, String(b2.editor))
  ok(
    '② 仍是 pending + 反馈',
    b2.slots.length === 2 && (b2.notice ?? '').includes('不能填这一位'),
    JSON.stringify({ slots: b2.slots, notice: b2.notice }),
  )

  /* ③ 已在位的 X chip */
  await page.click('.bench-chip-main[title="已经在参数里了"]')
  await page.waitForTimeout(420)
  const b3 = await benchRead()
  ok('③ 点已在位的 X：说清「已经在第 1 位了」', (b3.notice ?? '').includes('已经在第 1 位'), String(b3.notice))
  ok('③ pending 仍在', b3.slots.length === 2, JSON.stringify(b3.slots))

  /* ④ 能填的 Y chip —— 照旧填进去（Ω 是最后一位 ⇒ 收尾进编辑器）*/
  await page.click('.bench-chip-main[title^="填进第 2 位"]')
  await page.waitForTimeout(520)
  const b4 = await benchRead()
  ok('④ 点能填的 Y：填进第 2 位（收尾进编辑器）', b4.editor === 1, JSON.stringify(b4.editor))
  await scanPlain('⑦ pending 点对象')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
