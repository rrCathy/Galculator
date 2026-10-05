import { useEffect, useState } from 'react'
import { smallGroupCatalog, type SmallGroupList } from '../gal/smallGroups'
import { DockPanel } from './DockPanel'

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
  const [points, setPoints] = useState('5')
  const [labels, setLabels] = useState('a, b, c')
  const [structLabels, setStructLabels] = useState('1, 2, 3')

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
       * 分两个框而不是一个，是因为 `labeledSet(5)` 到底指"5 个点"还是
       * "一个叫 5 的点"两种读法都通（`pointSet.ts` 模块头）—— 让用户分别
       * 从两个框进，比自己猜要诚实。
       */}
      <div className="dock-subtitle">集合（凭空造）</div>
      <div className="cat-form">
        <input
          className="cat-input"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && points.trim()) onAdd(`pointSet(${points.trim()})`)
          }}
          inputMode="numeric"
          placeholder="点数"
          title="造 n 个抽象点：pointSet(5)"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          className="cat-go"
          disabled={!points.trim()}
          onClick={() => onAdd(`pointSet(${points.trim()})`)}
        >
          造点集
        </button>
      </div>
      <div className="cat-form">
        <input
          className="cat-input"
          value={labels}
          onChange={(e) => setLabels(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && labels.trim()) onAdd(`labeledSet(${labels.trim()})`)
          }}
          placeholder="a, b, c"
          title="按你的标号造点集：labeledSet(a, b, c)"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          className="cat-go"
          disabled={!labels.trim()}
          onClick={() => onAdd(`labeledSet(${labels.trim()})`)}
        >
          按标号造
        </button>
      </div>

      {/*
        「造结构」（S2b）—— 与上面两个框**并列**，因为它是同一件事的下一步：
        先有载体才有运算。`labeledSet` 那一支故意用**同一串标号**：它会先后落两行
        （`P = labeledSet(1, 2, 3)` 与编辑器产出的 `M = structure(P, ...)`），
        画布上于是是"一个圆 + 一个双线圆"，中间一条来源线（§11.3）。
      */}
      <div className="cat-form">
        <input
          className="cat-input"
          value={structLabels}
          onChange={(e) => setStructLabels(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && structLabels.trim())
              onBuildStructure(`labeledSet(${structLabels.trim()})`)
          }}
          placeholder="1, 2, 3"
          title="造一个代数结构：先造就这批点，再打开运算表编辑器"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          className="cat-go"
          disabled={!structLabels.trim()}
          onClick={() => onBuildStructure(`labeledSet(${structLabels.trim()})`)}
        >
          造结构
        </button>
      </div>

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
                   * `title` 是**纯文本面**：这里给的是用户能照抄的调用（`smallGroup(8, 3)`），
                   * 不是 `structure` 那个展示串（后者可能带 `^` 之类，但仍是 ASCII）。
                   */
                  title={`smallGroup(${g.order}, ${e.i})`}
                  onClick={() => onAdd(`smallGroup(${g.order}, ${e.i})`)}
                >
                  <span className="cat-i">{e.i}</span>
                  <span className="cat-sym">{e.structure}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </DockPanel>
  )
}
