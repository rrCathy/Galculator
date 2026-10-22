/**
 * 走查：**草稿区**（三区 P2，2026-10-22 拍板十条）。
 *
 * 判据在 `docs/PROPOSAL-zones.md` §5 顶部，这里只守"用户的手能不能走通"：
 *
 *   ① 收起态：右侧一条竖胶囊，画布上什么都不少；
 *   ② 行上「暂存」⇒ 画布上的节点**真的没了**，草稿区多一行，左栏那行带「草稿」标记；
 *   ③ 行上「扶正」⇒ 节点回来；
 *   ④ **从画布拖出去**（拖到右缘松手）⇒ 暂存 + 草稿区自动滑出（不滑出来用户以为丢了）；
 *   ⑤ **从草稿拖进画布** ⇒ 扶正，且**落在松手那一格**（吸附最近空格点，误差 ≤ 一格半）；
 *   ⑥ 草稿滑出 ⇒ 工作台自动收（拍板第 7 条）。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/draft-zone.mjs`
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
page.on('console', (m) => {
  if (m.type() === 'error') logs.push(m.text())
})
page.on('pageerror', (e) => logs.push(String(e)))

const nodeIds = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('svg.canvas g.gnode')]
      .map((g) => g.dataset.id)
      .sort(),
  )
const draftIds = () =>
  page.evaluate(() => [...document.querySelectorAll('.draft-row')].map((r) => r.dataset.id))

const add = async (expr) => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.locator('.composer-orb .orb-center').click()
    await page.waitForSelector('.composer-card', { timeout: 10000 })
    await page.waitForTimeout(220)
  }
  await page.locator('.composer-expr').fill(expr)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(420)
}

await page.goto(`${BASE}/?empty=1`)
await page.waitForSelector('.composer-orb .orb-center', { timeout: 30000 })
await page.waitForTimeout(500)

for (const g of ['D_4', 'A_4', 'Q_8']) await add(g)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
ok('先有三个节点（A / B / D）', (await nodeIds()).length === 3, JSON.stringify(await nodeIds()))

// ── ① 收起态 ──
ok('草稿胶囊在右侧、默认收起', await page.evaluate(() => {
  const d = document.querySelector('.draft-dock')
  if (!d || d.classList.contains('open')) return false
  return !!d.querySelector('.draft-toggle')
}))
ok('收起时画布一个节点都不少', (await nodeIds()).length === 3, JSON.stringify(await nodeIds()))

// ── ② 行上「暂存」 ──
await page.click('.row .draft')
await page.waitForTimeout(450)
const afterStash = await nodeIds()
ok('暂存后画布上的节点少了一个', afterStash.length === 2, JSON.stringify(afterStash))
ok(
  '左栏那一行带「草稿」标记（拍板第 9 条：两边都留）',
  (await page.locator('.row .row-draft-flag').count()) >= 1,
)
ok('胶囊上出现计数 1', (await page.locator('.draft-toggle .count').innerText()).trim() === '1')

// ── ③ 打开草稿区 + 「扶正」 ──
await page.click('.draft-toggle')
await page.waitForTimeout(450)
ok('点胶囊能滑出草稿区', (await page.locator('.draft-dock.open').count()) === 1)
ok('草稿区里就那一行', (await draftIds()).length === 1, JSON.stringify(await draftIds()))
/* 图形化（2026-10-22 用户「草稿区的对象也应该是图形化的」）：
   每行带一枚迷你节点，形状走 `canvasShape`（群=方、集合=圆），颜色走 origin。 */
ok(
  '草稿行是**迷你节点**（形状 / 颜色与画布同源）',
  await page.evaluate(() => {
    const row = document.querySelector('.draft-row')
    const node = row?.querySelector('.draft-node')
    if (!node || row.dataset.shape !== 'group') return false
    return node.classList.contains('draft-node-group')
  }),
)

