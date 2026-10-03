/**
 * 走查：**左上抽屉的列布局**（U16）。
 *
 * 规格：**「对象」与「操作」叠在同一列**，「信息」另占一列（两列顶对齐）。
 * 理由：前两栏是同一件事的两半（手写的定义 / 运算的产物），用户来回复查的就是它们；
 * 「信息」是另一类活（"看"）。
 *
 * 叠成一列会带来一个新风险：**两栏都展开时总高越过视口**。所以验两件事：
 *   \\cdot 静态几何 —— 同列（x 相等）、上下相邻（gap 一致）、信息另起一列且顶对齐；
 *   \\cdot 高度封顶 —— 塞满两栏 + 矮视口时，整列**不越出视口**，且是
 *     "缩下去变可滚动"而不是"被裁掉"（`scrollHeight > clientHeight`）。
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/dock-layout.mjs`
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

/** 打开指定的左上抽屉（幂等：已经开着就不点）。 */
async function openDocks(page, titles) {
  for (const t of titles) {
    const dock = page.locator('.dock').filter({ has: page.locator(`.dock-title:text-is("${t}")`) }).first()
    if (!(await dock.evaluate((el) => el.classList.contains('open')))) {
      await page.locator(`.dock-toggle:has-text("${t}")`).first().click()
    }
  }
  await page.waitForTimeout(300)
}

/** 左上三个抽屉 + 分列容器的几何。 */
const readGeo = (page) =>
  page.evaluate(() => {
    const R = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
        w: Math.round(r.width),
        h: Math.round(r.height),
      }
    }
    const dock = (t) =>
      [...document.querySelectorAll('.dock-topleft .dock')].find(
        (d) => d.querySelector('.dock-title')?.textContent === t,
      )
    const body = (t) => dock(t)?.querySelector('.dock-body')
    const b = (t) => body(t)
    return {
      obj: R(dock('对象')),
      op: R(dock('操作')),
      // 「目录」（U56）也在这列里 —— 列高断言要把它算上
      cat: R(dock('目录')),
      info: R(dock('信息')),
      col: R(document.querySelector('.dock-col')),
      colRight: R(document.querySelector('.dock-topleft'))?.right,
      body: {
        obj: b('对象') ? { h: R(b('对象')).h, scroll: b('对象').scrollHeight > b('对象').clientHeight + 1 } : null,
        op: b('操作') ? { h: R(b('操作')).h, scroll: b('操作').scrollHeight > b('操作').clientHeight + 1 } : null,
      },
      vh: window.innerHeight,
      vw: window.innerWidth,
    }
  })

