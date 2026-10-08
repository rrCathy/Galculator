/**
 * 走查：**工作台 —— 玻璃计算器**（`ui/Workbench.tsx`，v2 于 2026-10-06 落地，
 * 2026-10-07 按**方案二「横排计算器」**重排：左列=显示屏+键盘(三块)+`＋`、右列=明细；
 * 本套同日按新 DOM 再翻一次账）。
 *
 * ── 这一套守的是什么 ────────────────────────────────────────────
 * 形态（用户三轮逼出来的定案 + 方案二拍板，别退回任何一版）：
 * **左键盘 / 右明细 + 台面在标题栏 + `＋` 紧凑手风琴**。拆成可测的承诺：
 *
 *   ① **贴底常驻、点它才升起**，画布当背景（升起时画布尺寸不变）；
 *   ② **显示屏写数学身份**（`S₄` 不是 `smallGroup(12,3)`），副行才是定义；
 *   ③ **明细区一页铺开**（平铺 tab，不是手风琴），内容与信息面板**同源**（同一份 `SectionBody`）；
 *   ④ **键盘随焦点变**（P7）：焦点是群 27 键 **3 块**（造新东西 6 / 读它的结构 12 /
 *      作用与集合 9），是集合只剩「造新东西」里的「造结构」1 键；
 *      关系 op（`contains` / `isomorphism`）**不在**键盘（T2：关系归画布）；
 *   ⑤ **键盘键发起的 op 能在自己台内凑齐参数**（T1 槽位）—— 工作台升起时画布节点全被盖住，
 *      "去画布点对象"那条路真实用户走不通，槽位是唯一通路；pending 时键盘仍可用（换主意）；
 *   ⑥ **`＋` 导入**：空画布不离开工作台就能造对象（常见群 chips + 93 群库，**群库默认折起**）；
 *      **Esc / 点外关得掉**（2026-10-07 修的旧账：以前 Esc 关不掉还清焦点）；
 *   ⑦ **台面**：碰过的对象留在标题栏右侧（存 id，与画布同一份），chip 写数学名，`x` 拿下不删对象；
 *   ⑧ **文案纪律**：`·` / `…` / 字面 `**` 不许出现（no-unicode-leak 同判据，这里再钉一遍）。
 *
 * ── 期望值全部手算（`S_4`，阶 24 = 2³·3）─────────────────────────
 *   · 非交换；生成元 2 个（σ12、σ1234）；Z(S_4) = 1（中心平凡）；
 *   · [S_4,S_4] = A_4（12 阶）；Aut ≅ S_4、|Out| = 1；exp = lcm(1,2,3,4) = 12；
 *   · 合成列因子多重集 {C2,C3,C2,C2}；导来列 24▹12▹4▹1；分解 A_4 ⋊ C_2；
 *   · 元素 24 个；共轭类 5 个（类大小 {1,3,6,6,8}，每行 类大小×中心化子阶 = 24）；子群 7 个共轭类。
 *   `S_3`（阶 6，非交换，共轭类 3，子群 2 类）；`S_4 x C_6` 阶 144；`Z(S_4)` 阶 1。
 *
 * ── 2026-10-07 重写时的账 ──────────────────────────────────────
 * v1 套件断言的 `.bench-fam-head` / `.bench-op` / `.info-sec-label`（手风琴 + 任务栏）
 * 在 v2 里**已不存在**——工作台 v2 落地时这套没跟上，工作台整整一个迭代零 e2e 覆盖。
 * 教训进 `verify/README.md` 坑 75：**改 DOM 的批次，收尾必须重跑该面的走查**。
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

/** 清掉 KaTeX 的零宽字符再比文本（坑 19） */
const clean = (s) => String(s ?? '').replace(/[\u200b-\u200f\u00a0]/g, '').replace(/\s+/g, ' ').trim()

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

/**
 * 点画布节点 —— **真实鼠标**（合成事件绕过命中测试，会掩盖"工作台盖住节点"这类遮挡 bug，
 * 2026-10-05 自查抓到的系统性缺陷，见 v1 套件注释）。
 */
