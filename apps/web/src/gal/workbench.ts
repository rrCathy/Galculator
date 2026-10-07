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
 * ## 三档归宿：键盘族 / `＋` 面板 / 排除名单
 *
 * | 档 | 谁 | 为什么 |
 * |---|---|---|
 * | **键盘族**（`BENCH_FAMILIES`）| 31 条 | 都要**一个已有对象**当第一参数 ⇒ 是键盘键（"对这个对象做点什么"）|
 * | **`＋` 面板**（`BENCH_PLUS`）| `pointSet` / `labeledSet` / `smallGroup` | 实参**全是标量**、一个对象都不吃 ⇒ 键盘上按不出来，只能从 `＋` 进 |
 * | **排除**（`BENCH_EXCLUDED`）| `contains` / `isomorphism` | 两个对象之间的**关系**（产出 `relation`，画布上落成一条可点的边）⇒ 用户 2026-10-05 拍板归**画布** |
 * | | `factorize` / `binomial` / `binomialMod` / `gcd` / `lcm` / `eulerPhi` | 纯整数算术，与群论无关（U47「计算先不弄」）|
 *
 * ⚠️ **2026-10-06（W2）翻过一次账**：`pointSet`/`labeledSet`/`smallGroup` 从前在**排除名单**里，
 * 理由写的是"属目录"。用户实测第一条就是「**为什么不能在工作台内就创建出任意集合？**」——
 * 那句理由**是分类不是入口**（和 P1-1 被否是同一类错：把"这东西属于哪个分类"
 * 当成了"用户从哪儿进得来"）。现在它们在工作台里，入口是显示条上的 `＋`。
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
]

/**
 * **`＋` 面板里的 op**（工作台 v2 / W2，2026-10-06）—— 它们的入口是显示条上那个 `＋`，
 * **不是任务栏/键盘上的按钮**。
 *
 * 为什么单列一档，而不是塞回 `BENCH_EXCLUDED`：
 * 用户 2026-10-06 实测第一条就是「**为什么不能在工作台内就创建出任意集合？**」
 * 把它们写进"排除名单"（=不在工作台里）就是**继续撒谎** —— 它们在工作台里，
 * 只是入口是 `＋` 而不是键盘键（键盘键是"对一个已有对象做事"，凭空造没有对象可按）。
 *
 * ⚠️ 与 `structure`（造结构）的分工：`structure` 的实参是**一个集合**，
 * 所以它是键盘键（焦点是集合时就出现）；这里三条的实参**全是标量**，
 * 键盘上按不出来，只能从 `＋` 进。**同一个入口只出现一次**。
 */
export const BENCH_PLUS: string[] = ['pointSet', 'labeledSet', 'smallGroup']

/** 刻意**不进**工作台任何地方的 op —— 见模块头的排除表。 */
export const BENCH_EXCLUDED: Record<string, string> = {
  contains: '两个对象之间的关系（产出 relation）⇒ 属画布；入口在 ⊕ 球菜单与拖拽',
  isomorphism: '两个对象之间的关系（产出 relation）⇒ 属画布；入口在 ⊕ 球菜单与拖拽',
  factorize: '纯整数算术（U47「计算先不弄」）',
  binomial: '纯整数算术',
  binomialMod: '纯整数算术',
  gcd: '纯整数算术',
  lcm: '纯整数算术',
  eulerPhi: '纯整数算术',
}

/**
 * 启动时跑一次：**键盘分组 ∪ `＋` 面板 ∪ 排除名单 = 全部 op**，且互不重叠。
 *
 * ⚠️ 2026-10-06（W2）从"两档"扩成"三档"：加 `BENCH_PLUS` 是因为用户点名的
 * 「工作台里造不出集合」—— 凭空造的三条**一直在工作台里**，只是不该出现在键盘上。
 * 纪律不变：**新的 op 没有归宿就加载即抛**，不许"悄悄出现在没人看得见的地方"。
 */
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
  for (const id of BENCH_PLUS) {
    const prev = inFamily.get(id)
    if (prev) throw new Error(`工作台分组表：${id} 同时在「${prev}」与「＋ 面板」里`)
    if (!byId.has(id)) throw new Error(`工作台分组表：＋ 面板里的 ${id} 不在 OPS 里`)
    inFamily.set(id, '＋ 面板')
  }
  const missing = OPS.filter((o) => !inFamily.has(o.id) && !(o.id in BENCH_EXCLUDED)).map((o) => o.id)
  if (missing.length > 0) {
    throw new Error(
      `工作台分组表漏了 ${missing.length} 条 op：${missing.join(', ')}\n` +
        `要么归入某一族，要么进 BENCH_PLUS（＋ 面板），要么写进 BENCH_EXCLUDED 并说明为什么。这是纪律，不是可选。`,
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