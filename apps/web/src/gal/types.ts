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
 * 画布上的一条边。
 *   - map         实线箭头：数学里的映射，一等对象
 *   - action      作用线：`G ↷ Ω`，特殊样式
 *   - provenance  淡虚线：仅表示"这个节点由那个操作算出"，辅助信息
 */
export interface GalEdge {
  id: string
  kind: 'map' | 'action' | 'provenance'
  from: string
  to: string
  label?: string
  /**
   * 这条边**背后的对象**（若它是一等对象）——映射箭头才有。
   *
   * 有了它，箭头就能**被点选**：点箭头 → 选中那个映射对象 →
   * 悬浮球出现在箭头旁 → 直接点 `ker` / `im`（比手打 `K = ker(F)` 顺手得多）。
   * 结构伴生箭头（π / π₁ / ↪）目前还不是对象，所以没有这个字段。
   */
  objectId?: string
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
