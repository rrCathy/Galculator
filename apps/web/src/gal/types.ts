import type { CanvasShape, GalValue } from './value'

/**
 * 对象表里的一条 = 用户输入的一行「名字 = 定义」。
 *
 * 对象表是 `string[]` 的**纯函数**（见 build.ts）：改一行、删一行，整张画布自动重派生。
 */
export interface GalObject {
  /** 对象名（等号左侧） */
  id: string
  /** input = 直接声明（建群 / 建集合）；derived = 由操作产生 */
  origin: 'input' | 'derived'
  /** 画布主行 */
  label: string
  /** 画布副行 */
  sub?: string
  /** 原始定义（等号右侧） */
  def: string
  /**
   * 依赖的源对象名（画**来源线**）。
   * 由求值层从参数链自动收集，不是每个操作手写的。
   */
  sources: string[]
  /** 值（6 类之一，见 value.ts） */
  value: GalValue
  /** 命中的操作 id —— 指向 ops.ts 注册表 */
  opId?: string
  /** 配方：等价的原语复合。元数据，只用于解释（架构 §9） */
  recipe?: string
  /** 识别 / 归一化提示，如「已识别为 C₇⋊C₃」 */
  note?: string
}

/** 画布节点 = 对象 + 布局信息。数值不上画布，映射只画边不占节点。 */
export interface CanvasNode extends GalObject {
  shape: 'group' | 'set' | 'action'
  /** 派生深度，决定分层 */
  level: number
}

/**
 * 结构伴生边的**语义身份**（缺口 ⑧）。
 *
 * 伴生箭头（`π` / `π_1` / `↪` / `=` / `≅`）**不是用户写的**——它们是操作的结构
 * 顺手长出来的（"操作 = 结果对象 + 结构伴生"，`derive.ts` 的 `alongsideEdges`）。
 * 从前它们在画布上是一根**点不动的线**：用户看着 `N ↪ G` 想知道账（指数多少、
 * 正不正规），只能自己去信息面板里翻。
 *
 * 这一层把它补上：每条伴生边就地带着"它是什么 + 两端是谁 + 账是多少"。
 * **它不是一等对象**（不进对象表、不能被引用、没有悬浮球）——见 `doc` 那段
 * 的边界说明；要能被引用的包含请写 `R = A \subseteq B`（U20）。
 */
export type StructuralKind =
  /** `π : G ↠ G/N` 自然投影（商映射）—— 把每个元素送到它所在的陪集 */
  | 'naturalProjection'
  /** `π_1 : A × B ↠ A` 积投影 —— 忘掉另一个因子 */
  | 'projection'
  /** `H ↪ G` 子群包含（正规时是 `⊴`） */
  | 'inclusion'
  /** `Orb = Ω` 相等 —— "轨道吃下整个 Ω"，即作用传递 */
  | 'equality'
  /** 第一同构定理的 `G/ker φ ≅ im φ` */
  | 'isomorphism'

export interface StructuralEdge {
  kind: StructuralKind
  /** 一句话（纯文本，不写 LaTeX 命令 —— 它走纯文本那面）*/
  doc: string
  /** 两端在画布上的记号（LaTeX，显示走 KaTeX）*/
  from: string
  to: string
  /** 就地带出来的**账**（键是纯文本标签、值是 TeX 式子）—— 每条都真算 */
  facts: { k: string; v: string }[]
}

/**
 * 画布上的一条边。
 *   - map         实线箭头：数学里的映射，一等对象
 *   - action      作用线：`G ↷ Ω`，特殊样式
 *   - relation    关系线：`H ⊆ G` / `H ⊴ G`（用户**声明**的包含，U20）
 *   - provenance  淡虚线：仅表示"这个节点由那个操作算出"，辅助信息
 */
export interface GalEdge {
  id: string
  kind: 'map' | 'action' | 'relation' | 'provenance'
  from: string
  to: string
  label?: string
  /**
   * 这条边**背后的对象**（若它是一等对象）——映射箭头才有。
   *
   * 有了它，箭头就能**被点选**：点箭头 → 选中那个映射对象 →
   * 悬浮球出现在箭头旁 → 直接点 `ker` / `im`（比手打 `K = ker(F)` 顺手得多）。
   */
  objectId?: string
  /**
   * 结构伴生边的语义身份（缺口 ⑧）——**只有** `alongsideEdges` 与轨道边产出的
   * 那几类边才有。它让"点不动的线"变成"点得开、看得见账的线"。
   *
   * 与 `objectId` 的关系：两条路都能让边被点中，但后果不同 ——
   *   - 有 `objectId` → 点中的是**对象**（能继续 `ker` / `im` / `像`）
   *   - 只有 `structural` → 点中的是**这条箭头本身**（只看账，不给操作按钮）
   * 两者可以同时没有（来源线 `provenance` 就是，它不可点）。
   */
  structural?: StructuralEdge
  /**
   * 映射的**类型** —— 决定箭头的**形状**（DIAGRAM_SPEC §1.6）：
   *
   * | 值 | 含义 | 画成 |
   * |---|---|---|
   * | `injective` | 单射 | 尾部钩子 `↪` |
   * | `surjective` | 满射 | 双箭头 `↠` |
   * | `iso` | 同构（既单又满）| 双箭头 + 钩子 |
   * | （无）| 一般同态 | 普通箭头 |
   *
   * 课本里 `S₄ ↠ S₄/N`、`im φ ↪ H`、`G/ker φ ≅ im φ` **一眼可分**，
   * 因为它们分别承担定理的三个断言（满 / 单 / 双）。
   * 有了这个字段，画布不必读文字标签就知道该画哪种箭头。
   */
  arrow?: 'injective' | 'surjective' | 'iso'
}

/** 画布图 = 对象-关系图，由对象表派生（见 docs/INTERACTION.md §10）。 */
export interface CanvasGraph {
  nodes: CanvasNode[]
  edges: GalEdge[]
}

export type { CanvasShape }
