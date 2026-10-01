/**
 * 走查：对应定理卡片（U40，2026-09-30）。
 *
 * 用户原话：「逗我呢，你运行一下展示一下对应定理给我看看。」
 * 上一轮只交了设计稿，这一轮把它做进项目。这一套走的就是那句话要求的那条路：
 *   建 S₄ → 点它 → 开「信息」面板 → 切「子群」tab → 点正规子群右边的「对应」
 *   → 卡片里两侧各 6 个、覆盖边 8 / 8、正规数 3 / 3。
 *
 * 判据读的是**卡片里的 DOM**，不是截图 —— 截图只用来给人看。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/correspondence.mjs`
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

/** KaTeX 渲染后的 `textContent` 里带零宽字符（`C2×C2` 这种直接比会不等）。 */
const CLEAN = `(s) => (s ?? '').replace(/[\\u200b-\\u200d\\ufeff]/g, '').trim()`

const { chromium } = await import(PW)
const browser = await chromium.launch({ args: ['--no-proxy-server'] })
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
const logs = []
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

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

/* ── 点画布上的 G（点中它，信息面板会自动展开）───────────── */
const nodes = await page.$$eval('svg.canvas g.gnode', (gs) =>
  gs.map((g) => {
    const r = g.querySelector('.gnode-hit').getBoundingClientRect()
    return { id: g.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }),
)
ok('画布上有 S₄ 的节点', nodes.length >= 1, JSON.stringify(nodes.map((n) => n.id)))
if (nodes.length === 0) {
  await browser.close()
  console.log(`\n${pass} PASS / ${fail} FAIL`)
  process.exit(1)
}
await page.mouse.click(nodes[0].x, nodes[0].y)
await page.waitForTimeout(500)

/* ── 确保「信息」面板开着（它可能已经被点节点带开）───────── */
const infoToggle = page.locator('.dock-topleft .dock-toggle', { hasText: '信息' })
if (!(await infoToggle.evaluate((b) => b.closest('.dock').className.includes('open')))) {
  await infoToggle.click({ timeout: 5000 })
  await page.waitForTimeout(600)
}
await page.locator('.info-tab', { hasText: '子群' }).click({ timeout: 8000 })
await page.waitForTimeout(700)

/* ── ① 子群列表：按同构类分 7 组，「对应定理」只挂在正规行上 ───── */
const groups = await page.$$eval('.insp-isogroup', (els) =>
  els.map((e) => {
    const h = e.querySelector('.sub-group-head')
    return {
      struct: h?.dataset.struct ?? '',
      count: h?.dataset.count ?? '',
      open: !!e.querySelector('.insp-sub'),
      corr: e.querySelectorAll('.insp-sub-corr').length,
    }
  }),
)
ok('子群列表按同构类折成 7 组（S₄）', groups.length === 7, `groups=${groups.length}`)
ok(
  '组头带这一类的子群总数（1+3+4+4+3+4+9 = 28 个非平凡真子群）',
  groups.map((g) => g.count).join(',') === '1,3,4,4,3,4,9',
  groups.map((g) => g.count).join(','),
)
ok(
  '含正规子群的组默认摊开（A₄ 与 C₂×C₂ 两组）',
  groups.filter((g) => g.open).length === 2 && groups.filter((g) => g.open).every((g) => g.corr > 0),
  JSON.stringify(groups.map((g) => [g.struct, g.open, g.corr])),
)

const rows = await page.$$eval('.insp-sub', (els) =>
  els.map((el) => ({
    struct: el.dataset.struct ?? '',
    order: el.dataset.order ?? '',
    orbit: el.dataset.orbit ?? '',
    normal: el.dataset.normal === '1',
    meta: el.querySelector('.insp-sub-meta')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    hasBtn: !!el.querySelector('.insp-sub-corr'),
  })),
)
ok('摊开的共轭类行渲染出来了（A₄ 1 行 + C₂×C₂ 2 行）', rows.length === 3, `rows=${rows.length}`)
ok('列表里有「对应定理」按钮', rows.some((r) => r.hasBtn))
ok(
  '「对应定理」只出现在正规行上',
  rows.every((r) => r.hasBtn === r.normal),
  JSON.stringify(rows.filter((r) => r.hasBtn !== r.normal)),
)
ok(
  '按钮写着「对应定理」（不是从前那个灰扑扑的小「对应」）',
  await page.locator('.insp-sub-corr').first().textContent().then((t) => t.includes('对应定理')),
)

/* ── ② 点 Klein 四元群那一行（C₂×C₂ ⊴ S₄）─────────────── */
const picked = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.insp-sub')].find(
    (e) => e.dataset.normal === '1' && (e.dataset.struct ?? '').includes('C_{2}'),
  )
  if (!el) return null
  el.querySelector('.insp-sub-corr').click()
  return {
    struct: el.dataset.struct,
    order: el.dataset.order,
    gen: (el.querySelector('.insp-sub-gen')?.textContent ?? '').replace(/\s+/g, ''),
  }
})
ok(
  '点到了 Klein 四元群那一行（阶 4、C₂×C₂）',
  picked?.order === '4' && (picked?.struct ?? '').includes('C_{2}'),
  JSON.stringify(picked),
)
await page.waitForTimeout(900)
ok('卡片打开了', (await page.locator('.corr-card').count()) === 1)
ok('卡片里没有报错行', (await page.locator('.corr-bad').count()) === 0)

