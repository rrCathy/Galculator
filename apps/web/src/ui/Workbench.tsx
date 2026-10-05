import { useEffect, useMemo, useState } from 'react'
import {
  INFO_SECTIONS,
  SectionBody,
  sectionSummary,
  STRUCT_SECTIONS,
  type InfoTab,
} from './InfoDock'
import { STRUCTURE_LEVEL_LABEL } from '../gal/algebra'
import { subgroupClassCount } from './infoHelpers'
import { TexOrText } from './Tex'
import type { GalObject } from '../gal/types'
import type { NormalizedSubgroup } from '../gal/value'
import { homeOf } from '../gal/value'
import type { Group } from '@groupviz/core'
import { isKnownGroup } from '../gal/known'

/**
 * **工作台**（P1，2026-10-05）—— 从**底部升起**的一个框，画布当背景。
 *
 * ## 为什么是这个形态（用户定的）
 *
 * 原话：「工作台应该是从底部弹出的框，并且能在底部收起，交换图画布充当背景。」
 *
 * 两条硬约束：
 *   · **画布不重排** —— 面板 `position: absolute` 浮在画布上（`INTERACTION` §5
 *     「画布不给抽屉让位」），升起时 `CanvasView` 的尺寸与格点布局**一行都不改**。
 *     这与"三栏并排"是根本不同的事：后者把宽度切掉。
 *   · **收起要贴着它来的那条边** —— 收起后剩一条贴底的胶囊（点它落回去），
 *     位置与展开时一致，不"跳到别处"。
 *
 * ## 它与左上「信息」抽屉的关系：**同一批内容，两个地方都能看**
 *
 * 两处都显示"这个对象的细节"，所以内容**只能有一份**（`SectionBody`）——
 * 否则两份内容迟早分家，这个项目反复栽"判据散多份"的同一个病。
 * 差别只在于**姿态**：
 *   · 抽屉：随手瞄一眼（点开、看完、收起）；
 *   · 工作台：**坐下来**（升起、几节都摊开、可以一直开着）。
 *
 * ## 什么时候升起
 *
 * 由 `homeOf(value)` 判（`gal/value.ts`）：`bench` 档（群 / 代数结构 / 集合 /
 * 元素集 / 子群集）才值得"坐下来看"；`canvas` 档（映射 / 作用 / 关系）不升起 ——
 * 它们是**边**，那条线本身就是答案。
 */

export interface WorkbenchProps {
  open: boolean
  onToggle: () => void
  /** 焦点对象（与 `InfoDock` 同一个 `focus`）*/
  node: GalObject | null
  onExtract?: (sub: NormalizedSubgroup) => void
  /** 视口尺寸（算升起高度用；不给就按 CSS 的 max-height 走）*/
  viewportH?: number
}

/** 升起的最大高度（视口的百分之几）。CSS 里另有 `max-height` 兜底。 */
const MAX_H_RATIO = 0.45

