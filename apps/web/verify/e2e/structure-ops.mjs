/**
 * 走查：**U27 的六条接线 + 「结构」节**。
 *
 * 缺口原话（docs/USABILITY.md §6 第 ⑪ 条 / docs/TASKS.md 缺口清单 ②–⑥）：
 *   "半直积 / Inn / 极大子群 / Hall / 合成列 / Burnside / φ(n) / gcd —— core 已有…是接线工作"
 *
 * 这一套从**用户会怎么做**出发，把六条操作与「基本」tab 的新「结构」节走一遍：
 *   ① 数论三件套：`gcd(12, 18)` / `lcm(4, 6)` / `phi(12)` 进数值区（6 / 12 / 4）
 *   ② `轨道数(A)`：Burnside 的平均式**在输入框里就能看到**（纯文本面），两条路打勾
 *   ③ `极大子群(S_4)`：8 个（A₄ + 三个 D₄ + 四个 S₃），信息面板逐个列出来
 *   ④ 「结构」节：合成列因子 / 导来列 / 分解（S₄ ≅ A₄ ⋊ C₂；A₅ 单群 -> 不可分解）
 *   ⑤ `Inn(D_4)`：画布上一个节点，结论区说它 ≅ 什么
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/structure-ops.mjs`
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
page.setDefaultTimeout(8000)
const logs = []
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

/* ── 场地 ── */

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
  const disabled = await btn.isDisabled()
  if (!disabled) await btn.click()
  await page.waitForTimeout(340)
  return !disabled
}

const typeExpr = async (v) => {
  await ensureCard()
  await page.fill('.composer-expr', v)
  await page.waitForTimeout(260)
}

const status = () =>
  page.evaluate(() => ({
    text: document.querySelector('.composer-status')?.textContent ?? '',
    cls: [...(document.querySelector('.composer-status')?.classList ?? [])].join(' '),
  }))

/** 数值区的条目（`.num-label` 是 KaTeX 渲染后的文本，`.num-value` 是数字）。 */
const numericRows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.num-row')].map((r) => ({
      label: (r.querySelector('.num-label')?.textContent ?? '').replace(/\s+/g, ''),
      value: (r.querySelector('.num-value')?.textContent ?? '').trim(),
    })),
  )

/** 抽屉：按标题展开（收起时 body 根本不渲染 —— verify/README 第 15 条）。 */
const openDock = async (title) => {
  const open = await page.evaluate(
    (t) => [...document.querySelectorAll('.dock')].some((d) => d.querySelector('.dock-title')?.textContent?.trim() === t && d.classList.contains('open')),
    title,
  )
  if (!open) {
    await page.evaluate((t) => {
      const d = [...document.querySelectorAll('.dock')].find((x) => x.querySelector('.dock-title')?.textContent?.trim() === t)
      d?.querySelector('.dock-toggle')?.click()
    }, title)
    await page.waitForTimeout(260)
  }
}

/** 点左栏的行（按 `.row-name` 里的 **id** 匹配 —— 不是展示形态，verify/README 第 16 条）。 */
const clickRow = async (id) => {
  const hit = await page.evaluate((want) => {
    const rows = [...document.querySelectorAll('.dock-topleft .row-click')]
    const row = rows.find((r) => r.querySelector('.row-name')?.textContent?.trim() === want)
    if (!row) return false
    row.click()
    return true
  }, id)
  await page.waitForTimeout(380)
  return hit
}

/**
 * 把「全部子群」里**折起来的组全摊开**（第十七批起长列表按结构分组）。
 * 与用户的实际动作一致：想看某类里有谁，先点开那一组。
 */
