/**
 * 走查：**半直积 `⋊`**（U51）—— 记号欠定时不许糊弄，三态分诊要在**真界面**上看得见。
 *
 * 用户原话（两张截图 + 一句追问）：
 *   「所以到底是什么？GL(2,Z/4Z)，(C2)^4⋊S3 算不出来？」
 *   「半直积 ⋊ op……目前在做计算器，不是可视化！」
 *
 * 拐点是「计算器」这个定位：`⋊` 是**算**出来的东西，不是画出来的东西 ——
 * 所以本套钉的全是**算完之后的显示面**，一条引擎 Scene 都不接。
 *
 * 六条：
 *   ① **输入框打 `C_2^2 : C_3` 出节点**（用户点名要的那条）—— 12 阶，状态行绿字；
 *   ② **多解不许替用户挑**：`C_2^4 : S_3` 只预览 → 红字说「不是一个群」+「3 个」，
 *      候选用**不变量**列出来（同一个记号下各候选的符号一模一样）；
 *   ③ **算不动要说清卡在哪**：`C_2^5 : C_3` → 「本地不跑」+ 压力数字，
 *      且**不许**出现「后端 / 待接入」（本项目没有后端）；
 *   ④ **四个入口自动获得**：拖 `C_2^2` 到 `C_3` 上 → 菜单里有 `semidirectProduct` → 点一下建出 12 阶；
 *   ⑤ **菜单不撒谎**：`A_4` 拖到 `S_4`（288 阶，超规模线）→ 菜单里**没有** `semidirectProduct`，
 *      但 `directProduct` 照列 —— 列出来点下去必被预算拦住，就是撒谎；
 *   ⑥ **纯文本面零泄漏**：状态行 / 连线菜单 / ⊕ 面板的文本全是「键盘打得出」的字符
 *      （判据与 `e2e/no-unicode-leak.mjs` 的 `ALLOWED` 逐字相同）。
 *
 * ⚠️ 菜单标签的期望值（U54 起）：标签是**从 `OpDef.notation` 派生**的英文名
 * （`semidirectProduct` / `directProduct` / `contains` / `Z` / `Syl` …），
 * 不再是一张手写的中文表。改这一套时别照抄源码注释里的旧中文名。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/semidirect-op.mjs`
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

/* ── 纯文本面判据（与 e2e/no-unicode-leak.mjs 逐字相同）───────── */

const ALLOWED = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const badChars = (s) => [...new Set([...String(s ?? '')].filter((c) => !ALLOWED.test(c)))]

/* ── 场地 ─────────────────────────────────────────────── */

const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) > 0) return
  await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
  await page.click('.composer-orb .orb-center')
  await page.waitForTimeout(220)
}

const addLine = async (name, expr) => {
  await ensureCard()
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(200)
  const btn = page.locator('.composer-orb .composer-row button')
  if (await btn.isDisabled()) {
    const st = await page.evaluate(() => document.querySelector('.composer-status')?.textContent ?? '')
    console.log(`    [blocked] ${name} = ${expr} :: ${st}`)
    return false
  }
  await btn.click()
  await page.waitForTimeout(420)
  return true
}

/** 只预览（不提交）—— 状态行是这个 op 的**纯文本面**。 */
const typeExpr = async (v) => {
  await ensureCard()
  await page.fill('.composer-name', '')
  await page.fill('.composer-expr', v)
  await page.waitForTimeout(320)
}

const status = () =>
  page.evaluate(() => ({
    text: document.querySelector('.composer-status')?.textContent ?? '',
    cls: [...(document.querySelector('.composer-status')?.classList ?? [])].join(' '),
  }))

/** 画布节点（带屏幕坐标，供真指针用）。 */
const canvasState = () =>
  page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')
    if (!svg) return { nodes: [], edges: [], notices: [] }
    const nodes = [...svg.querySelectorAll('g.gnode')].map((g) => {
      const r = g.querySelector('.gnode-hit').getBoundingClientRect()
      return {
        id: g.dataset.id,
        label: g.dataset.label ?? '',
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      }
    })
    const edges = [...svg.querySelectorAll('g.gedge')].map((g) => {
      const el = g.querySelector('.gedge-label') ?? g
      const r = el.getBoundingClientRect()
      return { objectId: g.dataset.objectId ?? '', label: g.dataset.label ?? '', x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    return {
      nodes,
      edges,
      notices: [...document.querySelectorAll('.notice')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    }
  })

/** 真指针拖一次（Shift = 连线，不必先开底栏开关）。 */
const dragPointer = async (a, b, shift = true) => {
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 })
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.waitForTimeout(90)
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(420)
}

/** 连线菜单里的候选短标签（`menuLabel(op)`）。 */
const menuLabels = () =>
  page.evaluate(() => [...document.querySelectorAll('.connect-item .connect-label')].map((e) => e.textContent.trim()))

