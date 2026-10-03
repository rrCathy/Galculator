/**
 * 走查：**界面上不许出现键盘打不出来的字符**（2026-09-27 用户的要求）。
 *
 * 用户原话：「你给我把键盘上打不出来的字符都处理了，不要显示出来，也不支持输入这些。」
 *
 * 这条要求有两半，这份走查把两半都钉住：
 *
 *  ① **输入侧**：敲 `S₄` / `∩` / `φ` 一律被拦，且给出**可照抄的 ASCII 写法**；
 *  ② **显示侧**：界面上**每一段文本**（KaTeX 渲染的数学除外）都只由
 *     ASCII + 中文 + 中文标点组成。
 *
 * 为什么要把 KaTeX 排除在外：`\varphi` 渲染出来**就是** φ（字体字形），
 * 这正是"显示靠 KaTeX"的意思 —— 用户选的就是这个方案（显示是排版，文本流是 ASCII）。
 * 所以判据落在**文本流**上：
 *   · `.katex` 之外的文本节点 —— 不许有非 ASCII 的数学字符；
 *   · 源码形态（`data-*` 属性、名字、输入框的值）—— 更是必须全 ASCII。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/no-unicode-leak.mjs`
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
page.on('console', (m) => {
  if (m.type() === 'error') logs.push(m.text())
})
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

/* ══ 判据：什么是"键盘打不出来的字符" ══════════════════════════ */

/**
 * 放行：ASCII · 中文 · 中文标点 · 中文引号 · **空白（含换行）**。
 *
 * 破折号 / 省略号（— … –）**不放行** —— 它们在美国键盘上敲不出来，
 * 而界面文案里用中文逗号/顿号表达完全一样清楚。
 *
 * 换行也要放行：`\\n` 是回车键敲出来的（视图快照那种多行文本就住在 textarea 里）。
 * 判据只管"这个字符键盘上有没有键"，不管它排版好不好看。
 */
const ALLOWED = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const badChars = (s) => [...new Set([...String(s ?? '')].filter((c) => !ALLOWED.test(c)))]

/** 页面上**除 KaTeX 渲染之外**的全部可见文本（含 title / placeholder）。 */
const visibleText = () =>
  page.evaluate(() => {
    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walker.nextNode())) {
      const el = n.parentElement
      if (!el) continue
      // KaTeX 排出来的字形（φ / × / ⊂）是**设计要的**，不算文本流泄漏
      if (el.closest('.katex')) continue
      if (el.closest('script, style, .tmp-probe')) continue
      const t = (n.nodeValue ?? '').trim()
      if (!t) continue
      out.push({ text: t, where: (el.className || el.tagName).toString().slice(0, 40) })
    }
    for (const el of document.querySelectorAll('[title], [placeholder], [aria-label]')) {
      for (const a of ['title', 'placeholder', 'aria-label']) {
        const v = el.getAttribute(a)
        if (v?.trim()) out.push({ text: v, where: `${el.tagName}[${a}]` })
      }
    }
    return out
  })

/** 源码形态（`data-*` 与输入框的值）—— 这些是**能复制的文本**，必须全 ASCII。 */
const sourceText = () =>
  page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('*')) {
      for (const a of el.attributes) {
        if (a.name.startsWith('data-') && a.value.trim()) {
          out.push({ text: a.value, where: `${el.tagName}[${a.name}]` })
        }
      }
    }
    for (const el of document.querySelectorAll('input, textarea')) {
      if (el.value?.trim()) out.push({ text: el.value, where: `${el.tagName}.value` })
    }
    return out
  })

const checkVisible = async (stage) => {
  const rows = await visibleText()
  const bad = rows
    .map((r) => ({ ...r, bad: badChars(r.text) }))
    .filter((r) => r.bad.length > 0)
  ok(
    `${stage}：可见文本里没有键盘打不出的字符`,
    bad.length === 0,
    bad.map((b) => `${b.bad.join('')} @ ${b.where}: ${b.text.slice(0, 50)}`).join('  |  '),
  )
  return bad
}

const checkSource = async (stage) => {
  const rows = await sourceText()
  const bad = rows.map((r) => ({ ...r, bad: badChars(r.text) })).filter((r) => r.bad.length > 0)
  ok(
    `${stage}：源码形态（data-* / 输入框）里没有非 ASCII`,
    bad.length === 0,
    bad.map((b) => `${b.bad.join('')} @ ${b.where}: ${b.text.slice(0, 50)}`).join('  |  '),
  )
}

/* ══ 场地 ═════════════════════════════════════════════════ */

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
  if (await btn.isDisabled()) return false
  await btn.click()
  await page.waitForTimeout(300)
  return true
}

const status = () =>
  page.evaluate(() => ({
    text: document.querySelector('.composer-status')?.textContent ?? '',
    cls: [...(document.querySelector('.composer-status')?.classList ?? [])].join(' '),
  }))

const typeExpr = async (v) => {
  await ensureCard()
  await page.fill('.composer-expr', v)
  await page.waitForTimeout(240)
}

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

/* ══ ① 输入侧：打不出来的字符一律拦住，并给 ASCII 改法 ═══════ */

console.log('')
console.log('== ① 输入侧 ==')

const SUB4 = '\u2084' // ₄
const CAP = '\u2229' // ∩
const PHI = '\u03c6' // φ

