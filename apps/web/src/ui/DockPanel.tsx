import type { ReactNode } from 'react'

/**
 * 浮层面板（UI v3）。
 *
 * 面板不再是"占据布局的侧栏"，而是**浮在画布上、可弹出可收起**的小抽屉：
 * 收起时只剩一个标题胶囊，展开时往下一拉。左上一排并排放三个（对象 / 操作 / 信息），
 * 左下角那个用 `up` 让它往上拉（数值区）。
 */
export function DockPanel({
  title,
  count,
  open,
  onToggle,
  direction = 'down',
  actions,
  children,
}: {
  title: string
  count?: number
  open: boolean
  onToggle: () => void
  /** `up` = 从下往上拉（数值区） */
  direction?: 'down' | 'up'
  /** 展开后标题栏右侧的附加按钮 */
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`dock dock-${direction}${open ? ' open' : ''}`}>
      <header className="dock-head">
        <button className="dock-toggle" onClick={onToggle} title={open ? '收起' : '展开'}>
          <span className="dock-caret">{open ? '▾' : direction === 'up' ? '▴' : '▸'}</span>
          <span className="dock-title">{title}</span>
          {count !== undefined && count > 0 && <span className="count">{count}</span>}
        </button>
        {open && actions}
      </header>
      {open && <div className="dock-body">{children}</div>}
    </section>
  )
}