export function Workbench({ open, onToggle, node, onExtract, viewportH }: WorkbenchProps) {
  /*
   * 哪几节摊开：**默认全摊**（这正是工作台与抽屉的差别 —— 抽屉默认全收）。
   * 用户可以点标题收掉某节；换对象时回到"全摊"（`key` 换节点会重挂，见下面 effect）。
   */
  const [closed, setClosed] = useState<Set<InfoTab>>(new Set())

  const group: Group | null =
    node?.value.type === 'group' ? node.value.group : null
  const struct = node?.value.type === 'structure' ? node.value.structure : null
  const showGroup = group ?? struct?.group ?? null

  /** 本节点该有哪几节（与 `InfoDock` 同一份判定，见该文件 `:140`）*/
  const sections: { id: InfoTab; label: string }[] | null = showGroup
    ? [...INFO_SECTIONS, ...(struct ? STRUCT_SECTIONS : [])]
    : struct
      ? STRUCT_SECTIONS
      : null

  /** 「已知群」只有符号与阶，没有元素表（U48）—— 子群数那一格要改口径。 */
  const canCount = !!showGroup && !isKnownGroup(showGroup)
  const [subCount, setSubCount] = useState<number | null>(null)
  useEffect(() => {
    if (!canCount || !showGroup) {
      setSubCount(null)
      return
    }
    let alive = true
    const id = setTimeout(() => {
      if (alive) setSubCount(subgroupClassCount(showGroup))
    }, 0)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [canCount, showGroup])

  /** 换对象 ⇒ 回到"全摊"（工作台的默认姿态；抽屉那边是"全收"）*/
  useEffect(() => {
    setClosed(new Set())
  }, [node?.id])

  const bodyH = viewportH ? Math.round(viewportH * MAX_H_RATIO) : undefined

  const open2 = open && node !== null
  const shouldRise = open2 && node !== null && homeOf(node.value) === 'bench'

  return (
    <section
      className={`bench${open2 ? ' open' : ''}${shouldRise ? ' risen' : ''}`}
      style={bodyH ? { maxHeight: `${bodyH}px` } : undefined}
      data-node={node?.id ?? ''}
    >
      {/*
        标题条 = 收起后的那条胶囊。**贴着底**（`bottom: 0` 在 CSS 里），
        所以点它落回去时位置不变 —— 收起 / 展开是同一根轴上的两个位置。
      */}
      <header className="bench-head">
        <button
          className="bench-toggle"
          onClick={onToggle}
          title={open2 ? '收起工作台' : node ? `看 ${node.id} 的细节` : '展开工作台'}
        >
          <span className="bench-caret">{open2 ? 'v' : '^'}</span>
          <span className="bench-title">工作台</span>
          {node && <span className="bench-target">{node.id}</span>}
          {/*
            收起时给一句"点我看谁"——用户定的形态是**点它才升起**（2026-10-05），
            所以收起态那一行**必须自解释**：光一个「工作台」标题，
            用户不知道点它会发生什么、也不知道现在有没有焦点。
          */}
          {!open2 && node && <span className="bench-peek">点它升起，看这个对象的细节</span>}
          {!open2 && !node && <span className="bench-peek dim">先在画布或左栏选一个对象</span>}
        </button>

        {sections && shouldRise && (
          <div className="bench-secs">
            {sections.map((t) => {
              const isClosed = closed.has(t.id)
              return (
                <button
                  key={t.id}
                  className={`bench-sec${isClosed ? ' closed' : ''}`}
                  onClick={() =>
                    setClosed((prev) => {
                      const next = new Set(prev)
                      if (next.has(t.id)) next.delete(t.id)
                      else next.add(t.id)
                      return next
                    })
                  }
                  title={isClosed ? `展开「${t.label}」` : `收起「${t.label}」`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        )}
      </header>

      {open2 && (
        <div className="bench-body">
          {!node ? null : sections ? (
            <div className="info-acc">
              {sections.map((t) => {
                const isClosed = closed.has(t.id)
                return (
                  <section key={t.id} className="info-sec">
                    {/*
                      分区头**与 `InfoDock` 同款**（`.info-sec-head` / `.info-sec-label`）——
                      两处观感必须一致，否则"同一个对象在两个面板里长得不一样"。
                      摘要复用 `sectionSummary`（同一函数，见 InfoDock 的引用）。
                    */}
                    <div className={`info-sec-head${isClosed ? '' : ' on'}`}>
                      <span className="info-sec-label">{t.label}</span>
                      {t.id === 'axioms' && struct ? (
                        <span className="info-sec-sum">{STRUCTURE_LEVEL_LABEL[struct.axioms.level]}</span>
                      ) : t.id === 'table' && struct ? (
                        <span className="info-sec-sum">
                          {struct.carrier.length > 0 ? `${struct.carrier.length} x ${struct.carrier.length}` : ''}
                        </span>
                      ) : showGroup && (t.id === 'basic' || t.id === 'elements' || t.id === 'subgroups') ? (
                        /* `sectionSummary` 的 id 窄成那三档（`axioms`/`table` 各有自己的摘要，
                           上面两行已单独处理）—— 这里保持同样的窄化，不去改它的签名 */
                        <span className="info-sec-sum">{sectionSummary(t.id, showGroup, subCount)}</span>
                      ) : null}
                    </div>
                    {!isClosed && (
                      <div className="info-sec-body">
                        <SectionBody
                          section={t.id}
                          group={showGroup}
                          struct={struct}
                          node={node}
                          active={null}
                          subCount={subCount}
                          onExtract={onExtract}
                        />
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          ) : (
            /* 没有分节的对象（映射 / 作用 / 集合 / 数值…）⇒ 扁平排版 */
            <div className="info-acc">
              <div className="info-sec-body">
                <SectionBody
                  section="basic"
                  group={group}
                  struct={struct}
                  node={node}
                  active={null}
                  subCount={subCount}
                  onExtract={onExtract}
                />
              </div>
            </div>
          )}

          {node && (
            <div className="bench-foot">
              <TexOrText text={node.def} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
