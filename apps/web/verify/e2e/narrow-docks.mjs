/**
 * 走查：**窄窗口下面板之间不许互相盖**（U41，2026-09-30）。
 *
 * 用户报的是「3、元素列表现在都看不了了。」—— 追下去发现根子不在元素表本身，
 * 而在**窄窗口下三块抽屉会叠在一起**：
 *
 *   `.dock-topleft`（对象 / 操作 / 信息）与 `.dock-topright`（证明）都只跟**视口**
 *   比宽度（`max-width: calc(100% - 24px)`），谁也没给对面留位置。691px 宽的窗口里
 *   证明面板约 420px、信息面板 298px，叠了两百多 px；`.dock-topright` 在 DOM 里靠后
 *   ⇒ 盖在信息面板上面 ⇒ **「元素」「子群」两个 tab 点不动**（拦截者报 `.proof-item`），
 *   画布中央的对象也一样点不中。
 *
 * 修法：窄屏（≤1080px）两块各占一半宽。这一套钉住的就是这条。
 *
 * 判据一律用 `elementFromPoint`（真命中测试），不用几何"看着没重叠"——
 * 重叠是**点得中点不中**的问题，就得按命中测。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/narrow-docks.mjs`
 */
const PW = 'file:///C:/newproject/GroupViz/node_modules/playwright/index.mjs'
const BASE = process.env.GAL_BASE ?? 'http://127.0.0.1:5273'
/** 691 × 886 = 用户截图的尺寸 */
const W = Number(process.env.GAL_W ?? 691)
const H = Number(process.env.GAL_H ?? 886)

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
const page = await browser.newPage({ viewport: { width: W, height: H } })
const logs = []
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

console.log(`== narrow-docks ：${W} x ${H} 下面板不许互相盖 ==`)

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1400)

/* ── 建 G = S_4 ──────────────────────────────────────── */
await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
await page.click('.composer-orb .orb-center')
await page.waitForTimeout(250)
await page.fill('.composer-name', 'G')
await page.fill('.composer-expr', 'S_4')
await page.waitForTimeout(250)
await page.locator('.composer-orb .composer-row button').first().click()
await page.waitForTimeout(650)
await page.click('.composer-orb .orb-center')
await page.waitForTimeout(300)

/* ── ① 两块面板的几何：各占一半，互不重叠 ─────────────── */
const geom = await page.evaluate(() => {
  const r = (sel) => {
    const e = document.querySelector(sel)
    if (!e) return null
    const b = e.getBoundingClientRect()
    return { left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) }
  }
  return { left: r('.dock-topleft'), right: r('.dock-topright'), vw: window.innerWidth }
})
ok('两块顶部面板都在', !!geom.left && !!geom.right, JSON.stringify(geom))
ok(
  '左上面板不越过中线',
  geom.left.right <= geom.vw / 2,
  `right=${geom.left.right} / 中线=${geom.vw / 2}`,
)
ok(
  '右上面板不越过中线',
  geom.right.left >= geom.vw / 2,
  `left=${geom.right.left} / 中线=${geom.vw / 2}`,
)

/* ── ② 证明面板开着时，画布上的对象**点得中** ─────────── */
const hit = await page.evaluate(() => {
  const g = document.querySelector('svg.canvas g.gnode')
  if (!g) return null
  const b = g.querySelector('.gnode-hit').getBoundingClientRect()
  const x = b.left + b.width / 2
  const y = b.top + b.height / 2
  const el = document.elementFromPoint(x, y)
  return { x: Math.round(x), y: Math.round(y), hitId: el?.closest?.('g.gnode')?.getAttribute('data-id') ?? null, tag: el?.tagName }
})
ok('画布上的对象点得中（没被证明面板挡住）', hit?.hitId === 'G', JSON.stringify(hit))
await page.mouse.click(hit.x, hit.y)
await page.waitForTimeout(500)
ok('点完之后信息面板起来了', (await page.locator('.info-tab').count()) === 3)

