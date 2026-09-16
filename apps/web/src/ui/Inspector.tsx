import { useMemo, useState, type ReactNode } from 'react'
import {
  computeOrbits,
  getConjugacyClasses,
  getSmallGroupBySymbol,
  isGroupCyclic,
  isNilpotent,
  isSimpleGroup,
  isSolvable,
  listCosetStripSubgroups,
  type Group,
} from '@groupviz/core'
import { ACTION_KIND_LABEL, VALUE_TYPE_LABEL } from '../gal/value'
import { prettySymbol } from '../gal/pretty'
import type { CanvasNode } from '../gal/types'

/** 超过这个阶就不做属性枚举（对齐 ARCHITECTURE §10 的 ENUMERATION_LIMIT 口径）。 */
const ENUM_CAP = 144

interface Props {
  node: CanvasNode
  onClose: () => void
}

/**
 * 竖卡（交互模型 §5）：左栏的**详情态**。
 *
 * 它是**临时详情**而非居民——随径向菜单的「看」打开，关掉就回到输入态，
 * 所以两态不并存：输入区折叠成一行，不在这里再放一套输入框。
 */
export function Inspector({ node, onClose }: Props) {
  const v = node.value
  return (
    <div className="inspector">
      <header className="inspector-head">
        <button className="inspector-back" onClick={onClose} title="返回输入态（Esc）">
          ←
        </button>
        <span className={`chip chip-${v.type}`}>{VALUE_TYPE_LABEL[v.type]}</span>
        <strong className="inspector-title">{node.label}</strong>
        {node.sub && <span className="inspector-sub">{node.sub}</span>}
      </header>

      <div className="inspector-body">
        <Section title="定义">
          <Row k="行">
            <code>
              {node.id} = {node.def}
            </code>
          </Row>
          {node.sources.length > 0 && (
            <Row k="来源">
              <span>{node.sources.join(' , ')}</span>
            </Row>
          )}
          {node.opId && (
            <Row k="操作">
              <code>{node.opId}</code>
            </Row>
          )}
          {node.recipe && (
            <Row k="配方">
              <code>{node.recipe}</code>
            </Row>
          )}
          {node.note && (
            <Row k="识别">
              <span>{node.note}</span>
            </Row>
          )}
        </Section>

        <ValueSections node={node} />
      </div>
    </div>
  )
}

function ValueSections({ node }: { node: CanvasNode }) {
  const v = node.value

  switch (v.type) {
    case 'group':
      return <GroupSections group={v.group} />
    case 'elements':
      return (
        <Section title="元素表" count={v.elements.length}>
          <Elems list={v.elements.map((e) => e.label)} />
        </Section>
      )
    case 'subgroups':
      return (
        <Section title="子群列表" count={v.subgroups.length}>
          <div className="insp-tags">
            {v.subgroups.slice(0, 30).map((s, i) => (
              <span key={i} className="sub-tag" title={`阶 ${s.order} · 指数 ${s.index ?? '—'}`}>
                {s.label}
                <em>|H|={s.order}</em>
                {s.isNormal && <b>⊴</b>}
                {s.isSylow && <b className="syl">Syl</b>}
              </span>
            ))}
          </div>
          {v.subgroups.length > 30 && (
            <div className="insp-line dim">…共 {v.subgroups.length} 个</div>
          )}
        </Section>
      )
    case 'action': {
      const A = v.action
      const orbits = computeOrbits(A.perms, A.n).orbits.length
      return (
        <Section title="作用">
          <Row k="类型">
            <span>{ACTION_KIND_LABEL[A.kind]}</span>
          </Row>
          <Row k="Ω">
            <span>{A.n} 个点</span>
          </Row>
          <Row k="轨道数">
            <span>
              {orbits}
              {orbits === 1 ? '（传递）' : ''}
            </span>
          </Row>
        </Section>
      )
    }
    case 'map':
      return (
        <Section title="映射">
          <Row k="域">
            <span>
              {prettySymbol(v.map.domain.symbol)}（|·| = {v.map.domain.order}）
            </span>
          </Row>
          <Row k="靶">
            <span>
              {prettySymbol(v.map.codomain.symbol)}（|·| = {v.map.codomain.order}）
            </span>
          </Row>
          <Row k="同态">
            <span>{v.map.isHomomorphism ? '是' : '否'}</span>
          </Row>
        </Section>
      )
    case 'number':
      return (
        <Section title="数值">
          <Row k="值">
            <span>{v.label}</span>
          </Row>
        </Section>
      )
  }
}

