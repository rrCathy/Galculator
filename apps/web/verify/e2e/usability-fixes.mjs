/**
 * 走查：**可用性修复第一批**（U18）在真浏览器里的样子。
 *
 * 覆盖 `docs/USABILITY.md` 的四条缺口：
 *   ① 结论区对"构造出来的群"不再沉默（K 的信息里有「识别」+ SmallGroup）
 *   ③ 子群 tab 标清"这是共轭类代表"，正规的标 \\trianglelefteq 正规
 *   ⑤ 名字能敲 LaTeX 希腊字母（`\phi` \\to \\varphi）
 *   ⑨ 报错分清"没这功能"与"打错了"
 *
 * 跑法（先起 dev server 5273）：`node verify/e2e/usability-fixes.mjs`
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

/* ── 输入辅助 ─────────────────────────────────────────── */

const ensureCard = async () => {
  if ((await page.locator('.composer-card').count()) === 0) {
    await page.click('.composer-orb .orb-center')
    await page.waitForTimeout(220)
  }
}

/** 填一行并提交（名字可为空 \\to 走自动命名）。提交不了就把状态行打出来。 */
const addLine = async (name, expr) => {
  await ensureCard()
  await page.fill('.composer-name', name)
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(200)
  const btn = page.locator('.composer-orb .composer-row button')
  if (await btn.isDisabled()) {
    const st = await status()
    console.log(`    [blocked] name=${JSON.stringify(name)} status=${JSON.stringify(st.text)}`)
    return false
  }
  await btn.click()
  await page.waitForTimeout(320)
  return true
}

/** 只填表达式、**不**提交（用来看状态行的报错）。 */
const typeExpr = async (expr) => {
  await ensureCard()
  await page.fill('.composer-name', '')
  await page.fill('.composer-expr', expr)
  await page.waitForTimeout(260)
}

/**
 * 展开「操作」抽屉。
 *
 * 左上一列里是**两个**抽屉：「对象」放手写声明的（`origin === 'input'`）、
 * 「操作」放运算产出的（`derived`）——映射、核、像这些**都在后者**。
 * 而 `DockPanel` **收起时 body 整个不渲染**，所以不展开就读不到那些行。
 */
const ensureOpsDock = async () => {
  const body = '.dock:has(.dock-title:text-is("操作")) .dock-body'
  if ((await page.locator(body).count()) === 0) {
    await page.locator('.dock-toggle:has-text("操作")').first().click()
    await page.waitForTimeout(260)
  }
}

/**
 * 左栏点一行 —— **按 `.row-name` 里的对象 id 匹配**，不按文本包含。
 *
 * 踩过：行里渲染的是**原始定义**（`S = S_4`），而 `S₄` 是 `prettySymbol` 之后的展示形态，
 * 拿 `S₄` 去匹配永远匹配不上（而信息面板会停在"上一个被选中的对象"上，
 * 断言看到的是别的对象的子群列表 —— 于是失败原因看起来像"说明没渲染"）。
 */
const clickRow = async (id) => {
  await ensureOpsDock()
  return page.evaluate((want) => {
    const rows = [...document.querySelectorAll('.dock-topleft .row-click')]
    const hit = rows.find((r) => r.querySelector('.row-name')?.textContent?.trim() === want)
    if (!hit) return false
    hit.click()
    return true
  }, id)
}

