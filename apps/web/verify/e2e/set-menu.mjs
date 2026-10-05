/**
 * 走查：**集合值能不能当元素集**（F1 修复，2026-10-04）。
 *
 * ── 这一套守的是什么 ────────────────────────────────────────────
 * 审查发现（`docs/AUDIT-2026-10-04-canvas.md` F1）：同一件事的判据被写成**两份** ——
 * `paramAccepts` 的 `subset`/`setlike` **无条件**收 `set`（菜单就由它定），
 * 而内核 `subgroupArgOf` / `elementSetArgOf` / `asSet.run` 一条都不收。
 * 真机后果：拖 `S_4 -> pointSet(4)` 列出 **10 条**候选、**9 条点下去必报错**；
 * 点集节点的球上还铺着 `asSet` / `closure`，点任一都报错。
 * 量化（`probe4` 口径）：486 个拖拽候选里 **324 个**"列出来必报错"。
 *
 * 修法：判据**只写一份** `ops.ts#setElementSetOf`（`set` 当元素集读，当且仅当
 *   ① 有母群 ② 成员能在母群里解析回元素且不是子群点），内核与菜单都调它。
 * 于是"补"和"收窄"同时发生：**该收的收进来**（有母群的元素集提升），
 * **不该收的不再列**（抽象点集 / 子群集的底集）。
 *
 * 本套钉六件事（真浏览器）：
 *   ① 拖「群」到「点集」：菜单**只剩 1 条** `customAction`，且点下去不报错；
 *   ② 点集的球上**没有** `asSet` / `closure`（不再列撒谎的 op）；
 *   ③ 但点集**不是死路**：拖一个群过去就起得了头（① 即是）；
 *   ④ 手打时**诚实报错**（敲得出来，报错语对症）：`closure(点集)` / `asSet(集合)`；
 *   ⑤ **内核真的补上了 set**（正向证据）：有母群的元素集提升能当子群 ——
 *      拖 `D_4 -> asSet(center(D_4))` 列得出 `quotient`，且点下去真算得出商；
 *   ⑥ 纯文本面不泄漏 LaTeX（只查界面上的字，不查断言名）。
 *
 * 跑法（先起 dev server 5273，cwd 必须是 apps/web）：`node verify/e2e/set-menu.mjs`
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
page.setDefaultTimeout(5000)

await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1300)

/* ── 输入与探测辅助 ─────────────────────────────────────── */

const addLine = async (name, expr) => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(220)
  }
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(260)
  await page.evaluate(() => {
    const b = document.querySelector('.composer-orb .composer-row button')
    if (b && !b.disabled) b.click()
  })
  await page.waitForTimeout(380)
}

/** 左栏行（抽屉收起时 body 不渲染 —— 先展开「对象」）。 */
const rows = async () => {
  await page.evaluate(() => {
    for (const label of ['对象', '操作']) {
      const t = [...document.querySelectorAll('.dock-topleft .dock-toggle')].find((b) =>
        b.textContent.includes(label),
      )
      if (t && !t.closest('.dock').className.includes('open')) t.click()
    }
  })
  await page.waitForTimeout(380)
  return page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .row')].map((r) => ({
      name: r.querySelector('.row-name')?.textContent?.trim() ?? '?',
      def: r.querySelector('.row-def')?.textContent?.trim() ?? '',
      err: r.querySelector('.row-err')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    })),
  )
}

const nodeIds = () =>
  page.evaluate(() => [...document.querySelectorAll('svg.canvas g.gnode')].map((g) => g.dataset.id))

/** 节点中心（屏幕坐标 —— 用 `getBoundingClientRect`，它含全部 transform；`getBBox` 只有局部坐标）。 */
const nodeCenter = (id) =>
  page.evaluate((nid) => {
    const g = document.querySelector(`svg.canvas g.gnode[data-id="${nid}"]`)
    if (!g) return null
    const r = g.querySelector('.gnode-hit')?.getBoundingClientRect()
    if (!r || r.width === 0) return null
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, id)

/** 拖拽连线：**必须按 Shift**（否则是移动节点）。 */
const dragPointer = async (a, b) => {
  await page.keyboard.down('Shift')
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 })
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.waitForTimeout(120)
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await page.waitForTimeout(460)
}

