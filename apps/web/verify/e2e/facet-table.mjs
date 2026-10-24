/**
 * 走查：**分面表格**（U9-c，2026-10-24）—— 工作台元素表上勾选 / 点某阶 → 造集合。
 *
 * ## 它补的是"看得见的挑"
 *
 * 用户 2026-10-23 那句「只是一个元素集吗」之后，`filter` 与 `closure` 都有了；
 * 但**手挑几个元素**这件事仍然只能靠打字 —— 而"从表上挑"才是最自然的那条路
 * （元素表本来就摆在眼前）。这一批把它接上。
 *
 * ## 守的七件事
 *   ① 元素表首列是**勾选框**（每行一个）；
 *   ② 点某一阶的数值 ⇒ 选中**这一阶的全部元素**，再点一次取消（开关语义）；
 *   ③ 只能从「阶」列生成谓词条件（`ord(x) = n`）—— 别的列谓词层表达不了，
 *      做了也只能造 `{…}`，所以干脆不给假按钮；
 *   ④ 手勾一行 ⇒ **条件按钮消失**（那批不再是某个纯条件，不许拿假条件造 filter）；
 *   ⑤ 「造元素集」落 `elementSet(G, …)`、「按条件造」落 `filter(G, x, ord(x) = n)` ——
 *      两条都是**普通定义行**，与手敲的一模一样；
 *   ⑥ 造出来的东西真的能用（`elementSet` 那条能喂 `closure`）；
 *   ⑦ 文案零泄漏 + 全程零 console 错误。
 *
 * 跑法（先起 dev server 5273，**cwd 必须是 apps/web**）：`node verify/e2e/facet-table.mjs`
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

/**
 * 点节点拿焦点。**先收台**（工作台盖住画布下半部分，真实鼠标会点到台面板上），
 * **坐标动态算**（补参条 / 台升降都会挪布局）—— 这两条是 `scalar-pick.mjs` 踩出来的。
 */
const focusNode = async (id) => {
  const benchOpen = await page.evaluate(() => / open/.test(document.querySelector('.bench')?.className ?? ''))
  if (benchOpen) {
    await page.click('.bench-toggle')
    await page.waitForTimeout(400)
  }
  const p = await page.evaluate((nid) => {
    const el = document.querySelector(`svg.canvas g.gnode[data-id="${nid}"] .gnode-hit`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, id)
  if (!p) return false
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(500)
  return true
}

/** 展开「操作」栏 —— derived 产物都在这儿（`openOps` 默认 false） */
const setDock = async (label, want) => {
  const isOpen = await page.evaluate((l) => {
    const head = [...document.querySelectorAll('.dock-toggle')].find((b) => (b.textContent ?? '').includes(l))
    return !!head?.closest('.dock')?.querySelector('.dock-body')
  }, label)
  if (isOpen === want) return
  await page.locator('.dock-toggle', { hasText: label }).first().click()
  await page.waitForTimeout(240)
}

const tableState = () =>
  page.evaluate(() => ({
    rows: document.querySelectorAll('.etable tbody tr').length,
    checks: document.querySelectorAll('.etable-pick input').length,
    checked: [...document.querySelectorAll('.etable-pick input')].filter((i) => i.checked).length,
    count: document.querySelector('.etable-count')?.textContent?.trim() ?? '',
    buttons: [...document.querySelectorAll('.etable-make')].map((b) => ({
      text: b.textContent.trim(),
      disabled: b.disabled,
    })),
    hasTools: !!document.querySelector('.etable-tools'),
  }))

const rows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.dock .row')].map((r) => ({
      name: r.querySelector('.row-name')?.textContent?.trim() ?? '',
      def: r.querySelector('.row-def')?.textContent?.replace(/\s+/g, '') ?? '',
    })),
  )

/* ══ 场景 1：勾选列与阶分段 ═══════════════════════════════ */

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(700)
await addLine('G', 'S_3')
await focusNode('G')
await page.click('.bench-tab[data-tab="elements"]')
await page.waitForTimeout(500)

let st = await tableState()
ok('元素表 6 行（S_3）', st.rows === 6, String(st.rows))
ok('每行都有勾选框', st.checks === 6, String(st.checks))
ok('还没勾时没有底部工具条', !st.hasTools, JSON.stringify(st))

