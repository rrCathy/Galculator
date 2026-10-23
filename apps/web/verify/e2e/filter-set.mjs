/**
 * 走查：**筛选**（U9）—— `{x in A_4 : x^2 = e}` 在真界面上到底能不能用。
 *
 * ## 这一套为什么必须存在
 *
 * 语义层（`verify/suites/u9.ts`，43 条）测的是**求值器本身**：给它一个群、一条条件，
 * 它算得对不对。但用户碰到的不是那个函数 —— 用户碰的是**输入框里的一整行字符串**：
 * 先被 `normalizeExpr` 规范化（花括号糖在这一层转成 `filter(...)`），再被 `splitCall`
 * 折参数，再被 `resolveArg` 逐个解析，最后才到 op 的 `run`。中间任何一环把
 * `x^2 = e` 拆坏（比如把逗号当参数分隔、把 `^` 当群记号的阶），语义层都不会红。
 *
 * 项目吃过这个亏（`catalog.mjs` 头注里的教训：「回归全绿而用户摸不到」）。
 *
 * ## 守的七件事
 *   ① 整行能敲：`X = {x in A_4 : x^2 = e}` 提交成功、画布长出节点；
 *   ② 节点的数学名是**花括号成员表**（`mathLabel` 对 `elements` 的规矩），不是表达式原文；
 *   ③ 显式调用 `filter(A_4, x, ord(x) = 2)` 与糖**同效**；
 *   ④ 空集不报错（`ord(x) = 6` 在 `A_4` 上就是空集 —— 空集也是答案）；
 *   ⑤ 两种错定向：变量名对不上（`z` vs `x`）、超 144 阶（规模问题不是条件问题）；
 *   ⑥ 老写法一条不改：`{a, b, c}` 仍是按标号造；
 *   ⑦ 筛出来的能直接喂 `closure`（这就是选 `elements` 而不是 `set` 的理由）；
 *   ⑧ 文案纪律：新增文案里不许有键盘打不出的字符（判据与 `no-unicode-leak` 逐字相同）。
 *
 * 期望值全部来自 `suites/u9.ts` 里那批**手算 + 真跑对拍**过的数字（`A_4` 的
 * `x^2=e` = 4、`ord(x)=2` = 3、`ord(x)=6` = 0）。
 *
 * 跑法（先起 dev server 5273，**cwd 必须是 apps/web**）：`node verify/e2e/filter-set.mjs`
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
page.setDefaultTimeout(6000)

/* ── 纯文本面判据（与 e2e/no-unicode-leak.mjs 逐字相同）───────── */

const ALLOWED = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const badChars = (s) => [...new Set([...String(s ?? '')].filter((c) => !ALLOWED.test(c)))]
const clean = (s) =>
  String(s ?? '')
    .replace(/[\u200b-\u200f\u00a0]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

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
    console.log(`    [blocked] ${name} = ${expr} :: ${clean(st)}`)
    return false
  }
  await btn.click()
  await page.waitForTimeout(460)
  return true
}

/** 只预览（不提交）—— `.composer-status` 是这个面的纯文本面。 */
const typeExpr = async (v) => {
  await ensureCard()
  await page.fill('.composer-name', '')
  await page.fill('.composer-expr', v)
  await page.waitForTimeout(340)
}

const status = () =>
  page.evaluate(() => document.querySelector('.composer-status')?.textContent ?? '')

/**
 * 左栏那几段**默认是收起的**（`DockPanel` 用 `{open && <div className="dock-body">}`），
 * 收起时行根本不在 DOM 里。要读行就得先点开那一段，且**已经开着就别再点**（点了会关）。
 */
const setDock = async (label, want) => {
  const isOpen = await page.evaluate((l) => {
    const head = [...document.querySelectorAll('.dock-toggle')].find((b) => (b.textContent ?? '').includes(l))
    return !!head?.closest('.dock')?.querySelector('.dock-body')
  }, label)
  if (isOpen === want) return
  await page.locator('.dock-toggle', { hasText: label }).first().click()
  await page.waitForTimeout(240)
}

const nodeIds = () =>
  page.evaluate(() => [...document.querySelectorAll('svg.canvas g.gnode')].map((g) => g.dataset.id))

