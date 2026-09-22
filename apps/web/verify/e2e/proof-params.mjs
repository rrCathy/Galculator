/**
 * 走查：**证明模板的入参界面**（U15）。
 *
 * 从前的三条 Sylow 模板把群与 p 写死（只有 A₄ 一份实例）。这一轮把它们改成入参，
 * 于是"挑参数"本身成了学习动作。走查验的就是这条链**在真浏览器里真的通**：
 *   · 面板给一个群输入框，体检行当场报 `|G| = 12 = 2²·3`；
 *   · p 按钮只列 |G| 的素因子，并且**把 n_p 写在按钮上**（哪个 p 有戏一目了然）；
 *   · 换群之后 n_p 跟着变（改 S₄ → n₂ = 3）；
 *   · 跑不通的组合被**拦住并说明理由**（Sylow III + n_p = 1），不是点了才发现；
 *   · 换个群起跑 → 步数、实例行、画布节点都对；
 *   · 全程控制台零错误。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/proof-params.mjs`
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

const card = (id) => page.locator(`.proof-item[data-tpl="${id}"]`)
const I = 'sylow-1-wielandt'
const III = 'sylow-3-congruence'

/** 卡片现状：p 按钮上的文字、被拦时的红字、开始按钮是否可用。 */
const cardState = (id) =>
  page.evaluate((tid) => {
    const el = document.querySelector(`.proof-item[data-tpl="${tid}"]`)
    if (!el) return null
    return {
      primes: [...el.querySelectorAll('.proof-prime')].map((b) =>
        b.textContent.replace(/\s+/g, ' ').trim(),
      ),
      selected: el.querySelector('.proof-prime.on')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      bad: el.querySelector('.proof-bad')?.textContent.trim() ?? '',
      canStart: !el.querySelector('.proof-start')?.disabled,
    }
  }, id)

const setGroup = async (v) => {
  await page.fill('.proof-group input', v)
  await page.waitForTimeout(260)
}

// ── 起步：默认 A₄ ──
ok('证明面板里有群输入框', (await page.locator('.proof-group input').count()) === 1)
ok('默认群是 A_4', (await page.locator('.proof-group input').inputValue()) === 'A_4')
const order0 = await page.locator('.proof-order').innerText()
ok('体检行给出 |G| 的分解', order0.includes('12') && order0.includes('2²·3'), order0)
ok('体检行不含反斜杠', !order0.includes('\\'), order0)

const a4 = await cardState(I)
ok('p 按钮只列 |A₄| 的素因子（2 与 3）', a4.primes.length === 2, JSON.stringify(a4.primes))
ok('p 按钮上写着 n_p', /n₂ = 1/.test(a4.primes[0]) && /n₃ = 4/.test(a4.primes[1]), JSON.stringify(a4.primes))
ok('Sylow I 默认选 p = 2', /p = 2/.test(a4.selected), a4.selected)

// n_p = 1 撑不起 Sylow III —— 必须在按钮边就拦住并说明理由
const iii0 = await cardState(III)
await card(III).locator('.proof-prime').first().click()
await page.waitForTimeout(200)
const iiiLow = await cardState(III)
ok('Sylow III 切到 n_p = 1 的 p 就被拦', iiiLow.canStart === false, JSON.stringify(iiiLow))
ok('拦的理由说清了 n_p = 1', iiiLow.bad.includes('= 1'), iiiLow.bad)
ok('拦的理由不含反斜杠', !iiiLow.bad.includes('\\'), iiiLow.bad)

// ── 换群：S₄ ──
await setGroup('S_4')
const orderS4 = await page.locator('.proof-order').innerText()
ok('换群后体检行跟着变（|S₄| = 24 = 2³·3）', orderS4.includes('24') && orderS4.includes('2³·3'), orderS4)
const s4 = await cardState(I)
ok('S₄ 的 p 按钮仍是 2 与 3，n₂ 变成 3', /n₂ = 3/.test(s4.primes[0]) && /n₃ = 4/.test(s4.primes[1]), JSON.stringify(s4.primes))
const iiiS4 = await cardState(III)
ok('S₄ 上 Sylow III 可起跑（n₃ = 4）', iiiS4.canStart === true, JSON.stringify(iiiS4))

