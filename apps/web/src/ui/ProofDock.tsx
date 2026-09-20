import { useEffect, useRef } from 'react'
import { PROOF_TEMPLATES, type ProofStep, type ProofTemplate } from '../gal/proof'
import { DockPanel } from './DockPanel'
import { Tex } from './Tex'

/**
 * 证明面板（M1）——**step-through 的入口**。
 *
 * 每一步 `compute` 携带一整行定义；「下一步」= 把那一行写进定义表，
 * 于是画布上会一步步长出证明图（设计说明见 `gal/proof.ts` 顶部）。
 *
 * 与其它面板一致：浮层、可收起、收起只剩标题胶囊。
 */

const KIND_LABEL: Record<ProofStep['kind'], string> = {
  claim: '设',
  compute: '算',
  conclude: '∴',
}

export function ProofDock({
  open,
  onToggle,
  template,
  steps,
  cursor,
  onStart,
  onGoto,
  onRestart,
  onExit,
}: {
  open: boolean
  onToggle: () => void
  /** null = 还没选模板（面板显示模板列表） */
  template: ProofTemplate | null
  steps: ProofStep[]
  /** -1 = 还没开始 */
  cursor: number
  onStart: (t: ProofTemplate) => void
  onGoto: (i: number) => void
  onRestart: () => void
  onExit: () => void
}) {
  const running = !!template && cursor >= 0
  // 列表比面板长 → 走一步要把它**滚进视野**，否则"下一步"点了没反应（当前步在视野外）
  const onRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    onRef.current?.scrollIntoView({ block: 'nearest' })
  }, [cursor])
  return (
    <DockPanel
      title="证明"
      count={running ? cursor + 1 : undefined}
      open={open}
      onToggle={onToggle}
      bodyWidth={356}
      actions={
        template ? (
          <button className="dock-mini" onClick={onExit} title="退出证明（画布保留，可继续手动操作）">
            结束
          </button>
        ) : undefined
      }
    >
      {!template ? (
        <>
          <div className="dock-subtitle">走一遍定理的证明 · 每一步都写进定义表</div>
          {PROOF_TEMPLATES.map((t) => (
            <button key={t.id} className="proof-item" onClick={() => onStart(t)}>
              <span className="proof-item-title">{t.title}</span>
              <span className="proof-item-theorem">
                <Tex tex={t.theorem} />
              </span>
              <span className="proof-item-blurb">{t.blurb}</span>
            </button>
          ))}
          <div className="proof-warn">开始时清空画布（证明要独占一张图）</div>
        </>
      ) : (
        <>
          <div className="proof-head">
            <div className="proof-title">{template.title}</div>
            <div className="proof-theorem">
              <Tex tex={template.theorem} />
            </div>
          </div>

          <ol className="proof-steps">
            {steps.map((s, i) => (
              <li
                key={i}
                ref={i === cursor ? onRef : undefined}
                className={`proof-step k-${s.kind}${i === cursor ? ' on' : ''}${i > cursor ? ' future' : ''}`}
                onClick={() => onGoto(i)}
                title={i > cursor ? '跳到这一步（会把中间的步骤一并写好）' : '回到这一步'}
              >
                <span className={`proof-kind k-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                <span className="proof-text">{s.text}</span>
              </li>
            ))}
          </ol>

          <div className="proof-bar">
            <button onClick={onRestart} title="回到第 1 步">
              ⟲ 重来
            </button>
            <button onClick={() => onGoto(cursor - 1)} disabled={cursor <= 0}>
              ← 上一步
            </button>
            <button
              className="primary"
              onClick={() => onGoto(cursor + 1)}
              disabled={cursor >= steps.length - 1}
            >
              下一步 →
            </button>
          </div>
        </>
      )}
    </DockPanel>
  )
}
