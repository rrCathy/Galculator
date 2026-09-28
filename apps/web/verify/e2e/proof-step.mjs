/**
 * 走查：**证明面板的 step-through**（M1）。
 *
 * 验的是"走一步 = 写一行"这条链真的通：
 *   \\cdot 面板列出模板、点开始后 13 步可走；
 *   \\cdot 走的过程中**画布逐步长出证明图**（节点/边随步数增加）；
 *   \\cdot 当前步在列表里可见（自动滚进视野）、且它在画布上的对象被**高亮**；
 *   \\cdot 全程控制台零错误。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/proof-step.mjs`
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

/** 画布现状：节点 id + 边标签 + 节点底色（判断高亮）。 */
const snapshot = () =>
  page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
    const nodes = [...svg.querySelectorAll('g.gnode')].map((g) => ({
      id: g.dataset.id,
      fill: g.querySelector('.gnode-hit')?.getAttribute('fill') ?? '',
    }))
    return {
      ids: nodes.map((n) => n.id).sort(),
      highlighted: nodes.filter((n) => /0\.16/.test(n.fill)).map((n) => n.id).sort(),
      edges: [...svg.querySelectorAll('g.gedge')].map((g) => g.dataset.label ?? ''),
      rows: [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()),
    }
  })

// ── 面板：模板列表 ──
ok('证明面板在画布上', (await page.locator('.dock-topright').count()) === 1)
ok('列出至少一条模板', (await page.locator('.proof-item').count()) >= 1)
const theoremTex = await page.locator('.proof-item-theorem').first().innerText()
ok('模板显示了定理（TeX 已渲染，且不是字面反斜杠）', /p|G|H/.test(theoremTex) && !theoremTex.includes('\\'), theoremTex)

// ── 开始（U15 起：卡片上的「开始证明」按钮；点卡片本身不再等于起跑）──
await page.click('.proof-item[data-tpl="sylow-1-wielandt"] .proof-start')
await page.waitForTimeout(500)
const total = await page.locator('.proof-step').count()
ok('13 步（Wielandt 的 Sylow I）', total === 13, `got=${total}`)
const s0 = await snapshot()
ok('第 1 步就把 G 写进画布', s0.ids.includes('G'), `ids=${s0.ids.join(',')}`)
ok('第 1 步高亮 G', s0.highlighted.includes('G'), `hi=${s0.highlighted.join(',')}`)

// ── 逐步走：画布只增不减 ──
const growth = []
for (let i = 0; i < 6; i++) {
  await page.click('.proof-bar button.primary')
  await page.waitForTimeout(320)
  growth.push((await snapshot()).ids.length)
}
ok('走 6 步后画布上多了 P 与 \\Omega', growth[growth.length - 1] >= 3, `每步节点数=${growth.join(',')}`)
const s6 = await snapshot()
ok('P 上画布', s6.ids.includes('P'), `ids=${s6.ids.join(',')}`)
ok('陪集作用的 \\Omega 上画布', s6.ids.some((id) => id.includes('/Omega')), `ids=${s6.ids.join(',')}`)
ok('这一步没有求值失败的行', s6.rows.length === 0, s6.rows.join(' | '))

// ── 当前步可见（自动滚进视野）──
const vis = await page.evaluate(() => {
  const list = document.querySelector('.proof-steps')?.getBoundingClientRect()
  const on = document.querySelector('.proof-step.on')?.getBoundingClientRect()
  if (!list || !on) return { ok: false }
  return { ok: on.top >= list.top - 1 && on.bottom <= list.bottom + 1, list: Math.round(list.height), on: Math.round(on.top) }
})
ok('当前步在列表视野内（自动滚动）', vis.ok, JSON.stringify(vis))

// ── 走到底 ──
for (let i = 0; i < 12; i++) {
  if (await page.locator('.proof-bar button.primary').isDisabled()) break
  await page.click('.proof-bar button.primary')
  await page.waitForTimeout(260)
}
const fin = await snapshot()
ok('最终节点 = G / P / Orb / Stab / \\Omega', fin.ids.join(' ') === 'A/Omega G O P S', `ids=${fin.ids.join(',')}`)
ok('最终边含 \\hookrightarrow（包含）', fin.edges.filter((l) => l === '\\hookrightarrow').length === 2, `edges=${fin.edges.join(',')}`)
ok('最终边含 = （Orb = \\Omega，传递）', fin.edges.includes('='), `edges=${fin.edges.join(',')}`)
ok('最终边含 ~>（作用）', fin.edges.includes('\\curvearrowright'), `edges=${fin.edges.join(',')}`)
// `.proof-text` 走 KaTeX，`innerText` 拿到的是**渲染后**的字符 —— `\blacksquare`
// 在 KaTeX 里排成 ■（U+25A0），不是源码形态
const lastFileText = await page.locator('.proof-step.on .proof-text').innerText()
ok('结论文本渲染成了排版（有 katex 节点）', (await page.locator('.proof-step.on .proof-text .katex').count()) > 0, lastFileText.slice(0, 60))
ok('结论文本出现收尾记号 ■', /[\u220e\u25a0]/.test(lastFileText), lastFileText.slice(-40))
ok('下一步在末步禁用', await page.locator('.proof-bar button.primary').isDisabled())

// ── 回退与合法性 ──
// 注意：别用 `button:not(.primary)` —— 那会先命中「⟲ 重来」（点成回到第 1 步，
// 断言照样绿，但验的根本不是"上一步"）。用文本选择器。
const prev = '.proof-bar button:has-text("上一步")'
await page.click(prev)
await page.waitForTimeout(320)
const back1 = await snapshot()
ok(
  '回退一步不动画布（第 13 步是纯推理，不带定义行）',
  back1.ids.length === fin.ids.length,
  `${back1.ids.length} vs ${fin.ids.length}`,
)
for (let i = 0; i < 4; i++) {
  await page.click(prev)
  await page.waitForTimeout(260)
}
const back = await snapshot()
ok('退到 O 那步会**收回** Stab 那一行', !back.ids.includes('S') && back.ids.length < fin.ids.length, `ids=${back.ids.join(',')}`)
ok('回退后没有求值失败的行', back.rows.length === 0, back.rows.join(' | '))

// ── 再走到底，留一张**完整证明**的截图 ──
for (let i = 0; i < 14; i++) {
  if (await page.locator('.proof-bar button.primary').isDisabled()) break
  await page.click('.proof-bar button.primary')
  await page.waitForTimeout(240)
}
ok('能重新走到底', await page.locator('.proof-bar button.primary').isDisabled())
await page.screenshot({ path: '../../docs/assets/u13-proof-sylow1.png' })

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0) process.exitCode = 1
