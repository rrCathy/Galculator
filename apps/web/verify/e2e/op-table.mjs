/**
 * 走查：**操作表**（U8-a，2026-10-23）—— 右上角按钮弹出的全量目录。
 *
 * ## 这一套为什么存在
 *
 * 三条手势入口（径向球 / ⊕ 球 / 拖拽）问的全是"**你选中了什么**，它能做什么"。
 * `pointSet(5)` / `labeledSet(a,b,c)` / `smallGroup(8,3)` 一个对象参数都不吃，
 * 三条入口一条都够不着 —— 这是 `CatalogDock` 文件头就写着的老账。
 *
 * 用户 2026-10-23 拍板形态：「列表就做成按钮弹出来」。
 *
 * ## 守的八件事
 *   ① 右上角有按钮，空画布上也常驻（"能做什么"这个问题不依赖画布内容）；
 *   ② 点开是**全量 46 条 / 5 组**，分组与工作台键盘**同一份**任务表
 *      （造新东西 / 读它的结构 / 作用与集合 / ＋ 面板造 / 归画布）；
 *   ③ ⚠️ **必须含当前用不了的**（标"选 N 个对象"）—— 只列能用的表就退化成第四个球，
 *      而 `INTERACTION.md:617` 判死过那个「可用操作清单」；
 *   ④ 有焦点时说"现在能用"的那批，**点下去真的执行**（菜单不撒谎）；
 *   ⑤ 点"还差 N 个对象"的行 ⇒ 进 pending 等对象（不是静默什么都没发生）；
 *   ⑥ `Esc` 与点空白都关得掉；
 *   ⑦ 状态与文案零泄漏（判据与 `no-unicode-leak` 逐字相同）；
 *   ⑧ 全程零 console 错误。
 *
 * 跑法（先起 dev server 5273，**cwd 必须是 apps/web**）：`node verify/e2e/op-table.mjs`
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

const ALLOWED = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const badChars = (s) => [...new Set([...String(s ?? '')].filter((c) => !ALLOWED.test(c)))]
const clean = (s) => String(s ?? '').replace(/[\u200b-\u200f\u00a0]/g, '').replace(/\s+/g, ' ').trim()

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
  await page.locator('.composer-orb .composer-row button').click()
  await page.waitForTimeout(450)
}

const openTable = async () => {
  if (await page.evaluate(() => !!document.querySelector('.optable'))) return
  await page.click('[aria-label="操作表"]')
  await page.waitForTimeout(360)
}

const tableInfo = () =>
  page.evaluate(() => {
    const el = document.querySelector('.optable')
    if (!el) return null
    const rows = [...el.querySelectorAll('.optable-row')]
    const by = {}
    for (const r of rows) by[r.dataset.state] = (by[r.dataset.state] ?? 0) + 1
    return {
      groups: [...el.querySelectorAll('.optable-group-label')].map((x) => x.textContent.trim()),
      rows: rows.length,
      by,
      focus: el.querySelector('.optable-focus')?.textContent?.trim() ?? '',
      states: [...new Set(rows.map((r) => r.querySelector('.optable-state')?.textContent?.trim() ?? ''))],
      names: rows.map((r) => r.querySelector('.optable-name')?.textContent?.trim() ?? ''),
    }
  })

/* ══ 场景 1：空画布上的常驻入口 ═══════════════════════════ */

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(700)

ok('空画布上右上角也有「操作表」按钮', (await page.locator('[aria-label="操作表"]').count()) === 1)

await openTable()
let info = await tableInfo()
ok('点开就出现浮层', info !== null, JSON.stringify(info))
ok('全量 46 条', info?.rows === 46, String(info?.rows))
ok(
  '5 组，且分组名与工作台键盘同一份任务表',
  JSON.stringify(info?.groups) ===
    JSON.stringify(['造新东西', '读它的结构', '作用与集合', '＋ 面板造', '归画布 / 不进工作台']),
  JSON.stringify(info?.groups),
)

/**
 * **反向判据**：没有焦点时不许有任何一行说"现在能用" —— 那是撒谎。
 * 但也不许整表空着：三条"凭空造"要标出来。
 */
