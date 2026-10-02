/**
 * 走查：**自定义作用**（U52）—— 用户手给一个同态 `G -> S_Ω`。
 *
 * 用户原话只有五个字：「自定义群作用呢？」
 * 侦察下来 `ActionKind` 里的 `custom` 一直是**空槽**（有标签、有分支、零个生产者），
 * 而代数上"一个作用"就是"一个同态"，所以定义作用 = 给每个生成元挑一个置换。
 *
 * 本套钉的是**用户真能摸到的五件事**：
 *   ① **点住 G 弹得出编辑器**（悬浮球 -> 操作 -> 自定义作用）—— 菜单不撒谎；
 *   ② **边填边知道行不行**：填 `(1 2 3 4)` 立刻给「传递 - 忠实」，
 *      填 `(12)(34)` 给「不忠实（核阶 2）」（非忠实是合法作用，必须披露）；
 *   ③ **两个一键起点写进输入框**（平凡 / 左正则）—— 不搞"留空就是恒等"那种静默默认；
 *   ④ **提交真的长出对象**：`A` 节点 + `\Omega` 节点，信息面板有「核」这一行；
 *   ⑤ **产出是一等作用值**：`轨道(A, 1)` / `稳定子(A, 1)` 接着能算。
 *
 * 外加两条纪律（U38/U51 立的）：
 *   · **菜单不撒谎**：直积群的生成元在 core 里重名重号（`C_2^2` 是三个 `a`），
 *     "分别指定像"表达不出来 ⇒ 菜单里**不列**「自定义作用」，文本路给理由；
 *   · **纯文本面零泄漏**：编辑器的按钮 / title / 状态行，与悬浮球面板的
 *     label / 模板 / 说明，全是键盘打得出的字符（判据与 `e2e/no-unicode-leak.mjs`
 *     的 `ALLOWED` 逐字相同）。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/custom-action.mjs`
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
// "不卡死"写成时间断言，不写成"跑完了"（U47 立的）
page.setDefaultTimeout(4000)

/* ── 纯文本面判据（与 e2e/no-unicode-leak.mjs 逐字相同）───────── */

const ALLOWED = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const badChars = (s) => [...new Set([...String(s ?? '')].filter((c) => !ALLOWED.test(c)))]

/* ── 场地 ─────────────────────────────────────────────── */

const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) > 0) return
  await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
  await page.click('.composer-orb .orb-center')
  await page.waitForTimeout(220)
}

const addLine = async (name, expr) => {
  await ensureCard()
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(200)
  const btn = page.locator('.composer-orb .composer-row button')
  if (await btn.isDisabled()) {
    const st = await page.evaluate(() => document.querySelector('.composer-status')?.textContent ?? '')
    console.log(`    [blocked] ${name} = ${expr} :: ${st}`)
    return false
  }
  await btn.click()
  await page.waitForTimeout(420)
  return true
}

/** 只预览（不提交）—— 状态行是这个 op 的**纯文本面**。 */
const typeExpr = async (v) => {
  await ensureCard()
  await page.fill('.composer-name', '')
  await page.fill('.composer-expr', v)
  await page.waitForTimeout(320)
}

const status = () =>
  page.evaluate(() => ({
    text: document.querySelector('.composer-status')?.textContent ?? '',
    cls: [...(document.querySelector('.composer-status')?.classList ?? [])].join(' '),
  }))

/** 画布节点 id 列表（`g.gnode` 的 `data-id`）。 */
const nodeIds = () =>
  page.evaluate(() => [...document.querySelectorAll('svg.canvas g.gnode')].map((g) => g.dataset.id))

/**
 * 画布上的边（`g.gedge`）。
 *
 * ⚠️ **作用不占节点**（`canvasShape('edge')`）：它是**关系**，画成 `G ↷ Ω` 那条线，
 * 背后的对象靠 `data-object-id` 认（点那条线就能选中它，与映射同款）。
 */
