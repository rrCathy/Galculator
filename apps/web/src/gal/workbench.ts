import { OPS, type OpDef } from './ops'
import { takesCanvasObject } from './ops'

/**
 * **工作台的任务分组**（2026-10-05，P1-2）。
 *
 * ## 为什么要有这张表
 *
 * 工作台的定位（用户原话，2026-10-05 之前就说过）：
 * 「工作台是专门处理单个或少量对象之间较为细致的结构的地方，比如从集合添加结构得到群、
 *   群同态、群作用、半直积、自同构、共轭类等等。」
 *
 * 第一版把工作台做成了「选中对象的细节查看器」——**入口全留在 ⊕ 球菜单里**，
 * 于是工作台变成"换了位置的信息面板"：用户创建了一个集合，工作台只能看，
 * 而「给这个集合加一个运算」这道题在工作台上无路可走。
 *
 * ⇒ 这张表是**入口清单**：每一族是一组按钮，点一条就把那条 op 发起
 * （有焦点对象就带上它当第一参数，没有就先进 pending 让用户去画布点）。
 *
 * ## 分组依据：**用户要做什么**，不是 `mechanism`
 *
 * `OpDef.mechanism`（`action` / `atomic` / `enumerate` / `iterate` / `property` /
 * `arithmetic`）是**内核怎么算**的分类 —— 那是架构文档的东西，不是用户做事的分类。
 * 用户想的是"我要加个结构""我要看轨道"，不是"我要触发一个 atomic"。
 * 所以这张表与 `mechanism` 正交，是**面向任务的另一层视图**。
 *
 * ## 覆盖面：两条纪律
 *
 * ① **不许漏**：`assertPartition()` 在模块加载时断言「分组 ∪ 排除 ＝ 全部 45 条」且
 *    **互不重叠**。加了新 op 却没归类 ⇒ 加载即抛，而不是"悄悄出现在没人看得见的地方"。
 * ② **不许重**：一条 op 只出现在一族里（用户点得到的位置唯一）。
 *
 * ## 排除名单：8 条刻意**不进**工作台
 *
 * | 排除 | 为什么 |
 * |---|---|
 * | `pointSet` / `labeledSet` / `smallGroup` | 实参**全是标量**、一个对象都不吃 ⇒ 它们是「**凭空造**」。分工上属「目录」（U56 就是为它们建的），工作台是"处理已有对象之间的细致结构"，两者不是一件事 |
 * | `factorize` / `binomial` / `binomialMod` / `gcd` / `lcm` / `eulerPhi` | 纯整数算术，与群论无关；U47 定过"计算先不弄"，有输入球与数值区就够 |
 *
 * ⚠️ 这条排除**是判断不是事实**。若哪天用户要"在工作台里随手算个数"，
 * 改这张表即可 —— 但别零散地在别处开口子（那会回到"判据散多份"）。
 */

/** 一族任务。`hint` 是这一族在做什么（纯文本面：不许出现键盘打不出的字符）。 */
export interface BenchFamily {
  key: string
  label: string
  hint: string
  /** 这族的 op（按用户做事的顺序排，不按字母）*/
  ops: string[]
}

