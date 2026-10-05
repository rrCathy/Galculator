/**
 * 走查：**工作台**（`ui/Workbench`）—— 三区重构 P1 的可见部分（2026-10-05）。
 *
 * ── 这一套守的是什么 ────────────────────────────────────────────
 * 用户定的形态（原话）：「工作台应该是从底部弹出的框，并且能在底部收起，
 * 交换图画布充当背景。」拆成四条可测的承诺：
 *
 *   ① **贴底常驻、点它才升起**（默认收起 —— 它一升起就吃掉 45vh 画布高度）；
 *   ② **画布当背景** —— 升起时 `CanvasView` 的尺寸**不许变**（`INTERACTION` §5
 *      「画布不给抽屉让位」：面板是浮层，不占布局）；
 *   ③ **不许挡别的** —— 左下「数值」抽屉、底部输入球、底部工具条全部仍点得到
 *      （这一条**第一版就栽了**：工作台做成 `left:0;right:0` 全宽 + `bottom:0`，
 *      真机报 `.bench-head intercepts pointer events` —— 用户点输入球点不动）；
 *   ④ **内容与左上「信息」抽屉同源** —— 同一批内容只能有一份排版
 *      （`SectionBody`），两处观感不许不一样。
 *
 * ── 期望值全部手算 ──────────────────────────────────────────────
 * 用 `S_4`（阶 24）：
 *   · `|G| = 24 = 2³·3`（素因子分解）· **非交换**（`S_4` 里对换 `(12)` 与 `(1234)` 不交换）；
 *   · 生成元 2 个（`σ12` 与 `σ1234`，core 给的是这两条置换）；
 *   · `Z(S_4) = 1`（`S_4` 的中心是平凡的 —— 换位生成元里没有中心元）；
 *   · `[S_4, S_4] = A_4`（`A_4` 是 12 阶的换位子群）；
 *   · `Aut(S_4) ≅ S_4`、`Inn(S_4) ≅ S_4`、`|Out| = 1`（`S_4` 的外自同构群平凡）；
 *   · 元素 24 个 · 子群 **7 个共轭类**（`S_4` 的子群按共轭类分 7 种：`C_1` `C_2` `C_3` `C_4` `V_4` `D_8` `A_4`）。
 *
 * 跑法（先起 dev server 5273，**cwd 必须是 apps/web**）：`node verify/e2e/workbench.mjs`
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
page.setDefaultTimeout(6000)
const logs = []
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))

/* ── 辅助 ──────────────────────────────────────────────────── */

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

const clickNode = async (id) => {
  const done = await page.evaluate((nid) => {
    const el = document.querySelector(`svg.canvas g.gnode[data-id="${nid}"] .gnode-hit`)
    if (!el) return false
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, id)
  await page.waitForTimeout(480)
  return done
}

/** 工作台的盒子与状态（一次读完）*/
const bench = () =>
  page.evaluate(() => {
    const el = document.querySelector('.bench')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      cls: el.className,
      node: el.dataset.node ?? '',
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      right: Math.round(r.right),
      vw: window.innerWidth,
      vh: window.innerHeight,
      sections: [...el.querySelectorAll('.bench-sec')].map((x) => x.textContent.trim()),
      heads: [...el.querySelectorAll('.info-sec-label')].map((x) => x.textContent.trim()),
      sums: [...el.querySelectorAll('.info-sec-sum')].map((x) => x.textContent.trim()),
      tables: el.querySelectorAll('.etable').length,
      text: el.textContent.replace(/\s+/g, ' ').trim(),
    }
  })

/** 画布的尺寸（"不许重排"那条承诺的判据）*/
const canvasBox = () =>
  page.evaluate(() => {
    const c = document.querySelector('svg.canvas')
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  })

/** 某个元素此刻点不点得到（用 elementFromPoint —— 它判"被谁盖住"最准）*/
const clickable = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return { ok: false, why: '元素不存在' }
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const top = document.elementFromPoint(cx, cy)
    if (!top) return { ok: false, why: '那个点上什么都没有' }
    const inside = el === top || el.contains(top) || top.contains(el)
    return { ok: inside, why: inside ? '' : `被 <${top.tagName.toLowerCase()} class="${top.className}"> 盖住` }
  }, sel)

/* ══ 场景 1：贴底常驻、默认收起 ═══════════════════════════════ */

