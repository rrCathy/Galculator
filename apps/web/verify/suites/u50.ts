/**
 * U50 回归线（2026-10-02）：把"本地明明算得动、却被说成算不动"的族一次收口。
 *
 * 起因是两张截图：
 *   · `AUT(C4^2)` -> 「C_4^2 有 96 个自同构，本地建不出这个群，建群线 48，待后端 GAP 通道」
 *   · `GL(2,4)`   -> 「该记号本地建不了……（后端通道尚未接入）」
 *
 * 用户原话：「常见群族不会没导入吧……难道 desmos 算一些微积分还要跑去接入
 * matlab/sagemath 吗」。查下去是**两类**问题，都不是"算不动"：
 *
 *   ① `Aut` 建群贵在 core 的实现（`multiply` 是"复合完再在 |Aut| 条 map 里线性搜一遍"），
 *      不是建群本身 —— 换哈希乘法后 96 阶 2323ms -> 13ms、168 阶 60s 没完 -> 33ms。
 *      U47 那条 `|Aut| <= 48` 的"建群线"是**量错了对象**（`automorphisms.ts` 顶部有全表）。
 *   ② `GL`/`SL`/`PGL`/`PSL` 是 core **真没实现**（`createGL2` 第一行就 `if (!isPrime(p)) throw`，
 *      而 switch 里只硬编码了 `GL(2,2)` 与 `GL(2,3)`）—— 180 阶的 `GL(2,4)` 在本机
 *      枚举出来只要 0.2ms，缺的只是"有人写"（`matrixGroups.ts`）。
 *
 * 这一套守三件事：
 *   ① 截图里那两条报错**不再出现**（`Aut(C_4 x C_4)` / `GL(2,4)` 都给真群，且当场返回）；
 *   ② 新族的**数学对**（阶、元素阶分布、生成元闭包 —— 期望值全部手算，不从运行结果抄）；
 *   ③ 守卫**还在**、且说人话：真算不动的照旧拦住，但界面上的理由是"本地跑不完"，
 *      不再是"待后端 GAP 通道"（本项目没有后端 —— 那是句用户看不见的承诺）。
 */
import type { Group, GroupElement } from '@groupviz/core'
import type { GalObject } from '../../src/gal/types'
import { isKnownGroup } from '../../src/gal/known'
import { buildLocally } from '../../src/gal/localBuild'
import { build, eq, ok, suite } from '../harness'

/** 一行定义 + 拿最后一个对象。 */
function calcOf(lines: string[]): { obj: GalObject | undefined; ms: number } {
  const t0 = Date.now()
  const b = build(lines)
  const obj = b.byId(lines[lines.length - 1].split('=')[0].trim())
  return { obj, ms: Date.now() - t0 }
}

/** 最后一行**该失败**，返回报错语与同一条行的 hint。 */
function failOf(lines: string[]): { err: string; hint: string; ms: number } {
  const t0 = Date.now()
  const b = build(lines)
  const name = lines[lines.length - 1].split('=')[0].trim()
  const st = b.line(name)
  const bad = st && !st.ok
  return { err: bad ? (st.error ?? '') : '', hint: bad ? (st.hint ?? '') : '', ms: Date.now() - t0 }
}

function orderOf(o: GalObject | undefined): number | null {
  return o?.value.type === 'group' ? o.value.group.order : null
}

function elemCount(o: GalObject | undefined): number | null {
  return o?.value.type === 'group' ? o.value.group.elements.length : null
}

function knownOf(o: GalObject | undefined): boolean {
  return o?.value.type === 'group' && isKnownGroup(o.value.group)
}

/** 群值的符号（不是群值就回 null）。 */
function symbolOf(o: GalObject | undefined): string | null {
  return o?.value.type === 'group' ? o.value.group.symbol : null
}

/** 元素阶分布 `{阶: 个数}` —— 强不变量，用来抓"建出来的其实是别的同阶群"。 */
function orderDist(g: Group): Record<number, number> {
  const dist: Record<number, number> = {}
  for (const e of g.elements) {
    let o = 1
    let x = e
    while (x.id !== g.identity.id) {
      x = g.multiply(x, e)
      o++
    }
    dist[o] = (dist[o] ?? 0) + 1
  }
  return dist
}

