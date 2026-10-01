/**
 * 走查：**已知结论层**（U48）—— 常见族的闭式结论，看得见、也只在该出现的地方出现。
 *
 * 事故与用户原话：输入 `Aut(S6)` 页面卡死（U47 把"死机"换成了"算不动"），用户不接受
 * ——「作为群论计算器，起码得把常见结论硬编码吧。说 S6 搜不动我不是很认可」。
 * 于是有了 `src/gal/known.ts`（结论表）+ 两级落地（能构造就构造，构造不了退成"已知群"）。
 *
 * 这份走查钉**两个用户看得见的面**（"能过测试但用户感知不到"是无效改动）：
 *
 *   ① **跑 `Aut(S_6)`**：结论区直接说出 `|Aut(S_6)| = 1440`，且当场返回；
 *   ② **点 `S_6` 这件群本身**：展开「基本」节，有一段「课本结论」——
 *      自同构 / 内自同构 / 中心 / 换位子群 / 外自同构 / 幂指数 六条（不必先跑一遍操作）。
 *
 * 两条边界：
 *   · 「基本」节**默认收着**（U45）⇒ 不展开时 DOM 里**没有**这一块（零视觉成本）；
 *   · 认不出的群（`C_4 x C_4`）**不许蹭**结论（表只在命中的族上说话）。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/known-facts.mjs`
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
const logs = []
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

async function addLine(name, expr) {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(220)
  }
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(250)
  const b = page.locator('.composer-orb .composer-row button')
  const disabled = await b.isDisabled()
  if (!disabled) await b.click()
  await page.waitForTimeout(400)
  return !disabled
}

async function closeComposer() {
  if (await page.locator('.composer-card').count()) {
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(250)
  }
}

/** 画布上的节点（拿命中矩形中心当点击点）。 */
const NODES = () =>
  page.$$eval('svg.canvas g.gnode', (gs) =>
    gs.map((g) => {
      const r = g.querySelector('.gnode-hit').getBoundingClientRect()
      return { id: g.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }),
  )

async function pickNode(id) {
  const nodes = await NODES()
  const n = nodes.find((x) => x.id === id)
  if (!n) return false
  await page.mouse.click(n.x, n.y)
  await page.waitForTimeout(500)
  const t = page.locator('.dock-topleft .dock-toggle', { hasText: '信息' })
  if (!(await t.evaluate((b) => b.closest('.dock').className.includes('open')))) {
    await t.click({ timeout: 5000 })
    await page.waitForTimeout(450)
  }
  return true
}

/** 幂等地展开「基本」（手风琴里再点一下是收起 —— 所以先看 class）。 */
async function openBasic() {
  await page.evaluate(() => {
    const h = document.querySelector('.info-sec-head[data-sec="basic"]')
    if (h && !h.classList.contains('on')) h.click()
  })
  await page.waitForTimeout(400)
}

/** 「课本结论」块的行（`data-book-plain` 放纯文本形态当断言锚点）。 */
const BOOK_ROWS = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft [data-book="facts"] .insp-row')].map((r) => ({
      k: r.querySelector('.insp-k')?.textContent?.trim() ?? '',
      plain: r.querySelector('[data-book-plain]')?.getAttribute('data-book-plain') ?? '',
    })),
  )

/* ══ ① 跑 `Aut(S_6)`：结论区说出 1440（用户报的那条路）═══════ */

console.log('')
console.log('== ① Aut(S_6)：结论接手 ==')
await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1300)

const t0 = Date.now()
ok('建出 G = S_6', await addLine('G', 'S_6'))
ok('`A = Aut(G)` 提交得了（没卡死）', await addLine('A', 'Aut(G)'))
const autMs = Date.now() - t0
await closeComposer()
ok('整条路当场返回（事故时是 240s 没完）', autMs < 6000, `${autMs}ms`)

await pickNode('A')
const autIns = await page.evaluate(
  () => document.querySelector('.dock-topleft .insights')?.textContent?.replace(/[\u200b\u2061\u2062]/g, '') ?? '',
)
ok('Aut(S_6) 的结论区说出 1440', autIns.includes('1440'), autIns.slice(0, 160))
ok('而且说明它是「已知结论」', autIns.includes('已知结论'), autIns.slice(0, 160))

/* ══ ② 点 S_6 本身：展开「基本」，有「课本结论」 ═════════════ */

console.log('')
console.log('== ② S_6 的「课本结论」 ==')
ok('默认不展开时，DOM 里没有这块（零视觉成本）', (await page.locator('[data-book="facts"]').count()) === 0)
ok('点中 S_6 这个节点', await pickNode('G'))
await openBasic()
const rows = await BOOK_ROWS()
ok('展开后出现「课本结论」块', rows.length >= 5, JSON.stringify(rows.map((r) => r.k)))
ok('第一行是「自同构」，且写着 1440', rows[0]?.k === '自同构' && rows[0]?.plain.includes('1440'), JSON.stringify(rows[0]))
ok('「中心」行说平凡', rows.some((r) => r.k === '中心' && r.plain.includes('平凡')), JSON.stringify(rows))
ok('「外自同构」写出 |Out| = 2（S_6 那个著名例外）', rows.some((r) => r.k === '外自同构' && r.plain.includes('2')), JSON.stringify(rows))
ok('「幂指数」写出 60 = lcm(1..6)', rows.some((r) => r.k === '幂指数' && r.plain.includes('60')), JSON.stringify(rows))
ok('底部附了一句「凭什么」（来源）', (await page.locator('.dock-topleft [data-book="facts"] .insp-line').count()) === 1)
ok('页面无 console 错误', logs.length === 0, logs.join(' | '))

await page.screenshot({ path: '../../docs/assets/u48-known-facts.png' })

/* ══ ③ 负面对照：认不出的族不许蹭结论 ═══════════════════ */

console.log('')
console.log('== ③ 认不出就闭嘴 ==')
ok('建出 K = C_4 x C_4（底数不是素数，不在表里）', await addLine('K', 'C_4 x C_4'))
await closeComposer()
await pickNode('K')
await openBasic()
ok('C_4 x C_4 的「基本」里**没有**「课本结论」块', (await page.locator('[data-book="facts"]').count()) === 0)

console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