export const BENCH_FAMILIES: BenchFamily[] = [
  {
    key: 'build',
    label: '结构 / 映射 / 作用',
    hint: '填表、填像、填置换——这三件事文本一行表达不了，必须逐项填',
    ops: ['structure', 'map', 'customAction'],
  },
  {
    key: 'group',
    label: '群与分解',
    hint: '造新群、拆成两个群、看一个群自己的性质',
    ops: [
      'directProduct',
      'semidirectProduct',
      'quotient',
      'closure',
      'center',
      'commutatorGroup',
      'automorphismGroup',
      'innerAutomorphismGroup',
      'elementOrder',
    ],
  },
  {
    key: 'sub',
    label: '子群与正规性',
    hint: '同构定理的另一半：哪些子群、哪些正规',
    ops: [
      'subgroups',
      'maximalSubgroups',
      'normalSubgroups',
      'sylow',
      'pSubgroups',
      'centralizer',
      'normalizer',
    ],
  },
  {
    key: 'act',
    label: '作用与轨道',
    hint: 'G 动点集上：轨道、稳定子、点数——证明的主舞台',
    ops: [
      'conjugationAction',
      'leftTranslationAction',
      'conjugationOnSet',
      'cosetAction',
      'orbits',
      'stabilizers',
      'fixedPoints',
      'orbitCount',
    ],
  },
  {
    key: 'img',
    label: '映射的核与像',
    hint: '给出一个同态之后，问它丢了多少、留下了多少',
    ops: ['kernel', 'image'],
  },
  {
    key: 'set',
    label: '集合运算',
    hint: '两批元素凑一起看（结果若是子群会升级成群对象）',
    ops: ['intersection', 'union', 'difference', 'productSet', 'underlyingSet'],
  },
  {
    key: 'rel',
    label: '关系',
    hint: '声明"谁是谁的子群 / 同构"，画布上落成一条可点的边',
    ops: ['contains', 'isomorphism'],
  },
]

/** 刻意**不进**工作台的 op —— 见模块头的排除表。 */
export const BENCH_EXCLUDED: Record<string, string> = {
  pointSet: '凭空造点集：实参全是标量，一个对象都不吃，属「目录」（U56）',
  labeledSet: '凭空造点集：同 pointSet',
  smallGroup: '从库里挑群：属「目录」（U56）',
  factorize: '纯整数算术（U47「计算先不弄」）',
  binomial: '纯整数算术',
  binomialMod: '纯整数算术',
  gcd: '纯整数算术',
  lcm: '纯整数算术',
  eulerPhi: '纯整数算术',
}

/** 启动时跑一次：分组与排除名单合起来必须恰好盖住全部 op，且互不重叠。 */
function assertPartition(): void {
  const byId = new Map(OPS.map((o) => [o.id, o]))
  const inFamily = new Map<string, string>()
  for (const f of BENCH_FAMILIES) {
    for (const id of f.ops) {
      const prev = inFamily.get(id)
      if (prev) throw new Error(`工作台分组表：${id} 同时在「${prev}」与「${f.label}」两族里`)
      if (!byId.has(id)) throw new Error(`工作台分组表：${f.label} 里的 ${id} 不在 OPS 里`)
      inFamily.set(id, f.label)
    }
  }
  const missing = OPS.filter((o) => !inFamily.has(o.id) && !(o.id in BENCH_EXCLUDED)).map((o) => o.id)
  if (missing.length > 0) {
    throw new Error(
      `工作台分组表漏了 ${missing.length} 条 op：${missing.join(', ')}\n` +
        `要么归入某一族，要么写进 BENCH_EXCLUDED 并说明为什么。这是纪律，不是可选。`,
    )
  }
}
assertPartition()

/**
 * 一族的按钮清单（`OpDef` 形态）。
 *
 * 返回**空数组**而不是抛错是刻意的：那说明这一族有 id 打错了，
 * 但按钮层不该整块崩（其余族照常可用），`assertPartition` 已经在启动时拦过。
 */
export function familyOps(f: BenchFamily): OpDef[] {
  const byId = new Map(OPS.map((o) => [o.id, o]))
  return f.ops.map((id) => byId.get(id)).filter((o): o is OpDef => !!o)
}

/**
 * 这条 op 要几个**画布对象**（不含标量位与半对象档的 Ω）。
 *
 * 用于任务按钮上的角标："1 个对象" / "2 个对象"。**判据必须与 `objectArity` 同源**
 * —— 否则用户点一个标着"1 个对象"的按钮，却要他点两个。
 */
export function benchArity(op: OpDef): number {
  return op.params.filter((p) => takesCanvasObject(p.type) && !p.optional).length
}