/** 拖之后的候选菜单（`.connect-menu`）。 */
const connectMenu = () =>
  page.evaluate(() => {
    const m = document.querySelector('.connect-menu')
    if (!m) return null
    return {
      head: m.querySelector('.connect-head')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      items: [...m.querySelectorAll('.connect-item .connect-label')].map((e) => e.textContent.trim()),
    }
  })

const clickMenuItem = async (label) => {
  const hit = await page.evaluate((want) => {
    const items = [...document.querySelectorAll('.connect-item')]
    const h = items.find((it) => it.querySelector('.connect-label')?.textContent?.trim() === want)
    if (!h) return false
    h.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  }, label)
  await page.waitForTimeout(700)
  return hit
}

/** 页面上的临时提示条（错误语的落点）。 */
const notice = () =>
  page.evaluate(() => {
    const n = document.querySelector('.notice')
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : null
  })

const escapeAll = async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(280)
}

/** 点一个画布节点，再点开它那颗球（`.orb:not(.orb-center)`）。 */
const openOrb = async (id) => {
  await escapeAll()
  await page.evaluate((nid) => {
    const el = document.querySelector(`svg.canvas g.gnode[data-id="${nid}"] .gnode-hit`)
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, id)
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const o = document.querySelector('.orb:not(.orb-center)')
    if (o) o.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(460)
}

/** 球环上铺开的东西（卫星 `.orb-sat` + 「操作」面板里的 label）。 */
const ringLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.orb-sat, .orb-ops-panel .orb-op-label')].map((e) =>
      e.textContent.trim(),
    ),
  )

/* ══ 场景 A：拖「群」到「点集」——菜单只留真能跑的 ══════════ */

await addLine('G', 'S_4')
await addLine('P', 'pointSet(4)')
await escapeAll()

console.log('\n== 场景 A：拖 G(S_4) -> P(pointSet(4)) ==')
ok('前置：G 与 P 都在画布上', (await nodeIds()).includes('G') && (await nodeIds()).includes('P'))

{
  const g = await nodeCenter('G')
  const p = await nodeCenter('P')
  await dragPointer(g, p)
  const menu = await connectMenu()
  /*
   * 修复前这里列 **10 条**（9 条必报错）⇒ 弹菜单；现在只剩 1 条 ⇒ 走
   * `App#onConnect` 的 `cands.length === 1` 分支：**直接执行**。
   * 「不弹菜单」本身就是 F1 的核心读数之一（候选从 10 掉到 1）。
   */
  ok(
    '不弹候选菜单 ⇒ 候选已降到 1 条（修复前 10 条）',
    !menu || menu.items.length === 0,
    menu ? menu.items.join(', ') : '(没弹)',
  )
  const st = await page.evaluate(() => ({
    editor: document.querySelectorAll('.action-builder').length,
    notice: document.querySelector('.notice')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  }))
  ok(' 唯一那条（customAction）直接进了编辑器 —— 列出来 = 跑得动', st.editor === 1, JSON.stringify(st))
  ok(
    ' 没有报错提示（修复前点第一条就报"商需要第二个参数是子群"）',
    !st.notice || !/需要|不是|不能|没有|算不了|失败/.test(st.notice),
    JSON.stringify(st),
  )
  await escapeAll()
}

/* ══ 场景 B：点集的球上不再列撒谎的 op ═══════════════════════ */

console.log('\n== 场景 B：点集节点的球 ==')
await escapeAll()
{
  await openOrb('P')
  const ring = await ringLabels()
  ok('球的环**不含** asSet（底集对"已经是集合"的东西没意义）', !ring.includes('asSet'), ring.join(', '))
  ok('球的环**不含** closure（抽象点集没有生成子群）', !ring.includes('closure'), ring.join(', '))
}

/* ══ 场景 C：手打时诚实报错 ══════════════════════════════════ */

console.log('\n== 场景 C：手打时的提示（敲得出来，且对症）==')
await escapeAll()
/**
 * 填一条表达式，读 composer 的**预检提示**（不提交）。
 *
 * ⚠️ 失败的输入**进不了对象表**（`.row-err` 恒空 —— 这是老坑），报错落在
 * `.composer-status` 上，而且预检不通过时提交按钮是 **disabled**。
 */