/* ══ 一、「对象」与「操作」同列，信息另起一列 ═════════════ */

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const logs = []
  page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.waitForTimeout(1000)
  await openDocks(page, ['对象', '操作', '信息'])

  const g = await readGeo(page)
  ok('三个抽屉都展开了', !!g.obj && !!g.op && !!g.info, JSON.stringify(g))
  ok('对象与操作**左边缘对齐**（同一列）', g.obj.x === g.op.x, `obj.x=${g.obj.x} op.x=${g.op.x}`)
  ok('对象与操作**等宽**', g.obj.w === g.op.w, `${g.obj.w} vs ${g.op.w}`)
  ok(
    '操作**在对象下方**（间距 = 列 gap 8）',
    g.op.y - g.obj.bottom === 8,
    `op.y=${g.op.y} obj.bottom=${g.obj.bottom}`,
  )
  ok('信息在**另一列**（左边缘 = 该列右边界 + gap）', g.info.x > g.obj.right, `info.x=${g.info.x} obj.right=${g.obj.right}`)
  ok('两列**顶对齐**', g.info.y === g.obj.y, `${g.info.y} vs ${g.obj.y}`)
  ok(
    '信息没有跟着叠进那一列（y 仍在上方）',
    g.info.y < g.op.y,
    `info.y=${g.info.y} op.y=${g.op.y}`,
  )
  ok('整组不越出视口右边', g.colRight <= g.vw, `right=${g.colRight} vw=${g.vw}`)
  /*
   * 列高 = 各项高度之和 + gap（即**没有多余空隙**）。
   *
   * ⚠️ U56 起这一列有**三个**抽屉（对象 / 操作 / 目录）—— 原来只算两栏，
   * 多出来的「目录」胶囊就把这条读红了（col 343 = obj 78 + op 218 + cat 31 + 2 x 8）。
   * 判据本身没变，变的只是成员个数。以后再加栏，记得同步这里。
   */
  ok(
    '「操作」单独一项时列高 = 三栏之和 + 2 个 gap',
    g.col.h === g.obj.h + g.op.h + g.cat.h + 8 * 2,
    `col.h=${g.col.h} obj.h=${g.obj.h} op.h=${g.op.h} cat.h=${g.cat.h}`,
  )

  // 收起「操作」\\to 列变矮，且对象纹丝不动（收展不动布局）
  const objBefore = g.obj
  await page.locator('.dock-toggle:has-text("操作")').first().click()
  await page.waitForTimeout(300)
  const g2 = await readGeo(page)
  ok('收起操作后列变矮', g2.col.h < g.col.h, `${g2.col.h} vs ${g.col.h}`)
  ok(
    '收展不移动「对象」（位置像素级不变）',
    g2.obj.x === objBefore.x && g2.obj.y === objBefore.y,
    `${JSON.stringify(g2.obj)} vs ${JSON.stringify(objBefore)}`,
  )
  ok('收起后仍是窄胶囊（宽度小于展开）', g2.op.w < g.op.w, `${g2.op.w} vs ${g.op.w}`)

  ok('控制台零错误', logs.length === 0, logs.join(' | '))
  await page.close()
}

/* ══ 二、两栏都塞满 + 矮视口：整列封顶、缩下去变可滚动 ═════ */

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const logs = []
  page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
  await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
  await page.waitForTimeout(900)

  // 两栏各塞 12 行：`G_i = C_6` 进「对象」，`Z_i = Z(G_i)` 进「操作」
  await page.click('.composer-orb .orb-center')
  await page.waitForTimeout(300)
  for (let i = 1; i <= 12; i++) {
    await page.fill('.composer-expr', `G${i} = C_6`)
    await page.click('.composer-orb .composer-row button')
    await page.waitForTimeout(60)
  }
  for (let i = 1; i <= 12; i++) {
    await page.fill('.composer-expr', `Z${i} = Z(G${i})`)
    await page.click('.composer-orb .composer-row button')
    await page.waitForTimeout(60)
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await openDocks(page, ['对象', '操作'])

  const g = await readGeo(page)
  const rows = await page.evaluate(() => ({
    obj: document.querySelectorAll('.dock-topleft .dock-body .row-click').length,
    err: document.querySelectorAll('.row-err').length,
  }))
  ok('两栏真的塞了内容（各 12 行）', rows.obj >= 12 && rows.err === 0, JSON.stringify(rows))

  ok(
    '整列**不越出视口底部**（封顶生效）',
    g.col.bottom <= g.vh,
    `col.bottom=${g.col.bottom} vh=${g.vh}`,
  )
  ok(
    '两栏都还在（没被挤没）',
    g.obj.h > 40 && g.op.h > 40,
    `obj.h=${g.obj.h} op.h=${g.op.h}`,
  )
  ok(
    '缩下去是**可滚动**而不是被裁掉',
    (g.body.obj?.scroll ?? false) || (g.body.op?.scroll ?? false),
    JSON.stringify(g.body),
  )
  ok(
    '对象那栏的高度没有被整列封顶白吃（> 内容之外仍有可读区）',
    (g.body.obj?.h ?? 0) >= 120,
    JSON.stringify(g.body.obj),
  )

  await page.screenshot({ path: '../../docs/assets/u16-dock-col.png' })
  ok('控制台零错误', logs.length === 0, logs.join(' | '))
  await page.close()
}

console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0) process.exitCode = 1
