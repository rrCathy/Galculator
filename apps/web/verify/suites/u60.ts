/**
 * U60 回归线（S1b/S1c）：**代数结构** —— 给一个集合配一个运算，看它到哪一级。
 *
 * 起因是用户对"半群 / 幺半群这一章在教什么"的追问：
 *   「用户创建了一个三阶集，想设计一个群运算并检测是否构成群/半群，怎么做？」
 * 于是有了 `structure(P, 表)` 这条 op 与 `algebra.ts` 的验证器。本线守它的**全部读数**：
 * 四档层级、反例可证伪、升格的载体轮换（core 要求单位元在首位）、能力门、诚实边界。
 *
 * ⚠️ **期望值全部手算**（不抄运行结果）：
 *   零半群 `1,1,1,2` 的单位元是 b、零元是 a；左零带 `1,1,2,2` 满足 x*y=x；
 *   `magma 1,2,1,1` 的坏三元组是 (b,a,b)；(Z/6Z,x) 的单位是 {1,5}、幂等元 {0,1,3,4}；
 *   拟群 `(2a+b) mod 5` 是拉丁方但 `(1*0)*0 ≠ 1*(0*0)`。手算的**反例**要当场代回去复核。
 */
import {
  isGroupStructure,
  planStructure,
  STRUCTURE_MAX,
  structureToGroup,
  unitGroupOf,
  verifyAxioms,
  type AxiomProfile,
  type GalStructure,
} from '../../src/gal/algebra'
import { opsFor, paramAccepts } from '../../src/gal/ops'
import { canvasShape, isCanvasValue, sortOf, type GalValue } from '../../src/gal/value'
import { build, eq, ok, suite } from '../harness'

/* ── 教材典型例子的表（1-based，行优先；见 DEVPLAN §1）── */
const V4 = [1, 2, 3, 4, 2, 1, 4, 3, 3, 4, 1, 2, 4, 3, 2, 1] // 元素 e,a,b,c
const V4_LABELS = ['e', 'a', 'b', 'c']
/** 同构的 V4，但**单位元 e 在末位**（守 §1 头号陷阱：core 要求单位元在首位）。*/
const V4_ROT = [4, 3, 2, 1, 3, 4, 1, 2, 2, 1, 4, 3, 1, 2, 3, 4]
const V4_ROT_LABELS = ['a', 'b', 'c', 'e']
/** 零半群：b 是单位元，a 是零元，a 无逆 ⇒ 幺半群。*/
const ZERO_SEMI = [1, 1, 1, 2]
/** 左零带（x*y = x）：结合、无单位元 ⇒ 半群。*/
const LEFT_ZERO = [1, 1, 2, 2]
/** 非结合：坏在 (b*a)*b ≠ b*(a*b) ⇒ 原群。*/
const MAGMA = [1, 2, 1, 1]
/** (Z/6Z, x)：结合、单位元 1、0/2/3/4 无逆 ⇒ 幺半群；单位群 {1,5} ≅ C2。*/
const Z6MUL = [
  1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 1, 3, 5, 1, 3, 5, 1, 4, 1, 4, 1, 4, 1, 5, 3, 1, 5, 3, 1,
  6, 5, 4, 3, 2,
]
const Z6_LABELS = ['0', '1', '2', '3', '4', '5']
/** 拟群 a*b = (2a+b) mod 5：拉丁方，但非结合 ⇒ 原群（"拉丁方推不出群"）。*/
const QUASI = [1, 2, 3, 4, 5, 3, 4, 5, 1, 2, 5, 1, 2, 3, 4, 2, 3, 4, 5, 1, 4, 5, 1, 2, 3]
const TWO_LABELS = ['a', 'b']

/** 由扁平表造一个结构（手算用例全走它，避免重复）。 */
function mk(labels: string[], flat: number[]): GalStructure {
  const plan = planStructure(labels, flat)
  if (!plan.ok) throw new Error(`planStructure 失败：${plan.error}`)
  return plan.structure
}

/** 1-based 表项取 0-based 下标。 */
const at = (table: number[][], i: number, j: number): number => table[i][j] - 1

