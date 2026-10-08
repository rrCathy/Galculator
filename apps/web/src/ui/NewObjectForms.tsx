import { useState } from 'react'

/**
 * **凭空造**的三个表单：造点集 / 按标号造集合 / 造结构（载体 + 打开运算表编辑器）。
 *
 * ## 为什么抽成一个组件（2026-10-06，工作台 v2 / W2）
 *
 * 这三块的**唯一一份**逻辑从前住在 `CatalogDock` 里。用户实测第一条是
 * 「为什么不能在工作台内就创建出任意集合？还得我先点击目录栏导入对象？」
 * ⇒ 工作台的 `＋` 也要开这三个表单。
 *
 * 但**不许抄第二份** —— 抄了就会分家（表达式怎么拼、标题怎么写、
 * `labeledSet(5)` 那种歧义怎么摆，全是判据）。所以抽到这里，两处共用：
 *
 * | 用在哪 | 谁给的 `onAdd` |
 * |---|---|
 * | 左栏「目录」面板（U56）| `App#commitExpr`（与输入球同一条落行路）|
 * | 工作台显示条上的 `＋`（W2）| 同上 |
 *
 * ⚠️ **DOM 类名逐字未变**（`.cat-form` / `.cat-input` / `.cat-go`）——
 * 目录那套走查（`catalog.mjs` 32 条）一条都不用改。这是"抽组件不换皮"的红利。
 *
 * ⚠️ 分两个框而不是一个，是因为 `labeledSet(5)` 到底指"5 个点"还是"一个叫 5 的点"
 * 两种读法都通（`gal/pointSet.ts` 模块头）—— 让用户分别从两个框进，比自己猜要诚实。
 */
export interface NewObjectFormsProps {
  /** 把点出来的东西落成一行定义（`名字 = 表达式`）——命名归 App，与输入球同一条路 */
  onAdd: (expr: string) => void
  /**
   * 「造结构」：**先造就载体，再开表格编辑器**。
   *
   * 参数是载体的表达式（`labeledSet(a, b, c)`）。App 那边会先把它落成一行
   * （于是画布上真的有一个集合节点），再把这个节点交给 `structure` 编辑器。
   */
  onBuildStructure: (carrierExpr: string) => void
  /** 标题。目录面板里是「集合（凭空造）」，工作台的 `＋` 面板里换一句 */
  heading?: string
}

/**
 * `{a, b, c}` 与 `a, b, c` 都收（2026-10-07 花括号糖进输入层之后）。
 * 表单**落行也落花括号形态** —— 用户看到的 def 就是数学写法；
 * `labeledSet(…)` 是 evalExpr 内部的构造式，不再示人。
 */
function unwrapBraces(s: string): string {
  return s.trim().replace(/^\{/, '').replace(/\}$/, '').trim()
}

export function NewObjectForms({ onAdd, onBuildStructure, heading }: NewObjectFormsProps) {
  const [points, setPoints] = useState('5')
  const [labels, setLabels] = useState('a, b, c')
  const [structLabels, setStructLabels] = useState('1, 2, 3')

  return (
    <>
      {heading && <div className="dock-subtitle">{heading}</div>}
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
            if (e.key === 'Enter' && labels.trim()) onAdd(`{${unwrapBraces(labels)}}`)
          }}
          placeholder="{a, b, c}"
          title="造一个集合：标号由你定，如 {a, b, c}（标号能直接写进循环记号）"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          className="cat-go"
          disabled={!labels.trim()}
          onClick={() => onAdd(`{${unwrapBraces(labels)}}`)}
        >
          按标号造
        </button>
      </div>
      <div className="cat-form">
        <input
          className="cat-input"
          value={structLabels}
          onChange={(e) => setStructLabels(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && structLabels.trim())
              onBuildStructure(`{${unwrapBraces(structLabels)}}`)
          }}
          placeholder="1, 2, 3"
          title="造一个代数结构：先造这批点（如 {1, 2, 3}），再打开运算表编辑器"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          className="cat-go"
          disabled={!structLabels.trim()}
          onClick={() => onBuildStructure(`{${unwrapBraces(structLabels)}}`)}
        >
          造结构
        </button>
      </div>
    </>
  )
}
