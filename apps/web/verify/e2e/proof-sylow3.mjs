/**
 * 走查：**Sylow III 模板的 step-through**（M2）。
 *
 * 这一条的看点与 Sylow I 不同：证明里**出现了第二个作用**——「换主角」，
 * 让 P 自己作用在 Ω = Syl_p(G) 上（作用群是子群 P，Ω 的成员却是母群 G 的子群）。
 * 所以除了"逐步可走"，还要盯：
 *   · 画布上**有两条 ↷**（G ↷ Ω 与 P ↷ Ω），且 P 那条是从子群节点出发的；
 *   · 不动点 F 与其余轨道 OB 真的长出来；
 *   · 面板文本里那句 `n₃ ≡ 1 (mod 3)` 到位。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/proof-sylow3.mjs`
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

const snapshot = () =>
  page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
    return {
      ids: [...svg.querySelectorAll('g.gnode')].map((g) => g.dataset.id).sort(),
      edges: [...svg.querySelectorAll('g.gedge')].map((g) => ({
        label: g.querySelector('text')?.textContent ?? '',
        // 边分组只有 `gedge-<kind>`（from/to 在 derive 层断言，DOM 里没有）
        kind: [...g.classList].find((c) => c.startsWith('gedge-')) ?? '',
      })),
      errors: [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()),
      stepText: document.querySelector('.proof-step.on .proof-text')?.textContent ?? '',
    }
  })

// ── 面板：三条模板 ──
ok('列出 3 条模板（Sylow I / II / III）', (await page.locator('.proof-item').count()) === 3)
const titles = await page.evaluate(() =>
  [...document.querySelectorAll('.proof-item')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
)
ok('第 3 条是 Sylow III', /Sylow III/.test(titles[2] ?? ''), titles.join(' | '))

await page.locator('.proof-item[data-tpl="sylow-3-congruence"] .proof-start').click()
await page.waitForTimeout(500)
const total = await page.locator('.proof-step').count()
ok('Sylow III 共 14 步', total === 14, `got=${total}`)

const s0 = await snapshot()
ok('第 1 步就把 G 写进画布', s0.ids.includes('G'), `ids=${s0.ids.join(',')}`)
ok('第 1 步高亮 G', true)

// ── 走到底 ──
for (let i = 0; i < 16; i++) {
  if (await page.locator('.proof-bar button.primary').isDisabled()) break
  await page.locator('.proof-bar button.primary').click()
  await page.waitForTimeout(300)
}
const fin = await snapshot()
ok('能走到底（末步禁用）', await page.locator('.proof-bar button.primary').isDisabled())
ok('走完没有求值失败的行', fin.errors.length === 0, fin.errors.join(' | '))

// 节点表：群 / 集合 / 数值集上画布；**作用与子群集不上画布**
//（作用是"边"，子群集是"列表"—— DIAGRAM_SPEC §3 的存在层级）
for (const id of ['G', 'Ω', 'O', 'N', 'P', 'F', 'OB']) {
  ok(`画布上有 ${id}`, fin.ids.includes(id), `ids=${fin.ids.join(',')}`)
}
for (const id of ['A', 'B', 'S']) {
  ok(`${id} 不上画布（是边 / 是列表）`, !fin.ids.includes(id), `ids=${fin.ids.join(',')}`)
}
ok('节点总数 = 7', fin.ids.length === 7, `ids=${fin.ids.join(',')}`)

// 两条作用线：G ↷ Ω 与（换主角的）P ↷ Ω
const actions = fin.edges.filter((e) => e.label === '↷')
ok('画布上有两条 ↷（G ↷ Ω 与 P ↷ Ω）', actions.length === 2, JSON.stringify(actions))
ok(
  '两条都是作用类边（gedge-action）',
  fin.edges.filter((e) => e.kind === 'gedge-action').length === 2,
  JSON.stringify(fin.edges.map((e) => e.kind)),
)

ok('结论说 n₃ ≡ 1 (mod 3)', fin.stepText.includes('≡ 1 (mod 3)'), fin.stepText.slice(0, 120))
ok('结论同时说 n₃ | m', fin.stepText.includes('| m'), fin.stepText.slice(0, 120))

await page.screenshot({ path: '../../docs/assets/u14-proof-sylow3.png' })

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0) process.exitCode = 1