const clickNode = async (id) => {
  const pt = await page.evaluate((nid) => {
    const el = document.querySelector(`svg.canvas g.gnode[data-id="${nid}"] .gnode-hit`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, id)
  if (!pt) return false
  await page.mouse.click(pt.x, pt.y)
  await page.waitForTimeout(480)
  return true
}

/** 设焦点而不被工作台盖住：**先收台 → 点节点 → 再升台**（顺序反了就是 T1 那个卡死） */
const focusViaNode = async (id) => {
  const cls = await page.evaluate(() => document.querySelector('.bench')?.className ?? '')
  if (/ open/.test(cls)) {
    await page.click('.bench-toggle')
    await page.waitForTimeout(420)
  }
  const hit = await clickNode(id)
  await page.click('.bench-toggle')
  await page.waitForTimeout(600)
  return hit
}

/** 点槽位候选（真实鼠标）—— 按 `data-op` 式的 id 认候选，不按下标 */
const clickCand = async (id) => {
  const pt = await page.evaluate((want) => {
    const el = [...document.querySelectorAll('.bench-cand')].find(
      (c) => c.querySelector('.bench-cand-id')?.textContent?.trim() === want,
    )
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, id)
  if (!pt) return false
  await page.mouse.click(pt.x, pt.y)
  await page.waitForTimeout(750)
  return true
}

/** 按键盘键（`data-op` —— 不按显示文本，坑 70：显示名会随文案漂移） */
const clickKey = async (opId) =>
  page.evaluate((x) => {
    const b = [...document.querySelectorAll('.bench-key')].find((e) => e.dataset.op === x)
    if (!b) return false
    b.click()
    return true
  }, opId)

/** 工作台一次读全（v2 DOM） */
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
      vw: window.innerWidth,
      vh: window.innerHeight,
      hasBody: !!el.querySelector('.bench-body'),
      peek: el.querySelector('.bench-peek')?.textContent?.trim() ?? '',
      target: el.querySelector('.bench-target')?.textContent?.trim() ?? '',
      screenTitle: el.querySelector('.bench-screen-title')?.textContent ?? '',
      screenSub: el.querySelector('.bench-screen-sub')?.textContent ?? '',
      padHint: el.querySelector('.bench-pad-hint')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      padLabels: [...el.querySelectorAll('.bench-pad-label')].map((x) => x.textContent.trim()),
      famKeys: [...el.querySelectorAll('.bench-pad-row')].map((r) => [
        r.dataset.fam ?? '',
        r.querySelectorAll('.bench-key').length,
      ]),
      keyOps: [...el.querySelectorAll('.bench-key')].map((k) => k.dataset.op ?? ''),
      keyTitles: [...el.querySelectorAll('.bench-key')].map((k) => k.getAttribute('title') ?? ''),
      keyN: [...el.querySelectorAll('.bench-key-n')].map((k) => k.textContent.trim()),
      tabs: [...el.querySelectorAll('.bench-tab')].map((t) => t.dataset.tab ?? ''),
      tabSums: [...el.querySelectorAll('.bench-tab')].map(
        (t) => `${t.dataset.tab}:${t.querySelector('.bench-tab-sum')?.textContent?.trim() ?? ''}`,
      ),
      inspRows: [...el.querySelectorAll('.bench .insp-row')].map((x) => x.textContent),
      etables: el.querySelectorAll('.etable').length,
      elementRows: el.querySelectorAll('.etable tbody tr').length,
      slots: el.querySelectorAll('.bench-slots').length,
      slotHead: el.querySelector('.bench-slot-head')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      cands: [...el.querySelectorAll('.bench-cand .bench-cand-id')].map((x) => x.textContent.trim()),
      busy: !!el.querySelector('.bench-detail.busy'),
      stage: [...el.querySelectorAll('.bench-chip')].map((c) => ({
        main: c.querySelector('.bench-chip-main')?.textContent ?? '',
        title: c.querySelector('.bench-chip-main')?.getAttribute('title') ?? '',
      })),
      foot: el.querySelector('.bench-foot')?.textContent ?? '',
      text: el.textContent,
    }
  })

const canvasBox = () =>
  page.evaluate(() => {
    const c = document.querySelector('svg.canvas')
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  })

/** 某个元素此刻点不点得到（elementFromPoint 判"被谁盖住"最准） */
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

/* ══ 场景 1：贴底常驻、默认收起、收起条文案 ═══════════════════ */