const probeComposer = async (name, expr) => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.waitForSelector('.composer-orb .orb-center', { timeout: 20000 })
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(220)
  }
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(340)
  return page.evaluate(() => {
    const s = document.querySelector('.composer-card .composer-status')
    const btn = document.querySelector('.composer-orb .composer-row button')
    return {
      status: s ? s.textContent.replace(/\s+/g, ' ').trim() : null,
      cls: s ? s.className.replace(/\s+/g, ' ').trim() : null,
      disabled: btn ? btn.disabled : null,
    }
  })
}

await addLine('E', 'asSet(G)')
await escapeAll()
{
  const c1 = await probeComposer('K', 'closure(P)')
  console.log('  [诊断] closure(P) -> ' + JSON.stringify(c1))
  ok(
    'closure(点集)：预检就拦下（提交按钮 disabled），提示说清这个参数要什么',
    c1.disabled === true && !!c1.status && /集合/.test(c1.status),
    JSON.stringify(c1),
  )

  const c2 = await probeComposer('E2', 'asSet(E)')
  console.log('  [诊断] asSet(E) -> ' + JSON.stringify(c2))
  ok(
    'asSet(集合)：预检就拦下（提交按钮 disabled），不是"没有底集可取"',
    c2.disabled === true && !!c2.status && !/没有底集/.test(c2.status),
    JSON.stringify(c2),
  )

  const c3 = await probeComposer('E3', 'asSet(G)')
  ok('asSet(群)：合法 —— 按钮可提交（群是底集的源）', c3.disabled === false, JSON.stringify(c3))

  // 提交成功的这一条会进对象表（作为"报错行不进表"的对照）
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await addLine('E4', 'asSet(G)')
  await escapeAll()
  const rs = await rows()
  const by = new Map(rs.map((r) => [r.name, r]))
  ok('对照：成功的行（asSet(群)）确实进了对象表', !!by.get('E4') && !by.get('E4').err, JSON.stringify(by.get('E4')))
}

/* ══ 场景 D：内核真的补上了 set（正向证据）════════════════════ */

console.log('\n== 场景 D：D_4 拖到 asSet(center(D_4)) 上，商算得出 ==')
/*
 * ⚠️ **场景隔离**：前面三个场景在画布上堆了 7 个节点，自动布局会把 `CE` 推到
 * 窗口底部（y ≈ 713 / 900），拖拽的 `mouse.down` 落不到它身上（拖了没反应、也没报错）。
 * 重开一页只留三个节点 —— 这是"残留状态改变了几何"，不是功能问题。
 */
await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)
await addLine('H', 'D_4')
await addLine('C', 'center(H)')
await addLine('CE', 'asSet(C)')
await escapeAll()
{
  const h = await nodeCenter('H')
  const ce = await nodeCenter('CE')
  ok('前置：H / CE 都在画布上', !!h && !!ce)
  if (h && ce) {
    await dragPointer(h, ce)
    const menu = await connectMenu()
    ok('拖得开候选菜单', !!menu, menu ? menu.items.join(', ') : '(没弹)')
    if (menu) {
      ok(
        '菜单里有 quotient（有母群的元素集提升 = 真子群，F1 的"补"这一半）',
        menu.items.includes('quotient'),
        menu.items.join(', '),
      )
      const before = await nodeIds()
      const clicked = await clickMenuItem('quotient')
      await page.waitForTimeout(900)
      const nt = await notice()
      const after = await nodeIds()
      ok('点得中 quotient', clicked)
      ok(
        '商算得出（无报错提示；且画布多出节点 —— 比 id 差集，不看"节点数 +1"）',
        clicked && (!nt || !/需要|不是|不能|没有|算不了|失败/.test(nt)) && after.some((id) => !before.includes(id)),
        `notice = ${JSON.stringify(nt)}  before=[${before}] after=[${after}]`,
      )
    }
  }
}

/* ══ 场景 E：纯文本面（界面上的字不许有反斜杠）════════════════ */

console.log('\n== 场景 E：界面文字不泄漏 LaTeX ==')
{
  const texts = await page.evaluate(() => {
    const picked = []
    for (const sel of ['.notice', '.connect-menu', '.orb']) {
      for (const el of document.querySelectorAll(sel)) {
        picked.push(el.textContent.replace(/\s+/g, ' ').trim())
      }
    }
    return picked
  })
  const leak = texts.filter((t) => t.includes('\\'))
  ok('界面文字里没有反斜杠（LaTeX 泄漏）', leak.length === 0, JSON.stringify(leak.slice(0, 3)))
}

console.log(`\n${pass} PASS / ${fail} FAIL`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
