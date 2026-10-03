/**
 * 走查：**任意阶集合**（U53）—— 点集构造器 + Ω 当参数。
 *
 * 用户原话（U52 刚推上去之后）：
 *
 *   「逗我吗，连任意阶集合都创建不了，怎么创建自定义群作用？你做了半天做了什么？」
 *
 * 实测确认用户是对的：`{1,2,3}` / `labeledSet(1,2,3)` / `pointSet(5)` 全不通，而唯一能造 `set`
 * 的 `asSet(S)` 要求 `S` **已经存在**（子群集 / 元素集 / 群）—— 集合的点必须从
 * 某个已存在的群里借。于是 `customAction` 的 Ω 只能是内核硬造的 `{1..n}`。
 *
 * 本套钉的是**用户真能摸到的六件事**：
 *   ① **凭空造集合**：输入球里敲 `pointSet(5)` / `labeledSet(红, 绿, 蓝, 黄)` 就长出集合节点
 *      （`pointSet(5)` 的点号是 `1..5`；`labeledSet(5)` 两种读法都通 ⇒ 红字拦下并指路）；
 *   ② **Ω 那一格收三种写法**：一个数字（U52 老行为）· 一个点集表达式 · 画布上的集合一键挑；
 *   ③ **标号能写进循环记号**：Ω = `labeledSet(a, b, c)` 时填 `(a b)` 认得出，
 *      状态行的示例也跟着用标号（屏幕上写着 `a`，示例就该写 `a`）；
 *   ④ **老行为不坏**：Ω 填 `4` 时的一切读数与 U52 逐字一致；
 *   ⑤ **确认后不另造一个 Ω**：Ω 是画布上已有的集合时，节点**不多**、作用线直接连过去；
 *   ⑥ **纯文本面零泄漏**：按钮 / title / 状态行 / 读数全是键盘打得出的字符
 *      （判据与 `e2e/no-unicode-leak.mjs` 的 `ALLOWED` 逐字相同）。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/point-set.mjs`
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

/** 只预览（不提交）—— 状态行是这个面的**纯文本面**。 */
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

/** 画布上的边（`g.gedge`）—— 作用不占节点，它是关系。 */
const canvasEdges = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('svg.canvas g.gedge')].map((g) => ({
      objectId: g.dataset.objectId ?? '',
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

/** 选中节点 -> 点球 -> 点「操作」-> 单对象操作面板。 */
const openOpsPanel = async (id) => {
  await selectNode(id)
  await clickEl('.orb:not(.orb-center)')
  await clickEl('.orb-sat:text-is("操作")')
}

const orbOpLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.orb-ops-panel:not(.orb-center-panel) .orb-op-label')].map((e) => e.textContent.trim()),
  )

/** 点单对象操作面板里的某一条（按短标签）。 */
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

/** 展开「基本」（U45：默认全收；手风琴里再点一下是收起，所以先看 class）。 */
const openBasic = async () => {
  await page.evaluate(() => {
    const h = document.querySelector('.info-sec-head[data-sec="basic"]')
    if (h && !h.classList.contains('on')) h.click()
  })
  await page.waitForTimeout(320)
}

/** 信息面板的读数（`.insp-k` / `.insp-v`）。 */
const inspRows = async () => {
  await openBasic()
  return page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .insp-row')].map((r) => ({
      k: r.querySelector('.insp-k')?.textContent?.trim() ?? '',
      v: (r.querySelector('.insp-v')?.textContent ?? '')
        .replace(/[\u200b\u2061\u2062]/g, '')
        .replace(/\s+/g, '')
        .trim(),
    })),
  )
}

/** 信息面板里集合的成员记号（`.insp-tags .sub-tag`）。 */
const inspTags = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .insp-tags .sub-tag')].map((e) =>
      (e.textContent ?? '').replace(/[\u200b\u2061\u2062]/g, '').trim(),
    ),
  )

/** Ω 那一格的完整读数（U53 的编辑器界面）。 */
const editorState = () =>
  page.evaluate(() => {
    const el = document.querySelector('.action-builder')
    if (!el) return null
    return {
      omega: el.querySelector('.ab-n input')?.value ?? null,
      omegaCls: el.querySelector('.ab-n input')?.className ?? '',
      summary: el.querySelector('.ab-n .mb-to')?.textContent?.trim() ?? '',
      check: el.querySelector('.mb-check')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      cls: [...(el.querySelector('.mb-check')?.classList ?? [])].join(' '),
      cycles: [...el.querySelectorAll('.mb-row input.cycle-input')].map((i) => i.value),
      chips: [...el.querySelectorAll('.ab-set-chip')].map((b) => b.textContent.trim()),
      setsLabel: el.querySelector('.ab-sets-label')?.textContent?.trim() ?? '',
      hint: el.querySelector('.mb-hint')?.textContent?.trim() ?? '',
    }
  })

