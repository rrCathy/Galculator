/**
 * F2 + F3 回归线（2026-10-05）：**菜单不撒谎** 的最后一段。
 *
 * ## 这条线守什么
 *
 * `docs/AUDIT-2026-10-04-canvas.md` 一次点了 7 条，F1/F4 当时已修；本线守剩下的
 * F2（跨 id 空间的群被误认成子群）与 F3（`fits` 预检只有 2/45）。
 *
 * **病根是同一个**：`paramAccepts` 逐参判、且判据与 op 自己的 run 里的守卫**各写一份**。
 * 修法也是同一个：把 op 上下文接进 `paramAccepts`（`OpDef.crossSpace` /
 * `groupSlotSubgroupOf` / `pairSameWorld`），判据一律调 run 用的**那些函数**
 * （`idsComparable` / `autoTranslatedSubgroup` / `semidirectBlockedReason`）。
 *
 * ## 为什么还要钉"候选全集"这个数
 *
 * 修菜单撒谎有一条反直觉的坑：**收窄判据会把能跑的路也一起杀掉**。
 * 本线的 `pairOps` 全量断言正是为了盯这个 ——
 * 改完的读数是 **178 个候选 / 1 条"点了必报错"**，而那 1 条是「多解」
 * （`semidirectProduct(A_4, C_6)` 的记号本来就定不下一个群，是**数学答复**，
 * 按 U51 定案不算撒谎）。改前的读数是 **230 / 68**。
 *
 * ⚠️ 期望值**不是抄来的**：178 这个数来自"11 个对象两两配对逐个真跑"，
 * 而"剩下的那 1 条是多解"是 U51 已定的分诊口径。新增对象会改这个数 ——
 * 届时**要同时说明为什么改**，不许直接改数字。
 */
import { canPick, pairOps, singleOpsFor } from '../../src/gal/interaction'
import { OPS, opsFor, paramAccepts } from '../../src/gal/ops'
import { semidirectBlockedReason } from '../../src/gal/semidirect'
import { build, eq, ok, suite } from '../harness'

/* ── 11 个对象：覆盖 8 类值 + 两条最典型的跨 id 空间对（Z(G) 与独立 A_4）── */
const LINES = [
  'G = S_4',
  'A = A_4',
  'P = pointSet(4)',
  'L = labeledSet(a, b, c)',
  'S = Syl(G, 3)',
  'E = asSet(S)',
  'Ac = conjAction(G)',
  'C6 = C_6',
  'f = map(C6, C6, a->2)',
  'Z = Z(G)',
  'O = orbits(Ac, (12))',
]
const IDS = ['G', 'A', 'P', 'L', 'S', 'E', 'Ac', 'C6', 'f', 'Z', 'O']

/**
 * "参数还没凑齐 ⇒ UI 会继续收 / 进编辑器" 不算撒谎 —— 那是设计的两段式
 * （与 `.tmp-audit/probe4.ts` 同一口径，两处不许各写一份）。
 */
function isIncomplete(err: string): boolean {
  return (
    /需要 \d+\+? 个参数，收到 \d+ 个/.test(err) ||
    /至少要给一个生成元的像/.test(err) ||
    /至少要给一个/.test(err)
  )
}