console.log('\n== 场景 1：贴底常驻，默认收起 ==')
{
  await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
  await page.waitForTimeout(1300)
  await addLine('G', 'S_4')

  let b = await bench()
  ok('工作台在场（常驻，不是点对象才出现）', b !== null)
  ok('此刻是收起态（没有 `open`）', b !== null && !/ open/.test(b.cls), b?.cls)
  ok('收起时贴底那一带（位置偏下）',
    b !== null && b.vh - b.top - b.h < 70, b === null ? '' : `距视口底 ${Math.round(b.vh - b.top - b.h)}px`)
  ok('收起时只有标题条那一行高（< 60px）', b !== null && b.h < 60, `h=${b?.h}`)
  ok('收起时内容区不渲染（bench-body 不在）', b !== null && !b.hasBody)

  /*
   * 收起条报能力（W1 的措辞翻账后）+ **文案纪律**：
   * 分隔一律 ASCII `-`（`·` 键盘打不出来，no-unicode-leak 判据）—— 2026-10-07 收尾修过一处。
   */
  ok('收起条写着它能干什么（造对象 / 对它做事 / 翻结构）',
    b !== null && /造对象/.test(b.peek) && /对它做事/.test(b.peek) && /翻它的结构/.test(b.peek), b?.peek)
  ok('分隔是 ASCII `-`，不是键盘打不出的 `·`', b !== null && b.peek === '点开：造对象 - 对它做事 - 翻它的结构', b?.peek)
  ok('收起条**不再**说「先选一个对象」（那是第一版那个错）',
    b !== null && !/先在画布或左栏选一个对象/.test(b.text), clean(b?.text).slice(0, 60))

  await clickNode('G')
  b = await bench()
  ok('选中后标题条报出对象名（`G`）', b !== null && b.node === 'G', `node=${b?.node}`)
  ok('选中后**仍不自动升起**（用户定的：点它才升起）', b !== null && !/ open/.test(b.cls), b?.cls)
}

/* ══ 场景 2：点它升起 + 画布当背景 + 不挡输入球 ═══════════════ */

console.log('\n== 场景 2：点它升起，画布当背景 ==')
{
  const before = await canvasBox()
  await page.click('.bench-toggle')
  await page.waitForTimeout(520)
  const b = await bench()
  const after = await canvasBox()

  ok('升起了（class 带 `open risen`）', b !== null && / open/.test(b.cls) && / risen/.test(b.cls), b?.cls)
  ok('真的变高了（玻璃大台面 > 400px）', b !== null && b.h > 400, `h=${b?.h}`)
  ok('**画布尺寸没变**（面板是浮层，不占布局 —— INTERACTION §5）',
    before !== null && after !== null && before.w === after.w && before.h === after.h,
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)

  const nodeBox = await page.evaluate(() => {
    const g = document.querySelector('svg.canvas g.gnode[data-id="G"]')
    if (!g) return null
    const r = (g.querySelector('.gnode-hit') ?? g).getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top) }
  })
  ok('节点位置没被推走', nodeBox !== null, JSON.stringify(nodeBox))

  /* 工作台占大半屏会盖住输入球 ⇒ App 拿 onHeight 把球抬到台顶之上（onHeight 的注释） */
  const orb = await clickable('.composer-orb .orb-center')
  ok('底部输入球 ✎ **点得到**（升台后被抬起来了）', orb.ok, orb.why)
  const tools = await clickable('.canvas-tools .tool, .tools .tool, [class*="tool"]')
  ok('底部工具条**点得到**', tools.ok, tools.why)
}

/* ══ 场景 3：显示条 + 明细区（手算 S_4）═══════════════════════ */