export function run(): void {
  suite('u60 \cdot 四档层级（四档各自一个教材典型例子）')
  {
    const v4 = mk(V4_LABELS, V4)
    eq('V4 ⇒ 群', v4.axioms.level, 'group')
    ok('  V4 交换', v4.axioms.commutative)
    eq('  V4 单位元在 0 号（e）', v4.axioms.identityIndex, 0)
    ok('  V4 结合 + 有逆', v4.axioms.associative && v4.axioms.hasInverses)

    eq('零半群 ⇒ 幺半群', mk(TWO_LABELS, ZERO_SEMI).axioms.level, 'monoid')
    eq('左零带 ⇒ 半群', mk(TWO_LABELS, LEFT_ZERO).axioms.level, 'semigroup')
    eq('非结合表 ⇒ 原群', mk(TWO_LABELS, MAGMA).axioms.level, 'magma')
  }

  suite('u60 \cdot 反例必须可证伪（报一个反例，就当场代回去算一遍）')
  {
    const magma = mk(TWO_LABELS, MAGMA)
    const cex = magma.axioms.assocCounterexample
    ok('非结合给了见证三元组', !!cex, JSON.stringify(cex))
    if (cex) {
      const [a, b, c] = cex
      const t = magma.op.table
      // (a*b)*c ≠ a*(b*c)
      ok(
        `  三元组 (${a},${b},${c}) 真不结合`,
        at(t, at(t, a, b), c) !== at(t, a, at(t, b, c)),
        `(ab)c=${at(t, at(t, a, b), c)} a(bc)=${at(t, a, at(t, b, c))}`,
      )
    }

    const lz = mk(TWO_LABELS, LEFT_ZERO)
    ok('左零带左消去失败', !lz.axioms.cancellation.left)
    const cl = lz.axioms.cancellation.cexLeft
    if (cl) {
      const [x, y, z] = cl
      const t = lz.op.table
      ok(
        `  左消去反例 (${x},${y},${z}) 真违反（y≠z 而 xy=xz）`,
        y !== z && at(t, x, y) === at(t, x, z),
        `xy=${at(t, x, y)} xz=${at(t, x, z)}`,
      )
    } else {
      ok('  左零带应给出左消去反例', false)
    }

    const zs = mk(TWO_LABELS, ZERO_SEMI)
    ok('零半群里 a 无逆', (zs.axioms.notInvertible ?? []).includes(0), JSON.stringify(zs.axioms.notInvertible))
  }

  suite('u60 \cdot 升格（结构 → core Group；载体轮换守头号陷阱）')
  {
    ok('群结构升格成功', structureToGroup(mk(V4_LABELS, V4)) !== null)
    ok('非群结构升格为 null', structureToGroup(mk(TWO_LABELS, ZERO_SEMI)) === null)
    ok('isGroupStructure 与 level 一致', isGroupStructure(mk(V4_LABELS, V4)) && !isGroupStructure(mk(TWO_LABELS, LEFT_ZERO)))

    /*
     * §1 头号陷阱：core 要求**单位元在首位**。V4_ROT 的 e 在末位 ——
     * 升格必须做一次置换，否则 multiply 整体错位。手算：a·b = c。
     *
     * ⚠️ **不能用 label 认元素**：core 的 `ir()` 会把元素 label 重写成**生成元词**
     * （实测 a·b 的 label 是 `"a b"`，不是 `"c"`）。所以用 id 比 —— 且依赖
     * "e 换到首位后其余保持原序"：elements[1..3] 就是 a、b、c。
     */
    const g = structureToGroup(mk(V4_ROT_LABELS, V4_ROT))!
    ok('  轮换载体的结构仍升格成功', g !== null)
    eq('  core 的元素 0 号就是单位元 e', g.elements[0].label, 'e')
    const [e0, ea, eb, ec] = g.elements
    eq('  a·b 落在第 4 个位置（置换把 e 挪到首位）', g.multiply(ea, eb).id, ec.id)
    ok(
      '  且 a·b ∉ {e,a,b}（V4 里只能是 c，说明表没整体错位）',
      ![e0, ea, eb].some((x) => x.id === g.multiply(ea, eb).id),
    )
    ok('  V4 特征：每个元素都是对合', g.elements.every((x) => g.multiply(x, x).id === e0.id))
  }

  suite('u60 \cdot 能力门（够格成群才放行 group 位 —— 菜单不撒谎）')
  {
    const groupV: GalValue = { type: 'structure', structure: mk(V4_LABELS, V4) }
    const semiV: GalValue = { type: 'structure', structure: mk(TWO_LABELS, LEFT_ZERO) }
    ok('非群结构被 group 位拒绝', !paramAccepts('group', semiV, []))
    ok('群结构被 group 位放行', paramAccepts('group', groupV, []))
    ok(
      '群结构上列得出「子群集」',
      opsFor([groupV]).some((o) => o.id === 'subgroups'),
      opsFor([groupV]).map((o) => o.id).join(','),
    )
    ok(
      '非群结构上列不出「子群集」',
      !opsFor([semiV]).some((o) => o.id === 'subgroups'),
      opsFor([semiV]).map((o) => o.id).join(','),
    )
  }

  suite('u60 \cdot 诚实边界（长度 / 越界 / 上限 / 撞号，一律说清不静默）')
  {
    const short = planStructure(['a', 'b', 'c'], [1, 2, 3])
    ok('表长度 ≠ n² 报错', !short.ok, short.ok ? '' : short.error)
    if (!short.ok) ok('  错误语里点明"9 个"', short.error.includes('9'), short.error)

    const bad = mk(TWO_LABELS, [1, 3, 2, 1]) // 表项 3 > n＝2
    ok('表项越界 ⇒ closed=false', !bad.axioms.closed)
    eq('  closedAt 指名坏格（第 0 行第 1 列读到 3）', JSON.stringify(bad.axioms.closedAt), JSON.stringify([0, 1, 3]))
    eq('  未良定义的表停在原群（failsAt=closure）', bad.axioms.failsAt, 'closure')

    const tooBig = planStructure(
      Array.from({ length: STRUCTURE_MAX + 1 }, (_, i) => `x${i}`),
      Array.from({ length: (STRUCTURE_MAX + 1) ** 2 }, () => 1),
    )
    ok('n 超上限报"算不动"', !tooBig.ok, tooBig.ok ? '' : tooBig.error)
    if (!tooBig.ok) ok('  错误语里给出上限', tooBig.error.includes(String(STRUCTURE_MAX)), tooBig.error)

    const dupId = planStructure(['a', 'a'], [1, 2, 2, 1])
    ok('标号重复报错', !dupId.ok, dupId.ok ? '' : dupId.error)
    if (!dupId.ok) ok('  错误语里点明"重复"', dupId.error.includes('重复'), dupId.error)

    const pointCarrier = planStructure(['1', '2', '3'], [1, 2, 3, 2, 3, 1, 3, 1, 2])
    ok('无母群的点集也能当载体（3 阶，合法）', pointCarrier.ok)
  }

  suite('u60 \cdot 非群里藏群（(Z/6Z,x) 的单位群 —— 把"非群"接回群论）')
  {
    const z6 = mk(Z6_LABELS, Z6MUL)
    eq('(Z/6Z,x) ⇒ 幺半群', z6.axioms.level, 'monoid')
    eq('  单位元是 1', z6.axioms.identityIndex, 1)
    eq('  可逆元 = {1,5}', JSON.stringify(z6.axioms.units), JSON.stringify([1, 5]))

    const ug = unitGroupOf(z6)
    ok('  单位群存在', ug !== null)
    if (ug) eq('  单位群 U(M) 的阶是 2（C2）', ug.order, 2)

    // 非群结构的 asGroupOf 为 null：别拿 C₁ 兜底骗过"来自不同的群"那道关
    const v: GalValue = { type: 'structure', structure: z6 }
    ok('  非群结构没有上下文群', !isGroupStructure(z6))
  }

  suite('u60 \cdot 线 A 读数（幂等元 / 零元 / 消去律 / 拉丁方）')
  {
    const z6 = mk(Z6_LABELS, Z6MUL)
    eq('(Z/6Z,x) 幂等元 = {0,1,3,4}', JSON.stringify(z6.axioms.idempotents), JSON.stringify([0, 1, 3, 4]))
    eq('  零元 = {0}', JSON.stringify(z6.axioms.zeroElements), JSON.stringify([0]))
    ok('  (Z/6Z,x) 不是拉丁方', !z6.axioms.isLatin)
    eq('  首个坏行是第 0 行（整行重复）', z6.axioms.latinBadRow, 0)
    ok('  左消去失败（0*1 = 0*2）', !z6.axioms.cancellation.left)

    const quasi = mk(['0', '1', '2', '3', '4'], QUASI)
    ok('拟群是拉丁方', quasi.axioms.isLatin)
    ok('  但非结合（拉丁方推不出群）', !quasi.axioms.associative)
    eq('  停在原群', quasi.axioms.level, 'magma')
  }

  suite('u60 \cdot 派生一致（failsAt 与 level 同源；反例字段逐个复核）')
  {
    const cases: { name: string; labels: string[]; flat: number[] }[] = [
      { name: 'V4', labels: V4_LABELS, flat: V4 },
      { name: '零半群', labels: TWO_LABELS, flat: ZERO_SEMI },
      { name: '左零带', labels: TWO_LABELS, flat: LEFT_ZERO },
      { name: '非结合', labels: TWO_LABELS, flat: MAGMA },
      { name: '(Z/6Z,x)', labels: Z6_LABELS, flat: Z6MUL },
      { name: '拟群', labels: ['0', '1', '2', '3', '4'], flat: QUASI },
    ]
    const EXPECT: Record<string, AxiomProfile['failsAt']> = {
      V4: null,
      零半群: 'inverse',
      左零带: 'identity',
      非结合: 'associativity',
      '(Z/6Z,x)': 'inverse',
      拟群: 'associativity',
    }
    for (const c of cases) {
      const s = mk(c.labels, c.flat)
      const flat = c.flat
      const t: number[][] = []
      for (let i = 0; i < c.labels.length; i++) t.push(flat.slice(i * c.labels.length, (i + 1) * c.labels.length))
      const p = s.axioms
      // failsAt 与 level 一致：群 ⇒ null；否则指名的公理确实不成立
      if (p.level === 'group') {
        eq(`${c.name}：群 ⇒ failsAt=null`, p.failsAt, null)
      } else {
        const consistent =
          (p.failsAt === 'closure' && !p.closed) ||
          (p.failsAt === 'associativity' && !p.associative) ||
          (p.failsAt === 'identity' && p.associative && !p.hasIdentity) ||
          (p.failsAt === 'inverse' && p.associative && p.hasIdentity && !p.hasInverses)
        ok(`${c.name}：failsAt(=${p.failsAt}) 与 level(=${p.level}) 一致`, consistent)
        eq(`  failsAt 与手算一致`, p.failsAt, EXPECT[c.name])
      }
      // 反例字段逐个复核
      if (p.assocCounterexample) {
        const [x, y, z] = p.assocCounterexample
        ok(`  ${c.name}：assocCounterexample 真不结合`, tableAt(t, tableAt(t, x, y), z) !== tableAt(t, x, tableAt(t, y, z)))
      }
      if (p.cancellation.cexLeft) {
        const [x, y, z] = p.cancellation.cexLeft
        ok(`  ${c.name}：cexLeft 真违反`, y !== z && tableAt(t, x, y) === tableAt(t, x, z))
      }
      for (const el of p.notInvertible ?? []) {
        // 该元素确实找不到双边逆（相对单位元 ei）
        const ei = p.identityIndex
        if (ei === undefined) continue
        let found = false
        for (let j = 0; j < c.labels.length; j++) if (tableAt(t, el, j) === ei && tableAt(t, j, el) === ei) found = true
        ok(`  ${c.name}：${c.labels[el]} 真无逆`, !found)
      }
    }
  }

  suite('u60 \cdot 端到端（文本形态：structure(P, 表) 真跑得出）')
  {
    const b = build([
      'P = labeledSet(e, a, b, c)',
      'M = structure(P, 1,2,3,4, 2,1,4,3, 3,4,1,2, 4,3,2,1)',
    ])
    const M = b.byId('M')
    ok('文本形态建成 structure', M?.value.type === 'structure', b.err('M') ?? '')
    if (M && M.value.type === 'structure') {
      eq('  真跑出「群」', M.value.structure.axioms.level, 'group')
      eq('  升格缓存已填（group 指针非空）', M.value.structure.group !== undefined, true)
    }
    // (Z/6Z,x) 走一遍文本 → 幺半群 + 单位群
    const b2 = build(['Q = labeledSet(0,1,2,3,4,5)', 'N = structure(Q, 1,1,1,1,1,1, 1,2,3,4,5,6, 1,3,5,1,3,5, 1,4,1,4,1,4, 1,5,3,1,5,3, 1,6,5,4,3,2)'])
    const N = b2.byId('N')
    ok('(Z/6Z,x) 文本形态建成', N?.value.type === 'structure', b2.err('N') ?? '')
    if (N && N.value.type === 'structure') eq('  ⇒ 幺半群', N.value.structure.axioms.level, 'monoid')

    /*
     * S1c：升格后的群**接回现有群论** —— 取群函数收成 `asGroupOf` 一处，
     * 于是 `Sub(M)` / `Z(M)` 这些只认"一个群"的 op 在结构上也能真跑。
     * 手算：V4 有 5 个子群；V4 交换 ⇒ Z(V4) = V4。
     */
    const b3 = build([
      'P = labeledSet(e, a, b, c)',
      'M = structure(P, 1,2,3,4, 2,1,4,3, 3,4,1,2, 4,3,2,1)',
      'S = Sub(M)',
      'Zc = Z(M)',
    ])
    const S = b3.byId('S')
    ok('Sub(M) 在升格群上真跑得出', S?.value.type === 'subgroups', b3.err('S') ?? '')
    if (S && S.value.type === 'subgroups')
      // core `findAllSubgroups` **不含 G 自身**（MEMORY §3.1）⇒ V4 真子群 = {e} + 3 个 2 阶 = 4
      eq('  V4 有 4 个真子群（不含自身）', S.value.subgroups.length, 4)
    const Zc = b3.byId('Zc')
    ok('Z(M) 在升格群上真跑得出', Zc?.value.type === 'group', b3.err('Zc') ?? '')
    if (Zc && Zc.value.type === 'group') eq('  Z(V4) = V4（交换）', Zc.value.group.order, 4)
  }

  /*
   * S2c/S2b：**画布形状与能力同一个判据**（DEVPLAN §11.6）——
   * "够不够格当群"只写一次（`isGroupStructure`），四条出口都从它派生：
   *   ① 形状（方 / 双线圆）② `paramAccepts('group')` ③ 菜单里列不列 `Sub`
   *   ④ `structureToGroup` 非 null。
   * 这条断言就是防"形状说方、菜单里却没有 Sub"那个病根从内核漏到画布。
   */
  suite('u60 \cdot 形状档与能力门同源（§11.6 的四条出口）')
  {
    const gv = (flat: number[], labels: string[]): GalValue => ({
      type: 'structure',
      structure: mk(labels, flat),
    })
    const grp = gv(V4, V4_LABELS) // 够格成群
    const semi = gv(LEFT_ZERO, TWO_LABELS) // 半群（不封闭成群）

    eq('群结构 ⇒ 画布形状是 group（方）', canvasShape(grp), 'group')
    eq('半群结构 ⇒ 画布形状是 structure（双线圆）', canvasShape(semi), 'structure')
    ok('非群结构仍然占一个节点（isCanvasValue）', isCanvasValue(semi))
    eq('结构的"在哪"是顶点（能当映射的源或靶）', sortOf(semi), 'vertex')

    ok('群结构放行 group 位（paramAccepts）', paramAccepts('group', grp, []))
    ok('半群结构不放行 group 位', !paramAccepts('group', semi, []))
    ok('结构不能再当载体（载体要一个集合）', !paramAccepts('carrier', grp, []))

    // ③ 菜单：与 ② 用同一个判据 ⇒ 结论必须一致（列出来 = 点下去真能跑）
    const opsG = opsFor([grp]).map((o) => o.id)
    const opsS = opsFor([semi]).map((o) => o.id)
    ok('群结构的菜单里有 Sub', opsG.includes('subgroups'), opsG.join(','))
    ok('群结构的菜单里有 Z', opsG.includes('center'), opsG.join(','))
    ok('半群结构的菜单里没有 Sub（菜单不撒谎）', !opsS.includes('subgroups'), opsS.join(','))
    ok('半群结构的菜单里没有 Z', !opsS.includes('center'), opsS.join(','))
    // ④ 第四条出口与 ①②③ 同源
    ok('structureToGroup(群结构) 非 null', structureToGroup(grp.structure) !== null)
    ok('structureToGroup(半群结构) 是 null', structureToGroup(semi.structure) === null)
  }
}

/** 1-based 表项取 0-based 下标（run 里的闭包用不了，这里独立一份）。 */
function tableAt(t: number[][], i: number, j: number): number {
  return t[i][j] - 1
}
