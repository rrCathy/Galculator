/**
 * 走查：**群作用这件事本身**（U58）—— 真浏览器、真指针。
 *
 * 用户原话（2026-10-03）：「你现在开发的效果还是不行：群作用作为多对象操作
 * **只能选择一个对象**？那如果不是任意阶集合，是一个**特殊构造的集合（比如子群集）**
 * 你怎么弄？还有群作用的信息显示了什么东西？**元素映射到哪去了**？」
 * —— 这一套就是把这三问在真浏览器里走一遍（U57 那套只钉了"入口在哪"，
 * 没钉"进去之后能不能用"：入口 40 条全绿，而用户点进去照样卡住）。
 *
 * 五节：
 *   ① ⊕ 球点 `customAction` → pending 说「第 1 / 2 个对象」（U58 前是 1 / 1）
 *   ② 选完 G，Ω 那一格**能在画布上点**（点集合 → 编辑器里 Ω 已经指好它）
 *   ③ 不点 Ω 也能往下走：回车 / 条上那个按钮 → 编辑器（Ω 回落 |G|）
 *   ④ **子群集直接当 Ω**：chip 列得出 `Syl(S_4,3)`；Ω 读数是 `1 <234> ...`（带点号、零 LaTeX）
 *   ⑤ 造出来之后看信息：**「元素送到哪里去」**那张表（平凡作用全是 e、
 *      左正则作用给出真实置换 —— 两处都断言）
 *
 * 外加一条纪律：新写的文案全是纯文本面（判据与 `e2e/no-unicode-leak.mjs` 逐字相同）。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/action-omega.mjs`
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
page.setDefaultTimeout(4000)

/* ── 纯文本面判据（与 e2e/no-unicode-leak.mjs 逐字相同）───────── */

const ALLOWED = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const badChars = (s) => [...new Set([...String(s ?? '')].filter((c) => !ALLOWED.test(c)))]

/* ── 场地 ─────────────────────────────────────────────── */

const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(220)
  }
}

const addLine = async (name, expr) => {
  await ensureCard()
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(200)
  const btn = page.locator('.composer-orb .composer-row button')
  if (await btn.isDisabled()) {
    console.log(`    [blocked] ${name} = ${expr}`)
    return false
  }
  await btn.click()
  await page.waitForTimeout(420)
  return true
}

const clickSvg = async (sel) => {
  const done = await page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return false
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, sel)
  await page.waitForTimeout(400)
  return done
}

const clickEl = async (sel) => {
  if ((await page.locator(sel).count()) === 0) return false
  await page.click(sel, { timeout: 6000 })
  await page.waitForTimeout(340)
  return true
}

/**
 * 台收着才能和画布说话（2026-10-08：**点节点会自动升起工作台** —— 台会盖住球 / 环上
 * 卫星 / ⊕ 球面板，真实鼠标点不动它们）。凡点球/卫星前先收台（幂等）。
 */
const benchDown = async () => {
  if ((await page.locator('.bench.open').count()) > 0) {
    await page.click('.bench-toggle')
    await page.waitForTimeout(320)
  }
}

// 按 data-op 找，不按显示文本（显示名 2026-10-06 起是中文，会随文案漂移）。
const clickElByOp = (sel, opId) =>
  page.evaluate(
    ({ s, want }) => {
      const b = [...document.querySelectorAll(s)].find((x) => x.dataset.op === want)
      if (!b) return false
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    },
    { s: sel, want: opId },
  )