/**
 * 生成元闭包大小。**必须真算**：`buildSubgroupGroup` 与这里自造的矩阵群都**不校验**
 * 传进去的生成元能否生成整个群 —— 挑错的后果不是崩，是界面给出"生成元生成不出这个群"
 * 的假象（比报错难查，U49 立的纪律）。
 */
function genClosure(g: Group): number {
  const seen = new Set([g.identity.id])
  const stack: GroupElement[] = [g.identity]
  while (stack.length > 0) {
    const x = stack.pop() as GroupElement
    for (const gen of g.generators) {
      const y = (gen.apply as (e: GroupElement) => GroupElement)(x)
      if (!seen.has(y.id)) {
        seen.add(y.id)
        stack.push(y)
      }
    }
  }
  return seen.size
}

/** 只走补丁层。`buildLocally` 自己就守"core 建得出的不抢"（纪律①），所以直接调它。 */
function localOnly(canonical: string): Group | null {
  return buildLocally(canonical)
}

export function run(): void {
  suite('u50 \\cdot Aut 建群线：|Aut| 不再按 48 拦（U50）')
  {
    /*
     * 截图一：`AUT(C4^2)` 报"有 96 个自同构，本地建不出这个群，建群线 48"。
     * 那句话里每一半都是错的：96 个自同构 30ms 就搜出来了，包成群 13ms。
     */
    const c44 = calcOf(['G = C_4 x C_4', 'A = Aut(G)'])
    eq('|Aut(C_4 x C_4)| = 96（手算：384 = 96 x 4）', orderOf(c44.obj), 96)
    eq('给的是**真群**（元素表 96 行齐全）', elemCount(c44.obj), 96)
    ok('不是「已知群」—— Aut(C_4 x C_4) 不在课本结论表里，只能是真算的', !knownOf(c44.obj))
    ok('当场返回（< 2s；core 的 createAutomorphismGroup 实测 2323ms）', c44.ms < 2000, `${c44.ms}ms`)

    // 阶小 != 便宜：C_2^3 只有 8 阶，|Aut| = |GL(3,2)| = 168（core 那边 60s 没完）
    const c23 = calcOf(['G = C_2^3', 'A = Aut(G)'])
    eq('|Aut(C_2^3)| = |GL(3,2)| = 168', orderOf(c23.obj), 168)
    eq('168 阶也建成真群（U48 时只能退成「已知群」）', elemCount(c23.obj), 168)
    ok('不是「已知群」：GL(3,2) 现在本地有记号了', !knownOf(c23.obj))
    ok('当场返回（< 2s；core 实测 60s 没完）', c23.ms < 2000, `${c23.ms}ms`)

    // 误伤检查①：结论表那一档照旧走表（S_6 的 1440 本地真建不动）
    const s6aut = calcOf(['G = S_6', 'A = Aut(G)'])
    eq('|Aut(S_6)| = 1440 照旧由结论表接手', orderOf(s6aut.obj), 1440)
    ok('S_6 那一档仍是「已知群」（1440 阶真搜不出来）', knownOf(s6aut.obj))

    // 误伤检查②：线内一律**真算**，元素是自同构本身（结论区才能说 Aut(S_4) ≅ S_4）
    const s4aut = calcOf(['G = S_4', 'A = Aut(G)'])
    eq('|Aut(S_4)| = 24 照旧真算', orderOf(s4aut.obj), 24)
    ok('Aut(S_4) 不是「已知群」（元素表 24 行）', !knownOf(s4aut.obj) && elemCount(s4aut.obj) === 24)

    const a5aut = calcOf(['G = A_5', 'A = Aut(G)'])
    eq('|Aut(A_5)| = 120 = |S_5|（手算值）', orderOf(a5aut.obj), 120)
    eq('A_5 也建成真群（哈希乘法 2ms；core 实测 21s）', elemCount(a5aut.obj), 120)

    /*
     * 守卫**还在**：预算不是删掉了，是量对了。`C_6 x C_6`（36 阶，不在任何结论表族里）
     * 的 |Aut| = 288，代价 288^2 x 36 = 2 985 984 远超建群预算 —— 这一档仍旧拦住，
     * 只是理由换成实话（本地包不起来），不再是"待后端"。
     */
    const c66 = failOf(['G = C_6 x C_6', 'A = Aut(G)'])
    ok('预算外仍拦住（C_6 x C_6：|Aut| = 288 超出本地建群预算）', c66.err.includes('288'), c66.err || '(没报错)')
    ok('拦住的理由里不说"后端"（本项目没有后端）', !c66.err.includes('后端'), c66.err)
    ok('当场返回，不是"慢慢卡住"', c66.ms < 2000, `${c66.ms}ms`)
  }

  suite('u50 \\cdot 矩阵群族：GL / SL / PGL / PSL（U50）')
  {
    /*
     * 截图二：`GL(2,4)` 报"该记号本地建不了（后端通道尚未接入）"。
     *
     * 阶全部手算：|GL(2,q)| = (q^2-1)(q^2-q)、|SL(2,q)| = q(q^2-1)/(q-1) 在小 q 上直接算；
     * |GL(3,2)| = (8-1)(8-2)(8-4) = 168；|SL(3,2)| = |GL(3,2)| = 168（q=2 时 det 恒 1）。
     * PGL = GL/Z（|Z| = q-1）；PSL = SL/(Z ∩ SL)。
     */
    const cases: [string, number][] = [
      ['GL(2,4)', 180],
      ['GL(2,5)', 480],
      ['GL(2,7)', 2016],
      ['GL(3,2)', 168],
      ['SL(2,4)', 60],
      ['SL(2,5)', 120],
      ['SL(2,7)', 336],
      ['SL(3,2)', 168],
      ['PGL(2,5)', 120],
      ['PGL(2,7)', 336],
      ['PSL(2,5)', 60],
      ['PSL(2,7)', 168],
    ]
    for (const [sym, want] of cases) {
      const r = calcOf([`G = ${sym}`])
      eq(`${sym} 建得出，阶 = ${want}`, orderOf(r.obj), want)
      eq(`${sym} 元素表齐全（真群，不是「已知群」）`, elemCount(r.obj), want)
      ok(`${sym} 符号认得出来`, (symbolOf(r.obj) ?? '').startsWith(sym.split('(')[0]), String(symbolOf(r.obj)))
      ok(`${sym} 当场返回`, r.ms < 2000, `${r.ms}ms`)
    }

    /*
     * 强不变量：`GL(2,4)` 的阶直方图。手算 —— GL(2,4) ≅ A_5 x C_3：
     *   A_5：1 个 1 阶、15 个 2 阶、20 个 3 阶、24 个 5 阶；C_3：1 个 1 阶、2 个 3 阶。
     *   取 lcm 组合：1:1x1=1 · 2:15x1=15 · 3:(1x2 + 20x1 + 20x2)=62 · 5:24x1=24
     *   · 6:15x2=30 · 15:24x2=48 —— 合计 180，与 |GL(2,4)| 相符。
     * 这一条能抓住"建出来的其实是别的 180 阶群"（比如 GL(2,4) 与某个同阶非交换群）。
     */
    const gl24 = localOnly('GL(2,4)') as Group | null
    ok('GL(2,4) 走补丁层建得出', !!gl24)
    eq(
      'GL(2,4) 阶直方图 = 1/15/62/24/30/48（手算，合计 180）',
      JSON.stringify(gl24 ? orderDist(gl24) : null),
      JSON.stringify({ 1: 1, 2: 15, 3: 62, 5: 24, 6: 30, 15: 48 }),
    )

    // PSL(2,5) ≅ A_5（60 阶单群）—— 阶直方图是最直接的对照：只有 1/2/3/5 四档
    const psl25 = localOnly('PSL(2,5)') as Group | null
    eq(
      'PSL(2,5) 阶直方图 = 1/15/20/24（与 A_5 同形，合计 60）',
      JSON.stringify(psl25 ? orderDist(psl25) : null),
      JSON.stringify({ 1: 1, 2: 15, 3: 20, 5: 24 }),
    )
    eq('PSL(2,5) 阶 = 60 = |A_5|', psl25?.order ?? null, 60)

    /*
     * 纪律①（生成元自校验）：`buildSubgroupGroup` 与 core 的 `createGL2` 都**不检查**
     * 生成元能否生成整个群。这里逐个验闭包 —— 挑错的后果是"生成元生成不出这个群"的假象。
     */
    for (const sym of ['GL(2,4)', 'GL(2,7)', 'GL(3,2)', 'PSL(2,7)', 'PGL(2,7)']) {
      const g = localOnly(sym) as Group | null
      ok(`${sym} 的生成元真能生成整个群（闭包 = 阶）`, !!g && genClosure(g) === g.order, g ? `${genClosure(g)} / ${g.order}` : 'null')
    }

    /*
     * 纪律②：core 建得出的**不许抢**（同一个记号不许长出两个只是同构的群对象）。
     * `GL(2,2)` / `GL(2,3)` / `SL(2,3)` 是 core 硬编码在 switch 里的三个。
     */
    eq('GL(2,2) core 自己建得出 ⇒ 补丁层不接', buildLocally('GL(2,2)'), null)
    eq('GL(2,3) 同理', buildLocally('GL(2,3)'), null)
    eq('SL(2,3) 同理', buildLocally('SL(2,3)'), null)

    /*
     * 纪律③：不猜 —— 域不支持（`F_8`/`F_9` 要挑不可约多项式）或阶太大（`GL(3,3)` = 11232）
     * 一律 `null`，让调用方照原样说"本地建不了"。
     */
    eq('GL(2,8) 要扩域 F_8 ⇒ 不建（假答案不如没有）', buildLocally('GL(2,8)'), null)
    eq('GL(2,9) 要扩域 F_9 ⇒ 不建', buildLocally('GL(2,9)'), null)
    eq('GL(3,3) = 11232 阶超出本地能画的线 ⇒ 不建', buildLocally('GL(3,3)'), null)
  }

  suite('u50 \\cdot 门窄的 S_n / D_n / C_n（U50）')
  {
    /*
     * 这一族的问题与 A_6（U49）同型：**core 的族门写窄了**，构造器本身没有内部上限。
     *   `S_{n}` 门 3..6，而 `createSymmetricGroup` 无上限；
     *   `D_{n}` 门到 8，而 `createDihedralGroup` 无上限；
     *   `C_{n}` 门停在 120（`CYCLIC_GROUP_MAX_ORDER`），而闭式乘法任意阶都行。
     */
    const narrow: [string, number][] = [
      ['S_7', 5040],
      ['A_7', 2520],
      ['D_16', 32],
      ['D_32', 64],
      ['C_121', 121],
      ['C_1000', 1000],
    ]
    for (const [sym, want] of narrow) {
      const r = calcOf([`G = ${sym}`])
      eq(`${sym} 建得出，阶 = ${want}`, orderOf(r.obj), want)
      eq(`${sym} 元素表齐全`, elemCount(r.obj), want)
      ok(`${sym} 当场返回`, r.ms < 3000, `${r.ms}ms`)
    }

    /*
     * `A_7` 走的是同一层（`A_n` = `S_n` 的偶置换子群）⇒ 生成元闭包必须真等于 2520。
     * 手算：|A_7| = 7!/2 = 2520。
     */
    const a7 = localOnly('A_{7}') as Group | null
    eq('A_7 阶 = 2520 = 7!/2', a7?.order ?? null, 2520)
    ok('A_7 的生成元闭包 = 2520（真能生成）', !!a7 && genClosure(a7) === a7.order, a7 ? `${genClosure(a7)} / ${a7.order}` : 'null')

    /*
     * 上限**要停得有理**（不是"算不动"，是"建得出但不该建"）：
     *   · `S_8` = 40320 个元素（44ms、堆 +13.5MB）—— 元素表四万行必然把页面卡死，
     *     这正是 U47 的教训"建得出 != 该建"；
     *   · `A_8` 借 `S_8`，同一条线；
     *   · `D_1000` = 2000 个元素、`C_1001` —— 画布放不下。
     * 这几条停在这里，且**返回 null 让调用方说"本地建不了"**，不假装。
     */
    eq('S_8 超出"建得出也不该建"的线 ⇒ null', buildLocally('S_{8}'), null)
    eq('A_8 借 S_8，同一条线 ⇒ null', buildLocally('A_{8}'), null)
    eq('D_1000（2000 个元素）⇒ null', buildLocally('D_{1000}'), null)
    eq('C_1001 超出循环线上限 ⇒ null', buildLocally('C_{1001}'), null)

    // 纪律①：core 自己建得出的，补丁层一律不接（`S_6` / `D_8` / `C_12` 全在 core 门内）
    eq('S_6 core 建得出 ⇒ 不接', buildLocally('S_{6}'), null)
    eq('D_8 core 建得出 ⇒ 不接', buildLocally('D_{8}'), null)
    eq('C_12 core 建得出 ⇒ 不接', buildLocally('C_{12}'), null)
    eq('A_5 core 建得出 ⇒ 不接', buildLocally('A_{5}'), null)
  }

  suite('u50 \\cdot 报错语：没有后端，就别拿"待后端"当理由（U50）')
  {
    /*
     * 用户看得见的每一句"算不动"都要是实话。本项目**没有后端**，
     * 所以"待后端 GAP 通道 / 后端通道尚未接入"这类说法是**用户看不见的承诺**。
     * 留下来的那几处守卫（子群枚举 / p-子群 / 记号没覆盖）理由必须写成
     * "本地跑不完 / 本地构造器只覆盖到常见小规模族"。
     */
    const syl2 = failOf(['G = S_6', 'A = Syl(G, 2)'])
    ok('Syl_2(S_6) 仍拦住（实测 45s 没完）', syl2.err.includes('本地跑不完'), syl2.err)
    ok('理由里给出压力上限，不说"待后端"', !syl2.err.includes('后端') && syl2.hint.includes('本地压力上限'), `${syl2.err} | ${syl2.hint}`)

    const psub2 = failOf(['G = S_6', 'A = pSub(G, 2)'])
    ok('pSub_2(S_6) 同样拦住', psub2.err.includes('本地跑不完'), psub2.err)
    ok('且不说"待后端"', !psub2.err.includes('后端'), psub2.err)

    const c26 = failOf(['G = C_2^6', 'A = Syl(G, 2)'])
    ok('C_2^6（64 阶，144 线之下）也拦得住 —— 阶这条线对 p-子群不管用', c26.err.includes('本地跑不完'), c26.err)

    const sub6 = failOf(['G = S_6', 'A = Sub(G)'])
    ok('Sub(S_6) 说"超过子群枚举线"', sub6.err.includes('超过子群枚举线'), sub6.err)
    ok('理由写的是"本地跑不完"，不是"待后端"', !sub6.err.includes('后端'), sub6.err)

    const norm6 = failOf(['G = S_6', 'A = normalSubgroups(G)'])
    ok('normalSubgroups(S_6) 同样拦住且不说"待后端"', norm6.err.includes('超过子群枚举线') && !norm6.err.includes('后端'), norm6.err)

    const max6 = failOf(['G = S_3', 'H = S_3', 'P = G x H', 'Q = P x S_3', 'M = maximalSubgroups(Q)'])
    ok('极大子群超线也拦住', max6.err.includes('超过子群枚举线'), max6.err)

    /*
     * 记号层面：`D_1000` 这一档 core 只给了 `gapExpr`（它替"有 GAP 后端的宿主"准备的），
     * 本项目没后端 ⇒ 只能说"本地构造器没覆盖到"，不许把 gapExpr 当"待接入"的挡箭牌，
     * 也不许把 `DihedralGroup(2000)` 这种串摆到界面上（对用户是噪音）。
     */
    const d1000 = failOf(['G = D_1000'])
    ok('D_1000 报"该记号本地建不了"', d1000.err.includes('本地建不了'), d1000.err)
    ok('hint 说的是本地构造器的覆盖范围，不提 GAP/后端', d1000.hint.includes('本地构造器') && !d1000.hint.includes('GAP'), d1000.hint)
    ok('hint 里没有 core 的 gapExpr 原文（DihedralGroup 这种串不该出现在界面上）', !d1000.hint.includes('DihedralGroup'), d1000.hint)

    // 全量扫描：凡是有报错的行，都不许出现这几个词（名字互不冲突，一遍就能同时求值）
    const banned = ['后端', '待接入', '尚未接入', 'GAP']
    const r = build([
      'G1 = S_6',
      'R1 = Syl(G1, 2)',
      'G2 = D_1000',
      'G3 = S_6',
      'R3 = Sub(G3)',
      'G4 = S_6',
      'R4 = normalSubgroups(G4)',
    ])
    let scanned = 0
    for (const st of r.lineStates) {
      if (st.ok) continue
      scanned++
      const text = `${st.error ?? ''} ${st.hint ?? ''}`
      ok(
        `报错行「${st.raw}」不含"${banned.join(' / ')}"`,
        !banned.some((b) => text.includes(b)),
        text,
      )
    }
    ok('扫描确实覆盖到了报错行（不是空转）', scanned >= 4, String(scanned))
  }
}