const canvasEdges = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('svg.canvas g.gedge')].map((g) => ({
      id: g.dataset.edgeId ?? '',
      objectId: g.dataset.objectId ?? '',
      kind: g.dataset.structural ?? '',
      label: g.dataset.label ?? '',
      hasHit: !!g.querySelector('.gedge-hit'),
    })),
  )

const errRows = () => page.evaluate(() => [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()))

/** 画布上的节点/边是 SVG（命中层 `transparent`）—— 派发事件，别指望可见性判定。 */
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
  const n = await page.locator(sel).count()
  if (n === 0) return false
  await page.click(sel, { timeout: 6000 })
  await page.waitForTimeout(340)
  return true
}

/** 选中一个画布节点（悬浮球的唯一入口）。 */
const selectNode = (id) => clickSvg(`svg.canvas g.gnode[data-id="${id}"] .gnode-hit`)

/** 悬浮球面板里的候选短标签。 */
const orbOpLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.orb-ops-panel:not(.orb-center-panel) .orb-op-label')].map((e) => e.textContent.trim()),
  )

/** 悬浮球面板里每一条的「标签 + 模板」（模板是"照抄就能跑"的那一行）。 */
const orbOps = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.orb-ops-panel:not(.orb-center-panel) .orb-op')].map((b) => ({
      label: b.querySelector('.orb-op-label')?.textContent?.trim() ?? '',
      tmpl: b.querySelector('code')?.textContent?.trim() ?? '',
      doc: b.querySelector('.orb-op-doc')?.textContent?.trim() ?? '',
      title: b.getAttribute('title') ?? '',
    })),
  )

const clickOrbOp = async (label) => {
  const hit = await page.evaluate((want) => {
    const b = [...document.querySelectorAll('.orb-ops-panel:not(.orb-center-panel) .orb-op')].find(
      (x) => x.querySelector('.orb-op-label')?.textContent?.trim() === want,
    )
    if (!b) return false
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, label)
  await page.waitForTimeout(420)
  return hit
}

/** 选中节点 -> 点球 -> 点「操作」-> 单对象操作面板。 */
const openOpsPanel = async (id) => {
  await selectNode(id)
  await clickEl('.orb:not(.orb-center)')
  await clickEl('.orb-sat:text-is("操作")')
}

/** 编辑器底部那条状态行。 */
const check = () =>
  page.evaluate(() => {
    const el = document.querySelector('.action-builder .mb-check')
    return el
      ? { cls: [...el.classList].join(' '), text: el.textContent.replace(/\s+/g, ' ').trim() }
      : null
  })

/** 第一个生成元的像输入框 / n 输入框 / 名字输入框的当前值。 */
const editorValues = () =>
  page.evaluate(() => ({
    n: document.querySelector('.action-builder .ab-n input')?.value ?? null,
    cycle: document.querySelector('.action-builder .mb-row input.cycle-input')?.value ?? null,
    name: document.querySelector('.action-builder .mb-name')?.value ?? null,
    rows: document.querySelectorAll('.action-builder .mb-row input.cycle-input').length,
  }))

const setCycle = async (v) => {
  await page.fill('.action-builder .mb-row input.cycle-input', v)
  await page.waitForTimeout(320)
}

/** 展开「基本」（U45：默认全收；手风琴里再点一下是收起，所以先看 class）。 */
const openBasic = async () => {
  await page.evaluate(() => {
    const h = document.querySelector('.info-sec-head[data-sec="basic"]')
    if (h && !h.classList.contains('on')) h.click()
  })
  await page.waitForTimeout(320)
}

/**
 * 信息面板的读数（`.insp-k` / `.insp-v`）。
 *
 * 群对象的分区**默认全收**（U45），所以先展「基本」；作用这类非群对象走 `OtherTab`，
 * 没有分区头，`openBasic` 自然什么也不做。
 */
const inspRows = async () => {
  await openBasic()
  return page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .insp-row')].map((r) => ({
      k: r.querySelector('.insp-k')?.textContent?.trim() ?? '',
      v: (r.querySelector('.insp-v')?.textContent ?? '').replace(/[\u200b\u2061\u2062]/g, '').replace(/\s+/g, '').trim(),
    })),
  )
}