const card = await page.evaluate(() => {
  const c = document.querySelector('.corr-card')
  if (!c) return null
  return {
    head: c.querySelector('.corr-sub')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    hint: c.querySelector('.corr-hint')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    cols: [...c.querySelectorAll('.corr-col')].map((t) => t.textContent.trim()),
    syms: [...c.querySelectorAll('.corr-sym')].map((t) => t.textContent.trim()),
    badges: [...c.querySelectorAll('.corr-badge')].map((t) => t.textContent.trim()),
    ords: [...c.querySelectorAll('.corr-ord')].map((t) => t.textContent.trim()),
    facts: [...c.querySelectorAll('.corr-facts span')].map((t) => t.textContent.trim()),
    links: c.querySelectorAll('.corr-link').length,
    edges: c.querySelectorAll('.corr-edge').length,
    nodes: c.querySelectorAll('.corr-node').length,
  }
})
ok('读到了卡片内容', !!card)
if (card) {
  console.log('    head  =', card.head)
  console.log('    syms  =', JSON.stringify(card.syms))
  console.log('    facts =', JSON.stringify(card.facts))
  ok('两侧共 12 个节点（6 + 6）', card.nodes === 12, `nodes=${card.nodes}`)
  ok('左栏标题是「含 N 的 G 的子群」', card.cols[0]?.includes('含 N'), JSON.stringify(card.cols))
  ok('右栏标题是商群', card.cols[1]?.includes('/N'), JSON.stringify(card.cols))
  ok(
    '左栏看到 S₄ / A₄ / Klein 四元群',
    ['S₄', 'A₄', 'C₂×C₂'].every((x) => card.syms.includes(x)),
    JSON.stringify(card.syms),
  )
  ok(
    '右栏看到商群的子群（D₃ / C₃ / C₂ / {e}）',
    ['D₃', 'C₃', 'C₂', '{e}'].every((x) => card.syms.includes(x)),
    JSON.stringify(card.syms),
  )
  ok('四层各一条对应线', card.links === 4, `links=${card.links}`)
  ok('两侧覆盖边各 8 条（共 16）', card.edges === 16, `edges=${card.edges}`)
  ok('编号 ①..⑥ 左右各一遍', card.badges.length === 12 && new Set(card.badges).size === 6,
    JSON.stringify(card.badges))
  ok('阶标注两侧都在（|H| 与 |H/N|）',
    card.ords.filter((o) => o.startsWith('|H|=')).length === 6 &&
      card.ords.filter((o) => o.startsWith('|H/N|=')).length === 6,
    JSON.stringify(card.ords))
  ok('事实条说覆盖边"相等"', card.facts.some((f) => f.includes('覆盖边') && f.includes('相等')), JSON.stringify(card.facts))
  ok('事实条说正规数"相同"', card.facts.some((f) => f.includes('正规数') && f.includes('相同')), JSON.stringify(card.facts))
  // 定理那句话：|H/N| · |N| = |H|，取 N 阶 4，逐对核对
  const leftOrd = card.ords.filter((o) => o.startsWith('|H|=')).map((o) => Number(o.slice(4)))
  const rightOrd = card.ords.filter((o) => o.startsWith('|H/N|=')).map((o) => Number(o.slice(6)))
  ok('左栏阶集合 = {24,12,8,8,8,4}', JSON.stringify([...leftOrd].sort((a, b) => b - a)) === '[24,12,8,8,8,4]',
    JSON.stringify(leftOrd))
  ok('右栏阶集合 = {6,3,2,2,2,1}', JSON.stringify([...rightOrd].sort((a, b) => b - a)) === '[6,3,2,2,2,1]',
    JSON.stringify(rightOrd))
  ok('逐对满足 |H/N| x 4 = |H|',
    leftOrd.length === 6 && rightOrd.every((r) => leftOrd.includes(r * 4)),
    `${JSON.stringify(leftOrd)} / ${JSON.stringify(rightOrd)}`)

  // 截图入库（和其余走查一个约定）：一张卡片特写 + 一张"它在项目里的位置"
  await page.locator('.corr-card').screenshot({ path: '../../docs/assets/u40-correspondence-s4v4.png' })
  await page.screenshot({ path: '../../docs/assets/u40-correspondence-page.png' })
}