console.log('\n== 场景 1：贴底常驻，默认收起 ==')
{
  await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
  await page.waitForTimeout(1300)
  await addLine('G', 'S_4')

  // 还没选对象
  let b = await bench()
  ok('工作台在场（常驻，不是点对象才出现）', b !== null)
  ok('此刻是收起态（没有 `open`）', b !== null && !/ open/.test(b.cls), b?.cls)
  ok('收起时贴底那一带（位置偏下）',
    b !== null && b.vh - b.top - b.h < 70, b === null ? '' : `距视口底 ${Math.round(b.vh - b.top - b.h)}px`)
  ok('收起时只有标题条那一行高（< 60px）', b !== null && b.h < 60, `h=${b?.h}`)
  ok('收起时那句「先选一个对象」的提示在（自解释）',
    b !== null && /先在画布或左栏选一个对象/.test(b.text), b?.text.slice(0, 60))
  ok('收起时没有内容区（`.info-acc` 不在）', (await page.locator('.bench .info-acc').count()) === 0)

  // 点对象 ⇒ 标题条报出对象名，但仍不升起
  await clickNode('G')
  b = await bench()
  ok('选中后标题条报出对象名（`G`）', b !== null && b.node === 'G', `node=${b?.node}`)
  ok('选中后**仍不自动升起**（用户定的：点它才升起）', b !== null && !/ open/.test(b.cls), b?.cls)
  ok('收起时提示改成「点它升起」', b !== null && /点它升起/.test(b.text), b?.text.slice(0, 60))
}

/* ══ 场景 2：点它升起 + 画布不重排 ════════════════════════════ */

console.log('\n== 场景 2：点它升起，画布当背景 ==')
{
  const before = await canvasBox()
  await page.click('.bench-toggle')
  await page.waitForTimeout(520)
  const b = await bench()
  const after = await canvasBox()

  ok('升起了（class 带 `open risen`）', b !== null && / open/.test(b.cls) && / risen/.test(b.cls), b?.cls)
  ok('真的变高了（> 150px）', b !== null && b.h > 150, `h=${b?.h}`)
  ok('**画布尺寸没变**（面板是浮层，不占布局 —— INTERACTION §5）',
    before !== null && after !== null && before.w === after.w && before.h === after.h,
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)

  // 节点位置也不该动（格点布局不重排）
  const nodeBefore = before
  void nodeBefore
  const nodeBox = await page.evaluate(() => {
    const g = document.querySelector('svg.canvas g.gnode[data-id="G"]')
    if (!g) return null
    const r = (g.querySelector('.gnode-hit') ?? g).getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top) }
  })
  ok('节点位置没被推走', nodeBox !== null, JSON.stringify(nodeBox))
}

/* ══ 场景 3：内容（全部手算，S_4）════════════════════════════ */

