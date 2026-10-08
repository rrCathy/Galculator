/**
 * 走查：**引擎记号不能在展示层裸奔**（2026-09-21 用户报的 bug）。
 *
 * 现象：`A = Aut(S_4)` 之后信息面板「生成元」栏显示 `\alpha_2, \alpha_5`，
 * 提示串显示 `\mathrm{id}, \alpha_1, …, \alpha_{23}`。
 *
 * 判据（对**任何**一个从面板上读到的字符串成立）：
 *   \\cdot 不含反斜杠（那是引擎 TeX 漏到展示层的记号）；
 *   \\cdot 真的画成了数学排版（面板里出现 `.katex` 节点）。
 * 外加一条回认判据：`\\alpha₂` 这种展示形态**敲得进求值器**（`ord(A, \\alpha₂)` 能算）。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/tex-render.mjs`
 *
 * 坑（本轮踩的）：`.orb-center` 有**两颗**（多对象球与输入球共用类名）；
 * 抽屉收起时 `dock-body` **整个不渲染**——所以点行之前得先展开那个抽屉。
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
/** 键盘打不出来的字符（中文与中文标点除外）—— 这才是"不可接受"的东西。 */
/** KaTeX **渲染之后**不该再有反斜杠（`\alpha_1` 会排成 α1）—— 与 hasNonAscii 分工不同：
 *  前者管"文本形态"（源码/提示串），后者管"排版结果"（DOM 里的 textContent）。 */
const clean = (s) => !String(s ?? '').includes('\\')

const hasNonAscii = (s) =>
  /[^\x00-\x7F\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2013\u2014\u2018-\u201D\u2026]/.test(String(s ?? ''))

/**
 * KaTeX 渲染会在 textContent 里留**零宽字符**（`\u200b` 等，上下标之间那层）——
 * `hasNonAscii` 判定"键盘打不出"之前先剔掉（2026-10-08：composer 预览改走渲染面后暴露）。
 */
const stripInvisible = (s) =>
  String(s ?? '').replace(/[\u200b-\u200f\u2061-\u2064\u00a0\u2009\u200a\u2007]/g, '')

const { chromium } = await import(PW)
const browser = await chromium.launch({ args: ['--no-proxy-server'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const logs = []
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

/** 展开左上某个抽屉（收起时 body 不渲染）。 */
const openDock = async (title) => {
  const dock = page.locator('.dock-topleft .dock').filter({ hasText: title }).first()
  if ((await dock.locator('.dock-body').count()) === 0) await dock.locator('.dock-toggle').click()
  await page.waitForTimeout(250)
}

/** 走**输入球**声明一行（与用户手打完全同一条路）。 */
const declare = async (rhs) => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.locator('.composer-orb .orb-center').click()
  }
  await page.fill('.composer-expr', rhs)
  await page.waitForTimeout(350)
  return await page.locator('.composer-status').innerText()
}

// ── 1. 建 Aut(S₄)：引擎给的元素记号是 LaTeX ──
const st = await declare('Aut(S_4)')
ok('输入框预览认得 Aut(S_4)（不报"无法识别"，预览走渲染面）',
  !st.includes('无法识别') && st.length > 0 && !hasNonAscii(stripInvisible(st)), JSON.stringify(stripInvisible(st)).slice(0, 120))
await page.locator('.composer-orb .composer-row button').click()
await page.waitForTimeout(700)

// ── 2. 点对象行 to **工作台**（Aut 是运算产物，行在「操作」抽屉里）──
// 2026-10-08：信息面板并入工作台——点行会**自动升起工作台**，明细区默认就在「基本」节。
await openDock('操作')
const rowCount = await page.locator('.row-click').count()
ok('对象行出现', rowCount >= 1, `rows=${rowCount}`)
await page.locator('.row-click').first().click()
await page.waitForTimeout(700)
ok('点对象行 ⇒ 工作台自动升起（信息面板并入后）',
  (await page.locator('.bench.open').count()) === 1)
await page.waitForTimeout(500)

const rows = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.bench .insp-row')].map((r) => ({
      k: r.querySelector('.insp-k')?.textContent?.trim() ?? '',
      v: r.querySelector('.insp-v')?.textContent?.trim() ?? '',
      katex: r.querySelectorAll('.katex').length,
    })),
  )