/** 点左栏的一行（按 `.row-name` 里的 **id** 匹配）—— 只对**手输声明**的对象有效。 */
const clickRow = async (id) => {
  const hit = await page.evaluate((want) => {
    const rows = [...document.querySelectorAll('.dock-topleft .row-click')]
    const row = rows.find((r) => r.querySelector('.row-name')?.textContent?.trim() === want)
    if (!row) return false
    row.click()
    return true
  }, id)
  await page.waitForTimeout(420)
  return hit
}

/**
 * 点画布上的节点。
 *
 * op 派生出来的对象**不在「对象」面板里**（那个面板只列 `origin === 'input'` 的手输声明，
 * 见 `ObjectDock.tsx`）—— 所以画布是选中它们的**唯一**入口。这也正是 `.gnode-hit` 存在的理由。
 */
const clickNode = async (id) => {
  const hit = await page.evaluate((want) => {
    const el = document.querySelector(`svg.canvas g.gnode[data-id="${want}"] .gnode-hit`)
    if (!el) return false
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, id)
  await page.waitForTimeout(520)
  return hit
}

/** 展开「基本」（U45：默认全收；手风琴里再点一下是收起，所以先看 class）。 */
const openBasic = async () => {
  await page.evaluate(() => {
    const h = document.querySelector('.info-sec-head[data-sec="basic"]')
    if (h && !h.classList.contains('on')) h.click()
  })
  await page.waitForTimeout(320)
}

/** 信息面板的读数。 */
const inspRows = async () => {
  await openBasic()
  return page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .insp-row')].map((r) => ({
      k: r.querySelector('.insp-k')?.textContent?.trim() ?? '',
      v: (r.querySelector('.insp-v')?.textContent ?? '').replace(/[\u200b\u2061\u2062]/g, '').replace(/\s+/g, '').trim(),
    })),
  )
}

