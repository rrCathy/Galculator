import { useEffect, useState } from 'react'
import { smallGroupCatalog, type SmallGroupList } from '../gal/smallGroups'
import { DockPanel } from './DockPanel'
import { NewObjectForms } from './NewObjectForms'
import { Tex } from './Tex'

/**
 * 「目录」浮层面板（U56）—— 从库里**挑**群、**凭空造**集合，点了就落成一行定义。
 *
 * ## 为什么要有它
 *
 * 这两条路从前**没有入口**，只能靠输入球盲敲：
 *   - 群：`smallGroup(8, 3)`（U55 做了 op，可界面上一个字都没提过它）；
 *   - 集合：`pointSet(5)` / `labeledSet(a, b, c)`（U53 同理）。
 *
 * 另外三个入口（径向菜单 / ⊕ 球 / 拖拽连线）全都够不着它们：前两个筛的是
 * "选中了什么"（`opsFor` / `maxObjectArity > 1`），而这几条 op 的实参
 * **全是标量**（int / element），一个对象都不吃 —— 它们既不是单对象操作、
 * 也不是多对象操作，是「**凭空造**」。
 *
 * 用户原话（2026-10-03）：「怎么创建任意集合？也没看到像 groupviz 一样的
 * 导入群的手风琴啊」。
 *
 * ## 与 groupviz 的关系
 *
 * 形态照 Group Explorer 的 Group Library：**按阶分组**的群列表，点一个群名
 * 就该长出对象。区别只在落点 —— 那边开一个新视图窗口，这边是往画布上加一行
 * 定义（`G = smallGroup(8, 3)`）。于是目录点出来的东西与手敲的**完全同源**：
 * 可读、可改、可被别的操作引用（`compose.ts` 立的规矩：执行层只认定义行）。
 *
 * ## 懒加载
 *
 * `smallGroupCatalog()` 首次要 ~311ms（core 给 93 个群跑一遍预计算）。所以
 * **展开时才算**，而且推到下一个宏任务 —— 让展开这一帧先把面板画出来，
 * 用户不会觉得"点不动"。之后 core 自己缓存，再展开就是 0ms。
 */
export function CatalogDock({
  open,
  onToggle,
  onAdd,
  onBuildStructure,
}: {
  open: boolean
  onToggle: () => void
  /** 把点出来的东西落成一行定义（`名字 = 表达式`）——命名归 App，与输入球同一条路 */
  onAdd: (expr: string) => void
  /**
   * 「造结构」（S2b）：**先造就载体，再开表格编辑器**。
   *
   * 参数是载体的表达式（`labeledSet(a, b, c)`）。App 那边会先把它落成一行
   * （于是画布上真的有一个集合节点，§11.3：载体与结构是**两个**节点），
   * 再把这个节点交给 `structure` 编辑器。所以这里给的不是"一个结构"，
   * 而是"载体的写法" —— 编辑器还没开，表还是空的。
   */
  onBuildStructure: (carrierExpr: string) => void
}) {
  /**
   * **收起**的那几阶。默认**全展开** —— 目录的第一功能是"浏览"，
   * 一进来就看到 31 个光秃秃的阶标题是没法挑选的；折叠留给用户自己整理视野。
   */
  const [folded, setFolded] = useState<ReadonlySet<number>>(() => new Set())
  /** `null` = 还没算过（首次展开时补上） */
  const [orders, setOrders] = useState<SmallGroupList[] | null>(null)

  useEffect(() => {
    if (!open || orders) return
    const id = setTimeout(() => setOrders(smallGroupCatalog()), 0)
    return () => clearTimeout(id)
  }, [open, orders])

  const list = orders ?? []
  const total = list.reduce((s, g) => s + g.count, 0)

  const toggle = (order: number) => {
    setFolded((prev) => {
      const next = new Set(prev)
      if (next.has(order)) next.delete(order)
      else next.add(order)
      return next
    })
  }

  return (
    <DockPanel
      title="目录"
      count={total || undefined}
      open={open}
      onToggle={onToggle}
      // 群条目要摆「编号 + 结构」，比一行定义宽一档
      bodyWidth={196}
    >
      {/*
       * 「集合」排在群列表**前面** —— 造一个空集合是"起手动作"（先有舞台才有戏），
       * 而群目录是个 93 条的长列表，塞在它后面等于把造集合的入口埋起来
       * （用户原话问的正是"怎么创建任意集合"）。分区顺序就是个优先级声明。
       *
       * ⚠️ 2026-10-06（W2）：这三块表单**抽去了 `ui/NewObjectForms.tsx`**，
       * 因为工作台的 `＋` 也要开同一套。**DOM 类名逐字未变** ⇒ 本套走查一条不改。
       */}
      <NewObjectForms
        onAdd={onAdd}
        onBuildStructure={onBuildStructure}
        heading="集合（凭空造）"
      />

      <div className="dock-subtitle">群（{total} 个，按阶分组）</div>
      {list.map((g) => (
        <div key={g.order} className="cat-group">
          <button
            className="cat-order"
            onClick={() => toggle(g.order)}
            title={folded.has(g.order) ? '展开这一阶' : '收起这一阶'}
          >
            <span className="cat-caret">{folded.has(g.order) ? '>' : 'v'}</span>
            <span>阶 {g.order}</span>
            <span className="count">{g.count}</span>
          </button>
          {!folded.has(g.order) && (
            <div className="cat-items">
              {g.entries.map((e) => (
                <button
                  key={e.i}
                  className="cat-g"
                  /*
                   * `title` 是**纯文本面**：这里给的是用户能照抄的调用（`smallGroup(8, 3)`）。
                   */
                  title={`smallGroup(${g.order}, ${e.i})`}
                  onClick={() => onAdd(`smallGroup(${g.order}, ${e.i})`)}
                >
                  <span className="cat-i">{e.i}</span>
                  {/* 群名走**渲染面**（2026-10-08）：`structure` 是 TeX 源（`toTex` 规范过）——
                      `C_5:C_4` 排成 C₅:C₄、`SL(2,3)` 字母段正体（用户点名「标准群记号」）*/}
                  <span className="cat-sym">
                    <Tex tex={e.structure} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </DockPanel>
  )
}