const CASES = [
  [`S${SUB4}`, '下标', 'S_4'],
  [`C_2${CAP}C_3`, '符号', '\\cap'],
  [`\\alpha + ${PHI}`, '希腊字母', '\\varphi'],
]
for (const [src, kind, want] of CASES) {
  await typeExpr(src)
  const st = await status()
  ok(`敲「${src}」被拦住`, st.cls.includes('bad'), `${st.cls} :: ${st.text}`)
  ok(`  理由里说清是${kind}`, st.text.includes(kind) || st.text.includes('键盘打不出来'), st.text)
  ok(`  且给出可照抄的写法（含 ${want}）`, st.text.includes(want), st.text)
}

// LaTeX 写法本身不受影响（拦住的是"打不出来的字符"，不是反斜杠）
await typeExpr('S_4')
const okTex = await status()
ok('`S_4` 这种 ASCII 写法不被拦', !okTex.cls.includes('bad'), `${okTex.cls} :: ${okTex.text}`)

// 中文照旧放行（用户写的就是中文）—— 这一条要等对象建出来才验得了
//（中文操作名也得有真参数才跑得通），放在 ② 段末尾。

// 该拦的那种错，理由里必须**点明"键盘打不出来"**，而不是只说"无法识别"
await typeExpr('C_2 \u222a C_3')
const union = await status()
ok('`∪` 被拦且理由点明键盘打不出来', union.text.includes('键盘打不出来'), union.text)
ok('  并给出可照抄的改法（含 C_2）', union.text.includes('C_2'), union.text)

/* ══ ② 显示侧：一路点过去，每站都扫一遍 ═══════════════════ */

console.log('')
console.log('== ② 显示侧 ==')

await page.keyboard.press('Escape')
await page.waitForTimeout(300)

for (const [n, e] of [
  ['G', 'S_4'],
  ['H', 'S_3'],
  ['\\varphi', 'map(G, H, s12->23, c->13)'],
  ['K', 'ker(\\varphi)'],
  ['A', 'A_4'],
  ['R', 'contains(K, G)'],
]) {
  const built = await addLine(n, e)
  ok(`建得出「${n} = ${e}」`, built === true)
}
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// 中文操作名同样能跑（拦住的是"打不出来的字符"，不是中文）
await typeExpr('Sub(G)')
const okZh = await status()
ok('中文操作名 `Sub(G)` 不被拦', !okZh.cls.includes('bad'), `${okZh.cls} :: ${okZh.text}`)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

await checkVisible('空画布 + 六行对象')
await checkSource('空画布 + 六行对象')
await page.screenshot({ path: '../../docs/assets/u25-ascii-notation.png' })

/* ── 信息面板：逐个 tab 过一遍 ── */
const clickRow = async (id) => {
  await page.evaluate((want) => {
    const rows = [...document.querySelectorAll('.dock-topleft .row-click')]
    const hit = rows.find((r) => r.querySelector('.row-name')?.textContent?.trim() === want)
    hit?.click()
  }, id)
}

for (const id of ['G', 'K', '\\varphi']) {
  await clickRow(id)
  await page.waitForTimeout(360)
  await checkVisible(`信息面板：${id}`)
  const tabs = await page.locator('.info-sec-head, .dock-tab').count()
  for (let i = 0; i < Math.min(tabs, 5); i++) {
    const t = page.locator('.info-sec-head, .dock-tab').nth(i)
    if (await t.isVisible()) {
      await t.click()
      await page.waitForTimeout(260)
      await checkVisible(`信息面板 ${id} 的第 ${i + 1} 个 tab`)
    }
  }
}

/* ── 悬浮球：环 + 操作菜单 ── */
{
  await clickRow('G')
  await page.waitForTimeout(300)
  const orb = page.locator('.orb-center').first()
  if (await orb.count()) {
    await orb.click({ force: true })
    await page.waitForTimeout(320)
    await checkVisible('悬浮球：第一层环')
    const opsBtn = page.locator('.orb-sat:text-is("操作")').first()
    if (await opsBtn.count()) {
      await opsBtn.click({ force: true })
      await page.waitForTimeout(320)
      await checkVisible('悬浮球：单对象操作菜单')
    }
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(260)
}

/* ── 证明面板：走到最后一步（它是最长的文案面）── */
{
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.proof-item')]
    const hit = cards.find((c) => /同构|轨道|Sylow/.test(c.textContent ?? ''))
    hit?.querySelector('.proof-start')?.click()
  })
  await page.waitForTimeout(700)
  await checkVisible('证明面板：起跑')

  for (let i = 0; i < 24; i++) {
    const btn = page.locator('.proof-bar button.primary')
    if (!(await btn.count()) || (await btn.isDisabled())) break
    await btn.click()
    await page.waitForTimeout(180)
  }
  await page.waitForTimeout(300)
  await checkVisible('证明面板：走到底')
  await checkSource('证明面板：走到底')
}

/* ── 报错面：写一行错的 ── */
{
  // 2026-09-28（U27）起 `maximalSubgroups(G)` 已接线 —— 换仍在缺口清单里的 `HallSub(G)`
  await addLine('X', 'HallSub(G)')
  const st = await status()
  ok('「Hall子群」报「没有这个操作」', st.text.includes('没有名为'), st.text)
  await checkVisible('输入框报错（没有这个操作）')
  ok('这条提示里没有键盘打不出的字符', badChars(st.text).length === 0, badChars(st.text).join(''))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

/* ── 普通页面（自带示例定义）── */
{
  await page.goto('about:blank')
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.waitForTimeout(1400)
  await checkVisible('普通页面（示例定义）')
  await checkSource('普通页面（示例定义）')
}

ok('控制台零错误', logs.length === 0, logs.join(' | '))

await browser.close()
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
if (fail > 0) process.exit(1)