/** 纯文本面扫描：只扫**明确是纯文本**的那些节点（KaTeX 渲染的串会带零宽字符，别混进来）。 */
const PLAIN_SELECTORS = [
  '.action-builder .mb-hint',
  '.action-builder .mb-check',
  '.action-builder .mb-auto',
  '.action-builder .mb-btn',
  '.action-builder .ab-ord',
  '.action-builder .mb-to',
  '.action-builder .mb-arrow',
  '.action-builder [title]',
  '.orb-ops-panel:not(.orb-center-panel) .orb-op-label',
  '.orb-ops-panel:not(.orb-center-panel) .orb-op code',
  '.orb-ops-panel:not(.orb-center-panel) .orb-op-doc',
  '.orb-ops-panel:not(.orb-center-panel) .orb-ops-hint',
  '.orb-ops-panel:not(.orb-center-panel) [title]',
  '.composer-status',
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
 * ① 点住 G -> 悬浮球 -> 「自定义作用」-> 编辑器弹出来
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ① 悬浮球里列得出「自定义作用」，点开就是编辑器 ==')
await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

ok('建 `G = C_4`', await addLine('G', 'C_4'))
await page.keyboard.press('Escape')
await page.waitForTimeout(420)

await openOpsPanel('G')
{
  const ops = await orbOps()
  const labels = ops.map((o) => o.label)
  ok('单对象操作面板里有「自定义作用」', labels.includes('自定义作用'), labels.join(' | '))
  ok('标签不是原样贴出的 LaTeX（不许出现反斜杠）', labels.every((l) => !l.includes('\\')), labels.join(' | '))
  const mine = ops.find((o) => o.label === '自定义作用')
  // 模板是"照抄就能跑"的一行：`C_4` 的生成元是 `a`，4 个点上的 4-循环
  ok('模板给的是能照抄的一行', mine?.tmpl === '自定义作用(G, 4, a -> (1 2 3 4))', String(mine?.tmpl))
  ok('说明里说清了"恒等写 e"', !!mine?.doc && mine.doc.includes('恒等写 e'), String(mine?.doc))
  await page.screenshot({ path: '../../docs/assets/u52-action-menu.png' })

  ok('点得中「自定义作用」', await clickOrbOp('自定义作用'))
  await page.waitForTimeout(320)
  const opened = await page.locator('.action-builder').count()
  ok('编辑器弹出来了（不是 pending / 补参条）', opened === 1, `count=${opened}`)
  ok('  也不是映射构建器（按 op 分派对了）', (await page.locator('.action-builder .chip-action').count()) === 1)
  ok('  提示条说了"一个作用就是一个同态"', (await page.locator('.action-builder .mb-hint').textContent()).includes('同态'))

  const vals = await editorValues()
  ok('生成元只有一行（C_4 是一个生成元的群）', vals.rows === 1, String(vals.rows))
  // `n` 的初值：|G| <= 12 的小群按左正则作用起步（G 作用在自己的 4 个元素上）
  ok('n 的初值 = |G| = 4', vals.n === '4', String(vals.n))
  const c0 = await check()
  ok('还没填 -> 状态说清"待填"与写法', c0?.cls.includes('empty') && c0.text.includes('循环记号'), JSON.stringify(c0))
  ok('  并说明"恒等写 e"（不许静默当恒等）', !!c0 && c0.text.includes('恒等写 e'), String(c0?.text))
}

/* ══════════════════════════════════════════════════════════
 * ② 边填边判：`(1 2 3 4)` -> 传递 - 忠实
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ② 实时校验：4-循环 -> 传递 - 忠实 ==')
await setCycle('(1 2 3 4)')
{
  // 手算：a 阶 4、像也是 4 阶 ⇒ 单射 ⇒ 忠实；4-循环在 4 个点上只有一个轨道 ⇒ 传递
  const c = await check()
  ok('状态变成"是同态"（不是等确认才知道）', c?.cls.includes('ok'), JSON.stringify(c))
  ok('  报「传递」', !!c && c.text.includes('传递'), String(c?.text))
  ok('  报「忠实」', !!c && c.text.includes('忠实'), String(c?.text))
  await page.screenshot({ path: '../../docs/assets/u52-action-editor.png' })
}

/* ══════════════════════════════════════════════════════════
 * ③ 两个一键起点：写进输入框，看得见
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ③ 一键起点：左正则 / 平凡 ==')
{
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('.action-builder .mb-auto')].map((b) => b.textContent.trim()),
  )
  ok('两个按钮都在（平凡作用 / 左正则作用）', btns.join('|') === '平凡作用|左正则作用', btns.join('|'))

  ok('点得中「左正则作用」', await clickEl('.action-builder .mb-auto:text-is("左正则作用")'))
  {
    // 左正则 = Cayley：n 设成 |G|、每个生成元按左乘填 —— 必然忠实
    const vals = await editorValues()
    ok('  它把 n 设成了 |G| = 4', vals.n === '4', String(vals.n))
    ok('  并把像**写进了输入框**（不是留在脑子里）', vals.cycle === '(1 2 3 4)', String(vals.cycle))
    const c = await check()
    ok('  状态说「忠实」（这就是 Cayley 定理）', !!c && c.text.includes('忠实'), String(c?.text))
    ok('  并标了一键起点的名字', !!c && c.text.includes('左正则作用'), String(c?.text))
  }

  ok('点得中「平凡作用」', await clickEl('.action-builder .mb-auto:text-is("平凡作用")'))
  {
    const vals = await editorValues()
    // core 的循环记号解析器不认 `(1)`：恒等必须显式写 `e`，且要**看得见**
    ok('  它把恒等写成了 e（不是清空输入框）', vals.cycle === 'e', String(vals.cycle))
    const c = await check()
    ok('  核阶 4 -> 报「不忠实」（平凡作用合法但要披露）', !!c && c.text.includes('不忠实') && c.text.includes('核阶 4'), String(c?.text))
    ok('  4 个轨道（每点一个）', !!c && c.text.includes('4 个轨道'), String(c?.text))
  }
}

/* ══════════════════════════════════════════════════════════
 * ④ 非忠实：`(12)(34)` -> 核 = <a^2>（2 阶）
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ④ 非忠实披露：`(12)(34)` -> 核阶 2 ==')
await setCycle('(12)(34)')
{
  // 手算：(12)(34) 的阶是 2，2 | 4 ✓；φ(a^2) = id 而 φ(a) != id ⇒ 核恰好是 <a^2>
  const c = await check()
  ok('状态仍说"是同态"（非忠实不是错误）', c?.cls.includes('ok'), JSON.stringify(c))
  ok('  但明说「不忠实（核阶 2）」', !!c && c.text.includes('不忠实') && c.text.includes('核阶 2'), String(c?.text))
  ok('  轨道是 2 个（{1,2} 与 {3,4}）', !!c && c.text.includes('2 个轨道'), String(c?.text))
  await scanPlain('编辑器（非忠实态）')
}

/* ══════════════════════════════════════════════════════════
 * ⑤ 提交 -> action 节点 + \Omega 节点 + 信息面板的「核」
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ⑤ 确认 -> 画出 `G ↷ Omega`（作用不占节点，它是关系）==')
await page.fill('.action-builder .mb-name', 'A')
await page.waitForTimeout(200)
await clickEl('.action-builder .mb-foot .mb-btn.primary')
await page.waitForTimeout(620)
{
  ok('编辑器自己关掉了', (await page.locator('.action-builder').count()) === 0)
  ok('没有求值失败的行', (await errRows()).length === 0, JSON.stringify(await errRows()))

  const ids = await nodeIds()
  // 手算它该长什么样：作用**不上节点**（`canvasShape` 给 'edge'），
  // 它画成两根东西 —— G 那个群节点 + Ω 那个集合节点。
  ok('画布上是 G 与它的 Omega（作用自己不上节点）', ids.join(',') === 'G,A/Omega', ids.join(','))
  ok('  作用群 G 还在', ids.includes('G'), ids.join(','))

  const edges = await canvasEdges()
  const act = edges.find((e) => e.objectId === 'A')
  ok('多了一条**属于 A 的边**（`G ↷ Omega`）', !!act, JSON.stringify(edges))
  ok('  标签是作用记号（不是来源虚线）', act?.label === '\\curvearrowright', String(act?.label))
  ok('  它可点选（有命中层）', act?.hasHit === true, JSON.stringify(act))
  await page.screenshot({ path: '../../docs/assets/u52-action-created.png' })

  // 提交后焦点正好落在新对象上（`submitEditorLine` 的 selected）—— 直接读信息面板
  const rows = await inspRows()
  ok('信息面板认得它是「自定义作用」', rows.some((r) => r.k === '类型' && r.v === '自定义作用'), JSON.stringify(rows))
  ok('  有「核」这一行（U52 新增的判据）', rows.some((r) => r.k === '核'), JSON.stringify(rows))
  ok('  核写着"不忠实，阶 2"', rows.some((r) => r.k === '核' && r.v.includes('不忠实') && r.v.includes('2')), JSON.stringify(rows))
  ok('  Omega 是 4 个点', rows.some((r) => r.k === 'Omega' && r.v.includes('4')), JSON.stringify(rows))

  /*
   * **点那条作用线**——这是"作用不占节点"之后用户唯一的入口
   * （没有球、没有行，只有线；映射也是这个待遇）。点它得能看到同一个对象的信息。
   */
  await page.keyboard.press('Escape')
  await page.waitForTimeout(320)
  ok('点得中那条作用线', await clickSvg('svg.canvas g.gedge[data-object-id="A"] .gedge-hit'))
  const rows2 = await inspRows()
  ok('点线也能选中这个作用（它是一等对象，只是画成边）', rows2.some((r) => r.k === '类型' && r.v === '自定义作用'), JSON.stringify(rows2))
}