/* ══════════════════════════════════════════════════════════
 * ① 输入框打 `C_2^2 : C_3` 出节点（用户点名要的那条）
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ① 打 `C_2^2 : C_3` -> 出节点 ==')
await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

await typeExpr('C_2^2 : C_3')
{
  const s = await status()
  ok('预览认得出这是个群（绿字）', s.cls.includes('good') && s.text.includes('群'), `${s.cls} :: ${s.text}`)
  // 手算：唯一非平凡作用 ⇒ 12 阶（= A_4，见 verify/suites/u51.ts 的推导）
  ok('副行写着 |G| = 12（不是"算不出来"）', s.text.includes('|G| = 12'), s.text)
}
await page.screenshot({ path: '../../docs/assets/u51-semidirect-notation.png' })

ok('提交 `P = C_2^2 : C_3`', await addLine('P', 'C_2^2 : C_3'))
await page.keyboard.press('Escape')
await page.waitForTimeout(360)
{
  const st = await canvasState()
  ok('画布上真的落了一个节点（不是"预览过了但没落地"）', st.nodes.some((n) => n.id === 'P'), JSON.stringify(st.nodes.map((n) => n.id)))
  ok('没有求值失败的行', (await page.evaluate(() => document.querySelectorAll('.row-err').length)) === 0)
}
ok('点中 P', await clickRow('P'))
{
  const rows = await inspRows()
  ok('信息面板说阶 = 12', rows.some((r) => r.k === '阶' && r.v.includes('12')), JSON.stringify(rows))
  ok('  并且是**非交换**（12 阶交换群只能是 C_12 / C_6 x C_2，与 A_4 不同）', rows.some((r) => r.k === '交换' && r.v === '否'), JSON.stringify(rows))
}

/* ══════════════════════════════════════════════════════════
 * ② 多解：不替用户挑，列候选（不变量才能区分）
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ② `C_2^4 : S_3` -> 不是一个群 ==')
await typeExpr('C_2^4 : S_3')
{
  const s = await status()
  ok('红字拦住（不是一个群，不是一个数字）', s.cls.includes('bad') && s.text.includes('不是一个群'), `${s.cls} :: ${s.text}`)
  ok('说清是**几个**本质不同的选法（3 个）', s.text.includes('3 个'), s.text)
  // 用户当时看到的那句错话（core 把"不唯一"说成"不存在"）不许再出现
  ok('不再说 core 那句错话「找不到非平凡作用」', !s.text.includes('找不到非平凡作用'), s.text)
  // 候选用不变量区分：同一个记号下各候选的符号长得一模一样，只有 |Z| / 阶分布能认
  ok('候选里给出可区分的不变量（|Z| = 4 / 2 / 1 都在）', ['|Z| = 4', '|Z| = 2', '|Z| = 1'].every((x) => s.text.includes(x)), s.text)
  ok('抽样结论标了"是下界"（不假装完整枚举）', s.text.includes('下界'), s.text)
  ok('给出路（SmallGroup 或 从母群里挑子群）', s.text.includes('smallGroup') || s.text.includes('内半直积'), s.text)
}
await page.screenshot({ path: '../../docs/assets/u51-semidirect-multi.png' })

/* ══════════════════════════════════════════════════════════
 * ③ 算不动：说清卡在哪，且不许提"后端"
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ③ `C_2^5 : C_3` -> 说清卡在哪 ==')
const t3 = Date.now()
await typeExpr('C_2^5 : C_3')
{
  const s = await status()
  ok('红字拦住', s.cls.includes('bad'), `${s.cls} :: ${s.text}`)
  ok('理由是"本地算不了"', s.text.includes('本地算不了'), s.text)
  ok('且指出卡在哪一步（Aut 搜索线 30000）', s.text.includes('30000') && s.text.includes('本地不跑'), s.text)
  ok('不说"后端 / 待接入 / GAP"（本项目没有后端）', !['后端', '待接入', '尚未接入', 'GAP'].some((w) => s.text.includes(w)), s.text)
  ok('当场返回（不是慢慢卡住）', Date.now() - t3 < 4000, `${Date.now() - t3}ms`)
}

/* ══════════════════════════════════════════════════════════
 * ④ 四个入口自动获得：连线菜单里就有 `semidirectProduct`
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ④ 拖两个群 -> 菜单里有 semidirectProduct ==')
await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

ok('建 `A = C_2^2`', await addLine('A', 'C_2^2'))
ok('建 `B = C_3`', await addLine('B', 'C_3'))
await page.keyboard.press('Escape')
await page.waitForTimeout(480)

const before = await canvasState()
{
  const a = before.nodes.find((n) => n.id === 'A')
  const b = before.nodes.find((n) => n.id === 'B')
  ok('画布上两个群都在', !!a && !!b, JSON.stringify(before.nodes.map((n) => n.id)))

  if (a && b) {
    // 先确认两个端点都没被浮层压住（不然拖出来的是面板，不是连线）
    const clear = await page.evaluate(
      (p) => {
        const hit = (q) => document.elementFromPoint(q.x, q.y)?.closest?.('g.gnode')?.getAttribute('data-id') ?? null
        return { a: hit(p[0]), b: hit(p[1]) }
      },
      [a, b],
    )
    ok('两个端点都露在面板外面（测试前提）', clear.a === 'A' && clear.b === 'B', JSON.stringify(clear))

    await dragPointer(a, b, true)
    const labels = await menuLabels()
    ok('弹出了候选菜单（多候选，没有静默执行）', labels.length > 0, JSON.stringify(labels))
    ok('菜单里有「semidirectProduct」（op 从注册表派生，画布上自动就有；U54 前叫「半直积」）', labels.includes('semidirectProduct'), labels.join(' | '))
    ok('标签不是原样贴出的 LaTeX（不许出现反斜杠）', labels.every((l) => !l.includes('\\')), labels.join(' | '))
    ok('菜单里没有键盘打不出的字符', labels.every((l) => badChars(l).length === 0), badChars(labels.join('')).join(''))
    await page.screenshot({ path: '../../docs/assets/u51-semidirect-connect-menu.png' })

    // 点 semidirectProduct —— 菜单不撒谎：列出来就得真跑得动
    await page.evaluate(() => {
      const b2 = [...document.querySelectorAll('.connect-item')].find((x) =>
        x.querySelector('.connect-label')?.textContent?.trim() === 'semidirectProduct',
      )
      b2?.click()
    })
    await page.waitForTimeout(700)
    const after = await canvasState()
    ok('点一下真的建出来了（画布上多一个节点）', after.nodes.length === before.nodes.length + 1, `${before.nodes.length} -> ${after.nodes.length}`)
    ok('没有落成错误行', (await page.evaluate(() => document.querySelectorAll('.row-err').length)) === 0)

    /*
     * 新对象是**派生**的，不在「对象」面板里（那个面板只列手输声明）——
     * 所以按**画布 id 差集**找它，然后点节点（`.gnode-hit` 才是画布上的选中入口）。
     */
    const oldIds = before.nodes.map((n) => n.id)
    const fresh = after.nodes.find((n) => !oldIds.includes(n.id))
    ok('画布上多出来的那个节点就是它', !!fresh, JSON.stringify(after.nodes.map((n) => `${n.id}:${n.label}`)))
    if (fresh) {
      // 显示形态是 KaTeX 排出来的（`C_2^2 \rtimes_{\phi} C_3`），这里只认它落的是那个 12 阶群
      ok('点中那个新节点', await clickNode(fresh.id))
      const rows = await inspRows()
      ok('新对象就是那个 12 阶群（= A_4）', rows.some((r) => r.k === '阶' && r.v.includes('12')), JSON.stringify(rows))
      ok('  并且非交换', rows.some((r) => r.k === '交换' && r.v === '否'), JSON.stringify(rows))
      ok('  来源写着 A、B（这条是**用那两个对象算出来的**）', rows.some((r) => r.k === '来源' && r.v === 'A,B'), JSON.stringify(rows))
    }
  }
}

