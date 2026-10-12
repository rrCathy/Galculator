/**
 * 走查：**深色 · 仪器台的对比度巡检**（W1，2026-10-12）。
 *
 * ── 这一套守的是什么 ────────────────────────────────────────────
 * `PROPOSAL-ui-refresh.md` §6 立过一条：深色方向必须加一件"把'看不清的字'
 * 变成可回归的断言"。本套就是那件——**不是截图人肉看，是算式**：
 *
 *   ① **过亮底**：合成 alpha 后亮度 > 140 的"面"（深色下应只有仪器台上的
 *      信号元素：球 / ＋按钮 / 吸附环 / 已填槽序号圆）。其余一律 FAIL。
 *      典型案发现场：写死的浅色底（白卡、浅灰 chip）没换变量 ⇒ 深色下亮成一块。
 *   ② **低对比字**：直接文本的 `color` 与其合成背景的对比度 < 1.8 的
 *      （朴素 WCAG 式子，含深底偏移）。抓"深字落在深底上"这类。
 *
 * 判据全部跑在 **`?theme=dark`**（强制深色，不写 localStorage——与 `?empty=1` 同族）。
 * 浅色主题不扫（那是现状基线，本来就对）。
 *
 * ── 白名单（亮底）为什么是这几个 ──────────────────────────────
 *   `.orb`          —— 球（--ink 奶油底，仪器台样张如此）
 *   `.bench-plus`   —— 「＋ 导入对象」全台唯一实心色（信号蓝）
 *   `.snap-ring`    —— 吸附预览环（橙色信号，本来就亮）
 *   `.bench-slot-n` —— 已填槽的序号圆（紫底，与"已填"状态呼应）
 *   `.composer-orb` —— 输入球（同上，--ink 奶油）
 *
 * 跑法（先起 dev server 5273，cwd=apps/web）：`node verify/e2e/dark-contrast.mjs`
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
page.setDefaultTimeout(8000)
const logs = []
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

/** 亮底白名单（见文件头）——命中即豁免 */
const BRIGHT_WHITELIST = /orb|bench-plus|snap-ring|bench-slot-n|katex/
/** 低对比白名单：这些元素的 color 由 KaTeX / 图标自管（或本来就该淡） */
const LOW_WHITELIST = /katex|gnode-handle-dot|ct-sep/

const scan = () =>
  page.evaluate(
    ([brightWl, lowWl]) => {
      const parse = (c) => {
        const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
        if (!m) return null
        return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
      }
      const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
      const bgOf = (el) => {
        let n = el
        while (n && n !== document.documentElement) {
          const c = parse(getComputedStyle(n).backgroundColor)
          if (c && c.a > 0.5) return c
          n = n.parentElement
        }
        return { r: 20, g: 22, b: 26, a: 1 }
      }
      const brightWlRe = new RegExp(brightWl)
      const lowWlRe = new RegExp(lowWl)
      const bright = []
      const lowContrast = []
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.width < 6 || r.height < 6) continue
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.1) continue
        const cls = (el.className?.toString?.() ?? el.tagName).slice(0, 70)
        const bg = parse(cs.backgroundColor)
        const eff = bg && bg.a >= 0.05 ? bg.a * lum(bg) + (1 - bg.a) * 22 : null
        if (eff !== null && eff > 140 && !brightWlRe.test(cls)) {
          bright.push({ cls, bg: cs.backgroundColor })
        }
        const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 1)
        if (direct && !lowWlRe.test(cls)) {
          const fg = parse(cs.color)
          if (fg && fg.a > 0.4) {
            const b = bgOf(el)
            const L1 = lum(fg)
            const L2 = 0.5 * lum(b) + 11
            const ratio = (Math.max(L1, L2) + 5) / (Math.min(L1, L2) + 5)
            if (ratio < 1.8) {
              lowContrast.push({ cls, color: cs.color, text: el.textContent.trim().slice(0, 18) })
            }
          }
        }
      }
      return { bright, lowContrast }
    },
    [BRIGHT_WHITELIST.source, LOW_WHITELIST.source],
  )

console.log('== dark-contrast：深色仪器台 · 对比度巡检 ==')

await page.goto(`${BASE}/?empty=1&theme=dark`, { waitUntil: 'load' })
await page.waitForTimeout(1500)
ok('主题是深色（?theme=dark）', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark')

const addLine = async (name, expr) => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(240)
  }
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(260)
  await page.evaluate(() => {
    const b = document.querySelector('.composer-orb .composer-row button')
    if (b && !b.disabled) b.click()
  })
  await page.waitForTimeout(420)
}

const checkState = async (label) => {
  const r = await scan()
  ok(
    `${label}：无未预期亮底`,
    r.bright.length === 0,
    r.bright.slice(0, 3).map((x) => `${x.cls} ${x.bg}`).join(' | '),
  )
  ok(
    `${label}：无低对比文字`,
    r.lowContrast.length === 0,
    r.lowContrast.slice(0, 3).map((x) => `${x.cls} ${x.color} ${x.text}`).join(' | '),
  )
}

await checkState('初始')

await addLine('G', 'S_4')
await addLine('H', 'A_4')
await checkState('双群')

const pt = await page.evaluate(() => {
  const el = document.querySelector('svg.canvas g.gnode .gnode-hit')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
if (pt) {
  await page.mouse.click(pt.x, pt.y)
  await page.waitForTimeout(700)
}
await checkState('工作台升起')

await page.evaluate(() => {
  const b = [...document.querySelectorAll('.bench-key')].find((e) => e.dataset.op === 'directProduct')
  if (b) b.click()
})
await page.waitForTimeout(800)
await checkState('pending 选参')

await page.evaluate(() => {
  const t = [...document.querySelectorAll('.dock-toggle')].find(
    (b) => b.querySelector('.dock-title')?.textContent.trim() === '目录',
  )
  if (t) t.click()
})
await page.waitForTimeout(600)
await checkState('目录展开')

ok('全程零 console 错误', logs.length === 0, logs.join(' | '))

console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