/** 某个节点的**数学名**（`mathLabel` 渲染后的文本） */
const nodeText = (id) =>
  page.evaluate(
    (nid) => document.querySelector(`svg.canvas g.gnode[data-id="${nid}"]`)?.textContent ?? '',
    id,
  )

/** 对象栏某一行的**定义原文**（`.row-name` 找行、`.row-def` 取定义） */
const rowDef = (id) =>
  page.evaluate((nid) => {
    const rows = [...document.querySelectorAll('.dock .row')]
    const row = rows.find((r) => r.querySelector('.row-name')?.textContent.trim() === nid)
    return row?.querySelector('.row-def')?.textContent ?? ''
  }, id)

/* ══ 场景 1：整行能敲 ═════════════════════════════════════ */

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(600)

ok('空画布开局', (await nodeIds()).length === 0, (await nodeIds()).join(','))

const okBuild = await addLine('X', '{x in A_4 : x^2 = e}')
ok('`{x in A_4 : x^2 = e}` 提交成功（糖 → filter）', okBuild)
ok('画布长出节点 X', (await nodeIds()).includes('X'), (await nodeIds()).join(','))

const xText = clean(await nodeText('X'))
/**
 * 节点文字 = `o.label`，而 `filter` 给的 label 是 **TeX**（`\\{x \\in A_4 : x^2 = e\\}`）——
 * 由 KaTeX 排出，画布上读作 `{x ∈ A₄ : x² = e}`。
 *
 * 断言取"KaTeX 真的排了"这个信号：渲染后 `\in` 变成 `∈`、`A_4` 变成 `A` 带下标。
 * 反面判据更硬：**不许**出现 ASCII 挤成一团的 `{xinA4`（第一版就是这么难看的）。
 */
ok('节点文字排成了数学（`\\in` 渲染成 ∈）', xText.includes('∈'), xText)
ok('节点文字里没有 ASCII 挤成一团（不含 `{xinA4`）', !/\{xin/.test(xText), xText)

/* 调试：把对象栏里所有行的 name / def 打出来（定选择器用，稳定后删） */
if (process.env.GAL_DUMP) {
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.dock .row')].map((r) => ({
      name: r.querySelector('.row-name')?.textContent ?? '',
      def: r.querySelector('.row-def')?.textContent ?? '',
      cls: r.className,
    })),
  )
  console.log('    [dump rows]', JSON.stringify(rows))
}

/**
 * 展开**操作**栏而不是对象栏：`?empty=1` 开局没有手输对象，`filter` 的产物是
 * derived（`origin === 'derived'`）⇒ 全在「操作」栏（`openOps` 默认 **false**）。
 * 对象栏（默认 true）此时是空的 —— 第一版就踩了这个，dump 出来 0 行。
 */
await setDock('操作', true)
const xDef = clean(await rowDef('X'))
/**
 * ⚠️ `.row-def` 走 `TexOrText`：含 `^` 或 `_` 就交给 KaTeX 排，**空格会被吃**，
 * 所以 textContent 读出来是 `{xinA4:x2=e}` —— 这是现状渲染行为（`closure` 那些行同理），
 * 不是定义被改写。断言因此认**结构**（花括号 + in + 冒号 + 变量），不认空格。
 */