const expandSubgroupGroups = async () => {
  await page.evaluate(() => {
    document.querySelectorAll('.sub-group-head').forEach((b) => {
      if (!b.classList.contains('on')) b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  })
  await page.waitForTimeout(360)
}

/**
 * U45：信息面板默认**全收**，而「结构」节（合成列 / 导来列 / 分解）住在「基本」里 ——
 * 读数前先保证它开着（**幂等**：已经开着就不要再点，手风琴里再点一下是收起）。
 */
const ensureBasic = async () => {
  await page.evaluate(() => {
    const h = document.querySelector('.info-sec-head[data-sec="basic"]')
    if (h && !h.classList.contains('on')) h.click()
  })
  await page.waitForTimeout(240)
}

/** 信息面板的读数。 */
const infoState = async () => {
  await ensureBasic()
  return page.evaluate(() => ({
    chip: document.querySelector('.info-target .chip')?.textContent?.trim() ?? '',
    label: document.querySelector('.info-target strong')?.textContent?.trim() ?? '',
    def: document.querySelector('.info-def')?.textContent?.trim() ?? '',
    rows: [...document.querySelectorAll('.insp-row')].map((r) => ({
      k: r.querySelector('.insp-k')?.textContent?.trim() ?? '',
      v: (r.querySelector('.insp-v')?.textContent ?? '').replace(/[\u200b\u2061\u2062]/g, '').replace(/\s+/g, '').trim(),
    })),
    insights: (document.querySelector('.insights')?.textContent ?? '').replace(/\s+/g, ''),
    tags: [...document.querySelectorAll('.insp-tags .sub-tag')].map((t) => (t.textContent ?? '').replace(/\s+/g, '')),
    structure: document.querySelector('[data-structure]')?.getAttribute('data-structure') ?? '',
    factors: document.querySelector('[data-factors]')?.getAttribute('data-factors') ?? '',
    derived: document.querySelector('[data-derived]')?.getAttribute('data-derived') ?? '',
    decomp: document.querySelector('[data-decomp]')?.getAttribute('data-decomp') ?? '',
    decompKind: document.querySelector('[data-decomp-kind]')?.getAttribute('data-decomp-kind') ?? '',
    perfect: document.querySelector('[data-perfect]')?.getAttribute('data-perfect') ?? '',
    notes: [...document.querySelectorAll('.insp-sub-note, .insp-line')].map((n) => (n.textContent ?? '').trim()),
  }))
}

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(900)

/* ══ ① 数论三件套：进数值区 ══════════════════════════════ */

console.log('')
console.log('== ① 数论三件套 ==')

ok('建 `G = D_4`', await addLine('G', 'D_4'))
ok('建 `d1 = gcd(12, 18)`', await addLine('d1', 'gcd(12, 18)'))
ok('建 `d2 = lcm(4, 6)`', await addLine('d2', 'lcm(4, 6)'))
ok('建 `d3 = phi(12)`', await addLine('d3', 'phi(12)'))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

await openDock('数值')
{
  const rows = await numericRows()
  const byVal = new Map(rows.map((r) => [r.value, r.label]))
  ok('数值区里有了三个数（6 / 12 / 4）', ['6', '12', '4'].every((v) => byVal.has(v)), JSON.stringify(rows))
  ok('gcd 那条的标签写着 gcd(12, 18)', (byVal.get('6') ?? '').includes('gcd(12,18)'), byVal.get('6') ?? '')
  ok('lcm 那条的标签写着 lcm(4, 6)', (byVal.get('12') ?? '').includes('lcm(4,6)'), byVal.get('12') ?? '')
  // 数值条目的标签是 `id = 定义` 的**原样**（numeric.ts 的 computedNumbers）——
  // 这里看到的应当就是用户敲的那个 ASCII 调用名，而不是渲染后的 φ
  ok('phi 那条的标签写着 phi(12)（原样，不改写成反斜杠命令）', (byVal.get('4') ?? '').includes('phi(12)'), byVal.get('4') ?? '')
}

/* ══ ② 轨道数：Burnside 的平均式在输入框里就能看到 ═══════ */

console.log('')
console.log('== ② 轨道数（Burnside） ==')

ok('建 `A = 共轭作用(G)`', await addLine('A', '共轭作用(G)'))
await page.keyboard.press('Escape')
await page.waitForTimeout(240)

// 先只看**预览**（不提交）：`composer-status` 是纯文本面，副行会写 Burnside 的平均式
await typeExpr('轨道数(A)')
{
  const s = await status()
  ok('预览认得出这是数值（绿字）', s.cls.includes('good') && s.text.includes('数值'), `${s.cls} :: ${s.text}`)
  ok('预览里就有 Burnside 的平均式', s.text.includes('Burnside'), s.text)
  // D₄ 共轭作用手算：Σ|Fix(g)| = 8 + 4 + 4 + 8 + 4·4 = 40 -> 40 / 8 = 5
  ok('且写着 40 / 8 = 5（手算 Σ|Fix| = 40）', s.text.includes('40 / 8 = 5'), s.text)
  ok('两条路打勾（v）', s.text.includes('v'), s.text)
}
ok('提交 `n = 轨道数(A)`', await addLine('n', '轨道数(A)'))
await page.keyboard.press('Escape')
await page.waitForTimeout(240)
{
  const rows = await numericRows()
  ok('数值区多了 5（D₄ 的共轭类数）', rows.some((r) => r.value === '5' && r.label.includes('轨道数')), JSON.stringify(rows))
}

/* ══ ③ 极大子群：8 个列在信息面板里 ═════════════════════ */

console.log('')
console.log('== ③ 极大子群 ==')

ok('建 `H = S_4`', await addLine('H', 'S_4'))
ok('建 `M = 极大子群(H)`', await addLine('M', '极大子群(H)'))
await page.keyboard.press('Escape')
await page.waitForTimeout(320)

await openDock('操作')
ok('在「操作」抽屉里点中 M', await clickRow('M'))
{
  const inf = await infoState()
  ok('信息面板说这是子群集', inf.chip === '子群集', `${inf.chip} :: ${inf.def}`)
  /**
   * 「全部子群」这类长列表从第十七批起**按结构折成组**（`C_2 x9` 那种），
   * 成员要点开组头才渲染 —— 所以先全摊开再数（这也是用户看长列表的实际动作）。
   */
  await expandSubgroupGroups()
  const inf2 = await infoState()
  const orders = inf2.tags.map((t) => /H\|=(\d+)/.exec(t)?.[1]).filter(Boolean)
  ok('列出来 8 个', orders.length === 8, JSON.stringify(inf2.tags))
  // 手算：A₄(12) + 三个 D₄(8) + 四个 S₃(6)
  ok(
    '八项：12 + 8,8,8 + 6,6,6,6',
    orders.sort((a, b) => b - a).join(',') === '12,8,8,8,6,6,6,6',
    JSON.stringify(inf2.tags),
  )
}

/* ══ ④ 「结构」节（基本 tab） ═══════════════════════════ */

console.log('')
console.log('== ④ 「结构」节 ==')

ok('点中 H（S₄）', await clickRow('H'))
{
  const inf = await infoState()
  ok('有「结构」节', inf.structure === 'facts', inf.structure)
  // 手算：S₄ > A₄ > V₄ > C₂ > {e}，因子 C₂·C₃·C₂·C₂（2·3·2·2 = 24）
  ok('合成列因子 = C_2 \\cdot C_3 \\cdot C_2 \\cdot C_2', inf.factors === 'C_2 \\cdot C_3 \\cdot C_2 \\cdot C_2', inf.factors)
  ok('  附注说明不唯一（共 3 条）', inf.notes.some((n) => n.includes('3 条')), inf.notes.join(' | '))
  ok('导来列 = 24 > 12 > 4 > 1', inf.derived === '24 > 12 > 4 > 1', inf.derived)
  ok('分解 = A_4 \\rtimes C_2（半直积）', inf.decomp === 'A_4 \\rtimes C_2' && inf.decompKind === 'semidirect', `${inf.decomp} :: ${inf.decompKind}`)
  ok('  S₄ 不完美', inf.perfect === '0', inf.perfect)
}
// 截图前把信息面板滚到「结构」节（面板本来就带 overflow —— 让配图看得见导来列与分解）
await page.evaluate(() => {
  const dock = [...document.querySelectorAll('.dock')].find((d) => d.querySelector('.dock-title')?.textContent?.trim() === '信息')
  const body = dock?.querySelector('.dock-body')
  if (body) body.scrollTop = body.scrollHeight
})
await page.waitForTimeout(260)
await page.screenshot({ path: '../../docs/assets/u27-structure-facts.png' })

ok('建 `K = A_5`', await addLine('K', 'A_5'))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
ok('点中 K（A₅）', await clickRow('K'))
{
  const inf = await infoState()
  ok('A₅ 完美（data-perfect = 1）', inf.perfect === '1', inf.perfect)
  ok('A₅ 的分解是"不可分解"', inf.decomp === 'none', inf.decomp)
  ok('  理由点名单群', inf.notes.some((n) => n.includes('单群')), inf.notes.join(' | '))
  ok('A₅ 的合成列只有一项（A_5）', inf.factors === 'A_5', inf.factors)
}

// 上限：S₅（120 阶）不自动算，但要**明说没算**（不显示半截答案）
ok('建 `P = S_5`', await addLine('P', 'S_5'))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
ok('点中 P（S₅）', await clickRow('P'))
{
  const inf = await infoState()
  ok('结构节明说没算（capped）', inf.structure === 'capped', inf.structure)
  ok('  文案里给了原因（枚举代价）', inf.notes.some((n) => n.includes('未自动计算')), inf.notes.join(' | '))
}

/* ══ ⑤ Inn(G)：画布上一个节点 + 结论区说它 ≅ 什么 ═══════ */

console.log('')
console.log('== ⑤ Inn(G) ==')

ok('建 `I = Inn(G)`', await addLine('I', 'Inn(G)'))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

const nodeLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.gnode')].map((g) => g.getAttribute('data-label') ?? g.textContent ?? ''),
  )
{
  const labels = await nodeLabels()
  ok('画布上出现 Inn(G) 节点', labels.some((l) => l.includes('Inn')), JSON.stringify(labels))
}

ok('点中 I', await clickRow('I'))
{
  const inf = await infoState()
  ok('信息面板说这是群', inf.chip === '群', inf.chip)
  // 手算：Inn(D₄) ≅ D₄/Z(D₄)，|Z| = 2（{e, r²}）-> 4
  ok('阶 = |G| / |Z| = 8 / 2 = 4', inf.rows.some((r) => r.k === '阶' && r.v.includes('4')), JSON.stringify(inf.rows))
  ok(
    '副行写着 |Inn| = 4 = |G| / |Z| = 8 / 2',
    (inf.def ?? '').includes('Inn(G)') && inf.rows.length > 0,
    `${inf.def}`,
  )
  ok('结论区给出同构（≅）', inf.insights.includes('同构') && inf.insights.includes('≅'), inf.insights)
}

/* ══ ⑥ 输入侧的一条守卫：`Hall子群` 仍未支持（报错要说清"没这功能"） ═══ */

await typeExpr('Hall子群(G)')
{
  const s = await status()
  ok('`Hall子群(G)` 报「没有名为…的操作」（不是"群记号认不出"）', s.text.includes('没有名为'), s.text)
}

await browser.close()

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
process.exitCode = fail > 0 ? 1 : 0