function GroupSections({ group }: { group: Group }) {
  const info = useMemo(() => {
    const small = group.order <= ENUM_CAP
    const inLibrary = group.isoSymbol ? getSmallGroupBySymbol(group.isoSymbol) : null
    return {
      capped: !small,
      cyclic: isGroupCyclic(group),
      simple: small ? isSimpleGroup(group) : null,
      solvable: small ? isSolvable(group) : null,
      nilpotent: small ? isNilpotent(group) : null,
      classes: small ? getConjugacyClasses(group) : null,
      subs: small ? listCosetStripSubgroups(group) : null,
      inLibrary,
    }
  }, [group])

  return (
    <>
      <Section title="基本信息">
        <Row k="阶">
          <span>|G| = {group.order}</span>
        </Row>
        <Row k="生成元">
          <span>{group.generators.map((g) => g.symbol).join(', ') || '—'}</span>
        </Row>
        <Row k="交换">
          <span>{group.isAbelian ? '是' : '否'}</span>
        </Row>
        {info.cyclic !== null && (
          <Row k="循环">
            <span>{info.cyclic ? '是' : '否'}</span>
          </Row>
        )}
        {info.simple !== null && (
          <Row k="单">
            <span>{info.simple ? '是' : '否'}</span>
          </Row>
        )}
        {info.solvable !== null && (
          <Row k="可解">
            <span>{info.solvable ? '是' : '否'}</span>
          </Row>
        )}
        {info.nilpotent !== null && (
          <Row k="幂零">
            <span>{info.nilpotent ? '是' : '否'}</span>
          </Row>
        )}
      </Section>

      {info.inLibrary && (
        <Section title="识别">
          <Row k="小群库">
            <span>
              SmallGroup({info.inLibrary.order}, {info.inLibrary.index})
            </span>
          </Row>
          <Row k="结构">
            <code>{prettySymbol(info.inLibrary.group.symbol)}</code>
          </Row>
        </Section>
      )}

      <Section title="元素表" count={group.elements.length}>
        <Elems list={group.elements.map((e) => e.label)} />
      </Section>

      {info.classes && (
        <Section title="共轭类" count={info.classes.length}>
          <div className="insp-classes">
            {info.classes.map((cls, i) => (
              <div key={i} className="insp-class">
                <span className="insp-class-size">{cls.length}</span>
                <span className="insp-class-el">{cls.map((e) => e.label).join(' ')}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {info.subs && (
        <Section title="子群（按共轭轨道合并）" count={info.subs.length}>
          <div className="insp-subs">
            {info.subs.map((s) => (
              <div key={s.key} className="insp-sub">
                <code>{s.structure ? prettySymbol(s.structure) : `阶 ${s.order}`}</code>
                <span className="insp-sub-meta">
                  |H|={s.order} · [G:H]={s.index}
                  {s.isNormal ? ' · ⊴' : ''}
                  {s.orbitSize > 1 ? ` · ×${s.orbitSize}` : ''}
                </span>
              </div>
            ))}
            {info.subs.length === 0 && <div className="insp-line dim">没有非平凡真子群</div>}
          </div>
        </Section>
      )}

      {info.capped && (
        <div className="insp-line dim">|G| &gt; {ENUM_CAP}，属性与子群列表未枚举（守卫）</div>
      )}
    </>
  )
}

function Elems({ list }: { list: string[] }) {
  const CAP = 40
  const shown = list.slice(0, CAP)
  return (
    <>
      <div className="insp-elems">{shown.join(' ')}</div>
      {list.length > CAP && <div className="insp-line dim">…共 {list.length} 个</div>}
    </>
  )
}

function Section({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string
  count?: number
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`insp-section${open ? ' open' : ''}`}>
      <button className="insp-section-head" onClick={() => setOpen((o) => !o)}>
        <span className="insp-caret">{open ? '▾' : '▸'}</span>
        <span className="insp-section-title">{title}</span>
        {count !== undefined && <span className="count">{count}</span>}
      </button>
      {open && <div className="insp-section-body">{children}</div>}
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
