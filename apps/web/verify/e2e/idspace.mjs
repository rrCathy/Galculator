/**
 * 走查：**跨群元素表示的分诊与翻译**（2026-09-29，用户实测反馈 ①② 及同日下午的
 * 「商群功能问题好多……S4里有几个V4？还需要选？」）。
 *
 * 用户原话直接变成判据：
 *   - "A4 和 V4 的积集，你识别出和 C1 同构，这有点荒谬了"
 *     -> U29：积集不许**静默**产出节点（要么算对，要么停下说清）；
 *        U32：加了集合运算的对齐之后，`A_4 · V_4` 应当**直接算对**（= A_4），
 *        独立构造的 V_4 不再让交 / 并 / 差 / 积集给出空集或怪结果。
 *   - "我输入 Q = K/M 显示『M 不是 K 的子群，要求含单位元且乘法封闭』"
 *     -> 不许再用"不是子群"这句（数学上错的措辞），要说"元素不在同一个群里"
 *   - "S4里有几个V4？还需要选？"
 *     -> 商只认正规子群：S₄ 的 4 个 Klein 子群里正规的只有一个，
 *        直接翻译过去当分母，**不许**让用户"从 N 个里挑一个"
 *   - 没有正规候选（S₄ 的 9 个 C₂）与真有多个候选时，状态行都要说清
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/idspace.mjs`
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

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

/* ── 输入辅助 ─────────────────────────────────────────── */