console.log('\n== 场景 3：显示条与明细区 ==')
{
  const b = await bench()
  ok('显示条标题是**数学身份** S4（不是 smallGroup(12,3) 那种构造式）',
    clean(b?.screenTitle) === 'S4', clean(b?.screenTitle))
  ok('显示条副行报阶（手算 |S_4| = 24）', /阶\s*24/.test(clean(b?.screenSub)), clean(b?.screenSub))

  ok('明细区是平铺 tab：基本 / 元素 / 共轭类 / 子群（这个顺序）',
    JSON.stringify(b?.tabs) === JSON.stringify(['basic', 'elements', 'conj', 'subgroups']), JSON.stringify(b?.tabs))
  const sums = (b?.tabSums ?? []).join(' | ')
  ok('tab 摘要手算全对（|G| = 24 - 非交换 · 24 个元素 · 5 类 · 7 类）',
    /basic:\|G\| = 24 - 非交换/.test(sums) && /elements:24 个元素/.test(sums) &&
      /conj:5 类/.test(sums) && /subgroups:7 类/.test(sums), sums)

  /* 结论层按行读（KaTeX 零宽先抹掉，坑 19） */
  const rows = (b?.inspRows ?? []).map(clean)
  const rowOf = (kw) => rows.find((r) => r.includes(kw)) ?? ''
  ok('课本结论：中心 Z(S_4) = 1（手算：S_4 中心平凡）', /^中心.*=1$/.test(rowOf('中心')), rowOf('中心'))
  ok('课本结论：换位子群 = A_4 且 |A_4| = 12', /A4.*=12/.test(rowOf('换位子群')), rowOf('换位子群'))
  ok('课本结论：外自同构 |Out| = 1', /Out.*=1/.test(rowOf('外自同构')), rowOf('外自同构'))
  ok('课本结论：幂指数 exp = 12（lcm(1,2,3,4)）', /12/.test(rowOf('幂指数')), rowOf('幂指数'))
  ok('结构：合成列因子 C2·C3·C2·C2（24 = 2*3*2*2）', /C2.*C3.*C2.*C2/.test(rowOf('合成列')), rowOf('合成列'))
  ok('结构：导来列 24▹12▹4▹1 降到底', /24▹12▹4▹1/.test(rowOf('导来列')), rowOf('导来列'))
  ok('结构：分解 A_4 ⋊ C_2（手算 S_4 ≅ A_4 ⋊ C_2）', /A4.*C2/.test(rowOf('分解')), rowOf('分解'))

  /* 「元素」tab：元素表是逐元素 24 行（坑 47：呈现粒度变了行数含义会变——当前就是 24 行） */
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.bench-tab')].find((x) => x.dataset.tab === 'elements')
    t?.click()
  })
  await page.waitForTimeout(600)
  const b2 = await bench()
  ok('切到「元素」tab 后元素表在场（与信息面板同一个 `.etable`）', (b2?.etables ?? 0) >= 1, `tables=${b2?.etables}`)
  ok('元素表 24 行（手算：S_4 有 24 个元素，逐元素一行）', b2?.elementRows === 24, `rows=${b2?.elementRows}`)

  /* 「共轭类」tab：类方程 + 轨道-稳定子逐行对账 */
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.bench-tab')].find((x) => x.dataset.tab === 'conj')
    t?.click()
  })
  await page.waitForTimeout(600)
  const conj = await page.evaluate(() =>
    [...document.querySelectorAll('.bench .conj-table tbody tr')].map((r) =>
      [...r.querySelectorAll('td')].map((c) => c.textContent.trim()),
    ),
  )
  ok('共轭类表 5 行（手算：S_4 有 5 个共轭类）', conj.length === 5, JSON.stringify(conj.map((r) => r[1])))
  ok('类大小集合 = {1,3,6,6,8}（手算 S_4 的类方程 1+3+6+8+6 = 24）',
    JSON.stringify(conj.map((r) => Number(r[2])).sort((x, y) => x - y)) === JSON.stringify([1, 3, 6, 6, 8]),
    JSON.stringify(conj.map((r) => r[2])))
  ok('每行都满足「类大小 x 中心化子阶 = 24」（轨道-稳定子）',
    conj.every((r) => Number(r[2]) * Number(r[3]) === 24), JSON.stringify(conj.map((r) => r[2] + 'x' + r[3])))
  ok('共轭类节的脚注说了轨道-稳定子对账',
    /轨道-稳定子/.test(await page.evaluate(() => document.querySelector('.bench .conj-note')?.textContent ?? '')))

  /* 脚注是 def（可贴回输入框）。注意它走 KaTeX：`S_4` 的 textContent 是 `S4`（坑 19/40） */
  ok('底部脚注回到定义式（S_4 的渲染形态）', clean(b?.foot) === 'S4', clean(b?.foot))
}

/* ══ 场景 4：符号键盘随焦点变（P7）════════════════════════════ */