/* ── ③ 关掉，换 A₄ 那一行再看一次（第二个例子）───────────── */
await page.locator('.corr-x').click()
await page.waitForTimeout(400)
ok('卡片关得掉', (await page.locator('.corr-card').count()) === 0)

const picked2 = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.insp-sub')].find(
    (e) => e.dataset.normal === '1' && (e.dataset.struct ?? '').startsWith('A_'),
  )
  if (!el) return null
  el.querySelector('.insp-sub-corr').click()
  return { struct: el.dataset.struct, order: el.dataset.order }
})
ok('点到了 A₄ 那一行（阶 12）', picked2?.order === '12', `picked=${JSON.stringify(picked2)}`)
await page.waitForTimeout(800)
const card2 = await page.evaluate(() => {
  const c = document.querySelector('.corr-card')
  if (!c) return null
  return {
    nodes: c.querySelectorAll('.corr-node').length,
    edges: c.querySelectorAll('.corr-edge').length,
    links: c.querySelectorAll('.corr-link').length,
    syms: [...c.querySelectorAll('.corr-sym')].map((t) => t.textContent.trim()),
    facts: [...c.querySelectorAll('.corr-facts span')].map((t) => t.textContent.trim()),
  }
})
ok('A₄ 的卡片也打开了', !!card2)
if (card2) {
  console.log('    A₄ syms  =', JSON.stringify(card2.syms))
  console.log('    A₄ facts =', JSON.stringify(card2.facts))
  // 含 A₄ 的子群只有 A₄ 与 S₄ ⇒ 2 对
  ok('A₄：两侧各 2 个', card2.nodes === 4, `nodes=${card2.nodes}`)
  ok('A₄：覆盖边各 1 条', card2.edges === 2, `edges=${card2.edges}`)
  ok('A₄：两层对应线', card2.links === 2, `links=${card2.links}`)
  // 含 A₄ 的只有 A₄ 与 S₄，两个都正规 ⇒ 2 / 2
  ok(
    'A₄：两侧正规数 2 / 2 且相同',
    card2.facts.some((f) => f.includes('正规数') && f.includes('相同') && f.includes('2 / 2')),
    JSON.stringify(card2.facts),
  )
  await page.locator('.corr-card').screenshot({ path: '../../docs/assets/u40-correspondence-a4.png' }).catch(() => {})
}

ok('全程零 console 错误', logs.length === 0, logs.slice(0, 3).join(' | '))

await browser.close()
console.log(`\n${pass} PASS / ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 1)
