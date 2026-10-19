import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Group } from '@groupviz/core'
import { Tex } from './Tex'
import {
  canDiscoverPresentation,
  discoverGroupPresentation,
  presentationBlockedReason,
  standardPresentation,
  type GroupPresentationView,
} from '../gal/presentation'

/**
 * 「表示」节：群的 `<S | R>`（2026-10-19）。
 *
 * 用户原话：「为什么没看见群展示 `<S|R>`」。数据层见 `gal/presentation.ts`：
 * 先取标准表示（微秒级），没有才允许**按需**反推（Todd-Coxeter，实测 1.7s）。
 *
 * ## 为什么反推要点按钮
 *
 * 反推是同步重活，放进渲染路径会把工作台卡住一秒多。这里照抄「子群」标题行那条
 * 成本闸门：面板先画出来，用户点了才算（`setTimeout(0)` 让"正在反推"这一帧先上屏）。
 *
 * ## 为什么反推结果只显示 3 条
 *
 * `discoverPresentation` 给的关系**没有化简**：16 阶的 `SmallGroup(16,3)` 实测回了
 * **80+ 条**。整串塞进面板就是一堵墙 —— 超过 8 条只列前 3 条 + 总数，另给「展开全部」。
 * 标准表示（C/D/S/A…）都很短，不受这条影响。
 */
export function PresentationTab({ group }: { group: Group }) {
  const std = useMemo(() => standardPresentation(group), [group])
  const [state, setState] = useState<DiscoverState>({ kind: 'idle' })

  // 换群 ⇒ 反推结果作废（每个群的表示不一样）
  useEffect(() => {
    setState({ kind: 'idle' })
  }, [group])

  if (std) return <PresentationView view={std} />

  const blocked = presentationBlockedReason(group)
  if (blocked) {
    return (
      <>
        <div className="insp-line dim">本地没有现成表示。</div>
        <div className="insp-line dim">{blocked}</div>
      </>
    )
  }

  if (state.kind === 'done') return <PresentationView view={state.view} />

  if (!canDiscoverPresentation(group)) {
    return (
      <>
        <div className="insp-line dim">本地没有现成表示。</div>
        <div className="insp-line dim">
          阶 {group.order} 超过反推上限，本地不做 Todd-Coxeter 搜索。
        </div>
      </>
    )
  }

  return (
    <>
      <div className="insp-line dim">
        本地没有现成表示（这个群不属于 C / D / S / A / 直积 / 半直积这些标准族）。
      </div>
      <div className="insp-line dim">可以从乘法表反推一组生成元与关系，需要现算几秒。</div>
      <button
        type="button"
        className="sub-tag sub-tag-btn"
        data-pres-discover
        disabled={state.kind === 'running'}
        onClick={() => {
          setState({ kind: 'running' })
          // 让「正在反推…」先画出来，再跑同步搜索
          setTimeout(() => {
            const view = discoverGroupPresentation(group)
            setState(view ? { kind: 'done', view } : { kind: 'none' })
          }, 0)
        }}
      >
        {state.kind === 'running' ? '正在反推…' : '尝试反推表示'}
      </button>
      {state.kind === 'none' && (
        <div className="insp-line dim">反推没找到有限表示（关系数或词长超出搜索预算）。</div>
      )}
    </>
  )
}

type DiscoverState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; view: GroupPresentationView }
  | { kind: 'none' }

/** 多于这个条数就折叠（反推结果未化简，实测能到 80+ 条）。 */
const RELATOR_FOLD = 8

function PresentationView({ view }: { view: GroupPresentationView }) {
  const [all, setAll] = useState(false)
  const many = view.relators.length > RELATOR_FOLD
  const shown = all ? view.relators : view.relators.slice(0, many ? 3 : view.relators.length)

  return (
    <div data-pres={view.source}>
      <Row k="表示">
        {/* 反推结果太长时只写 `⟨S | ⋯⟩`：整串 KaTeX 既慢又把面板撑爆 */}
        <Tex
          tex={
            many
              ? `\\langle ${view.generators.join(', ')} \\mid \\cdots \\rangle`
              : view.tex
          }
        />
      </Row>
      <Row k="生成元">
        {view.generators.map((g, i) => (
          <span key={i}>
            {i > 0 ? ', ' : ''}
            <Tex tex={g} />
          </span>
        ))}
      </Row>
      <Row k="关系">
        <span>
          {view.relators.length} 条
          {view.source === 'discovered' ? '（反推，未化简）' : ''}
        </span>
      </Row>
      {shown.map((r, i) => (
        <div key={i} className="insp-line">
          <Tex tex={r} />
        </div>
      ))}
      {view.relators.length > shown.length && (
        <button type="button" className="sub-tag sub-tag-btn" onClick={() => setAll(true)}>
          展开全部 {view.relators.length} 条
        </button>
      )}
    </div>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="insp-row">
      <span className="insp-k">{k}</span>
      <span className="insp-v">{children}</span>
    </div>
  )
}