console.log('\n== 场景 4：符号键盘随焦点变 ==')
{
  await addLine('P', 'labeledSet(a, b, c)')
  await focusViaNode('G') // 焦点 = S_4（先收台再点节点，避开遮挡）

  let b = await bench()
  ok('群焦点：27 枚键（实测注册表里"第一参吃画布对象"且 canPick 放行的全部）',
    b?.keyOps.length === 27, `keys=${b?.keyOps.length}`)
  ok('分成 3 块（造新东西 / 读它的结构 / 作用与集合 —— 2026-10-07 方案二重排）',
    b?.padLabels.length === 3 &&
      /造新东西/.test(b.padLabels.join('|')) && /读它的结构/.test(b.padLabels.join('|')) &&
      /作用与集合/.test(b.padLabels.join('|')), JSON.stringify(b?.padLabels))
  ok('块的键数手算全对（造 6 / 读 12 / 作用与集合 9；6+12+9 = 27）',
    JSON.stringify(b?.famKeys) === JSON.stringify([['build', 6], ['read', 12], ['actset', 9]]),
    JSON.stringify(b?.famKeys))
  ok('键集里有用户要的核心动作（Z / Sub / Syl / 直积 / 商 / 共轭作用 / 底集）',
    ['center', 'subgroups', 'sylow', 'directProduct', 'quotient', 'conjugationAction', 'underlyingSet']
      .every((op) => b.keyOps.includes(op)), JSON.stringify(b?.keyOps))
  ok('关系 op **不在**键盘（contains / isomorphism 归画布，T2）',
    !b.keyOps.includes('contains') && !b.keyOps.includes('isomorphism'))

  ok('每枚键都有 title（悬停出中文全名，不许有看不见的按钮）',
    b.keyTitles.length === b.keyOps.length && b.keyTitles.every((t) => t.length > 0))
  const centerTitle = b.keyTitles[b.keyOps.indexOf('center')] ?? ''
  ok('center 键的 title 以中文全名开头（中心（Z(G)））', centerTitle.startsWith('中心（Z(G)）'), centerTitle)
  ok('全部键 title 里没有 `·` / `…` / 字面 `**`（文案纪律，2026-10-07 修过 title 分隔符）',
    b.keyTitles.every((t) => !t.includes('·') && !t.includes('…') && !t.includes('**')))

  ok('2 对象的键带角标（bench-key-n），且角标一律是 2',
    b.keyN.length > 0 && b.keyN.every((n) => n === '2'), JSON.stringify(b.keyN))

  /* 焦点换成集合 ⇒ 键盘只剩「造结构」1 枚（P7：眼前只有十来个键，集合时更少） */
  await focusViaNode('P')
  b = await bench()
  ok('集合焦点：键盘只剩 1 枚键', b?.keyOps.length === 1, JSON.stringify(b?.keyOps))
  ok('而且就是「给它一个运算」（structure）', b?.keyOps[0] === 'structure', JSON.stringify(b?.keyOps))

  /* 结构 op 要编辑器：表 9 格（手算载体 3 个元素）+ 细节区让位 + **键盘留着** */
  await clickKey('structure')
  await page.waitForTimeout(800)
  const ed = await page.evaluate(() => ({
    open: !!document.querySelector('.struct-builder'),
    cells: document.querySelectorAll('.sb-cell').length,
    busy: !!document.querySelector('.bench-detail.busy'),
    keys: document.querySelectorAll('.bench-key').length,
  }))
  ok('点「造结构」编辑器直接开（不用去别处找入口）', ed.open)
  ok('表已铺好（3 x 3 = 9 格，手算：载体 3 个元素）', ed.cells === 9, `cells=${ed.cells}`)
  ok('编辑器开着时细节区让位（两者贴底会重叠）', ed.busy)
  ok('**键盘留着**（改主意不必先关编辑器 —— 2026-10-07 修：焦点不再在 busy 时被掐掉）',
    ed.keys === 1, `keys=${ed.keys}`)
  await page.evaluate(() => document.querySelector('.map-builder .mb-x')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await page.waitForTimeout(500)
  ok('x 关得掉', (await page.locator('.map-builder').count()) === 0)
}

/* ══ 场景 5：＋ 导入对象（空画布不下台就造得出）═══════════════ */

console.log('\n== 场景 5：＋ 导入对象 ==')
{
  await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  await page.click('.bench-toggle')
  await page.waitForTimeout(600)

  let b = await bench()
  ok('空画布上升起：显示条明说「还没有对象」', clean(b?.screenTitle) === '还没有对象', clean(b?.screenTitle))
  ok('键盘区不摆死按钮（没有对象就没有键、没有块，也不写教学句子）',
    (b?.keyOps.length ?? -1) === 0 && (b?.padLabels.length ?? -1) === 0 && (b?.padHint ?? 'x') === '',
    JSON.stringify({ keys: b?.keyOps.length, labels: b?.padLabels.length, hint: b?.padHint }))

  await page.click('.bench-plus')
  await page.waitForTimeout(900)
  const plus = await page.evaluate(() => ({
    panel: !!document.querySelector('.bench-plus-panel'),
    quick: [...document.querySelectorAll('.bench-plus-panel .plus-quick .plus-chip')].map((c) => c.textContent.trim()),
    libOpen: !!document.querySelector('.bench-plus-panel .plus-lib-body'),
  }))
  ok('＋ 面板拉出来（左列内联的紧凑手风琴）', plus.panel)
  ok('常见群 chips 在（S_3 / S_4 / A_4 / Q_8 …）',
    plus.quick.includes('S_3') && plus.quick.includes('S_4') && plus.quick.includes('Q_8'), JSON.stringify(plus.quick))
  ok('群库**默认折起**（2026-10-07 紧凑化，用户点名）', plus.libOpen === false, `libOpen=${plus.libOpen}`)
  await page.click('.bench-plus-panel .plus-lib-head')
  await page.waitForTimeout(700)
  const lib = await page.evaluate(() => ({
    libRows: document.querySelectorAll('.bench-plus-panel .plus-lib-row').length,
    libChips: document.querySelectorAll('.bench-plus-panel .plus-lib .plus-chip').length,
  }))
  ok('展开后按阶分组：31 行（手算 1–31 阶）', lib.libRows === 31, `rows=${lib.libRows}`)
  ok('群库共 93 枚 chip（手算：1–31 阶共 93 个群）', lib.libChips === 93, `chips=${lib.libChips}`)

  /* 点常见群 S_3 ⇒ 真造出对象、焦点切过去、自动上台面 */
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll('.bench-plus-panel .plus-quick .plus-chip')].find(
      (c) => c.textContent.trim() === 'S_3',
    )
    chip?.click()
  })
  await page.waitForTimeout(900)
  b = await bench()
  ok('点 chip 后面板收起、焦点切到新对象', (await page.locator('.bench-plus-panel').count()) === 0 && b?.node !== '')
  ok('新对象是 S_3（数学身份上屏）', clean(b?.screenTitle) === 'S3', clean(b?.screenTitle))
  ok('手算 |S_3| = 6（副行报阶）', /阶\s*6/.test(clean(b?.screenSub)), clean(b?.screenSub))
  ok('键盘跟着换焦点（群键回来了）', (b?.keyOps.length ?? 0) > 20, `keys=${b?.keyOps.length}`)
  ok('新对象自动上台面（chip 在，且写数学名 S3）', (b?.stage.length ?? 0) === 1 && clean(b.stage[0].main) === 'S3',
    JSON.stringify(b?.stage.map((c) => clean(c.main))))

  /* S_3 的明细手算：非交换 / 3 个共轭类 / 2 类子群 */
  const sums = (b?.tabSums ?? []).join(' | ')
  ok('S_3 摘要手算全对（|G| = 6 - 非交换 · 3 类 · 2 类）',
    /basic:\|G\| = 6 - 非交换/.test(sums) && /conj:3 类/.test(sums) && /subgroups:2 类/.test(sums), sums)
}