/* ══════════════════════════════════════════════════════════
 * ⑤ 菜单不撒谎：超规模线的一对不列 semidirectProduct
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ⑤ `A_4` 拖到 `S_4` -> 不列 semidirectProduct ==')
await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

ok('建 `A = A_4`', await addLine('A', 'A_4'))
ok('建 `G = S_4`', await addLine('G', 'S_4'))
await page.keyboard.press('Escape')
await page.waitForTimeout(480)

{
  const st = await canvasState()
  const a = st.nodes.find((n) => n.id === 'A')
  const g = st.nodes.find((n) => n.id === 'G')
  ok('画布上两个群都在', !!a && !!g, JSON.stringify(st.nodes.map((n) => n.id)))
  if (a && g) {
    const clear = await page.evaluate(
      (p) => {
        const hit = (q) => document.elementFromPoint(q.x, q.y)?.closest?.('g.gnode')?.getAttribute('data-id') ?? null
        return { a: hit(p[0]), g: hit(p[1]) }
      },
      [a, g],
    )
    ok('两个端点都露在面板外面（测试前提）', clear.a === 'A' && clear.g === 'G', JSON.stringify(clear))

    await dragPointer(a, g, true)
    const labels = await menuLabels()
    ok('弹出候选菜单', labels.length > 0, JSON.stringify(labels))
    // 手算：|A_4| x |S_4| = 12 x 24 = 288 > 256（本地规模线）—— 列出来点下去必被预算拦住
    ok('菜单里**没有**「semidirectProduct」（列出来就是撒谎）', !labels.includes('semidirectProduct'), labels.join(' | '))
    ok('同一对下「directProduct」照列（别把预检做成"一律不列"）', labels.includes('directProduct'), labels.join(' | '))
    ok('「contains」也在（A_4 正规于 S_4，这是真判据）', labels.includes('contains'), labels.join(' | '))
    ok('菜单里没有键盘打不出的字符', labels.every((l) => badChars(l).length === 0), badChars(labels.join('')).join(''))

    // 真拖两次同一个东西也不该把 14 秒的活悄悄塞给用户：菜单里没有它，就没法误点
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
}

/* ══════════════════════════════════════════════════════════
 * ⑥ 纯文本面零泄漏（状态行 / 菜单 / ⊕ 面板）
 * ══════════════════════════════════════════════════════════ */

console.log('')
console.log('== ⑥ 纯文本面零泄漏 ==')
await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

const scanPlain = async (stage, sel) => {
  const rows = await page.evaluate((s) => {
    const out = []
    for (const el of document.querySelectorAll(s)) {
      const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (t) out.push({ t, where: el.className || el.tagName })
    }
    for (const el of document.querySelectorAll(`${s} [title]`)) {
      const v = el.getAttribute('title')
      if (v?.trim()) out.push({ t: v, where: 'title' })
    }
    return out
  }, sel)
  const bad = rows.filter((r) => badChars(r.t).length > 0)
  ok(`${stage}：没有键盘打不出的字符`, bad.length === 0, bad.map((b) => `${badChars(b.t).join('')} @ ${b.where}: ${b.t.slice(0, 60)}`).join(' | '))
}

// 状态行：记号那条路的**四个结局**各扫一遍（唯一 / 只有平凡 / 多解 / 算不动）
for (const [expr, tag] of [
  ['C_2^2 : C_3', '唯一就建'],
  ['C_2 : C_2', '只有平凡作用'],
  ['C_2^4 : S_3', '多解'],
  ['C_2^5 : C_3', '算不动'],
]) {
  await typeExpr(expr)
  await scanPlain(`状态行（${tag}）`, '.composer-status')
}

// ⊕ 多对象面板：`doc` 与 `menuLabel` 都显示在这里（U51 的 `doc` 曾带破折号）
{
  await page.keyboard.press('Escape')
  await page.waitForTimeout(260)
  const opened = await page.evaluate(() => {
    const b = document.querySelector('.multi-orb .orb-center')
    if (!b) return false
    b.click()
    return true
  })
  ok('打得开 ⊕ 多对象面板', opened)
  await page.waitForTimeout(360)
  await scanPlain('⊕ 多对象面板', '.orb-center-panel')
}

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