const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(220)
  }
}
const status = () =>
  page.evaluate(() => document.querySelector('.composer-status')?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
/** 只填不提交：用来读**预览**（提交后输入框清空，状态行就换了内容） */
const typeExpr = async (expr) => {
  await ensureCard()
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(240)
}
const addLine = async (name, expr) => {
  await ensureCard()
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(200)
  const btn = page.locator('.composer-orb .composer-row button')
  if (await btn.isDisabled()) return false
  await btn.click()
  await page.waitForTimeout(340)
  return true
}
const nodeIds = () =>
  page.evaluate(() => [...document.querySelectorAll('g.gnode')].map((g) => g.getAttribute('data-id')))
const ensureDocks = async () => {
  for (const n of ['对象', '操作']) {
    const has = await page.evaluate(
      (x) =>
        [...document.querySelectorAll('.dock')].some(
          (d) => d.querySelector('.dock-title')?.textContent?.trim() === x && d.querySelector('.dock-body'),
        ),
      n,
    )
    if (!has) {
      await page.locator(`.dock-toggle:has-text("${n}")`).first().click()
      await page.waitForTimeout(180)
    }
  }
}
const clickRow = async (id) => {
  await ensureDocks()
  return page.evaluate((w) => {
    const r = [...document.querySelectorAll('.dock-topleft .row-click')]
    const h = r.find((x) => x.querySelector('.row-name')?.textContent?.trim() === w)
    h?.click()
    return !!h
  }, id)
}
/**
 * 展开信息面板的第 `name` 节 —— **幂等**（U45 起标题行是**开关**，不是 tab）。
 *
 * 从前这里直接 `.click()`，在 tab 模型下"点=切过去"是幂等的；换成手风琴之后
 * 再点同一节就是**收起** —— 走查里第二次 `openTab('元素')` 于是把表收没了
 * （`rows=0`）。助手要的是"保证它开着"，所以先看 `on` 再决定点不点。
 */
const openTab = async (name) => {
  await page.evaluate((n) => {
    const h = [...document.querySelectorAll('.info-sec-head')].find(
      (b) => b.querySelector('.info-sec-label')?.textContent.trim() === n,
    )
    if (h && !h.classList.contains('on')) h.click()
  }, name)
  await page.waitForTimeout(360)
}
/**
 * 元素表的**行数**。
 *
 * 2026-10-01 起元素表是**逐元素一行**（v3.2 曾按共轭类折成 5 行，被用户否掉：
 * 「元素列表你按共轭类收起来是什么意思？……连单个元素信息都看不了了。」）。
 * 所以 `tr` 条数**就是群的阶**。
 */
const tableRows = () =>
  page.evaluate(() => document.querySelectorAll('.etable tbody tr[data-el]').length)

/* ── ①② 两个独立构造的群：积集停下、商直接翻译 ───────── */

console.log('== idspace ：跨群元素表示的分诊与翻译 ==')

ok('A = A_4 提交', await addLine('A', 'A_4'))
ok('V = V_4（独立构造）提交', await addLine('V', 'V_4'))

// 积集：A_4 · 独立 V_4 —— 现在**真算对**（V_4 翻译成 A_4 里唯一的 Klein，乘积 = A_4）。
// 这条走查从前钉的是"必须停下"（U29）；U32 加了集合运算的对齐之后，它应该直接算出来。
await typeExpr('A \\cdot V')
const mulStatus = await status()
ok('积集不再是红字（预览成功）', !mulStatus.includes('不在'), mulStatus)
ok(
  '积集写明"翻译过"并给出配方',
  mulStatus.includes('自动取') && mulStatus.includes('闭包(A, (12)(34), (13)(24))'),
  mulStatus,
)
ok('|A_4 · V_4| = 12', mulStatus.includes('12'), mulStatus)

ok('P = A \\cdot V 提交', await addLine('P', 'A \\cdot V'))
ok('点得中 P 这一行', await clickRow('P'))
await openTab('元素')
const mulRows = await tableRows()
ok(
  '积集结果的元素表：12 行（就是 A_4 的 12 个元素）',
  mulRows === 12,
  `rows=${mulRows}`,
)

// 交：从前**静默给空集**（id 空间不通），现在对齐后是 A_4 里那个 Klein
ok('I = 交(A, V) 提交', await addLine('I', '交(A, V)'))
ok('点得中 I 这一行', await clickRow('I'))
await openTab('元素')
const capRows = await tableRows()
ok(
  '交的结果：4 行（A_4 ∩ V_4 = Klein 的 4 个元素）',
  capRows === 4,
  `rows=${capRows}`,
)

await page.screenshot({ path: '../../docs/assets/u32-setops.png' })

// 记号串号（U33）：`C_3 ∩ C_7` 从前给"3 个元素的假交集"，现在报"没有共同的母群"并指路
ok('K = C_3 提交', await addLine('K3', 'C_3'))
ok('M = C_7 提交', await addLine('M7', 'C_7'))
await typeExpr('交(K3, M7)')
const crossWorld = await status()
ok(
  'C_3 ∩ C_7 不再给假交集（报"没有共同的母群"）',
  crossWorld.includes('共同的母群'),
  crossWorld,
)
ok('并指出路（先放进共同的大群）', crossWorld.includes('闭包'), crossWorld)

// 画布上下文（U34）：把 F₂₁ 摆上，同样的 `积集(C_3, C_7)` 就不再需要闭包了
ok('F = F_21 提交', await addLine('F', 'F_21'))
await typeExpr('积集(K3, M7)')
const withCanvas = await status()
ok('F₂₁ 摆着时：`积集(C_3, C_7)` 直接算出来（21 阶）', withCanvas.includes('21'), withCanvas)
ok('披露写明取的是 F 里的子群（候选结果相同）', withCanvas.includes('结果相同'), withCanvas)

// 商：A_4 里与 V_4 同构的正规子群**恰有一个** -> 直接翻译（S₄/V₄ 的同类场景）
await typeExpr('A / V')
const qStatus = await status()
ok('商不再问"要用哪一个"', !qStatus.includes('指明'), qStatus)
ok(
  '商自动取唯一同构的正规子群（配方写出来）',
  qStatus.includes('自动取') && qStatus.includes('闭包(A, (12)(34), (13)(24))'),
  qStatus,
)
ok('商的预览是成功的：|G/N| = 3', qStatus.includes('|G/N| = 3'), qStatus)

ok('Q0 = A / V 提交', await addLine('Q0', 'A / V'))
ok('点得中 Q0 这一行', await clickRow('Q0'))
await openTab('元素')
const rows = await tableRows()
ok('|A_4 / V_4| = 3（手算 12 / 4）', rows === 3, `rows=${rows}`)

// 没有正规候选时照实说：A_4 的 3 个 C_2 全不正规
ok('C = C_2 提交', await addLine('C', 'C_2'))
await typeExpr('A / C')
const noNormal = await status()
ok('A_4 里 3 个 C_2 都不正规 -> 照实说', noNormal.includes('没有一个是正规子群'), noNormal)

/* ── ③ 配方照旧可照抄，且真能算对 ───────────────────── */

ok('K = 闭包(A, (12)(34), (13)(24)) 提交', await addLine('K', '闭包(A, (12)(34), (13)(24))'))
ok('Q = A / K 提交', await addLine('Q', 'A / K'))
ok('点得中 Q 这一行', await clickRow('Q'))
await openTab('元素')
const rowsManual = await tableRows()
ok('照抄出来的那条路也算得对：3 个元素', rowsManual === 3, `rows=${rowsManual}`)

await page.screenshot({ path: '../../docs/assets/u30-quotient-auto.png' })

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
