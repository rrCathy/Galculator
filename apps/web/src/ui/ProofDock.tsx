import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PROOF_GROUP_CHOICES,
  PROOF_TEMPLATES,
  stageInfo,
  templateReady,
  type ProofParams,
  type ProofStep,
  type ProofTemplate,
} from '../gal/proof'
import { subscript } from '../gal/pretty'
import { DockPanel } from './DockPanel'
import { Tex } from './Tex'

/**
 * 证明面板（M1 / U15）——**step-through 的入口**，也是**模板入参界面**。
 *
 * 每一步 `compute` 携带一整行定义；「下一步」= 把那一行写进定义表，
 * 于是画布上会一步步长出证明图（设计说明见 `gal/proof.ts` 顶部）。
 *
 * ## 参数为什么放在卡片上（U15）
 *
 * M2 之前群与 p 写死在模板里，用户只能看 A₄ 一份实例。现在**同一份证明骨架**
 * 在任意群上实例化，于是"挑参数"本身就是学习动作：换个群，看 n_p 变、看哪条路走不通。
 *
 * 三条设计口径：
 *   - **群只有一个输入框**（三张卡共用）：比较三条 Sylow 定理本来就该在同一个群上做；
 *     每张卡各管自己的 p。
 *   - **p 只列 |G| 的素因子**，并且**把 n_p 写在按钮上**——"哪个 p 才有戏"是这一屏
 *     最该被看见的信息（n_p = 1 时 Sylow II/III 退化成废话）。
 *   - **能不能开始 = 一个判据两处用**（`templateReady`，与 `build()` 同一份）：
 *     按钮亮着就一定能跑，跑不通时理由直接写在卡片上。
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
  params,
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
  /** 正在跑的实例参数（群与 p） */
  params: ProofParams | null
  steps: ProofStep[]
  /** -1 = 还没开始 */
  cursor: number
  onStart: (t: ProofTemplate, params: ProofParams) => void
  onGoto: (i: number) => void
  onRestart: () => void
  onExit: () => void
}) {
  const running = !!template && cursor >= 0

  /* ── 入参状态：群一个（三张卡共用）+ 每张卡各记住自己的 p ── */
  const [group, setGroup] = useState(() => PROOF_TEMPLATES[0]?.defaults.group ?? 'A_4')
  const [picks, setPicks] = useState<Record<string, number>>({})
  const info = useMemo(() => stageInfo(group), [group])

  /**
   * 换群之后替各张卡挑的 p：**优先"有戏"的那个**（n_p 最大），并列时取小的。
   * A₄ → p = 3（n₃ = 4 而 n₂ = 1）、S₄ → p = 3、D₆ → p = 2——正是各自最值得看的那条。
   */
  const bestP = useMemo(() => {
    if (!info.ok || info.primes.length === 0) return 2
    return [...info.primes].sort(
      (a, b) => (info.counts[b] ?? 0) - (info.counts[a] ?? 0) || a - b,
    )[0]
  }, [info])

  const pOf = (t: ProofTemplate) => {
    const want = picks[t.id] ?? t.defaults.p
    return info.ok && info.primes.includes(want) ? want : bestP
  }

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

          <div className="proof-params">
            <label className="proof-group">
              <span className="proof-param-name">群</span>
              <input
                value={group}
                list="proof-group-choices"
                spellCheck={false}
                placeholder="A_4"
                onChange={(e) => setGroup(e.target.value)}
              />
            </label>
            <div className={`proof-order${info.ok ? '' : ' bad'}`}>
              {info.ok
                ? `|G| = ${info.order} = ${info.orderUni}`
                : (info.error ?? '')}
            </div>
          </div>

          {/* 建议群（都实测过模板跑得通）；改成自由输入也就少这一行提示 */}
          <datalist id="proof-group-choices">
            {PROOF_GROUP_CHOICES.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>

          {PROOF_TEMPLATES.map((t) => {
            const p = pOf(t)
            const block = templateReady(t, group, p)
            return (
              <div key={t.id} className={`proof-item${block ? ' blocked' : ''}`} data-tpl={t.id}>
                <div className="proof-item-title">{t.title}</div>
                <div className="proof-item-theorem">
                  <Tex tex={t.theorem} />
                </div>
                <div className="proof-item-blurb">{t.blurb}</div>

                <div className="proof-primes">
                  {info.ok ? (
                    info.primes.map((q) => (
                      <button
                        key={q}
                        className={`proof-prime${q === p ? ' on' : ''}`}
                        onClick={() => setPicks((prev) => ({ ...prev, [t.id]: q }))}
                        title={`Sylow ${q}-子群的个数`}
                      >
                        <span className="proof-prime-p">p = {q}</span>
                        <span className="proof-prime-n">
                          n{subscript(String(q))} = {info.counts[q] ?? 0}
                        </span>
                      </button>
                    ))
                  ) : (
                    <span className="proof-bad">先给一个建得出的群</span>
                  )}
                </div>

                {info.ok && block && <div className="proof-bad">{block}</div>}

                <button
                  className="proof-start"
                  disabled={!!block}
                  onClick={() => onStart(t, { group: group.trim(), p })}
                >
                  开始证明
                </button>
              </div>
            )
          })}
          <div className="proof-warn">开始时清空画布（证明要独占一张图）</div>
        </>
      ) : (
        <>
          <div className="proof-head">
            <div className="proof-title">{template.title}</div>
            <div className="proof-theorem">
              <Tex tex={template.theorem} />
            </div>
            {params && (
              <div className="proof-instance">
                实例：<b>{params.group}</b> · p = {params.p}
              </div>
            )}
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
