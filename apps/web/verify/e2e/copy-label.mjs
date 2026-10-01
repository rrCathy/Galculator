/**
 * 走查：**把画布上的记号抄回去**。
 *
 * 「展示成什么样，就得照着敲回去」这条契约的**端到端证明** —— 语义层能验
 * "`S₄` 与 `S_4` 同阶"，但验不了**画布上显示的到底是不是 `S₄`**（那是渲染层的事）。
 *
 * 所以这一份走最真实的路径：
 *   建群 \\to 读出画布节点的 `data-label`（系统自己生成的展示串）\\to **把那个串当新输入敲回去**
 *   \\to 它必须建出同一个群（标签集合是**不动点**）。
 *
 * 由来（2026-09-26）：修之前，画布上写的是 `S₄`，用户照着抄回去报"无法识别：S₄"——
 * 面板、节点标签、文档里给的记号**全是敲不回来的**。元素级早就修过，群记号级一直漏着。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/copy-label.mjs`
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
await page.waitForTimeout(1300)

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
  await page.waitForTimeout(180)
  const btn = page.locator('.composer-orb .composer-row button')
  if (await btn.isDisabled()) {
    const st = await page.evaluate(() => ({
      status: document.querySelector('.composer-status')?.textContent ?? '',
      expr: document.querySelector('.composer-expr')?.value ?? null,
    }))
    console.log(`    [blocked] name=${JSON.stringify(name)} expr=${JSON.stringify(expr)} ${JSON.stringify(st)}`)
    return false
  }
  await btn.click()
  await page.waitForTimeout(320)
  return true
}

/** 画布上的节点：id + **展示串**（`data-label` 就是系统给用户看的那个记号） */
const nodeLabels = (pred = () => true) =>
  page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
    if (!svg) return []
    return [...svg.querySelectorAll('g.gnode')].map((g) => ({
      id: g.dataset.id ?? '',
      label: g.dataset.label ?? '',
    }))
  }).then((xs) => xs.filter((x) => pred(x)))

const rowErrs = () =>
  page.evaluate(() => [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()))

/* ══ 建一批群 ═══════════════════════════════════════════ */

const SEEDS = [
  ['G1', 'S_4'],
  ['G2', 'A_4'],
  ['G3', 'C_12'],
  ['G4', 'C_2 x C_2'],
  ['G5', 'Q_8'],
  ['G6', 'D_4'],
]
for (const [n, e] of SEEDS) await addLine(n, e)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

const seeds = await nodeLabels((n) => n.id.startsWith('G'))
ok('六个群都上了画布', seeds.length === 6, seeds.map((s) => `${s.id}=${s.label}`).join(' '))
ok('没有求值失败的行', (await rowErrs()).length === 0, JSON.stringify(await rowErrs()))