const r1 = await rows()
const gen = r1.find((r) => r.k === '生成元')
ok('工作台明细里有「生成元」栏', !!gen, r1.map((r) => r.k).join('/'))
ok('生成元栏不含反斜杠', clean(gen?.v), gen?.v)
ok('生成元栏是数学排版（有 katex 节点）', (gen?.katex ?? 0) > 0, `katex=${gen?.katex}`)
// KaTeX 排版之后 textContent 里就是 `α2`（下标是 CSS 排的，不是字符）——
// 所以判据看"排版出来的那个希腊字母"，不看源码形态
ok('生成元栏排版出希腊字母（不是裸字面量 alpha）', /\u03b1/.test(gen?.v ?? ''), gen?.v)
// 留一张"修好之后"的图：信息面板的记号是排版出来的，不是反斜杠
await page.screenshot({ path: '../../docs/assets/u14-panel-tex.png' })

// ── 3. 元素 tab：一屏元素记号 ──
await page.click('.bench-tab[data-tab="elements"]')
await page.waitForTimeout(500)
const elems = await page.evaluate(() => {
  const t = document.querySelector('.etable')
  if (!t) return { head: '', katex: 0 }
  const th = [...t.querySelectorAll('tbody th')].map((x) => x.textContent.trim())
  return { head: th.slice(0, 4).join(' '), katex: t.querySelectorAll('.katex').length }
})
ok('元素表行首记号不含反斜杠', clean(elems.head), elems.head)
ok('元素表行首是数学排版', elems.katex > 0, `katex=${elems.katex}`)
// 注意：KaTeX 的下标是**排版**出来的，textContent 里 `\\alpha₁` 就是 `\\alpha 1`
//（与 `S₄` \\to`S4` 同一个坑），所以判据不能照抄展示形态
ok('元素表排版出 α1（α 后跟下标 1）', /\u03b1\s*1/.test(elems.head), elems.head)

// ── 4. 子群 tab ──
await page.click('.bench-tab[data-tab="subgroups"]')
await page.waitForTimeout(500)
const subs = await page.evaluate(() =>
  [...document.querySelectorAll('.insp-subs .insp-sub')].map((x) => x.textContent.trim()).join(' | '),
)
ok('子群列表不含反斜杠', clean(subs), subs.slice(0, 80))

// ── 5. 解析失败时，提示串是给用户抄的 \\to 必须可读 ──
await page.click('.bench-tab[data-tab="basic"]')
const bad = await declare('ord(A, zzz)')
// 提示串现在**就是** ASCII LaTeX（`\alpha_1`）——反斜杠是"能照样敲回去"的保证，
// 不再是要消灭的东西；要消灭的是"键盘打不出来的字符"
ok('失败提示里没有键盘打不出的字符', !hasNonAscii(stripInvisible(bad)), bad.slice(0, 90))
ok('失败提示列出展示形态的元素', bad.includes('\\alpha_1'), bad.slice(0, 90))
// 再留一张：用户截图里那屏反斜杠，现在是 `元素：id, \\alpha₁, …, \\alpha₂₃`
await page.screenshot({ path: '../../docs/assets/u14-hint-tex.png' })

// ── 6. 回认：面板上看到的 `\\alpha₂` 敲得进求值器 ──
const good = await declare('ord(A, \\alpha_2)')
ok('展示形态 \\alpha_2 能求值', good.includes('数值'), good)

// ── 7. 敲进去之后，数值区真的记下了这个数 ──
await page.locator('.composer-orb .composer-row button').click()
await page.waitForTimeout(600)
const num = await page.evaluate(() =>
  [...document.querySelectorAll('.num-row')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
)
ok('数值区记下了 ord(A, \\alpha_2)', num.some((x) => x.includes('4')), num.join(' | '))
const nums = await page.evaluate(() =>
  [...document.querySelectorAll('.num-row .num-label')].map((x) => x.textContent.trim()),
)
ok('数值标签不含反斜杠', nums.every(clean), nums.join(' | '))

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0) process.exitCode = 1
