import { useEffect, useMemo, useRef, useState } from 'react'
import {
  instanceLabel,
  PROOF_GROUP_CHOICES,
  PROOF_TEMPLATES,
  stageInfo,
  templateReady,
  type ParamSlot,
  type ProofParams,
  type ProofStep,
  type ProofTemplate,
} from '../gal/proof'
import { subscript } from '../gal/pretty'
import { DockPanel } from './DockPanel'
import { Tex } from './Tex'

/**
 * 证明面板（M1 / U15 / M3）——**step-through 的入口**，也是**模板入参界面**。
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
 *   - **群只有一个输入框**（所有卡共用）：比较几条定理本来就该在同一个群上做；
 *     每张卡各管自己的东西（Sylow 系列管 p，轨道–稳定子管点 x，第一同构管靶群与像）。
 *   - **控件由模板自己声明**（`slots`，M3）：M2 时所有模板的参数恰好都是 `(群, p)`，
 *     面板可以把"p 按钮组"写死；M3 两条新定理参数不一样，写死就不成立了。
 *     p 按钮上**带 n_p**——"哪个 p 才有戏"是这一屏最该被看见的信息
 *     （n_p = 1 时 Sylow II/III 退化成废话）。
 *   - **能不能开始 = 一个判据两处用**（`templateReady`，与 `build()` 同一份材料）：
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
  extra,
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
  /** 正在跑的实例的**额外参数槽**（点 x / 靶群 / 像） */
  extra: Record<string, string> | null
  steps: ProofStep[]
  /** -1 = 还没开始 */
  cursor: number
  onStart: (t: ProofTemplate, params: ProofParams, extra: Record<string, string>) => void
  onGoto: (i: number) => void
  onRestart: () => void
  onExit: () => void
}) {
  const running = !!template && cursor >= 0

  /* ── 入参状态：群一个（所有卡共用）+ 每张卡记住自己的 p 与其他槽 ── */
  const [group, setGroup] = useState(() => PROOF_TEMPLATES[0]?.defaults.group ?? 'A_4')
  const [picks, setPicks] = useState<Record<string, number>>({})
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({})
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
    const want = picks[t.id] ?? t.defaults.p ?? bestP
    return info.ok && info.primes.includes(want) ? want : bestP
  }

  /**
   * 各卡参数槽的**建议值**（模板自己算：轨道–稳定子挑最有戏的点、第一同构挑同态）。
   *
   * 依赖里带上 `drafts` 不是笔误：模板的 `suggest` 会读"当前槽值"来决定连带更新
   * （靶群换了 → 像要重算），所以用户一改就得跟着重算一遍。
   */
  const suggestions = useMemo(() => {
    const out: Record<string, Record<string, string>> = {}
    for (const t of PROOF_TEMPLATES) {
      if (!t.suggest) continue
      out[t.id] = t.suggest(group, picks[t.id] ?? t.defaults.p ?? 2, drafts[t.id] ?? {})
    }
    return out
  }, [group, picks, drafts])

  /** 某张卡此刻的全部槽值：**建议值打底，用户的改动盖在上面**。 */
  const extraOf = (t: ProofTemplate): Record<string, string> => ({
    ...(suggestions[t.id] ?? {}),
    ...(drafts[t.id] ?? {}),
  })

  /**
   * 改一个槽值。
   *
   * 换**靶群**时顺手把同卡其他槽的建议值重算一遍（像 `a→2` 是相对靶群写的，
   * 靶群一换就未必还解得出），但**不覆盖用户刚敲的那一格**——否则打字打一半就被吃掉。
   */
  const setSlot = (t: ProofTemplate, p: number, slot: ParamSlot, value: string) => {
    setDrafts((prev) => {
      const cur = { ...(prev[t.id] ?? {}), [slot.key]: value }
      if (slot.kind !== 'group' || !t.suggest) return { ...prev, [t.id]: cur }
      const refreshed = t.suggest(group, p, cur)
      const next = { ...cur }
      for (const [k, v] of Object.entries(refreshed)) if (k !== slot.key) next[k] = v
      return { ...prev, [t.id]: next }
    })
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
                onChange={(e) => {
                  const v = e.target.value
                  setGroup(v)
                  // 换群 = 换实例：各卡的槽值回到模板的建议值（旧的 `(123)` 在新群里未必存在）
                  if (v.trim() !== group.trim()) setDrafts({})
                }}
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
            const extra = extraOf(t)
            const block = templateReady(t, group, p, extra)
            /**
             * 「还没填」与「填错了」要分开说：槽是空的时候那句话是**引导**
             *（灰字：源群不是循环群时，工具给不出建议的像，得用户自己写），
             * 填了却不成立才是**错误**（红字）。一律红字会让人以为工具坏了。
             */
            const blank = t.slots.some((s) => s.kind !== 'prime' && !(extra[s.key] ?? '').trim())
            return (
              <div key={t.id} className={`proof-item${block ? ' blocked' : ''}`} data-tpl={t.id}>
                <div className="proof-item-title">{t.title}</div>
                <div className="proof-item-theorem">
                  <Tex tex={t.theorem} />
                </div>
                <div className="proof-item-blurb">{t.blurb}</div>

                <div className="proof-fields">
                  {t.slots.map((slot) =>
                    slot.kind === 'prime' ? (
                      <div className="proof-primes" key="p">
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
                    ) : (
                      <label className="proof-field" key={slot.key}>
                        <span className="proof-field-name">{slot.label}</span>
                        <input
                          value={extra[slot.key] ?? ''}
                          placeholder={slot.kind === 'element' ? (slot.hint ?? '') : ''}
                          spellCheck={false}
                          onChange={(e) => setSlot(t, p, slot, e.target.value)}
                        />
                      </label>
                    ),
                  )}
                </div>

                {info.ok && block && (
                  <div className={blank ? 'proof-hint' : 'proof-bad'}>{block}</div>
                )}

                <button
                  className="proof-start"
                  disabled={!!block}
                  onClick={() => onStart(t, { group: group.trim(), p }, extra)}
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
                实例：{instanceLabel(template, params, extra ?? undefined)}
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