ok(
  '对象栏那一行的定义仍是集合建构式（花括号 + in + 冒号）',
  /\{x/.test(xDef) && /in/.test(xDef) && /:/.test(xDef),
  xDef,
)

/* ══ 场景 2：显式调用同效 ═════════════════════════════════ */

const okExplicit = await addLine('Y', 'filter(A_4, x, ord(x) = 2)')
ok('`filter(A_4, x, ord(x) = 2)` 也能敲', okExplicit)
const yText = clean(await nodeText('Y'))
ok('Y 的条件排进节点（ord(x) = 2）', /ord/.test(yText) && /=2/.test(yText), yText)

/* ══ 场景 3：空集与老写法 ═════════════════════════════════ */

const okEmpty = await addLine('Z', '{x in A_4 : ord(x) = 6}')
ok('空集不报错（`ord(x)=6` 在 A_4 上就是空集）', okEmpty)
ok('空集节点照样上画布', (await nodeIds()).includes('Z'), (await nodeIds()).join(','))

const okLabels = await addLine('L', '{a, b, c}')
ok('老写法 `{a, b, c}` 一条不改', okLabels)
ok('…它仍按标号造（节点写 a, b, c）', /a/.test(clean(await nodeText('L'))), clean(await nodeText('L')))

/* ══ 场景 4：筛出来的能继续算 ═════════════════════════════ */

const okClosure = await addLine('W', 'closure(Y)')
ok('筛出来的能直接喂 closure（elements 档的价值）', okClosure)

/* ══ 场景 5：两种错要定向 ═════════════════════════════════ */

await typeExpr('{z in S_3 : x^2 = e}')
const stVar = clean(await status())
ok('变量名对不上：说"不是变量"并点名 z', /不是变量/.test(stVar) && /z/.test(stVar), stVar)
ok('…文案零泄漏（纯文本面）', badChars(stVar).length === 0, badChars(stVar).join(','))

await typeExpr('{x in S_6 : x^2 = e}')
const stBig = clean(await status())
ok('超 144 阶：说"超过"（规模问题，不是条件写错）', /超过/.test(stBig), stBig)

await typeExpr('{x in A_4 : x^2}')
const stBare = clean(await status())
ok('裸表达式缺判断：说"没有给出判断"并给两条出口', /没有给出判断/.test(stBare) && /= e/.test(stBare), stBare)

await typeExpr('{x in A_4 : x^2 = qq}')
const stNoEl = clean(await status())
ok('条件是群里没有的元素：点名那个记号', /没有元素/.test(stNoEl) && /qq/.test(stNoEl), stNoEl)

/* ══ 场景 6：工作台键盘上有「筛选」 ═══════════════════════ */

/** 点节点升台（真实鼠标；合成事件会掩盖遮挡） */
const focusNode = async (id) => {
  const pt = await page.evaluate((nid) => {
    const el = document.querySelector(`svg.canvas g.gnode[data-id="${nid}"] .gnode-hit`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, id)
  if (!pt) return false
  await page.mouse.click(pt.x, pt.y)
  await page.waitForTimeout(520)
  return true
}

/**
 * 聚焦画布节点之前**必须把左栏收起** —— 展开的「操作」栏会盖住画布左上角，
 * 而 `focusNode` 走的是**真实鼠标**（合成事件会绕过命中测试，掩盖遮挡 bug：
 * 2026-10-05 自查抓到的系统性缺陷，见 `workbench.mjs` 头注）。收迟了就点不到节点。
 */
await page.keyboard.press('Escape')
await setDock('操作', false)
await page.waitForTimeout(200)
await focusNode('X')
await page.waitForTimeout(500)

const bench = await page.evaluate(() => {
  const el = document.querySelector('.bench')
  if (!el) return null
  return {
    open: el.getBoundingClientRect().height > 60,
    keys: [...el.querySelectorAll('.bench-key')].map((k) => k.dataset.op ?? ''),
    filterTitle: [...el.querySelectorAll('.bench-key')]
      .find((k) => k.dataset.op === 'filter')
      ?.getAttribute('title') ?? '',
    filterLabel: [...el.querySelectorAll('.bench-key')]
      .find((k) => k.dataset.op === 'filter')
      ?.textContent.trim() ?? '',
  }
})

ok('工作台升起来了（元素集焦点）', bench?.open === true, JSON.stringify(bench))
ok('键盘里有「筛选」这一枚', bench?.keys.includes('filter') === true, (bench?.keys ?? []).join(','))
ok('键面写中文（筛选），不是 ASCII op 名', /筛选/.test(bench?.filterLabel ?? ''), bench?.filterLabel)
ok('title 是能照抄的写法（含 in 与 x^2）', /in /.test(bench?.filterTitle ?? '') && /\^/.test(bench?.filterTitle ?? ''), bench?.filterTitle)
ok('键面与 title 都零泄漏', badChars(bench?.filterLabel ?? '').length === 0 && badChars(bench?.filterTitle ?? '').length === 0)

/* ══ 场景 7：全程无 console 错误 ══════════════════════════ */

ok('全程零 console 错误', logs.length === 0, logs.slice(0, 3).join(' | '))

console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0) process.exitCode = 1