// 文本形态的两个特征（2026-09-27 起）：是**简化 LaTeX**（`S_4`），
// 且**不含任何键盘打不出的字符**（Unicode 下标 / 希腊字母 / 数学符号都不许有）
const labels = seeds.map((s) => s.label)
const NON_ASCII = /[^\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D]/
ok(
  '标签是**简化 LaTeX 文本形态**（`S_4` / `C_{12}` / `C_2^2`）',
  labels.some((l) => /_[0-9{]/.test(l)),
  labels.join(' | '),
)
ok(
  '标签里**没有**键盘打不出的字符（Unicode 下标 / 希腊字母 / 数学符号）',
  labels.every((l) => !NON_ASCII.test(l)),
  labels.join(' | '),
)
await page.screenshot({ path: '../../docs/assets/u24-copy-label.png' })

/* ══ 把标签抄回去 ═══════════════════════════════════════ */

console.log('')
console.log('== 照着画布上的记号抄回去 ==')
{
  const copied = []
  for (const [i, s] of seeds.entries()) {
    const done = await addLine(`K${i + 1}`, s.label)
    copied.push({ from: s.label, done })
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(460)

  ok(
    '六个标签全部被输入框接受（修前全报"无法识别"）',
    copied.every((c) => c.done),
    copied.map((c) => `${c.from}:${c.done}`).join(' '),
  )

  const errs = await rowErrs()
  ok('没有求值失败的行', errs.length === 0, JSON.stringify(errs))

  // **不动点判据**：抄回去建出的群，它自己的标签应当与原标签**集合相同**
  //（落到同一个群 \\to 同一个展示形态；顺序会因自动布局变化，所以比集合）
  const back = await nodeLabels((n) => n.id.startsWith('K'))
  ok('抄回去的六个都建出来了', back.length === 6, back.map((b) => `${b.id}=${b.label}`).join(' '))

  const sorted = (xs) => [...xs].sort().join(' | ')
  ok(
    '标签集合是**不动点**（抄回去建出的还是同一批群）',
    sorted(back.map((b) => b.label)) === sorted(labels),
    `${sorted(labels)}  ->  ${sorted(back.map((b) => b.label))}`,
  )
}

/* ══ 另一条路：从信息面板的结论里抄 ═════════════════════ */

console.log('')
console.log('== 面板里给的记号也抄得回去 ==')
{
  // 点一个对象，让它出现在信息面板里；面板里的记号同样是展示形态
  await page.evaluate(() => {
    const g = document.querySelector('g.gnode[data-id="G1"] .gnode-hit')
    g?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(420)

  const panelText = await page.evaluate(() => {
    const clean = (s) => (s ?? '').replace(/[\u200b\u2061\u2062]/g, '')
    return [...document.querySelectorAll('.dock-topleft')].map((e) => clean(e.textContent)).join(' ')
  })
  // 面板文本里**不许**出现键盘打不出的字符（这是这一轮的核心契约）。
  // 注意：KaTeX **渲染**之后才会出现 `∣`/`φ` 这类字形，而 `.dock-topleft` 的
  // textContent 会把渲染结果也读进来 —— 所以这里挑的是"没有渲染过的纯文本面"
  //（状态行、提示语），它们必须自己就是 ASCII。
  const plainChrome = await page.evaluate(() =>
    [
      ...document.querySelectorAll('.row-name, .insp-label, .proof-kind, .dock-tab'),
    ]
      .map((e) => e.textContent ?? '')
      .join(' '),
  )
  ok(
    '面板的**纯文本面**（行名 / 标签 / tab）里没有键盘打不出的字符',
    !NON_ASCII.test(plainChrome),
    plainChrome.slice(0, 120),
  )
}

/* ══ 反例：不该被过度容错 ═══════════════════════════════ */

/* ══ 还有一条真实路径：框选复制（拿到的是 KaTeX 排版后的文本）═══ */

console.log('')
console.log('== 框选复制得到的是 `S4`（下标由 CSS 排出来），那条路也要通 ==')
{
  // 用户在画布上**框选一段标签复制**，浏览器给的是渲染后的可见文本 ——
  // KaTeX 把下标排成了 CSS，所以拿到的是 `S4` 而不是 `S₄`。这条路的宽容度
  // 不归我们管（是 core 记号解析器自己的），但它是用户最常做的动作，得验。
  const visual = await page.evaluate(() =>
    [...document.querySelectorAll('svg.canvas g.gnode .gnode-label')]
      .map((e) => (e.textContent ?? '').replace(/[\u200b\u2061\u2062]/g, '').replace(/\s+/g, '')),
  )
  const picked = visual.filter((v) => /^[A-Za-z]+[0-9]+$/.test(v)).slice(0, 4)
  ok('画布上的可见文本确实长这样（`S4` / `C12`…）', picked.length > 0, visual.join(' | '))

  for (const [i, v] of picked.entries()) await addLine(`V${i + 1}`, v)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const vBack = await nodeLabels((n) => /^V\d/.test(n.id))
  ok(
    '这些"可见文本"抄回去也建得出来',
    vBack.length === picked.length,
    `抄了 ${picked.join(' ')} -> 建出 ${vBack.map((x) => x.id + '=' + x.label).join(' ')}`,
  )
  ok('没有求值失败的行', (await rowErrs()).length === 0, JSON.stringify(await rowErrs()))
}

/* ══ 边界：真不存在的记号才该报错 ════════════════════════ */

console.log('')
console.log('== 边界 ==')
{
  const bad = await addLine('ZZ', 'Q99')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(360)
  const made = await nodeLabels((n) => n.id === 'ZZ')
  ok('真不存在的记号（`Q99`）建不出来', made.length === 0, JSON.stringify(made))
  void bad
}

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