// ── 换群：D₆（n₂ = 3 有戏、n₃ = 1 没戏）──
await setGroup('D_6')
const d6 = await cardState(I)
ok('D₆ 的 n₂ = 3、n₃ = 1', /n₂ = 3/.test(d6.primes[0]) && /n₃ = 1/.test(d6.primes[1]), JSON.stringify(d6.primes))

// ── 认不出的群：红字 + 全部禁用 ──
await setGroup('这不是群记号')
const bad = await cardState(I)
ok('乱写的群判为不可用', bad.canStart === false && bad.bad.length > 2, JSON.stringify(bad))
ok('乱写时不列 p 按钮', bad.primes.length === 0, JSON.stringify(bad.primes))
const orderBad = await page.locator('.proof-order.bad').count()
ok('体检行转成红色错误态', orderBad === 1)

// ── 真起跑：S₄ / Sylow III / p = 3 ──
await setGroup('S_4')
await card(III).locator('.proof-prime').nth(1).click()
await page.waitForTimeout(200)
// 起跑前先留一张**入参界面**的图（这一轮的交付物就是它）
await page.screenshot({ path: '../../docs/assets/u15-proof-params.png' })
const picked = await cardState(III)
ok('切到 p = 3 后可以起跑', picked.canStart === true, JSON.stringify(picked))
await card(III).locator('.proof-start').click()
await page.waitForTimeout(600)

const inst = await page.locator('.proof-instance').innerText()
ok('实例行写明「S_4 · p = 3」', inst.includes('S_4') && inst.includes('p = 3'), inst)
const total = await page.locator('.proof-step').count()
ok('Sylow III 在 S₄ 上仍是 14 步', total === 14, `got=${total}`)

// 走到底，看画布上真长出了证明图
for (let i = 0; i < 16; i++) {
  if (await page.locator('.proof-bar button.primary').isDisabled()) break
  await page.click('.proof-bar button.primary')
  await page.waitForTimeout(220)
}
const dom = await page.evaluate(() => {
  const svg = document.querySelector('svg.canvas')
  return {
    ids: [...svg.querySelectorAll('g.gnode')].map((g) => g.dataset.id).sort(),
    labels: Object.fromEntries(
      [...svg.querySelectorAll('g.gnode')].map((g) => [g.dataset.id, g.dataset.label ?? '']),
    ),
    edges: [...svg.querySelectorAll('g.gedge')].map((g) => g.querySelector('text')?.textContent ?? ''),
    rows: [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()),
    last: document.querySelector('.proof-step.on .proof-text')?.textContent ?? '',
  }
})
ok('走到底没有求值失败的行', dom.rows.length === 0, dom.rows.join(' | '))
// 子群集 S 是 list（**不上画布**），它在画布外的宿主是 Ω；作用 A / B 是一等**边**，不占节点
ok(
  '画布上有 G / Ω / O / N / P / F / OB',
  ['G', 'Ω', 'O', 'N', 'P', 'F', 'OB'].every((x) => dom.ids.includes(x)),
  dom.ids.join(','),
)
ok('画布上没有孤立的子群集节点 S', !dom.ids.includes('S'), dom.ids.join(','))
ok('画布上有两条 ↷（G 与 P 各一条）', dom.edges.filter((l) => l === '↷').length === 2, dom.edges.join(','))
ok('结论说 n₃ ≡ 1 (mod 3)', dom.last.includes('≡ 1 (mod 3)'), dom.last)
ok('结论文本里没有反斜杠', !dom.last.includes('\\'), dom.last)

// core 把 S₄ 的单循环写成 `234`（不带括号）——画布上必须是课本记号 `⟨(234)⟩`，
// 否则节点标签读起来像个整数（U15 顺带修掉的展示层毛病）
ok(
  'P 的节点标签是 ⟨(234)⟩ 而不是 ⟨234⟩',
  /^⟨\([0-9]+\)⟩$/.test(dom.labels.P ?? ''),
  dom.labels.P,
)

await page.screenshot({ path: '../../docs/assets/u15-proof-s4-sylow3.png' })

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0) process.exitCode = 1