const setOmega = async (v) => {
  await page.fill('.action-builder .ab-n input', v)
  await page.waitForTimeout(420)
}

const setCycle = async (i, v) => {
  const rows = await page.locator('.action-builder .mb-row input.cycle-input').all()
  if (!rows[i]) return false
  await rows[i].fill(v)
  await page.waitForTimeout(420)
  return true
}

/** 纯文本面扫描：只扫**明确是纯文本**的节点（KaTeX 渲染的串会带零宽字符，别混进来）。 */
const PLAIN_SELECTORS = [
  '.composer-status',
  '.row-err',
  '.action-builder .mb-hint',
  '.action-builder .mb-check',
  '.action-builder .mb-auto',
  '.action-builder .mb-btn',
  '.action-builder .ab-ord',
  '.action-builder .mb-to',
  '.action-builder .mb-arrow',
  '.action-builder .mb-gen',
  '.action-builder .ab-sets-label',
  '.action-builder .ab-set-chip',
  '.action-builder [title]',
  '.orb-ops-panel:not(.orb-center-panel) .orb-op-label',
  '.orb-ops-panel:not(.orb-center-panel) .orb-op code',
  '.orb-ops-panel:not(.orb-center-panel) .orb-op-doc',
  '.orb-ops-panel:not(.orb-center-panel) .orb-ops-hint',
  '.orb-ops-panel:not(.orb-center-panel) [title]',
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
 * ① 凭空造集合：`pointSet(5)` / `labeledSet(红, 绿, 蓝, 黄)`
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ① 输入球里凭空造集合（不借任何群）==')
await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

ok('建 `P = pointSet(5)`', await addLine('P', 'pointSet(5)'))
await page.keyboard.press('Escape')
await page.waitForTimeout(420)
{
  const ids = await nodeIds()
  ok('点集长成了画布节点', ids.includes('P'), ids.join(','))
  ok('点得中 P', await selectNode('P'))
  const rows = await inspRows()
  // 手算：`pointSet(5)` 就是 5 个抽象点，点号 1..5
  ok('  基数 = 5', rows.some((r) => r.k === '基数' && r.v === '5'), JSON.stringify(rows))
  const tags0 = await inspTags()
  ok('  点号就是 1..5', tags0.join(',') === '1,2,3,4,5', tags0.join(','))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  ok('建 `X = labeledSet(红, 绿, 蓝, 黄)`', await addLine('X', 'labeledSet(红, 绿, 蓝, 黄)'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(420)
  ok('集合也长成节点', (await nodeIds()).includes('X'), (await nodeIds()).join(','))
  ok('点得中 X', await selectNode('X'))
  const rows2 = await inspRows()
  ok('  基数 = 4', rows2.some((r) => r.k === '基数' && r.v === '4'), JSON.stringify(rows2))
  const tags = await inspTags()
  ok('  成员就是那 4 个字（标号保真）', tags.join(',') === '红,绿,蓝,黄', tags.join(','))
}

/* ══════════════════════════════════════════════════════════
 * ② 报错路：歧义与非法点数都红字拦下，并指路
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ② `labeledSet(5)` 两种读法都通 -> 不许猜，指路 pointSet(5) ==')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
{
  await typeExpr('labeledSet(5)')
  const s = await status()
  ok('红字拦下', s.cls.includes('bad'), `${s.cls} :: ${s.text}`)
  ok('  说清两种读法', s.text.includes('5 个点') && s.text.includes('一个叫 5 的点'), s.text)
  ok('  指路 pointSet(5)', s.text.includes('pointSet(5)'), s.text)

  await typeExpr('pointSet(401)')
  const s2 = await status()
  ok('pointSet(401) 超上限拦下', s2.cls.includes('bad') && s2.text.includes('超过上限'), s2.text)
  ok('  理由说是"手写记号"（不是算不动）', s2.text.includes('敲'), s2.text)

  await typeExpr('pointSet(0)')
  const s3 = await status()
  ok('pointSet(0) 拦下（点数必须是正整数）', s3.cls.includes('bad') && s3.text.includes('必须是正整数'), s3.text)
  await scanPlain('状态行（点集报错三连）')
  await page.screenshot({ path: '../../docs/assets/u53-point-set.png' })
}

/* ══════════════════════════════════════════════════════════
 * ③ 编辑器 Ω 那一格：数字（老行为）/ 点集表达式 / 一键挑
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ③ Ω 一格收三种写法：数字 / 点集表达式 / 画布上的集合 ==')
await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)
ok('建 `P = pointSet(5)`（给下面那排一键按钮准备一个集合）', await addLine('P', 'pointSet(5)'))
await page.keyboard.press('Escape')
await page.waitForTimeout(360)
ok('建 `X = labeledSet(a, b, c)`', await addLine('X', 'labeledSet(a, b, c)'))
await page.keyboard.press('Escape')
await page.waitForTimeout(360)
ok('建 `G = C_4`', await addLine('G', 'C_4'))
await page.keyboard.press('Escape')
await page.waitForTimeout(420)

await openOpsPanel('G')
{
  const labels = await orbOpLabels()
  ok('单对象操作面板里有「customAction」（U54 前叫「自定义作用」）', labels.includes('customAction'), labels.join(' | '))
  ok('点得中「customAction」', await clickOrbOp('customAction'))
  await page.waitForTimeout(500)

  let s = await editorState()
  ok('编辑器的 Ω 那一格在', !!s && typeof s.omega === 'string')
  // U52 老行为：小群按 |C_4| = 4 个点起步
  ok('Ω 初值 = |G| = 4（老行为）', s?.omega === '4', String(s?.omega))
  ok('  读数是"4 个点"', s?.summary === '4 个点', s?.summary)
  ok('  这一格标着「作用点集」', await page.locator('.action-builder .ab-n .mb-gen:text-is("作用点集")').count() === 1)
  ok('  提示条说清"一个点数或一个点集表达式"', !!s && s.hint.includes('点集') && s.hint.includes('点数'), s?.hint)

  // 画布上的集合做成一排一键按钮（**只列集合，不列作用群 G**）
  ok('一排按钮出现了', (s?.chips.length ?? 0) >= 2, String(s?.chips.length))
  ok('  列出画布上的 P 与 X', s?.chips.includes('P') && s?.chips.includes('X'), s?.chips.join('|'))
  ok('  **不列**作用群 G（那是起点不是舞台）', !s?.chips.includes('G'), s?.chips.join('|'))
  ok('  那排有个标题（纯文本）', (s?.setsLabel ?? '').includes('集合'), s?.setsLabel)

  /* ── 老写法：数字 + 4-循环 ── */
  await setCycle(0, '(1 2 3 4)')
  s = await editorState()
  ok('填 (1 2 3 4) -> 是同态 - 传递 - 忠实', !!s && s.cls.includes('ok') && s.check.includes('传递') && s.check.includes('忠实'), s?.check)

  /* ── `pointSet(8)`：凭空造 8 个点 ── */
  await setOmega('pointSet(8)')
  await setCycle(0, '(1 2 3 4)(5 6 7 8)')
  s = await editorState()
  ok('Ω = pointSet(8) 收下了', (s?.summary ?? '').startsWith('点集 8 个点'), s?.summary)
  ok('  读数截断用 ASCII 三个点（不是省略号）', (s?.summary ?? '').includes('...'), s?.summary)
  ok('  8 个点上两个 4-循环 -> 2 个轨道 - 忠实', !!s && s.cls.includes('ok') && s.check.includes('2 个轨道') && s.check.includes('忠实'), s?.check)

  /* ── `labeledSet(a, b, c)`：标号，且记号里就能写标号 ── */
  await setOmega('labeledSet(a, b, c)')
  s = await editorState()
  ok('Ω = labeledSet(a, b, c) 收下了', s?.summary === '点集 3 个点：a b c', s?.summary)
  await setCycle(0, '(a b)')
  s = await editorState()
  ok('像写标号 (a b) 认得出来（不是"不是点集里的点"）', !!s && !s.check.includes('不是点集里的点'), s?.check)
  ok('  状态说是同态', !!s && s.cls.includes('ok'), s?.check)
  await scanPlain('编辑器（Ω = labeledSet(a,b,c)）')
  await page.screenshot({ path: '../../docs/assets/u53-omega-editor.png' })

  /* ── 一键挑画布上的集合 ── */
  await page.click('.action-builder .ab-set-chip:text-is("X")')
  await page.waitForTimeout(400)
  s = await editorState()
  ok('点一下 X -> Ω 框里填的是它的名字', s?.omega === 'X', String(s?.omega))
  ok('  读数给出 3 个标号', s?.summary === '点集 3 个点：a b c', s?.summary)
  ok('  X 那个按钮亮着（.on）', (await page.locator('.action-builder .ab-set-chip.on:text-is("X")').count()) === 1)

  /* ── 认不出来的话 -> 指名报错 ── */
  await setOmega('abc')
  s = await editorState()
  ok('乱填 -> bad 且指名', !!s && s.cls.includes('bad') && s.check.includes('abc'), s?.check)
  ok('  Ω 输入框也标红', (s?.omegaCls ?? '').includes('bad'), s?.omegaCls)
  await scanPlain('编辑器（Ω 认不出来）')
}

/* ══════════════════════════════════════════════════════════
 * ④ 确认后：作用线连到那个集合节点，**不另造**一个 Ω
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ④ Ω 是画布上已有的集合 -> 不另造节点，作用线连过去 ==')
await setOmega('X')
await setCycle(0, '(a b)')
{
  const s = await editorState()
  ok('状态是同态', !!s && s.cls.includes('ok'), s?.check)
  const before = await nodeIds()
  await page.fill('.action-builder .mb-name', 'A')
  await page.waitForTimeout(200)
  await clickEl('.action-builder .mb-foot .mb-btn.primary')
  await page.waitForTimeout(620)
  const after = await nodeIds()

  ok('编辑器自己关掉了', (await page.locator('.action-builder').count()) === 0)
  ok('没有求值失败的行', (await errRows()).length === 0, JSON.stringify(await errRows()))
  ok('节点**一个没多**（不另造 Ω 节点）', after.length === before.length, `${before.join(',')} -> ${after.join(',')}`)
  ok('  也没有冒出一个带 /Omega 的新节点', !after.some((id) => id.includes('/')), after.join(','))
  ok('  作用群 G 与作为 Ω 的 X 都还在', after.includes('G') && after.includes('X'), after.join(','))

  const edges = await canvasEdges()
  const act = edges.find((e) => e.objectId === 'A')
  ok('多了一条**属于 A 的边**（`G ↷ X`）', !!act, JSON.stringify(edges))
  ok('  标签是作用记号', act?.label === '\\curvearrowright', String(act?.label))
  ok('  它可点选（有命中层）', act?.hasHit === true, JSON.stringify(act))
  await page.screenshot({ path: '../../docs/assets/u53-omega-created.png' })

  // 提交后焦点落在这个作用上 —— 直接读信息面板
  const rows = await inspRows()
  ok('信息面板认得它是「自定义作用」', rows.some((r) => r.k === '类型' && r.v === '自定义作用'), JSON.stringify(rows))
  ok('  有「核」这一行', rows.some((r) => r.k === '核'), JSON.stringify(rows))
  ok('  Omega 是 3 个点', rows.some((r) => r.k === 'Omega' && r.v.includes('3')), JSON.stringify(rows))
}

/* ══════════════════════════════════════════════════════════
 * ⑤ 产出的是一等作用值：下游接着算（按标号引用点）
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ⑤ 下游：轨道 / 稳定子 在自由点集上照样算 ==')
{
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  ok('建 `O = orbits(A, a)`', await addLine('O', 'orbits(A, a)'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(360)
  ok('建 `S = stabilizer(A, a)`', await addLine('S', 'stabilizer(A, a)'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(420)
  ok('两条都没报错', (await errRows()).length === 0, JSON.stringify(await errRows()))

  const ids = await nodeIds()
  ok('轨道与稳定子都上了画布', ids.includes('O') && ids.includes('S'), ids.join(','))
  // 手算：`(a b)` 把 a 送到 b、b 送到 a ⇒ 轨道 = {a, b}，2 个点
  ok('点得中轨道 O', await selectNode('O'))
  {
    const rows = await inspRows()
    ok('  轨道是 2 个点（{a, b}）', rows.some((r) => r.k === '基数' && r.v === '2'), JSON.stringify(rows))
  }
  ok('点得中稳定子 S', await selectNode('S'))
  {
    const rows = await inspRows()
    // 手算：C_4 上 a -> (a b)，那 a^2 -> 恒等 ⇒ Stab(a) = {e, a^2}（2 阶）
    ok('  稳定子是 2 阶（{e, a^2}）', rows.some((r) => r.k === '阶' && r.v === '|G|=2'), JSON.stringify(rows))
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await scanPlain('下游算完之后的整页纯文本面')
}

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