/* ══ 场景 6：键盘发起 op —— 槽位凑参数（不碰画布）+ 单对象直接执行 ═
 *
 * T1 的结构性卡死：工作台升起时画布节点全被盖住，"去画布点对象"走不通。
 * 键盘键发起的二元 op 必须能在台内的**槽位**里凑齐第二参。
 */

console.log('\n== 场景 6：槽位凑参数与直接执行 ==')
{
  await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  await addLine('G', 'S_4')
  await addLine('Q', 'C_6')
  await focusViaNode('G')

  /*
   * 旧账（2026-10-07 修）：`＋` 面板的 **Esc / 点外关闭**。
   * 以前按 Esc 关不掉面板、反而把焦点清掉（真机复现过）——现在层叠：
   * 面板开着时 Esc 先关面板（捕获段拦截），再按一次才轮到 App 的取消。
   */
  await page.click('.bench-plus')
  await page.waitForTimeout(500)
  ok('＋ 面板开得出来（给"关法"钉钉子用）', (await page.locator('.bench-plus-panel').count()) === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  let b0 = await bench()
  ok('Esc 关掉面板**且不动焦点**（显示条仍是 S_4、键盘仍是 27 键）',
    (await page.locator('.bench-plus-panel').count()) === 0 && clean(b0?.screenTitle) === 'S4' &&
      (b0?.keyOps.length ?? 0) === 27,
    `title=${clean(b0?.screenTitle)} keys=${b0?.keyOps.length}`)
  await page.click('.bench-plus')
  await page.waitForTimeout(400)
  const screenPt = await page.evaluate(() => {
    const el = document.querySelector('.bench-screen')
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await page.mouse.click(screenPt.x, screenPt.y)
  await page.waitForTimeout(300)
  ok('点面板外面（显示屏上）也关得掉，焦点不动',
    (await page.locator('.bench-plus-panel').count()) === 0 && (await bench())?.node === 'G')

  const nodesBefore = await page.locator('svg.canvas g.gnode').count()
  ok('点「直积」进 pending（第 2 位等一个群）', await clickKey('directProduct'))
  await page.waitForTimeout(700)

  let b = await bench()
  ok('台内出现槽位区（不用去画布）', b?.slots === 1, `slots=${b?.slots}`)
  ok('槽位头说清在等谁（直积 · 在下面点）',
    /正在选对象/.test(b?.slotHead ?? '') && /直积/.test(b?.slotHead ?? ''), b?.slotHead)
  /* 2026-10-07 修的钉子：busy 时焦点不再被掐 —— 显示条保持对象并报「正在选参数」 */
  ok('显示条保持焦点并报进度（阶 24 - 正在选参数：1 / 2）',
    /正在选参数：1 \/ 2/.test(clean(b?.screenSub)) && /24/.test(clean(b?.screenSub)), clean(b?.screenSub))
  ok('键盘在 pending 时仍可用（焦点没被掐掉）', (b?.keyOps.length ?? 0) === 27, `keys=${b?.keyOps.length}`)
  ok('候选里有 C_6（Q）', b?.cands.includes('Q'), JSON.stringify(b?.cands))

  ok('点槽位候选（真实鼠标）', await clickCand('Q'))
  b = await bench()
  ok('选完就真算出来（pending 收了、画布多一个对象）',
    b?.slots === 0 && (await page.locator('svg.canvas g.gnode').count()) === nodesBefore + 1,
    `nodes=${await page.locator('svg.canvas g.gnode').count()}`)
  ok('直积阶 = 144（手算 24 x 6），结果自动成焦点',
    /阶\s*144/.test(clean(b?.screenSub)), clean(b?.screenSub))
  /*
   * 台面记的是"**工作台开着时碰过的对象**"（App.tsx：只 `benchOpen` 时记焦点）。
   * Q 建行时工作台没开 ⇒ 不在台上；G（focusViaNode）与产物（自动成焦点）在。
   */
  ok('产物自动上台面（台面上是 G 与直积；Q 没在开台时碰过所以不在）',
    (b?.stage.length ?? 0) === 2 &&
      b.stage.some((c) => clean(c.main) === 'S4') && /S4.*C6/.test(clean(b.stage[b.stage.length - 1].main)),
    JSON.stringify(b?.stage.map((c) => clean(c.main))))

  /* 切回 G（点台面 chip），再试单对象 op：焦点就是全部参数 ⇒ 直接执行（W5 连续演算） */
  ok('点台面 chip 切回焦点 G',
    await page.evaluate(() => {
      const chip = [...document.querySelectorAll('.bench-chip .bench-chip-main')].find(
        (c) => c.getAttribute('title') === '切到 G',
      )
      if (!chip) return false
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    }))
  await page.waitForTimeout(500)
  const stageBefore = (await bench())?.stage.length ?? 0
  ok('点「中心 Z(G)」直接算（S_4 中心平凡，无 pending）', await clickKey('center'))
  await page.waitForTimeout(900)
  b = await bench()
  ok('没有 pending（单对象 op 一步到位）', b?.slots === 0, `slots=${b?.slots}`)
  ok('结果自动成焦点：Z(S_4) 阶 1（手算中心平凡）', /阶\s*1/.test(clean(b?.screenSub)), clean(b?.screenSub))
  ok('台面又多了一枚（连续演算都留在台上）', (b?.stage.length ?? 0) === stageBefore + 1,
    JSON.stringify(b?.stage.map((c) => clean(c.main))))
}

/* ══ 场景 7：台面 chip —— 数学名 / 切焦点 / x 拿下不删 ═════════ */

console.log('\n== 场景 7：台面 ==')
{
  const b = await bench()
  ok('chip 上写的是数学名（S4），对象名进 title（切到 G）',
    b.stage.some((c) => clean(c.main) === 'S4' && c.title === '切到 G'), JSON.stringify(b.stage))

  /* 点 chip = 切焦点（与"点画布节点"同一个函数 onPick） */
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll('.bench-chip')].find(
      (c) => c.querySelector('.bench-chip-main')?.getAttribute('title') === '切到 G',
    )
    chip?.querySelector('.bench-chip-main')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(500)
  const b2 = await bench()
  ok('点 chip 切回焦点 G（显示条回到 S_4）', b2?.node === 'G' && clean(b2?.screenTitle) === 'S4',
    `node=${b2?.node} title=${clean(b2?.screenTitle)}`)

  /* x = 拿下台面，**不删对象** */
  const nodesBefore = await page.locator('svg.canvas g.gnode').count()
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll('.bench-chip')].find(
      (c) => c.querySelector('.bench-chip-main')?.getAttribute('title') === '切到 G',
    )
    chip?.querySelector('.bench-chip-x')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(500)
  const b3 = await bench()
  ok('x 把 G 拿下台面（chip 少一枚）', b3?.stage.length === (b2?.stage.length ?? 0) - 1,
    JSON.stringify(b3?.stage.map((c) => c.title)))
  ok('但对象还在画布上（拿下 != 删除）',
    (await page.locator('svg.canvas g.gnode').count()) === nodesBefore, `nodes=${nodesBefore}`)
}

/* ══ 场景 8：全局卫生 —— 工作台各态扫一遍"键盘打不出的字符" ═══ */

console.log('\n== 场景 8：文案纪律（工作台各态）==')
{
  /* 与 no-unicode-leak 同一判据：ASCII + 中文 + 中文标点 + 全角 + 引号 + 空白 */
  const ALLOWED_SRC = '[\\x20-\\x7E\\u3000-\\u303F\\u4E00-\\u9FFF\\uFF00-\\uFFEF\\u2018-\\u201D\\n\\r\\t]'
  const scan = () =>
    page.evaluate((allowedSrc) => {
      const ALLOWED = new RegExp(allowedSrc)
      const out = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let n
      while ((n = walker.nextNode())) {
        const el = n.parentElement
        if (!el) continue
        if (el.closest('.katex')) continue
        if (el.closest('script, style, .tmp-probe')) continue
        const t = (n.nodeValue ?? '').trim()
        if (!t) continue
        out.push({ text: t, where: (el.className || el.tagName).toString().slice(0, 40) })
      }
      for (const el of document.querySelectorAll('[title], [placeholder], [aria-label]')) {
        for (const a of ['title', 'placeholder', 'aria-label']) {
          const v = el.getAttribute(a)
          if (v?.trim()) out.push({ text: v, where: `${el.tagName}[${a}]` })
        }
      }
      return out
        .map((r) => ({ ...r, bad: [...new Set([...r.text].filter((c) => !ALLOWED.test(c)))] }))
        .filter((r) => r.bad.length > 0)
    }, ALLOWED_SRC)

  /* 态 1：焦点在群（键盘 27 键的 title 全在被扫之列） */
  let leaks = await scan()
  ok('焦点群（27 键全挂 title）：无键盘打不出的字符', leaks.length === 0,
    leaks.slice(0, 3).map((l) => `${l.bad.join('')} @ ${l.where}: ${l.text.slice(0, 40)}`).join(' | '))

  /* 态 2：pending（槽位区 + 显示条「正在选参数」） */
  await clickKey('directProduct')
  await page.waitForTimeout(700)
  leaks = await scan()
  ok('pending（槽位 + 进度副行）：无键盘打不出的字符', leaks.length === 0,
    leaks.slice(0, 3).map((l) => `${l.bad.join('')} @ ${l.where}: ${l.text.slice(0, 40)}`).join(' | '))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  /* 态 3：＋ 面板全开（常见群 + 93 群库 chip + 造集合/造结构表单） */
  await page.click('.bench-plus')
  await page.waitForTimeout(900)
  leaks = await scan()
  ok('＋ 面板（群库 93 chip）：无键盘打不出的字符', leaks.length === 0,
    leaks.slice(0, 3).map((l) => `${l.bad.join('')} @ ${l.where}: ${l.text.slice(0, 40)}`).join(' | '))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  ok('全程零 console 错误', logs.length === 0, logs.slice(0, 2).join(' | '))
}

console.log(`\n${pass} PASS / ${fail} FAIL`)
if (logs.length) {
  console.log('\n浏览器控制台有报错：')
  for (const l of logs.slice(0, 5)) console.log('  ' + l)
}
await browser.close()
process.exit(fail === 0 && logs.length === 0 ? 0 : 1)