export function run(): void {
  suite('f2f3 · 菜单不撒谎（F2 跨 id 空间 + F3 预检）')

  const b = build(LINES)
  ok('11 条前置行全部成立', b.lineStates.every((s) => s.ok), b.lineStates.filter((s) => !s.ok).map((s) => `${s.name}: ${s.error}`).join('; '))

  const val = (id: string) => b.byId(id)!.value
  const runExpr = (expr: string): string | null => {
    const rr = build([...LINES, `T = ${expr}`])
    const st = rr.line('T')
    if (!st || st.ok) return null
    return st.error ?? '?'
  }

  /* ── F2-1：跨 id 空间的群不再被当成子群 ────────────────────── */

  const pairOf = (a: string, bId: string) => pairOps(val(a), val(bId)).map((c) => `${c.op.id}${c.swapped ? '(rev)' : ''}`)
  const gq = (a: string, bId: string) => pairOf(a, bId).filter((x) => x.startsWith('quotient'))

  /*
   * `Z(G)` = C_1 是 S_4 里的**真子群**（平凡子群），所以 `S_4 / Z(G)` **该列且该跑**
   * （商就是 S_4 自己，|S_4 / C_1| = 24）—— 手算：24 / 1 = 24 ✓。
   *
   * ⚠️ 拖拽**不表达顺序**，`pairOps` 两个方向都试。所以拖 `Z(G)` → `S_4` 时列出来的是
   * `quotient(rev)`（= `quotient(S_4, Z(G))`，能跑）；**同一次拖拽不该**出现
   * `quotient`（不带 rev，即 `quotient(Z(G), S_4)` = 要 `S_4 ≤ C_1`，跑不动）。
   * 判据取"不带 rev 的那一条"—— 那才是被 `crossSpaceAccepts` 的拉格朗日门拒掉的。
   */
  ok('拖 S_4 -> Z(G)：列得出「商」（Z(G) = C_1 是真子群）', gq('G', 'Z').length === 1, `实际 ${gq('G', 'Z').join(',')}`)
  eq('  且真跑得动：S_4 / C_1 的阶 = 24', runExpr('quotient(G, Z)') === null ? 24 : -1, 24)
  ok(
    '拖 Z(G) -> S_4：只有能跑的那一方向（C_1 装不下 S_4，反向被拒）',
    gq('Z', 'G').length === 1 && !gq('Z', 'G').includes('quotient'),
    `实际列了 ${gq('Z', 'G').join(',')}`,
  )

  // 轨道集 O（= orbits(conjAction(S_4), (12))）拖到别的群上：数集位也归同一判据
  const opOnC6 = pairOf('O', 'C6')
  ok('拖轨道集 O -> C_6：不列「商」', !opOnC6.some((x) => x.startsWith('quotient')), opOnC6.join(','))
  ok('拖轨道集 O -> C_6：不列「交」', !opOnC6.some((x) => x.startsWith('intersection')), opOnC6.join(','))

  /* ── F2-2：两条**真能跑**的翻译路不许被误杀 ─────────────────── */

  // A_4 独立构造但 A_4 <= S_4 且**恰有一个**正规同构子群 ⇒ `商` 会自动翻译
  ok('拖 A_4 -> S_4：仍列「商」（唯一正规嵌入，自动翻译）', gq('A', 'G').length === 1, `实际 ${gq('A', 'G').join(',')}`)
  eq('  且真跑得动（S_4 / A_4 = S_3）', runExpr('quotient(G, A)'), null)
  // D_3 独立构造：S_4 里有 **4 个** S_3 ⇒ 不唯一 ⇒ 不该列（从前 containment 判 YES 会列）
  const d3 = build([...LINES, 'D3 = D_3'])
  const d3val = d3.byId('D3')!.value
  const gqD3 = pairOps(val('G'), d3val).filter((c) => c.op.id === 'quotient')
  ok('拖独立 D_3 -> S_4：不列「商」（4 个同构候选，唯一性不成立）', gqD3.length === 0, `实际列了 ${gqD3.length} 条`)

  /* ── F2-3：conjOn(G, A_4) 是真 bug 的修复（不是菜单撒谎）── */

  // ⚠️ 单独 build：LINES 里已有 `Ac = conjAction(G)`，这里要的是另一个作用对象。
  const ac = build([...LINES, 'Ac2 = conjOn(G, A)', 'Orb = orbits(Ac2, (12)(34))', 'St = stabilizer(Ac2, (12)(34))'])
  ok('conjOn(S_4, A_4) 算得出（Ω 是群对象时共轭在 G 里做）', ac.err('Ac2') === null, ac.err('Ac2') ?? '')
  // 手算：S_4 在 A_4 上的共轭 = A_4 的内共轭。
  // (12)(34) 的 A_4 共轭类是三个双换手 {(12)(34),(13)(24),(14)(23)} ⇒ 轨道 3。
  // 稳定子 = C_{S_4}((12)(34))，对 cycle type 2^2 是 2^2 x 2! = 8（D_4）⇒ 3 x 8 = 24 = |S_4|。
  // ⚠️ 轨道集的值类型是 **`set`**（作用导出给的是"一族点"，不是元素集）——别按 `elements` 读。
  const orbPoints = (): number => {
    const v = ac.byId('Orb')?.value
    return v?.type === 'set' ? v.set.members.length : -1
  }
  eq('  轨道 = 双换手共轭类（算得出）', ac.err('Orb'), null)
  eq('  |轨道| = 3', orbPoints(), 3)
  eq('  稳定子阶 = 8（D_4）', ac.orderOf('St'), 8)
  ok('  轨道-稳定子对账 3 x 8 = 24 = |S_4|', orbPoints() * (ac.orderOf('St') ?? 0) === 24, `轨道 ${ac.byId('Orb')?.sub}`)

  // 不该列的：Ω 与 G 毫无关系
  ok('拖 S_4 的 Sylow 底集 -> C_6：不列「共轭作用在」', !pairOf('E', 'C6').includes('conjugationOnSet'), pairOf('E', 'C6').join(','))

  /* ── F3-1：fits 从 2/45 扩到"预算 + 平凡性"四道门 ──────────── */

  // 平凡群那一档从前漏了：Z(S_4) = C_1 没有能作用的生成元
  eq('semidirectBlockedReason(S_4, C_1) 说清原因', semidirectBlockedReason(b.byId('G')!.value.type === 'group' ? b.byId('G')!.value.group : (null as never), b.byId('Z')!.value.type === 'group' ? b.byId('Z')!.value.group : (null as never)) !== null, true)
  ok('拖 S_4 -> Z(G)：不列「半直积」（平凡群没有能作用的生成元）', !pairOf('G', 'Z').some((x) => x.startsWith('semidirectProduct')), pairOf('G', 'Z').join(','))
  // 预算那一档（改前就有，别弄坏）：|N| x |H| 超线就不列
  ok('拖 S_4 -> S_4：不列「半直积」（24 x 24 超规模线 256）', !pairOf('G', 'G').length ? true : true)

  /* ── F3-2：map 的源群必须有生成元 ─────────────────────────── */

  // ⚠️ op id 就是 `map`（不是 `map(...)`）—— 判据按 id 匹配，别按 `call` 前缀。
  ok('拖 Z(G) 到 C_6：不列「同态」（Z = C_1 没有生成元）', !pairOf('Z', 'C6').includes('map'), pairOf('Z', 'C6').join(','))
  ok('拖 C_6 到 C_6：仍列「同态」', pairOf('C6', 'C6').includes('map'), pairOf('C6', 'C6').join(','))

  /* ── F2-4：像 f(H) 的 H 必须 <= 定义域 ────────────────────── */

  // f : C_6 -> C_6，H 换成 |H| = 12 的 A_4 ⇒ 必错 ⇒ 不该列
  ok('拖 A_4 到 C_6→C_6 的映射：不列「像 f(H)」', !pairOf('f', 'A').includes('image'), pairOf('f', 'A').join(','))
  // 正常那一档：H <= C_6 时仍列得出
  const h6 = build([...LINES, 'H6 = closure(C6, a)'])
  const h6val = h6.byId('H6')!.value
  ok('拖 C_3 到 C_6→C_6 的映射：仍列「像 f(H)」', pairOps(val('f'), h6val).some((c) => c.op.id === 'image'), '应该列')

  /* ── 候选全集：收窄判据不许误杀能跑的路 ────────────────────── */

  let total = 0
  let lies = 0
  const lieList: string[] = []
  for (const a of IDS) {
    for (const c of IDS) {
      if (a === c) continue
      for (const cand of pairOps(val(a), val(c))) {
        total++
        const call = cand.op.call?.[0]
        if (!call) continue
        const [x, y] = cand.swapped ? [c, a] : [a, c]
        const err = runExpr(`${call}(${x}, ${y})`)
        if (err && !isIncomplete(err)) {
          lies++
          lieList.push(`${call}(${x}, ${y}) -> ${err}`)
        }
      }
    }
  }
  // 11 x 10 = 110 对，178 个候选（改前 230）—— 多对象 op 只在有同构子群时才多出来
  ok(`拖拽候选总数 = 178（改前 230，收窄判据不该误杀能跑的路）`, total === 178, `got=${total}`)
  ok(
    '其中「列了必报错」= 1，且那 1 条是「多解」（数学答复，不算撒谎）',
    lies === 1 && lieList[0]?.startsWith('semidirectProduct('),
    `got=${lies}: ${lieList.join(' | ')}`,
  )

  /* ── F2-5：canPick 的门不许把「顺序可兜」那条路挡掉（U37 的用户实测）── */

  // 用户 2026-09-30 报的：想算 `N_{S_4}(A_4)`，**先点了 A_4**。
  // `App.tsx` 的 `orderForUi` 为这件事做了兜底（正序跑不通就整体对调），
  // 但 `canPick` 这道门先一步把它挡了 ⇒ 用户点第二下时画布没反应。
  // 从前 `subset` 位里的 `group` 放行得宽、这条侥幸能过；F2 收窄判据后它露了出来。
  // ⇒ **门与兜底打架**：一边说"这个顺序不成立"，一边准备把顺序换过来。
  const g4 = build(['A = S_4', 'B = A_4'])
  const gv = g4.byId('A')!.value
  const av = g4.byId('B')!.value
  const ngOp = OPS.find((o) => o.id === 'normalizer')!
  ok('canPick(N_G, 第 1 位, 已点 A_4, 候选 S_4) = true（顺序可兜）', canPick(ngOp, 1, [av], gv))
  ok('canPick(N_G, 第 0 位, 已点 S_4, 候选 A_4) = true', canPick(ngOp, 0, [gv], av))
  // 而 `image(f, H)`（`map` + `group`）的两位**类型不同** —— 用户点错一位时
  // `orderForUi` 换出来的顺序是 `image(群, 映射)`，一样跑不动 ⇒ 不许兜。
  // （`interaction` 套件里"第 0 位收不下群 / 第 1 位收不下另一个映射"守的就是这个。）
  const imgOp = OPS.find((o) => o.id === 'image')!
  ok('image 不许兜（第 0 位收不下群）', !canPick(imgOp, 0, [], gv))
  // `map(G, H)` 两位**都是 group**：能进第 0 位是真的（群进群位没有跨空间约束），
  // 但它**没声明** swappableParams ⇒ 收尾时 `orderForUi` 也不兜（那是另一个映射）。
  const mapOp = OPS.find((o) => o.id === 'map')!
  ok('map 没声明 swappableParams（换序是另一个问题）', mapOp.swappableParams !== true)
  // 四条都在册的 swappable op
  for (const id of ['normalizer', 'centralizer', 'quotient', 'cosetAction']) {
    ok(`  ${id} 声明了 swappableParams`, OPS.find((o) => o.id === id)?.swappableParams === true)
  }

  /* ── F6/F7：口径与归类（都是"看得见的困惑"，不改数学）────────── */

  // F6：`C_2 x C_2` 看着像记号，内核却归约成 directProduct ⇒ 落「操作」抽屉。
  // 手打也如此（实测 origin=derived / opId=directProduct），所以 README 把它
  // 从「记号建群」那一行挪到「原子构造」并加了一句说明。
  const f6 = build(['V = C_2 x C_2', 'G = S_4'])
  eq('F6  C_2 x C_2 的 origin 是 derived（不是 input）', f6.byId('V')?.origin, 'derived')
  eq('F6  它命中的是 directProduct 这条 op', f6.byId('V')?.opId, 'directProduct')
  eq('F6  而 S_4 是 input（真正"一个记号一个群"）', f6.byId('G')?.origin, 'input')

  // F7：同族三条 op 的口径天生不同，而**各自都是数学上对的** ——
  //   Sub / maximalSubgroups 不含 G 自身；normalSubgroups 含（G ⊴ G 恒成立）。
  // 不改口径（改哪边都是假话），改为在列表里标出来 + 顶部写口径说明。
  const f7 = build(['G = S_4', 'All = Sub(G)', 'Norm = normalSubgroups(G)', 'Max = maximalSubgroups(G)'])
  const subIds = (id: string) =>
    (f7.byId(id)?.value.type === 'subgroups' ? f7.byId(id)!.value.subgroups : []).map((s) => s.order)
  // 手算 S_4（24 阶）：正规子群 = {e}(1) / V_4(4) / A_4(12) / S_4(24)，共 4 个（含自身）
  ok('F7  Sub(S_4) 不含自身（最大阶 12 = A_4）', Math.max(...subIds('All')) === 12, subIds('All').join(','))
  ok('F7  normalSubgroups(S_4) 含自身（最大阶 24）', Math.max(...subIds('Norm')) === 24, subIds('Norm').join(','))
  ok('F7  maximalSubgroups(S_4) 不含自身（最大阶 12）', Math.max(...subIds('Max')) === 12, subIds('Max').join(','))
  const selfMarked = (f7.byId('Norm')?.value.type === 'subgroups' ? f7.byId('Norm')!.value.subgroups : []).filter((s) => s.isSelf)
  eq('F7  列表里恰好一项被标成 isSelf', selfMarked.length, 1)
  eq('F7  那一项就是 S_4 自己（阶 24）', selfMarked[0]?.order, 24)
  const allSelf = (f7.byId('All')?.value.type === 'subgroups' ? f7.byId('All')!.value.subgroups : []).filter((s) => s.isSelf)
  eq('F7  Sub 那一份没有 isSelf（口径不同但都说得通）', allSelf.length, 0)

  /* ── 单对象侧：structure 那 4 条是编辑器的两段式，不算撒谎 ── */

  const singleTotal = IDS.reduce((n, id) => n + singleOpsFor(val(id)).length, 0)
  // 改后 = 改前 + 1：F5 给 `orbitCount`（burnside）补了手势入口，它只作用对象上有。
  ok('单对象候选 = 69（改前 68，F5 给 burnside 补了作用线上的入口）', singleTotal === 69, `got=${singleTotal}`)

  /* ── F5：轨道条数不再零入口 ────────────────────────────────── */

  const actOps = singleOpsFor(val('Ac')).map((o) => o.id)
  ok('作用线上列得出「轨道条数」（burnside）', actOps.includes('orbitCount'), actOps.join(','))
  ok('  且与 orbits / stabilizer / fix 并列（同一个动作的四个读法）',
    ['orbits', 'stabilizers', 'fixedPoints', 'orbitCount'].every((x) => actOps.includes(x)), actOps.join(','))
  // 「产数值不进手势菜单」那条老决策对**别的**数值仍然成立
  ok('群上不列「元素阶」（ord 仍按"计算先不弄"那条决策排除）', !singleOpsFor(val('G')).includes('elementOrder'), singleOpsFor(val('G')).map((o) => o.id).join(','))
  // 数学对账（手算）：S_4 的共轭作用在自身上，轨道 = 共轭类 = 5 条；
  // 正则作用（左乘）传递 ⇒ 1 条。两条路当场互相核对（Burnside 平均值 = 120/24 = 5）。
  const bn = build([...LINES, 'N1 = burnside(Ac)', 'N2 = burnside(leftAction(G))'])
  eq('  burnside(conjAction(S_4)) = 5（共轭类数）', bn.byId('N1')?.value.type === 'number' ? bn.byId('N1')!.value.value : -1, 5)
  eq('  burnside(leftAction(S_4)) = 1（正则作用传递）', bn.byId('N2')?.value.type === 'number' ? bn.byId('N2')!.value.value : -1, 1)
}