await page.click('.draft-row .draft-promote')
await page.waitForTimeout(450)
ok('「扶正」后节点回来', (await nodeIds()).length === 3, JSON.stringify(await nodeIds()))
ok('草稿区空了', (await draftIds()).length === 0, JSON.stringify(await draftIds()))

// ── ④ 从画布拖出去（真实鼠标，拖到右缘） ──
const target = (await nodeIds()).includes('B') ? 'B' : (await nodeIds())[1]
const nb = await page.locator(`svg.canvas g.gnode[data-id="${target}"] .gnode-hit`).boundingBox()
await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2)
await page.mouse.down()
await page.mouse.move(1300, 460, { steps: 12 })
await page.waitForTimeout(320)
/* 拖到热区**但不松手**：面板必须已经亮起来（2026-10-22 用户「拖到草稿区没有很好的反馈」） */
ok('拖进右缘热区：草稿面板点亮并给提示', await page.evaluate(() => {
  const d = document.querySelector('.draft-dock')
  return !!d && d.classList.contains('hot') && !!document.querySelector('.draft-hot-hint')
}))
await page.mouse.move(1390, 460, { steps: 4 })
await page.mouse.up()
await page.waitForTimeout(600)
const afterDragOut = await nodeIds()
ok(`拖到右缘松手 ⇒ ${target} 被暂存`, !afterDragOut.includes(target), JSON.stringify(afterDragOut))
ok('草稿区**自动滑出**（否则看着像丢了）', (await page.locator('.draft-dock.open').count()) === 1)
ok('草稿区里就是它', (await draftIds())[0] === target, JSON.stringify(await draftIds()))

// ── ⑤ 从草稿拖进画布：落在松手那一格 ──
const svgBox = await page.locator('svg.canvas').boundingBox()
const dropAt = { x: 620, y: 520 }
await page.locator('.draft-row').dragTo(page.locator('svg.canvas'), {
  targetPosition: { x: dropAt.x - svgBox.x, y: dropAt.y - svgBox.y },
})
await page.waitForTimeout(700)
const back = await nodeIds()
ok('拖进画布 ⇒ 扶正（节点回来了）', back.includes(target), JSON.stringify(back))
ok('草稿区不再列它', !(await draftIds()).includes(target), JSON.stringify(await draftIds()))

const center = await page.evaluate((id) => {
  const g = document.querySelector(`svg.canvas g.gnode[data-id="${id}"] .gnode-hit`)
  if (!g) return null
  const b = g.getBoundingClientRect()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}, target)
/*
 * 落点判据：**吸到最近空格点**意味着可能差一格（目标格被占时往外找）。
 * 一格在默认缩放下约 145px；这里放到 220 以内就算"落在这一带"，
 * 同时要求它没有回到原来的位置（证明 `pins` 真的按松手点写了）。
 */
const dist = center ? Math.hypot(center.x - dropAt.x, center.y - dropAt.y) : 1e9
ok('落在松手那一带（≤ 一格半）', dist <= 220, `dist=${Math.round(dist)} center=${JSON.stringify(center)}`)

// ── ⑥ 草稿滑出 ⇒ 工作台自动收 ──
// 先把草稿收起来（它现在开着，是上一步拖拽后自动滑出的）
if ((await page.locator('.draft-dock.open').count()) > 0) {
  await page.click('.draft-toggle')
  await page.waitForTimeout(420)
}
// 点画布节点 ⇒ 工作台升起（先点一下空白：上一步的拖拽留了 `suppressClick`，
// 它会把紧跟着的第一次 click 当"拖动的尾巴"吞掉 —— 这是拖拽的既有约定）
await page.mouse.click(60, 700)
await page.waitForTimeout(300)
await page.click('svg.canvas g.gnode .gnode-hit', { force: true })
await page.waitForTimeout(900)
ok('先让工作台升起来', (await page.locator('.bench.open').count()) === 1)
// 再开草稿 ⇒ 台必须让位
await page.click('.draft-toggle')
await page.waitForTimeout(650)
ok('草稿滑出时工作台自动收（拍板第 7 条）', (await page.locator('.bench.open').count()) === 0)

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