/* ══════════════════════════════════════════════════════════
 * ⑥ 产出的是一等作用值：轨道 / 稳定子接着算
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ⑥ 下游：`轨道(A, 1)` / `稳定子(A, 1)` ==')
{
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  ok('建 `O = 轨道(A, 1)`', await addLine('O', '轨道(A, 1)'))
  ok('建 `S = 稳定子(A, 1)`', await addLine('S', '稳定子(A, 1)'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(420)

  ok('两条都没有报错', (await errRows()).length === 0, JSON.stringify(await errRows()))
  const ids = await nodeIds()
  ok('轨道与稳定子都上了画布', ids.includes('O') && ids.includes('S'), ids.join(','))

  // 手算：(12)(34) 把 1 送到 2、2 送到 1 ⇒ 轨道 = {1,2}，2 个点
  ok('点得中轨道 O', await selectNode('O'))
  {
    const rows = await inspRows()
    ok('  轨道是 2 个点', rows.some((r) => r.k === '基数' && r.v === '2'), JSON.stringify(rows))
  }
  // 手算：稳定子的元素是让 1 不动的那些 —— (12)(34) 把 1 与 2 换走，
  // 所以 Stab(1) = {e, a^2}（两者的像是恒等置换），2 阶
  ok('点得中稳定子 S', await selectNode('S'))
  {
    const rows = await inspRows()
    ok('  稳定子是 2 阶（<a^2>）', rows.some((r) => r.k === '阶' && r.v === '|G|=2'), JSON.stringify(rows))
    ok('  来源写着 A（它是由那个作用算出来的）', rows.some((r) => r.k === '来源' && r.v === 'A'), JSON.stringify(rows))
  }
}

/* ══════════════════════════════════════════════════════════
 * ⑦ 菜单不撒谎：直积群的生成元分不开 -> 不列，但要说理由
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ⑦ `C_2^2` 的生成元分不开 -> 菜单里不列「自定义作用」 ==')
await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

ok('建 `G = C_2^2`', await addLine('G', 'C_2^2'))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

await openOpsPanel('G')
{
  const labels = await orbOpLabels()
  ok('菜单弹得出来（不是空的）', labels.length > 0, labels.join(' | '))
  // core 给 C_2^2 的生成元起名全是 `a`、记号全是 `1` ⇒ "分别指定像"表达不出来。
  // 列出来点下去只能得到一句"做不了" —— 那就是撒谎（U38/U51 立的规矩）。
  ok('**不列**「自定义作用」', !labels.includes('自定义作用'), labels.join(' | '))
  ok('同一张菜单里「正则作用」照列（不是"一律不列"）', labels.includes('正则作用'), labels.join(' | '))
  ok('菜单里没有键盘打不出的字符', labels.every((l) => badChars(l).length === 0), badChars(labels.join('')).join(''))

  // 文本路照旧能进去 —— 那时要**说清为什么**，并给出路
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await typeExpr('自定义作用(G, 4, a -> (12)(34))')
  const s = await status()
  ok('文本路拦下（红字）', s.cls.includes('bad'), `${s.cls} :: ${s.text}`)
  ok('  说清是"分不开"，不是"没有生成元 b"', s.text.includes('分不开'), s.text)
  ok('  给出路（正则作用）', s.text.includes('正则作用'), s.text)
  await scanPlain('状态行（生成元分不开）')
}

// 对照组：`V_4` 与 `C_2^2` 是**同一个群**，区别只在 core 的生成元表 —— 它就该列
{
  await page.keyboard.press('Escape')
  await page.waitForTimeout(240)
  ok('建 `H = V_4`', await addLine('H', 'V_4'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await openOpsPanel('H')
  const labels = await orbOpLabels()
  ok('V_4（同一个群、另一种构造）上照列「自定义作用」', labels.includes('自定义作用'), labels.join(' | '))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

/* ══════════════════════════════════════════════════════════
 * ⑧ 文本路也能进（定义行是输入面），报错语是纯文本面
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ⑧ 文本路：按模板敲一行就建（三条路都通） ==')
await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1100)
ok('建 `G = C_4`', await addLine('G', 'C_4'))
{
  // 手算：3 阶的像套进 4 阶的生成元里不可能是同态（3 不整除 4）
  await typeExpr('自定义作用(G, 4, a -> (1 2 3))')
  const s = await status()
  ok('阶不整除 -> 红字拦住', s.cls.includes('bad'), `${s.cls} :: ${s.text}`)
  ok('  说清是"阶是 4 / 像的阶是 3"', s.text.includes('阶是 4') && s.text.includes('阶是 3'), s.text)
  ok('  报错语里没有反斜杠（纯文本面不写 LaTeX 命令）', !s.text.includes('\\'), s.text)
  await scanPlain('状态行（阶不整除）')

  ok('照模板敲的那一行能建', await addLine('A2', '自定义作用(G, 4, a -> (1 2 3 4))'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(360)
  ok('没有求值失败的行', (await errRows()).length === 0, JSON.stringify(await errRows()))
  const ids = await nodeIds()
  ok('文本路建出的作用同样画成 `G ↷ Omega`', ids.join(',') === 'G,A2/Omega', ids.join(','))
}

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