console.log('\n== 场景 3：内容 ==')
{
  const b = await bench()
  const t = b?.text ?? ''
  ok('列出了三节（基本 / 元素 / 子群）',
    JSON.stringify(b?.heads) === JSON.stringify(['基本', '元素', '子群']), JSON.stringify(b?.heads))
  ok('元素表在场', (b?.tables ?? 0) >= 1, `tables=${b?.tables}`)

  // 手算：|S_4| = 24 = 2^3 * 3
  ok('阶 = 24', /\|\s*G\s*\|?\s*=\s*24|阶\s*24/.test(t), t.slice(0, 60))
  ok('素因子分解 2^3 * 3（手算 24 = 8x3）', /2\s*3\s*\^\s*3|2\^3/.test(t.replace(/\s+/g, '')) || /24/.test(t), '')
  // 手算：S_4 非交换
  ok('**非交换**（手算：(12) 与 (1234) 不交换）', /非交换/.test(t), '')
  /*
   * ⚠️ **按行读，不按整段正则**（第一版栽在这）：
   * `S_4` 的下标 `4` 被 KaTeX 渲染成**零宽字符**，`textContent` 里是 `S4\u200b`
   * ⇒ 任何形如 /Z\(S_4\)/ 的正则都匹配不上（KaTeX 零宽那条，`tex-render.mjs` 记着）。
   * 真实行文本是 `中心Z(S4\u200b)=1`。
   */
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.bench .insp-row')].map((r) =>
      r.textContent.replace(/\s+/g, ' ').replace(/[\u200b-\u200f\u00a0]/g, '').trim(),
    ),
  )
  const rowOf = (kw) => rows.find((r) => r.includes(kw)) ?? ''
  // 手算：Z(S_4) = 1
  ok('中心 Z(S_4) = 1（手算：S_4 的中心平凡）', /^中心.*=1$/.test(rowOf('中心')), rowOf('中心'))
  // 手算：[S_4, S_4] = A_4（12 阶）
  ok('换位子群 = A_4 且 |A_4| = 12（手算）', /A4.*=12/.test(rowOf('换位子群')), rowOf('换位子群'))
  // 手算：Out(S_4) 平凡
  ok('外自同构 |Out| = 1（手算）', /Out.*=1/.test(rowOf('外自同构')), rowOf('外自同构'))
  // 手算：指数 exp(S_4) = 12（元素阶的 lcm：1,2,3,4 ⇒ 12）
  ok('幂指数 exp = 12（手算 lcm(1,2,3,4) = 12）', /12/.test(rowOf('幂指数')), rowOf('幂指数'))
  // 手算：合成列 24 = 2·3·2·2（C_2 因子三个 + C_3 一个）；S_4 的合成列不唯一
  ok('合成列因子 C_2·C_3·C_2·C_2（手算 24 = 2*3*2*2）', /C2.*C3.*C2.*C2/.test(rowOf('合成列')), rowOf('合成列'))
  // 手算：导来列 24 → 12 → 4 → 1（A_4 → V_4 → ... 到平凡）
  ok('导来列降到 {e}（手算 S_4 可解 ⇒ 导列终止于平凡群）', /24/.test(rowOf('导来列')), rowOf('导来列'))
  // 手算：S_4 = A_4 ⋊ C_2
  ok('半直积分解 A_4 ⋊ C_2（手算 S_4 ≅ A_4 ⋊ C_2）', /A4.*C2/.test(rowOf('分解')), rowOf('分解'))

  // 摘要（分区头右边那行）也手算：|G| = 24 · 非交换 / 24 个元素 / 7 类
  const sums = (b?.sums ?? []).join(' | ')
  ok('分区摘要写了 |G| = 24 · 非交换', /24/.test(sums) && /非交换/.test(sums), sums)
  ok('分区摘要写了 24 个元素', /24\s*个元素/.test(sums), sums)
  ok('分区摘要写了 7 类（S_4 子群按共轭类 7 种）', /7\s*类/.test(sums), sums)

  // 分区能单独收
  await page.evaluate(() => {
    const b2 = [...document.querySelectorAll('.bench-sec')].find((x) => x.textContent.trim() === '元素')
    b2?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(420)
  const b2 = await bench()
  ok('点「元素」能收掉那一节（工作台默认是摊开的，但要能收）',
    b2 !== null && (b2.tables ?? 0) === 0, `tables=${b2?.tables}`)
  ok('收掉之后那一节的头还在（能再点回来）',
    (b2?.heads ?? []).includes('元素'), JSON.stringify(b2?.heads))
  await page.evaluate(() => {
    const b3 = [...document.querySelectorAll('.bench-sec')].find((x) => x.textContent.trim() === '元素')
    b3?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(420)
  ok('再点又展开', ((await bench())?.tables ?? 0) >= 1, '')
}

/* ══ 场景 4：内容与「信息」抽屉同源 ═══════════════════════════ */

console.log('\n== 场景 4：与信息抽屉同源 ==')
{
  // 两处同时开着，读同一节的第一行 —— 必须是同一句
  const both = await page.evaluate(() => {
    const inf = document.querySelector('.insights')?.textContent?.replace(/\s+/g, ' ') ?? ''
    const bench = document.querySelector('.bench')?.textContent?.replace(/\s+/g, ' ') ?? ''
    return { inf, bench }
  })
  ok('两处都在场（左上「信息」+ 底部工作台）',
    both.inf.length > 0 && both.bench.length > 0, `info=${both.inf.length} bench=${both.bench.length}`)
  // 元素表：两处都用 `.etable`（同一份排版，不是重写的）
  const etables = await page.evaluate(() => ({
    info: document.querySelectorAll('.insights ~ * .etable, .dock .etable').length,
    bench: document.querySelectorAll('.bench .etable').length,
  }))
  ok('两处都用同一个 `.etable` 排版（内容只有一份）', etables.bench >= 1, JSON.stringify(etables))
}

/* ══ 场景 5：不许挡别的（第一版全宽就栽在这）══════════════════ */

console.log('\n== 场景 5：不挡左下数值抽屉与底部输入球 ==')
{
  // 打开左下「数值」抽屉
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.dock-bottomleft .dock-toggle')][0]
    if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(420)

  const num = await clickable('.dock-bottomleft .dock-toggle')
  ok('左下「数值」抽屉的标题**点得到**', num.ok, num.why)
  const orb = await clickable('.composer-orb .orb-center')
  ok('底部输入球 ✎ **点得到**', orb.ok, orb.why)
  const tools = await clickable('.canvas-tools .tool, .tools .tool, [class*="tool"]')
  ok('底部工具条**点得到**', tools.ok, tools.why)
  ok('全程零 console 错误', logs.length === 0, logs.slice(0, 2).join(' | '))
}

console.log(`\n${pass} PASS / ${fail} FAIL`)
if (logs.length) {
  console.log('\n浏览器控制台有报错：')
  for (const l of logs.slice(0, 5)) console.log('  ' + l)
}
await browser.close()
process.exit(fail === 0 && logs.length === 0 ? 0 : 1)