// 按 data-op 找，不按显示文本（显示名 2026-10-06 起是中文，会随文案漂移）。
const clickCenterOp = (opId) =>
  page.evaluate((want) => {
    const b = [...document.querySelectorAll('.orb-center-panel .orb-op')].find(
      (x) => x.dataset.op === want,
    )
    if (!b) return false
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, opId)

/** 单对象那条路：群节点的环上先点「操作」卫星，再从抽屉里挑一条。 */
// 按 data-op 找，不按显示文本（显示名 2026-10-06 起是中文，会随文案漂移）。
const clickOpsPanelOp = (opId) =>
  page.evaluate((want) => {
    const b = [...document.querySelectorAll('.orb-ops-panel .orb-op')].find(
      (x) => x.dataset.op === want,
    )
    if (!b) return false
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, opId)

/** 从**群节点球**进 `customAction`：环上直接有就点它，否则先开「操作」抽屉。 */
const openFromGroupOrb = async (id) => {
  await clickSvg(`svg.canvas g.gnode[data-id="${id}"] .gnode-hit`)
  await benchDown() // 台升起会盖住球/环 —— 先收（2026-10-08）
  await clickEl('.orb:not(.orb-center)')
  if (await clickElByOp('.orb-sat', 'customAction')) return true
  await benchDown() // 台升起会盖住球/环 —— 先收（2026-10-08）
  await clickEl('.orb-sat:text-is("操作")')
  await page.waitForTimeout(420)
  return clickOpsPanelOp('customAction')
}

const pendText = () =>
  page.evaluate(() => ({
    bars: document.querySelectorAll('.pending-bar').length,
    hint: document.querySelector('.pending-hint')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    picked: document.querySelector('.pending-picked')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    btn: document.querySelector('.pending-btn.primary')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  }))

const editorState = () =>
  page.evaluate(() => ({
    open: document.querySelectorAll('.action-builder').length,
    omega: document.querySelector('.action-builder .ab-n input')?.value ?? null,
    omegaSummary: document.querySelector('.action-builder .ab-n .mb-to')?.textContent?.trim() ?? null,
    chips: [...document.querySelectorAll('.action-builder .ab-set-chip')].map((b) => b.textContent.trim()),
    onChip: [...document.querySelectorAll('.action-builder .ab-set-chip.on')].map((b) => b.textContent.trim()),
    gens: [...document.querySelectorAll('.action-builder .mb-row .mb-gen')].map((e) => e.dataset.gen ?? ''),
    check: document.querySelector('.action-builder .mb-check')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    checkCls: [...(document.querySelector('.action-builder .mb-check')?.classList ?? [])].join(' '),
  }))

const setOmega = async (v) => {
  await page.evaluate((val) => {
    const el = document.querySelector('.action-builder .ab-n input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, val)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, v)
  await page.waitForTimeout(400)
}

/** 打开 ⊕ 球 -> 点 `customAction` -> 空着手进 pending。 */
const openMultiCustom = async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(340)
  await benchDown() // 台升起会盖住球/环 —— 先收（2026-10-08）
  await clickEl('.multi-orb .orb-center')
  const hit = await clickCenterOp('customAction')
  await page.waitForTimeout(400)
  return hit
}

const infoPanel = () =>
  page.evaluate(() => {
    const t = document.querySelector('.map-corr-table')
    return {
      corrHead: document.querySelector('.map-corr .rel-head')?.textContent?.trim() ?? null,
      corrCols: t ? [...t.querySelectorAll('th')].map((h) => h.textContent.trim()) : [],
      corrRows: t
        ? [...t.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((d) => d.textContent.trim()))
        : [],
      kvK: [...document.querySelectorAll('.insp-k')].map((k) => k.textContent.trim()),
      /*
       * LaTeX 泄漏扫描。**只扫自然语言面**：Ω 的读数、状态行、提示语、chip 标签。
       *
       * 故意**不扫** `[title]` —— 那里放的是**记号样例**（`title="留空则命名为「\alpha」"`），
       * `\alpha` 与 `C_4` 同类：它就是对象名本身，用户照抄进输入框才对（U25 立的
       * "输入只认 ASCII 记号、显示才走 KaTeX"）。把它当泄漏会让这条判据变成噪音。
       */
      leak: [...document.querySelectorAll('.action-builder .mb-to, .action-builder .mb-check, .action-builder .mb-hint, .action-builder .ab-sets-label, .action-builder .ab-set-chip')]
        .map((e) => e.textContent ?? '')
        .filter((s) => /\\[a-zA-Z]+/.test(s)),
    }
  })

/* ══════════════════════════════════════════════════════════
 * 场地：G = S_4（24 阶）；S3 = Syl(S_4, 3)（**子群集**，4 个）；O = asSet(S3)
 * ══════════════════════════════════════════════════════════ */

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1300)

ok('建 `G = S_4`', await addLine('G', 'S_4'))
ok('建 `S3 = Syl(S_4, 3)`（子群集，4 个 Sylow 3-子群）', await addLine('S3', 'Syl(S_4, 3)'))
ok('建 `O = asSet(S3)`（把它读成集合）', await addLine('O', 'asSet(S3)'))
await page.keyboard.press('Escape')
await page.waitForTimeout(420)
ok(
  '三条前置都求值成功',
  (await page.evaluate(() => [...document.querySelectorAll('.row-err')].length)) === 0,
  JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.row-err')].map((e) => e.textContent.trim()))),
)

/* ══════════════════════════════════════════════════════════
 * ① pending 说「第 1 / 2 个对象」—— Ω 也是一格
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ① ⊕ 球点 `customAction`：它要**两个**对象，不是"只选一个" ==')
{
  ok('从 ⊕ 球点得中 `customAction`', await openMultiCustom())
  const a = await pendText()
  ok('提示条出现了', a.bars === 1, JSON.stringify(a))
  ok('  第 1 / 2 个对象（U58 前是 1 / 1 —— 用户说"只能选择一个对象"）', a.hint.includes('第 1 / 2'), a.hint)

  ok('点得中群节点 G', await clickSvg('svg.canvas g.gnode[data-id="G"] .gnode-hit'))
  const b = await pendText()
  ok('  已选里出现 S_4', b.picked.includes('S_4'), b.picked)
  ok('  Ω 那一位说清是「可选」', b.hint.includes('可选') && b.hint.includes('Omega'), b.hint)
  ok('  且收尾是「进编辑器填」而不是「直接执行」', b.hint.includes('编辑器') && !b.hint.includes('直接执行'), b.hint)
  ok('  条上那颗按钮同款文案', b.btn.includes('在编辑器里填'), b.btn)
  await page.screenshot({ path: '../../docs/assets/u58-pending-omega.png' })
}

/* ══════════════════════════════════════════════════════════
 * ② Ω 能在画布上点：点集合 O -> 编辑器里 Ω 已经是它
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ② Ω 那一格能在画布上点 ==')
{
  ok('点得中画布上的集合 O', await clickSvg('svg.canvas g.gnode[data-id="O"] .gnode-hit'))
  const e = await editorState()
  ok('编辑器弹出来了', e.open === 1, JSON.stringify(e))
  ok('  Ω 那一格是 `O`（点的就是它，没被 |G| = 24 覆盖）', e.omega === 'O', JSON.stringify(e))
  ok('  那排 chip 里 O 是**高亮**的', e.onChip.includes('O'), JSON.stringify(e.onChip))
}

/* ══════════════════════════════════════════════════════════
 * ③ 不点 Ω 也能走：回车 / 条上按钮
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ③ 不点 Ω：回车 / 条上那颗按钮，都进编辑器 ==')
{
  await openMultiCustom()
  await clickSvg('svg.canvas g.gnode[data-id="G"] .gnode-hit')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(520)
  const e = await editorState()
  ok('回车 → 编辑器弹出（U58 前这一步会去跑 op 然后报"至少给一个生成元的像"）', e.open === 1, JSON.stringify(e))
  ok('  Ω 回落到 4（S_4 是 24 阶 > 12，走的是"大群给小舞台"那一支）', e.omega === '4', JSON.stringify(e))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(320)

  await openMultiCustom()
  await clickSvg('svg.canvas g.gnode[data-id="G"] .gnode-hit')
  const t = await pendText()
  ok('条上按钮仍在（不选 Ω 的出口）', !!t.btn, JSON.stringify(t))
  ok('点得中它', await page.evaluate(() => {
    const b = document.querySelector('.pending-btn.primary')
    if (!b) return false
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }))
  await page.waitForTimeout(520)
  ok('  也进编辑器', (await editorState()).open === 1)
}

/* ══════════════════════════════════════════════════════════
 * ④ 子群集直接当 Ω（不必先 asSet）
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ④ **子群集**直接当 Ω：chip 列得出它，读数带点号、零 LaTeX ==')
{
  await page.keyboard.press('Escape')
  await page.waitForTimeout(320)
  // 从**群节点**那条路进（最直接），确保与 ⊕ 球那条落到同一个编辑器
  ok('从群节点球进 `customAction`（第四条入口）', await openFromGroupOrb('G'))
  const e0 = await editorState()
  ok('编辑器弹出来了（第四条入口：群节点球）', e0.open === 1, JSON.stringify(e0))
  ok('  chip 一排里**有 S3**（子群集 —— U58 前一个 chip 都不列）', e0.chips.includes('S3'), JSON.stringify(e0.chips))
  ok('  也在 O（asSet 的产物）', e0.chips.includes('O'), JSON.stringify(e0.chips))

  await setOmega('S3')
  const a = await editorState()
  ok('Ω 填 `S3`（子群集本体）**认得出来**（U58 前报"它不是集合"）', a.checkCls.includes('empty') && !a.checkCls.includes('bad'), `${a.checkCls} :: ${a.check}`)
  ok('  读数说 4 个点', a.omegaSummary.includes('4 个点'), a.omegaSummary)
  ok('  读数**带点号**（用户照着写 (1 3) 要用）', a.omegaSummary.includes('1 <234>'), a.omegaSummary)
  ok('  读数里**没有 LaTeX 命令**（U58 前是 `\\langle 234\\rangle`）', !a.omegaSummary.includes('\\'), a.omegaSummary)
  ok('  全部读数里也没有 LaTeX 泄漏', (await infoPanel()).leak.length === 0, JSON.stringify((await infoPanel()).leak))

  await setOmega('O')
  const b = await editorState()
  ok('Ω 填 `O` 也一样（4 个点）', b.omegaSummary.includes('4 个点') && !b.checkCls.includes('bad'), `${b.checkCls} :: ${b.check}`)
  await page.screenshot({ path: '../../docs/assets/u58-omega-subgroups.png' })

  // 平凡作用（每个生成元映成恒等）—— 必然同态，先把对象造出来
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    for (const el of document.querySelectorAll('.action-builder .mb-row input.cycle-input')) {
      setter.call(el, 'e')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await page.waitForTimeout(420)
  const c = await editorState()
  ok('全填 e：状态行说"是同态"', c.checkCls.includes('ok'), `${c.checkCls} :: ${c.check}`)
  await page.fill('.action-builder .mb-name', 'AC')
  await page.waitForTimeout(200)
  ok('点得中「确认」', await clickEl('.action-builder .mb-foot .mb-btn.primary'))
  await page.waitForTimeout(640)
  ok('没有求值失败的行', (await page.evaluate(() => [...document.querySelectorAll('.row-err')].length)) === 0)
  ok(
    '画出 `G ↷ Omega` 那条边',
    (await page.evaluate(() =>
      [...document.querySelectorAll('svg.canvas g.gedge')].some((g) => g.dataset.objectId === 'AC'),
    )),
  )
}

/* ══════════════════════════════════════════════════════════
 * ⑤ 信息面板：「元素送到哪里去」
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ⑤ 作用的信息：**元素送到哪里去**那张表 ==')
{
  await page.waitForTimeout(400)
  const info = await infoPanel()
  ok('有一张 `.map-corr-table`（U58 前作用这一侧没有表）', info.corrCols.length === 2, JSON.stringify(info.corrCols))
  ok('  标题是「元素送到哪里去」', info.corrHead === '元素送到哪里去', String(info.corrHead))
  ok('  列头是 元素 / 像', info.corrCols.join(',') === '元素,像', info.corrCols.join(','))
  ok('  逐行铺了（|S_4| = 24 个元素）', info.corrRows.length === 24, String(info.corrRows.length))
  // 平凡作用：每个元素的像都是 e（手算：恒等映射）
  ok('  平凡作用 ⇒ 每行的像都是 e', info.corrRows.every((r) => r[1] === 'e'), JSON.stringify(info.corrRows.slice(0, 3)))
  await page.screenshot({ path: '../../docs/assets/u58-action-corr.png' })
}

console.log('')
console.log('== ⑤b 换个**非平凡**作用（左正则）：表里给出真实置换 ==')
{
  await page.keyboard.press('Escape')
  await page.waitForTimeout(320)
  ok('再进一次 `customAction`', await openFromGroupOrb('G'))
  ok('点得中「左正则作用」', await clickEl('.action-builder .mb-auto:text-is("左正则作用")'))
  await page.waitForTimeout(520)
  const e = await editorState()
  ok('  它把 Ω 设成 |G| = 24 个点', e.omega === '24', JSON.stringify(e.omega))
  ok('  状态行：是同态 + 传递 + 忠实（Cayley）', e.checkCls.includes('ok') && e.check.includes('忠实'), `${e.checkCls} :: ${e.check}`)
  await page.fill('.action-builder .mb-name', 'AC2')
  await page.waitForTimeout(200)
  ok('确认', await clickEl('.action-builder .mb-foot .mb-btn.primary'))
  await page.waitForTimeout(700)

  const info = await infoPanel()
  ok('表还在（换了条作用）', info.corrCols.join(',') === '元素,像', info.corrCols.join(','))
  ok('  这次有**非平凡**的像（不是清一色 e）', info.corrRows.some((r) => r[1] !== 'e'), JSON.stringify(info.corrRows.slice(0, 3)))
  ok(
    '  像写成了循环记号（至少一行含括号）',
    info.corrRows.some((r) => r[1].includes('(')),
    JSON.stringify(info.corrRows.slice(0, 3)),
  )
  // 手算锚点：左正则作用里，元素 `34` 把 1 送到 2、2 送到 1（左乘 (12) 型的对换）
  const row34 = info.corrRows.find((r) => r[0] === '34')
  ok('  抽查一行：`34` 的像含 `(1 2)`', !!row34 && row34[1].includes('(1 2)'), JSON.stringify(row34))
  await page.screenshot({ path: '../../docs/assets/u58-action-corr-regular.png' })
}

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