const infoState = () =>
  page.evaluate(() => ({
    labels: [...document.querySelectorAll('.insight-label')].map((e) => e.textContent.trim()),
    texts: [...document.querySelectorAll('.insight-body')].map((e) => e.textContent.trim()),
    notes: [...document.querySelectorAll('.insp-note')].map((e) => e.textContent.trim()),
    // 只数**共轭类那一行**里的正规标记（2026-09-30 起子群 tab 按同构类分组，
    // 组头上也有一个只写 ⊴ 的提示徽标，它不是"某个子群正规"的行内标记）
    normals: [...document.querySelectorAll('.insp-sub .insp-normal')].map((e) => e.textContent.trim()),
    subs: [...document.querySelectorAll('.insp-sub-meta')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  }))

const status = () =>
  page.evaluate(() => {
    const el = document.querySelector('.composer-status')
    return { cls: el?.className ?? '', text: el?.textContent.trim() ?? '' }
  })

/** 左上两个抽屉里的全部对象行（展开「操作」抽屉之后再读）。 */
const objIds = async () => {
  await ensureOpsDock()
  return page.evaluate(() =>
    [...document.querySelectorAll('.dock-topleft .row-click')].map((r) => (r.textContent ?? '').trim()),
  )
}

/* ══ ⑤ 名字能敲 LaTeX 希腊字母 ═════════════════════════════ */

await addLine('G', 'C_6')
await addLine('H', 'C_6')
await addLine('\\phi', 'map(G, H, a->2)')
await page.waitForTimeout(300)

const ids = await objIds()
ok('`\\phi` 被接受，对象表里出现同名对象', ids.some((x) => x.startsWith('\\phi')), JSON.stringify(ids))
ok('没有求值失败的行（`\\phi` 是合法名字）', (await page.locator('.row-err').count()) === 0)

/**
 * **引用**这一半曾经漏过（2026-09-26 用户："关于 φ 这个希腊字符，你还没修啊"）。
 *
 * 那时建对象那侧会把 `\phi` 归一成真字符 φ、引用那侧不会 —— 于是
 * `ker(\phi)` 找不到那个映射（报"需要一个映射对象"）而 `ker(φ)` 找得到，
 * 用户看到的只是"有时候好使有时候不好使"。
 *
 * 2026-09-27 形态约定反转之后，这条约束**换了形式但更强**：
 * 名字只有一种形态（ASCII / LaTeX 命令），**没有第二套写法要去对齐** ——
 * 那个 bug 的形状从根上不存在了。所以现在验的是：
 *   · 同名引用必定找得到（`ker(\phi)`）；
 *   · 另一个别名**就是另一个名字**（`ker(\varphi)` 找不到，且报错说清"没有这个对象"）；
 *   · 真字符 ϕ 一律被拦（它键盘打不出来）。
 */
// 三条都走**输入框那条路**：被拦的会在这里就拦下（按钮置灰），所以判据看 status，
// 不看 `.row-err` —— 后者是"进了对象表才求值失败"，根本不是被拦的样子。
const okK1 = await addLine('K1', 'ker(\\phi)')
const stK2 = await status()
const okK2 = await addLine('K2', 'ker(\\varphi)')
const stK3pre = await status()
const okK3 = await addLine('K3', 'ker(\u03d5)') // 真字符 ϕ（从论文 PDF 里复制来的通常是这个码位）
const stK3 = await status()
await page.waitForTimeout(340)

const allRows = await objIds()
ok('同名引用找得到（`ker(\\phi)` 通）', okK1 === true && allRows.some((x) => /^K1/.test(x)), JSON.stringify(allRows))
ok(
  '另一个别名**是另一个名字**（`ker(\\varphi)` 找不到，不再被静默归一）',
  okK2 === false && allRows.every((x) => !/^K2/.test(x)),
  `submitted=${okK2}`,
)
ok(
  '真字符 ϕ 被拦下（键盘打不出来）',
  okK3 === false && allRows.every((x) => !/^K3/.test(x)),
  `submitted=${okK3}`,
)
ok(
  '拦 ϕ 的理由说清是"键盘打不出来"',
  stK3.text.includes('键盘打不出来'),
  `${stK3.cls} :: ${stK3.text}`,
)
ok(
  '而且给出了可照抄的改法（`\\varphi`）',
  stK3.text.includes('\\varphi'),
  stK3.text,
)
ok(
  '对象表里没有任何非 ASCII 的名字（形态统一了）',
  allRows.every((x) => !/^[^\x00-\x7F]/.test(x)),
  JSON.stringify(allRows),
)
void stK2
void stK3pre
await page.screenshot({ path: '../../docs/assets/u23-greek-phi.png' })

/* ══ ⑨ 报错分清「没这功能」与「打错了」 ═══════════════════ */

// 2026-09-28（U27）起 `maximalSubgroups(G)` 已接线 —— 换仍在缺口清单里的 `HallSub(G)` 当样本
await typeExpr('HallSub(G)')
const s1 = await status()
ok('`HallSub(G)` 报「没有名为…的操作」', s1.text.includes('没有名为'), `${s1.cls} :: ${s1.text}`)
ok('并给了相近操作（Sub(G)）', s1.text.includes('Sub(G)'), s1.text)
ok('不再说"可用的群记号"', !s1.text.includes('群记号'), s1.text)

// U27 接线之后的正面判据：`gcd` / `maximalSubgroups(G)` / `Inn(G)` 都跑得通
await typeExpr('gcd(12, 18)')
const sGcd = await status()
ok('`gcd(12, 18)` 通过校验且预览出值', !sGcd.cls.includes('bad') && sGcd.text.includes('6'), `${sGcd.cls} :: ${sGcd.text}`)

// 关系行是在**输入框**里打的 \\to 走 evalExpr（不是 buildLines），所以这里验的是 preview 那句话。
// 注意 U20 之后 `\\subseteq` 已经是**真操作**了：这里不再甩"写的是一个关系"，
// 而是真的去算，算不通就报"为什么算不通"——这才是提示该有的样子。
await typeExpr('H \\subseteq G')
const s2 = await status()
ok('`H \\subseteq G`（两个 C_6，元素相同）报「同一个」', s2.text.includes('同一个'), `${s2.cls} :: ${s2.text}`)
ok('不再说"这行写的是一个关系"', !s2.text.includes('这行写的是一个关系'), s2.text)
ok('也不甩"无法识别的群记号"', !s2.text.includes('群记号'), s2.text)

// 某一侧根本不存在 \\to 直接点出是哪一侧，而不是答非所问
await typeExpr('A \\subseteq K9')
const s3 = await status()
ok('`A \\subseteq K9` 报「算不出来」（指出是哪一侧）', s3.text.includes('算不出来'), s3.text)

// 真\\cdot打错字：保持"无法识别"
await typeExpr('G S_4')
const s4 = await status()
ok('乱写仍是「无法识别」', s4.text.includes('无法识别'), s4.text)

// 收起输入卡，免得挡住画布
await page.keyboard.press('Escape')
await page.waitForTimeout(250)

/* ══ ① K 的信息：结论区不再沉默 ═══════════════════════════ */

await addLine('K', 'ker(\\phi)')
await page.waitForTimeout(300)
ok('K 建出来了', (await page.locator('.row-err').count()) === 0)

ok('点得中 K 那一行', await clickRow('K'))
await page.waitForTimeout(350)
const kInfo = await infoState()
ok('K 的结论区里有「识别」条', kInfo.labels.includes('识别'), kInfo.labels.join(','))
ok(
  '「识别」条给出了 SmallGroup 坐标',
  kInfo.texts.some((t) => t.includes('SmallGroup')),
  kInfo.texts.join(' | '),
)
ok('不再只有"阶"一条', kInfo.labels.length >= 2, kInfo.labels.join(','))

/* ══ ③ 子群 tab：标清"共轭类代表" + \\trianglelefteq 正规 ═══════════════ */

// 换一个子群丰富点的群，看得更清楚
await ensureCard()
await page.fill('.composer-name', 'S')
await page.fill('.composer-expr', 'S_4')
await page.click('.composer-orb .composer-row button')
await page.waitForTimeout(350)
await page.keyboard.press('Escape')
await page.waitForTimeout(250)

ok('点得中 S_4 那一行', await clickRow('S'))
await page.waitForTimeout(300)
await page.click('.info-sec-head[data-sec="subgroups"]')
await page.waitForTimeout(350)
const subInfo = await infoState()
ok(
  // 2026-09-30 起子群 tab 先折**同构类**再摊共轭类 —— 顶部说明跟着改了，
  // 但"这个列表是什么"这件事必须照旧说清（旧断言的关键词是「共轭类代表」）
  '子群 tab 顶部说清了这个列表是什么（同构类分组 + 共轭类）',
  subInfo.notes.some((n) => n.includes('同构类') && n.includes('共轭类')),
  subInfo.notes.join(' | '),
)
ok(
  '说明里点出「平凡群与 G 自身不在此列」',
  subInfo.notes.some((n) => n.includes('不在此列')),
  subInfo.notes.join(' | '),
)
ok(
  '正规子群有显眼的「\\trianglelefteq 正规」标记',
  subInfo.normals.length > 0 && subInfo.normals.every((x) => x.includes('正规')),
  JSON.stringify(subInfo.normals),
)
ok(
  'S_4 的子群列表里有 2 个正规代表（A_4 与 V_4）',
  subInfo.normals.length === 2,
  JSON.stringify(subInfo.normals),
)
ok(
  '底部提示指向 normalSubgroups(G)',
  subInfo.notes.some((n) => n.includes('normalSubgroups(G)')),
  subInfo.notes.join(' | '),
)

await page.screenshot({ path: '../../docs/assets/u18-info-fixes.png' })

/* ══ U47/U48：本地预算 + 已知结论 —— 敲 `Aut(S6)` 不许卡死，还要有答案 ═══ */

/**
 * 事故路径就是**按键预览**：`ComposerOrb` 的 `useMemo` 每次输入都同步求值一次，
 * 所以"算不完"在这里不是"慢"，是**整个页面不动了**（连光标都不闪）。
 *
 * 这一段的判据是**时间**：守卫没生效时下面这些 `page.*` 调用会一直挂着 ——
 * 所以先把默认超时压到 4s，挂住就记一条 FAIL，而不是让整条走查线卡死在这里。
 *
 * ⚠️ **U48 把这里的期望值翻过来了**：U47 时 `Aut(S6)` 的答案是"搜不动"（拒绝语），
 * 用户当场否掉了那个答案（「起码得把常见结论硬编码吧」）⇒ 现在 `Aut(S6)` **当场给出
 * `|Aut| = 1440`**（结论表），预览区是 `good` 而不是 `bad`。判据因此换成：
 * **快 + 有 1440**（"搜不动"那条断言反过来，写成"不再说搜不动"）。
 * 仍然守的是同一件事：`Syl(S6, 2)` 这种本地真跑不完的，还是当场拦下（且说人话）。
 *
 * 放在截图**之后**：这一段要反复换画布，会把上面那条 U18 的截图换掉。
 */
await page.goto(`${BASE}/?empty=1`, { waitUntil: 'load' })
await page.waitForTimeout(900)
await ensureCard()
page.setDefaultTimeout(4000)

try {
  const t0 = Date.now()
  await page.fill('.composer-expr', 'Aut(S6)')
  const fillMs = Date.now() - t0
  ok('输入 Aut(S6)：预览立刻回来（< 2s，事故时是 240s 没完）', fillMs < 2000, `${fillMs}ms`)

  const st = await status()
  ok('U48：预览区给出结论 |Aut(S_6)| = 1440（不再是"搜不动"）', st.text.includes('1440'), st.text)
  ok('而且不再说"搜不动"', !st.text.includes('搜不动'), st.text)
  ok('预览是"可以提交"的（不是拒绝、也不是空白）', st.cls.includes('good'), st.cls)

  await page.screenshot({ path: '../../docs/assets/u48-aut-known.png' })

  // 守卫不许误伤：S_4 的自同构群照旧算得出来
  const t1 = Date.now()
  await page.fill('.composer-expr', 'Aut(S4)')
  const fill2Ms = Date.now() - t1
  const st2 = await status()
  ok('Aut(S4) 照旧算得出（守的是"跑不动"，不是"一律不算"）', st2.cls.includes('good'), `${st2.text}`)
  ok('Aut(S4) 也很快（|Aut| = 24）', fill2Ms < 2000 && st2.text.includes('24'), `${fill2Ms}ms ${st2.text}`)

  // 被拦之后页面还得是活的
  const t2 = Date.now()
  await page.fill('.composer-expr', 'Syl(S6, 2)')
  const fill3Ms = Date.now() - t2
  const st3 = await status()
  ok('Syl(S6, 2) 也被拦住', st3.text.includes('本地跑不完'), st3.text)
  ok('拦住的理由不说"待后端"（本项目没有后端）', !st3.text.includes('后端'), st3.text)
  ok('Syl(S6, 2) 当场返回', fill3Ms < 2000, `${fill3Ms}ms`)

  const t3 = Date.now()
  await page.click('.composer-orb .orb-center')
  const clickMs = Date.now() - t3
  ok('被拦之后页面仍然响应点击', clickMs < 1000, `${clickMs}ms`)
  await page.click('.composer-orb .orb-center')
  await page.waitForTimeout(200)
} catch (e) {
  ok('U47 这一段没有把页面挂住', false, String(e).slice(0, 160))
}

ok('控制台零错误', logs.length === 0, logs.join(' | '))
console.log('')
console.log(`${pass} PASS / ${fail} FAIL`)
await browser.close()
if (fail > 0 || logs.length > 0) process.exitCode = 1