/* ── ③ 信息面板的三个 tab 都点得动 ───────────────────── */
const tabsHit = await page.evaluate(() =>
  [...document.querySelectorAll('.info-tab')].map((b) => {
    const r = b.getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { label: b.textContent.trim(), reachable: el === b || b.contains(el) }
  }),
)
ok(
  '三个 tab 都点得中（没被证明面板盖住）',
  tabsHit.length === 3 && tabsHit.every((t) => t.reachable),
  JSON.stringify(tabsHit),
)

/* ── ④ 用户报的那条：元素表看不看得全 ─────────────────── */
await page.locator('.info-tab', { hasText: '元素' }).click({ timeout: 8000 })
await page.waitForTimeout(600)
const el = await page.evaluate(() => {
  const wrap = document.querySelector('.etable-wrap')
  const table = wrap?.querySelector('table')
  const body = document.querySelector('.info-tabs')?.closest('.dock-body')
  if (!wrap || !table || !body) return null
  const br = body.getBoundingClientRect()
  const tr = table.getBoundingClientRect()
  return {
    classes: document.querySelectorAll('.etable tbody tr[data-size]').length,
    elements: [...document.querySelectorAll('.etable tbody tr[data-size]')].reduce(
      (s, r) => s + Number(r.dataset.size ?? 1),
      0,
    ),
    heads: [...document.querySelectorAll('.etable thead th')].map((t) => t.textContent.replace(/\s+/g, '')),
    tableOverflows: Math.round(tr.right - br.right),
  }
})
ok('元素表按共轭类折叠（S_4 是 5 类）', el?.classes === 5, JSON.stringify(el))
ok('折叠后元素总数仍然是 24（没丢元素）', el?.elements === 24, JSON.stringify(el))
ok(
  '五列一列不少（共轭类 / 阶 / inZ / 类大小 / 中心化子）',
  el?.heads.length === 5,
  JSON.stringify(el?.heads),
)
ok(
  '表格不再横向越出面板（右边两列从前就是这么被裁掉的）',
  (el?.tableOverflows ?? 99) <= 1,
  `越出 ${el?.tableOverflows}px`,
)
await page.screenshot({ path: '../../docs/assets/u41-narrow-elements.png' })

/* 展开一个共轭类：能看该类全部元素 */
await page.evaluate(() => document.querySelectorAll('.etable-cls')[1]?.click())
await page.waitForTimeout(400)
const expanded = await page.evaluate(() => {
  const td = document.querySelector('.etable-expand td')
  return td ? td.textContent.replace(/\s+/g, ' ').trim() : null
})
ok('点得开共轭类看该类全部元素（换位类 6 个）', (expanded?.split('·').length ?? 0) === 6, expanded)

/* ── ⑤ 子群 tab 的组头也点得动 ───────────────────────── */
await page.locator('.info-tab', { hasText: '子群' }).click({ timeout: 8000 })
await page.waitForTimeout(500)
const subHeads = await page.evaluate(() => {
  const body = document.querySelector('.info-tabs')?.closest('.dock-body')
  const br = body?.getBoundingClientRect()
  return [...document.querySelectorAll('.sub-group-head')].map((b) => {
    const r = b.getBoundingClientRect()
    // 只测**滚动到可视区里**的那些：面板下方没滚到的组头本来就点不到，
    // 那不是重叠问题（拿它们做命中测试会假 FAIL，U36 那种恒真/恒假的坑反过来踩）
    const visible = !!br && r.top >= br.top && r.bottom <= br.bottom
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { count: b.dataset.count, visible, reachable: !visible || el === b || b.contains(el) }
  })
})
ok('子群 tab 有 7 个同构类组头', subHeads.length === 7, JSON.stringify(subHeads))
ok(
  '可视区内的组头都点得中',
  subHeads.filter((h) => h.visible).length > 0 && subHeads.every((h) => h.reachable),
  JSON.stringify(subHeads.filter((h) => !h.reachable)),
)

console.log('')
ok('全程零 console 错误', logs.length === 0, logs.slice(0, 3).join(' | '))
await browser.close()
console.log(`${pass} PASS / ${fail} FAIL`)
if (fail > 0 || logs.length > 0) process.exitCode = 1
