/**
 * 「视图快照」卡片（缺口 ⑫）—— 把整套视图**导出成一段文本 / 从一段文本导回来**。
 *
 * 一个输入框同时干两件事：导出就是把文本填进去，导入就是把里面的文本读出来，
 * 所以不拆成两个对话框（用户复制 / 粘贴的永远是这同一个框）。
 *
 * 卡片归 App 管而不是画布管 —— 因为快照里最要紧的 `lines`（定义行）属于 App，
 * 画布只贡献钉住位置与视口（通过 `CanvasHandle` 按需取）。
 */
export function SnapshotCard({
  text,
  error,
  onText,
  onExport,
  onApply,
  onClose,
}: {
  text: string
  error: string | null
  onText: (v: string) => void
  /** 导出：把当前视图（定义行 + 钉住 + 视口）写进框里 */
  onExport: () => void
  /** 导入：照框里的文本重建视图 */
  onApply: () => void
  onClose: () => void
}) {
  return (
    <div className="snap-card" onClick={(e) => e.stopPropagation()}>
      <div className="snap-head">
        <strong>视图快照</strong>
        <button className="snap-x" onClick={onClose} title="关闭">
          x
        </button>
      </div>
      <div className="snap-hint">
        一段文本装下整套视图：定义行 + 钉住的位置 + 视口。复制出去收好，下次贴回来就能接着画。
      </div>
      <textarea
        className="snap-text"
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="把快照文本贴到这里，再点「应用快照」"
        spellCheck={false}
        aria-label="视图快照文本"
      />
      <div className="snap-actions">
        <button className="snap-btn primary" onClick={onExport} title="把当前视图写成上面的文本">
          生成当前视图
        </button>
        <button className="snap-btn" onClick={onApply} title="用上面框里的文本重建视图">
          应用快照
        </button>
      </div>
      {error && <div className="snap-err">{error}</div>}
    </div>
  )
}