ok('没焦点时没有一行谎称"现在能用"', (info?.by.ready ?? 0) === 0, JSON.stringify(info?.by))
ok('没焦点时仍列出"凭空造"那三条（标 ＋ 面板造）', (info?.by.build ?? 0) === 3, JSON.stringify(info?.by))
ok('纯算术那几条不许冒充"＋ 面板造"（它们的入口是输入框）', (info?.states ?? []).includes('输入框敲'), JSON.stringify(info?.states))
ok(
  '其余行说的是"选 N 个对象"（不是一片灰/不可点）',
  (info?.states ?? []).some((s) => /^选 \d+ 个对象$/.test(s)),
  JSON.stringify(info?.states),
)

const emptyLeak = await page.evaluate(() =>
  [...document.querySelectorAll('.optable-state, .optable-group-label, .optable-sub, .optable-name')].map(
    (x) => x.textContent ?? '',
  ),
)
ok('空画布态：表内文案零泄漏', emptyLeak.every((t) => badChars(t).length === 0), JSON.stringify(emptyLeak.filter((t) => badChars(t).length)))

/* ══ 场景 2：Esc 与点空白都关得掉 ═════════════════════════ */

await page.keyboard.press('Escape')
await page.waitForTimeout(260)
ok('Esc 关得掉', !(await page.evaluate(() => !!document.querySelector('.optable'))))

await openTable()
await page.mouse.click(40, 700)
await page.waitForTimeout(260)
ok('点空白处也关得掉', !(await page.evaluate(() => !!document.querySelector('.optable'))))

/* ══ 场景 3：有焦点时"现在能用"要真能用 ═══════════════════ */

await addLine('G', 'S_4')
await addLine('A', 'A_4')

const pt = await page.evaluate(() => {
  const el = document.querySelector('svg.canvas g.gnode[data-id="G"] .gnode-hit')
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await page.mouse.click(pt.x, pt.y)
await page.waitForTimeout(520)

await openTable()
info = await tableInfo()
ok('表头显示当前焦点', /焦点 G/.test(info?.focus ?? ''), info?.focus)
ok('有焦点时出现"现在能用"那批', (info?.by.ready ?? 0) >= 10, JSON.stringify(info?.by))
ok(
  '…且它是工作台键盘的子集口径（造新东西里有 直积/商群，读结构里有 中心）',
  ['直积', '商群', '中心'].every((n) => (info?.names ?? []).includes(n)),
  JSON.stringify((info?.names ?? []).slice(0, 8)),
)

/* 点一条 ready 的（`center`：1 对象 0 标量 ⇒ 直接执行，不进补参条） */
const before = (await page.evaluate(() => document.querySelectorAll('svg.canvas g.gnode').length)) ?? 0
await page.click('.optable-row[data-op="center"]')
await page.waitForTimeout(760)
const afterCenter = await page.evaluate(() => ({
  tableOpen: !!document.querySelector('.optable'),
  nodes: document.querySelectorAll('svg.canvas g.gnode').length,
}))
ok('点"现在能用"的行：表自己关掉', !afterCenter.tableOpen)
ok('…并且真的算出了新对象（画布多一个节点）', afterCenter.nodes === before + 1, `${before} -> ${afterCenter.nodes}`)

/* 点一条 need 的（`directProduct`：2 对象）⇒ 进 pending 等第二个 */
await openTable()
await page.click('.optable-row[data-op="directProduct"]')
await page.waitForTimeout(620)
const pend = await page.evaluate(() => ({
  tableOpen: !!document.querySelector('.optable'),
  bar: document.querySelector('.pending-bar')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
}))
ok('点"还差 N 个对象"的行：表关掉', !pend.tableOpen)
ok('…并进 pending 等对象（不是静默无反应）', /选择|第/.test(pend.bar), pend.bar.slice(0, 60))
ok('pending 条文案零泄漏', badChars(pend.bar).length === 0, badChars(pend.bar).join(','))

/* ══ 场景 4：全程无 console 错误 ══════════════════════════ */

ok('全程零 console 错误', logs.length === 0, logs.slice(0, 3).join(' | '))

console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0) process.exitCode = 1
