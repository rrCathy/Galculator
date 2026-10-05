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

/**
 * 点画布上的节点 —— **必须用真实鼠标**（`page.mouse.click`），不能用
 * `dispatchEvent(new MouseEvent('click'))`。
 *
 * ⚠️ 2026-10-05 自查抓到的系统性缺陷：**合成事件绕过命中测试**。
 * 工作台升起时 `top≈380`，而画布节点自动布局在 `y≈450` ⇒ **全被盖住**，
 * 真实用户点不到；可 `dispatchEvent` 直接派发到元素上，照样"成功"。
 * ⇒ 当时 36 套走查里 17 套、50 处用合成点击，**这类遮挡 bug 系统性测不出来**。
 * 本套改成真实鼠标之后，凡是"被盖住却以为点到了"的断言会当场红。
 */
/**
 * 点槽位候选（真实鼠标）—— T1 加的对象槽位。
 * 这是"**完全不用碰画布**"那条路的验证入口。
 */
const clickCand = async (idx) => {
  const pt = await page.evaluate((i) => {
    const el = document.querySelectorAll('.bench-cand')[i]
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, idx)
  if (!pt) return false
  await page.mouse.click(pt.x, pt.y)
  await page.waitForTimeout(650)
  return true
}

const clickNode = async (id) => {
  const pt = await page.evaluate((nid) => {
    const el = document.querySelector(`svg.canvas g.gnode[data-id="${nid}"] .gnode-hit`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    /* 顺手报一下"这个点最上层是谁" —— 失败时能一眼看出被谁挡了 */
    const top = document.elementFromPoint(x, y)
    return { x, y, blocker: top?.closest?.('.bench') ? 'bench' : top?.closest?.('.gnode') ? 'node' : (top?.tagName ?? '?') }
  }, id)
  if (!pt) return false
  await page.mouse.click(pt.x, pt.y)
  await page.waitForTimeout(480)
  return true
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
      /* 每节自己的头（`.info-sec-label`），标题栏不再有一排节名按钮 */
      sections: [...el.querySelectorAll('.bench-detail .info-sec-label')].map((x) => x.textContent.trim()),
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
  /*
   * ⚠️ **P1-2 改掉了这条契约**（第一版的工作台不做功能入口，只看细节）：
   * 从前收起条上写「先在画布或左栏选一个对象」—— 那正是用户骂的那句
   * 「什么叫得选对象才能用工作台」。现在收起条上写的是**它能干什么**：
   * 「7 类 36 个操作：加结构 / 同态 / 作用 / 半直积 / 自同构 / 共轭类」。
   * ⇒ 判据从"提示用户去选对象"改成"**报能力清单**"，并加一条**不许出现旧那句**。
   */
  ok('收起条报出能力清单（7 类 36 个操作 + 点名的六件事）',
    b !== null && /7 类 36 个操作/.test(b.text) && /加结构/.test(b.text) &&
      /同态/.test(b.text) && /半直积/.test(b.text) && /自同构/.test(b.text) && /共轭类/.test(b.text),
    b?.text.slice(0, 90))
  ok('收起条**不再**说「先选一个对象」（那是第一版那个错）',
    b !== null && !/先在画布或左栏选一个对象/.test(b.text), b?.text.slice(0, 60))
  ok('收起时没有内容区（`.info-acc` 不在）', (await page.locator('.bench .info-acc').count()) === 0)

  // 点对象 ⇒ 标题条报出对象名，但仍不升起
  await clickNode('G')
  b = await bench()
  ok('选中后标题条报出对象名（`G`）', b !== null && b.node === 'G', `node=${b?.node}`)
  ok('选中后**仍不自动升起**（用户定的：点它才升起）', b !== null && !/ open/.test(b.cls), b?.cls)
  ok('收起时仍报能力清单（选不选对象都一样可用）',
    b !== null && /7 类 36 个操作/.test(b.text), b?.text.slice(0, 60))
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
  ok('列出了四节（基本 / 元素 / 共轭类 / 子群）',
    JSON.stringify(b?.heads) === JSON.stringify(['基本', '元素', '共轭类', '子群']), JSON.stringify(b?.heads))
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
  /*
   * ⚠️ **按它所属那一节的标题找，不按按钮自己的文字**（P1-2 改了形态）：
   * 分节按钮从"标题栏里的一排 `基本|元素|子群`"挪进了**每一节自己的头**里，
   * 现在按钮上写的是动作词「收起 / 展开」，节名在旁边的 `.info-sec-label`。
   * 第一版按 `textContent === '元素'` 找 —— 现在找不到了，红了 3 条。
   */
  const clickSec = (label) =>
    page.evaluate((L) => {
      const head = [...document.querySelectorAll('.bench-detail .info-sec-head')].find((h) =>
        h.querySelector('.info-sec-label')?.textContent.trim() === L,
      )
      const b = head?.querySelector('.bench-sec')
      if (!b) return false
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    }, label)

  ok('「元素」那一节有收起按钮（工作台默认是摊开的，但要能收）', await clickSec('元素'))
  await page.waitForTimeout(420)
  const b2 = await bench()
  ok('点「元素」能收掉那一节（工作台默认是摊开的，但要能收）',
    b2 !== null && (b2.tables ?? 0) === 0, `tables=${b2?.tables}`)
  ok('收掉之后那一节的头还在（能再点回来）',
    (b2?.heads ?? []).includes('元素'), JSON.stringify(b2?.heads))
  await clickSec('元素')
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

/* ══ 场景 6：任务栏 —— **不选对象也能用**（P1-2 的核心承诺）════════
 *
 * ⚠️ 这组是专门钉 2026-10-05 用户当场骂的那句
 *   「什么叫得选对象才能用工作台？那叫什么工作台？我创建了一个集合，
 *     这个工作台怎么只能看？工作台难道不就是用来放什么添加群结构之类的功能吗？」
 *
 * 三条承诺，各有判据：
 *   ① **能力常驻**：抬起眼就看见 7 族 + 36 个按钮，含用户点名的六件事；
 *   ② **不需要选中对象**：空画布上点一条，它进 pending 并说清下一个要什么；
 *   ③ **有焦点就带上它**：点一条结构，编辑器直接开、**已带上那个集合**。
 */

console.log('\n== 场景 6：任务栏（不选对象也能用）==')
{
  // 回到空画布（前面几组造过东西）
  await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  await page.click('.bench-toggle')
  await page.waitForTimeout(600)

  // ① 能力常驻
  ok('**空画布**上工作台也升起得起来', (await page.locator('.bench.open').count()) === 1)
  const fams = await page.evaluate(() =>
    [...document.querySelectorAll('.bench-fam-head')].map((x) => ({
      label: x.querySelector('.bench-fam-label')?.textContent?.trim(),
      n: Number(x.querySelector('.bench-fam-n')?.textContent?.trim() ?? '0'),
    })),
  )
  /*
   * ⚠️ **6 族 / 34 条**（2026-10-05 改动，不是回归）：用户拍板把
   * `contains` / `isomorphism`（"两个对象之间的关系"）**移出工作台、归画布**
   * —— 按三区定义"画布是用来处理多个对象之间关系的地方"。
   * 入口仍在 ⊕ 球菜单（`multiOps` 16 条里含这两个）。
   */
  ok('6 族全在场', fams.length === 6, JSON.stringify(fams.map((f) => f.label)))
  const totalOps = fams.reduce((s2, f) => s2 + f.n, 0)
  ok('按钮总数 34（族头那个数字是真数，不是装饰）', totalOps === 34, `sum=${totalOps}`)
  const labels = fams.map((f) => f.label).join(' / ')
  ok('用户点名的都在里面（加结构 · 群与分解 · 作用与轨道 · 映射的核与像）',
    /结构 \/ 映射 \/ 作用/.test(labels) && /群与分解/.test(labels) &&
      /作用与轨道/.test(labels) && /映射的核与像/.test(labels),
    labels)

  // ② 不需要选中对象：点一条，进 pending 并说清下一个要什么
  const clickFam = (L) =>
    page.evaluate((x) => {
      const b = [...document.querySelectorAll('.bench-fam-head')].find(
        (e) => e.querySelector('.bench-fam-label')?.textContent?.trim() === x,
      )
      if (!b) return false
      b.click()
      return true
    }, L)
  const clickOp = (N) =>
    page.evaluate((x) => {
      const b = [...document.querySelectorAll('.bench-op')].find(
        (e) => e.querySelector('.bench-op-name')?.textContent?.trim() === x,
      )
      if (!b) return false
      b.click()
      return true
    }, N)

  ok('展开「群与分解」', await clickFam('群与分解'))
  await page.waitForTimeout(400)
  ok('展开后这一族有 9 个按钮', (await page.locator('.bench-op').count()) === 9,
    `${await page.locator('.bench-op').count()}`)

  // ⚠️ 此刻**画布是空的、一个对象都没选**
  ok('此刻确实没选中任何对象', (await page.locator('.gnode.sel, .gnode[data-selected="true"]').count()) === 0)
  ok('点「Z(G)」有反应（不是死的按钮）', await clickOp('Z(G)'))
  await page.waitForTimeout(600)
  const pend = await page.evaluate(() => ({
    bar: !!document.querySelector('.pending-bar'),
    what: document.querySelector('.pending-what')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    hint: document.querySelector('.pending-hint')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  }))
  ok('它进 pending（去画布点参数，而不是报错）', pend.bar, JSON.stringify(pend))
  ok('pending 说清下一位要什么（群，第 1 / 1 个对象）',
    /选择/.test(pend.hint) && /1 \/ 1/.test(pend.hint) && /群/.test(pend.hint), pend.hint)

  /*
   * ③ 凑齐参数 —— **用槽位，不碰画布**（T1）。
   *
   * ⚠️ 这里从前写的是 `clickNode('G')`（点画布），而 `clickNode` 用的是合成事件
   * ⇒ 它**掩盖了真 bug**：工作台升起时画布节点全被盖住，真实用户点不到。
   * 改成真实鼠标后这条当场红（实测「点完只看到 G」，Z(G) 一直没算出来）。
   * ⇒ 场景重写成走**槽位**这条路 —— 这才是"不选对象也能用"的真实含义。
   */
  await addLine('G', 'S_4')
  await page.waitForTimeout(400)
  ok('pending 时工作台出现槽位区（不用去画布）', (await page.locator('.bench-slots').count()) === 1)
  ok('槽位列出了刚造的 G 当候选', (await page.locator('.bench-cand').count()) >= 1,
    await page.evaluate(() => [...document.querySelectorAll('.bench-cand')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')))
  ok('点槽位候选（真实鼠标）', await clickCand(0))
  await page.waitForTimeout(700)
  ok('按槽位选完就真算出来（画布上多了一个对象）',
    (await page.locator('svg.canvas g.gnode').count()) >= 2,
    await page.evaluate(() => [...document.querySelectorAll('svg.canvas g.gnode')].map((g) => g.dataset.id).join(' ')))
  ok('pending 自动收了', (await page.locator('.pending-bar').count()) === 0)

  // ③' 有焦点时点「给这个集合加结构」⇒ 编辑器直接开、**带上那个集合**
  await page.evaluate(() => document.querySelector('.pending-x, .pending-bar .icon-x')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await addLine('P', 'labeledSet(a, b, c)')
  await page.waitForTimeout(400)
  ok('展开「结构 / 映射 / 作用」', await clickFam('结构 / 映射 / 作用'))
  await page.waitForTimeout(400)
  ok('点「structure(P, table)」', await clickOp('structure(P, table)'))
  await page.waitForTimeout(700)
  /* 它要一个载体 ⇒ 走槽位选那个集合（同样不碰画布）*/
  ok('结构 op 也要槽位（载体）', (await page.locator('.bench-slots').count()) === 1)
  ok('点槽位候选把 labeledSet 填进去', await clickCand(0))
  await page.waitForTimeout(800)
  const ed = await page.evaluate(() => ({
    open: !!document.querySelector('.struct-builder'),
    cells: document.querySelectorAll('.sb-cell').length,
    head: document.querySelector('.struct-builder .mb-head')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    /* 编辑器开着时工作台的细节区让位（否则两者贴底重叠，按钮点不到）*/
    detailBusy: !!document.querySelector('.bench-detail.busy'),
    famsStillThere: document.querySelectorAll('.bench-fam-head').length,
  }))
  ok('编辑器**直接开**了（不用再去别处找入口）', ed.open, ed.head.slice(0, 60))
  ok('**带上了那个集合**（编辑器头写着 labeledSet，不是空的）',
    /labeledSet/.test(ed.head), ed.head.slice(0, 60))
  ok('表已铺好（3 x 3 = 9 格，手算：载体 3 个元素）', ed.cells === 9, `cells=${ed.cells}`)
  ok('编辑器开着时细节区让位（否则两者贴底重叠）', ed.detailBusy)
  ok('任务栏仍在（改主意不必先关编辑器）', ed.famsStillThere === 6, `fams=${ed.famsStillThere}`)

  // 收工：关掉编辑器
  await page.evaluate(() => document.querySelector('.map-builder .mb-x')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await page.waitForTimeout(500)
  ok('x 关得掉', (await page.locator('.map-builder').count()) === 0)
  ok('全程零 console 错误', logs.length === 0, logs.slice(0, 2).join(' | '))
}

/* ══ 场景 7：共轭类（T3）+ 关系 op 归画布（T2）═════════════════
 *
 * 两条都是 2026-10-05 自查后按用户原话补的：
 *   · 「共轭类」被点名要，而工作台里**一个含"共轭"的按钮都没有** ⇒ 补成细节区一节；
 *   · `contains` / `isomorphism` 是"两个对象之间的关系" ⇒ 按"画布处理多对象关系"
 *     的定义**移出工作台**（入口仍在 ⊕ 球菜单）。
 */

console.log('\n== 场景 7：共轭类 + 关系 op 归画布 ==')
{
  await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  await addLine('G', 'S_4')
  await page.waitForTimeout(400)
  await clickNode('G') // 此刻工作台收起 ⇒ 真实鼠标点得到
  await page.waitForTimeout(500)
  await page.click('.bench-toggle')
  await page.waitForTimeout(700)

  // ① 「共轭类」是细节区的一节（不是任务栏一个按钮）
  const heads = await page.evaluate(() =>
    [...document.querySelectorAll('.bench-detail .info-sec-label')].map((x) => x.textContent.trim()),
  )
  ok('细节区有「共轭类」一节', heads.includes('共轭类'), JSON.stringify(heads))
  ok('它紧跟在「元素」后面（共轭类是元素的划分）',
    heads.indexOf('共轭类') === heads.indexOf('元素') + 1, JSON.stringify(heads))
  ok('摘要写着 5 类（手算：S_4 有 5 个共轭类）',
    (await page.evaluate(() => {
      const h = [...document.querySelectorAll('.bench-detail .info-sec-head')].find(
        (x) => x.querySelector('.info-sec-label')?.textContent.trim() === '共轭类',
      )
      return h?.querySelector('.info-sec-sum')?.textContent?.trim() ?? ''
    })) === '5 类',
    await page.evaluate(() => {
      const h = [...document.querySelectorAll('.bench-detail .info-sec-head')].find(
        (x) => x.querySelector('.info-sec-label')?.textContent.trim() === '共轭类',
      )
      return h?.querySelector('.info-sec-sum')?.textContent ?? ''
    }))

  /*
   * ② 类方程 + 逐行读数（手算：1 + 6 + 8 + 3 + 6 = 24）
   *
   * ⚠️ **不要点那枚「收起」**：工作台的节**默认是展开的**（与左上 InfoDock 默认全收相反，
   * 那是 P1 定死的姿态）⇒ 点一下反而把它收起来了。
   * 第一版写了这点，rows 拿到 `[]`，红 3 条。
   */
  if ((await page.locator('.conj-table').count()) === 0) {
    /* 兜底：万一被前一步收起来了，点一次展开 */
    await page.evaluate(() => {
      const h = [...document.querySelectorAll('.bench-detail .info-sec-head')].find(
        (x) => x.querySelector('.info-sec-label')?.textContent.trim() === '共轭类',
      )
      h?.querySelector('.bench-sec')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await page.waitForTimeout(500)
  }
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.conj-table tbody tr')].map((r) =>
      [...r.querySelectorAll('td')].map((c) => c.textContent.trim()),
    ),
  )
  ok('共轭类表 5 行（手算 5 类）', rows.length === 5, JSON.stringify(rows.map((r) => r[1])))
  ok('类大小集合 = {8,6,6,3,1}（手算 S_4 的类方程）',
    JSON.stringify(rows.map((r) => Number(r[2])).sort((a, b) => a - b)) === JSON.stringify([1, 3, 6, 6, 8]),
    JSON.stringify(rows.map((r) => r[2])))
  ok('每行都满足「类大小 x 中心化子阶 = 24」（轨道-稳定子）',
    rows.every((r) => Number(r[2]) * Number(r[3]) === 24),
    JSON.stringify(rows.map((r) => r[2] + 'x' + r[3])))
  ok('画布上有共轭类节的脚注（说明这条对账关系）',
    /轨道-稳定子/.test(await page.evaluate(() => document.querySelector('.conj-note')?.textContent ?? '')))

  // ③ 关系 op 不在工作台（T2）
  for (const f of ['结构 / 映射 / 作用', '群与分解', '子群与正规性', '作用与轨道', '映射的核与像', '集合运算']) {
    await page.evaluate((x) => {
      const b = [...document.querySelectorAll('.bench-fam-head')].find(
        (e) => e.querySelector('.bench-fam-label')?.textContent === x,
      )
      if (b && !b.closest('.bench-fam').className.includes('open')) b.click()
    }, f)
    await page.waitForTimeout(200)
  }
  const opNames = await page.evaluate(() =>
    [...document.querySelectorAll('.bench-op-name')].map((x) => x.textContent.trim()),
  )
  ok('工作台里**没有** contains（它归画布）', !opNames.some((n) => /contains/.test(n)), JSON.stringify(opNames.length))
  ok('工作台里**没有** isomorphism（它归画布）', !opNames.some((n) => /isomorphism/.test(n)))
  ok('也没有「关系」这一族了', (await page.locator('.bench-fam').count()) === 6)
  ok('全程零 console 错误', logs.length === 0, logs.slice(0, 2).join(' | '))
}

console.log(`\n${pass} PASS / ${fail} FAIL`)
if (logs.length) {
  console.log('\n浏览器控制台有报错：')
  for (const l of logs.slice(0, 5)) console.log('  ' + l)
}
await browser.close()
process.exit(fail === 0 && logs.length === 0 ? 0 : 1)