/* 点「阶」列里数值为 2 的那一格（第二行的 2 就是） */
await page.click('.etable-order >> nth=1')
await page.waitForTimeout(400)
st = await tableState()
ok('点阶=2 ⇒ 选中该阶全部元素（3 个对换）', st.checked === 3, JSON.stringify(st))
ok('底部出现「已选 3 个」', /已选 3/.test(st.count), st.count)
ok(
  '…并给出两个出口：造元素集 / 按条件造（ord(x) = 2）',
  st.buttons.length === 2 &&
    st.buttons[0].text === '造元素集' &&
    /按条件造（ord\(x\) = 2）/.test(st.buttons[1].text) &&
    st.buttons.every((b) => !b.disabled),
  JSON.stringify(st.buttons),
)

/* ══ 场景 2：再点同一阶 = 取消（开关语义）═════════════════ */

await page.click('.etable-order >> nth=1')
await page.waitForTimeout(360)
st = await tableState()
ok('再点同一阶 ⇒ 全部取消', st.checked === 0 && !st.hasTools, JSON.stringify(st))

/* ══ 场景 3：手勾一行 ⇒ 条件按钮消失 ══════════════════════ */

await page.click('.etable-order >> nth=1')
await page.waitForTimeout(300)
await page.click('.etable-pick input >> nth=0') // 再手动勾一个（单位元）
await page.waitForTimeout(320)
st = await tableState()
ok('手勾之后选中数变了', st.checked === 4, JSON.stringify(st))
ok(
  '…并且「按条件造」消失（这 4 个不再等于 ord(x)=2，不许拿假条件造）',
  st.buttons.length === 1 && st.buttons[0].text === '造元素集',
  JSON.stringify(st.buttons),
)

/* ══ 场景 4：「造元素集」落一行 elementSet ═════════════════ */

await page.click('.etable-make')
await page.waitForTimeout(700)
await setDock('操作', true)
let rs = await rows()
const setRow = rs.find((r) => /elementSet/.test(r.def))
ok('「造元素集」落成 elementSet(G, …) 定义行', !!setRow, JSON.stringify(rs))
ok('…标号是 4 个（e 与 3 个对换）', /elementSet\(G,e,.*,.*,.*\)/.test((setRow?.def ?? '').replace(/\s+/g, '')), setRow?.def)

/* 造出来的东西能继续算（这就是 elementSet 给 elements 而不是 set 的理由） */
await addLine('J', `closure(${setRow?.name})`)
const jLine = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('.composer-status')].map((x) => x.textContent ?? '')
  return heads.join(' | ')
})
void jLine
await setDock('操作', true)
rs = await rows()
ok('…并且能直接喂 closure（拿它当生成集）', rs.some((r) => /closure/.test(r.def)), JSON.stringify(rs.map((r) => r.def)))
await setDock('操作', false)

/* ══ 场景 5：「按条件造」落一行 filter ═════════════════════ */

/**
 * 重新聚焦 G 把台升起来 —— `focusNode` 是"先收台再点节点"（避开遮挡），
 * 所以上面 `addLine` 之后台是收着的，`.bench-tab` 根本不存在。
 */
await focusNode('G')
await page.click('.bench-tab[data-tab="elements"]')
await page.waitForTimeout(420)
await page.click('.etable-order >> nth=1')
await page.waitForTimeout(340)
const mk = page.locator('.etable-make', { hasText: '按条件造' })
ok('重新点阶又出现「按条件造」', (await mk.count()) === 1)
await mk.click()
await page.waitForTimeout(720)
await setDock('操作', true)
rs = await rows()
ok(
  '「按条件造」落成 filter(G, x, ord(x) = 2)',
  rs.some((r) => /filter\(G,x,ord\(x\)=2\)/.test(r.def.replace(/\s+/g, ''))),
  JSON.stringify(rs.map((r) => r.def)),
)

/* ══ 场景 6：纪律 ═══════════════════════════════════════ */

const txt = await page.evaluate(() =>
  [...document.querySelectorAll('.etable, .etable-tools, .bench-tab')].map((x) => x.textContent ?? ''),
)
ok('表内文案零泄漏', txt.every((t) => badChars(clean(t)).length === 0), JSON.stringify(txt.filter((t) => badChars(clean(t)).length)))
ok('全程零 console 错误', logs.length === 0, logs.slice(0, 3).join(' | '))

console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0) process.exitCode = 1
