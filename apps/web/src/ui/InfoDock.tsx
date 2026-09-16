import { useMemo, type ReactNode } from 'react'
import {
  getSmallGroupBySymbol,
  isGroupCyclic,
  isNilpotent,
  isSimpleGroup,
  isSolvable,
  listCosetStripSubgroups,
  type Group,
} from '@groupviz/core'
import { ACTION_KIND_LABEL, VALUE_TYPE_LABEL } from '../gal/value'
import { Tex, TexOrText } from './Tex'
import { ElementsTable } from './ElementsTable'
import { DockPanel } from './DockPanel'
import type { GalObject } from '../gal/types'

const ENUM_CAP = 144

export type InfoTab = 'basic' | 'elements' | 'subgroups'

export const INFO_TABS: { id: InfoTab; label: string }[] = [
  { id: 'basic', label: '基本' },
  { id: 'elements', label: '元素' },
  { id: 'subgroups', label: '子群' },
]

/**
 * 信息区面板（UI v3）：画布上那三个按钮（基本 / 元素 / 子群）**共用这一个面板**，
 * 点哪个按钮就切到哪个 tab。
 */
export function InfoDock({
  open,
  onToggle,
  tab,
  onTab,
  node,
}: {
  open: boolean
  onToggle: () => void
  tab: InfoTab
  onTab: (t: InfoTab) => void
  /** 焦点**对象**——不限于节点：映射只画箭头，但同样有信息可看 */
  node: GalObject | null
}) {
  const group = node && node.value.type === 'group' ? node.value.group : null

  return (
    <DockPanel title="信息" open={open} onToggle={onToggle}>
      {!node && <div className="empty">点画布上的对象，看它的信息</div>}

      {node && (
        <>
          <div className="info-target">
            <span className={`chip chip-${node.value.type}`}>
              {VALUE_TYPE_LABEL[node.value.type]}
            </span>
            <strong>
              <TexOrText text={node.label} />
            </strong>
            <span className="info-def">
              {node.id} = {node.def}
            </span>
          </div>

          {group ? (
            <>
              <div className="info-tabs">
                {INFO_TABS.map((t) => (
                  <button
                    key={t.id}
                    className={`info-tab${tab === t.id ? ' on' : ''}`}
                    onClick={() => onTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {tab === 'basic' && <BasicTab group={group} node={node} />}
              {tab === 'elements' && <ElementsTable group={group} />}
              {tab === 'subgroups' && <SubgroupsTab group={group} />}
            </>
          ) : (
            <OtherTab node={node} />
          )}
        </>
      )}
    </DockPanel>
  )
}

function BasicTab({ group, node }: { group: Group; node: GalObject }) {
  const info = useMemo(() => {
    const small = group.order <= ENUM_CAP
    const inLibrary = group.isoSymbol ? getSmallGroupBySymbol(group.isoSymbol) : null
    return {
      cyclic: isGroupCyclic(group),
      simple: small ? isSimpleGroup(group) : null,
      solvable: small ? isSolvable(group) : null,
      nilpotent: small ? isNilpotent(group) : null,
      inLibrary,
    }
  }, [group])

  return (
    <>
      <Row k="阶">
        <span>|G| = {group.order}</span>
      </Row>
      <Row k="生成元">
        <span>{group.generators.map((g) => g.symbol).join(', ') || '—'}</span>
      </Row>
      <Row k="交换">
        <span>{group.isAbelian ? '是' : '否'}</span>
      </Row>
      <Row k="循环">
        <span>{info.cyclic ? '是' : '否'}</span>
      </Row>
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
      {info.inLibrary && (
        <Row k="识别">
          <span>
            SmallGroup({info.inLibrary.order}, {info.inLibrary.index}) ·{' '}
            <Tex tex={info.inLibrary.group.symbol} />
          </span>
        </Row>
      )}
      {node.sources.length > 0 && (
        <Row k="来源">
          <span>{node.sources.join(' , ')}</span>
        </Row>
      )}
      {node.recipe && (
        <Row k="配方">
          <code>{node.recipe}</code>
        </Row>
      )}
    </>
  )
}

function SubgroupsTab({ group }: { group: Group }) {
  const subs = useMemo(
    () => (group.order <= ENUM_CAP ? listCosetStripSubgroups(group) : null),
    [group],
  )

  if (!subs) return <div className="insp-line dim">|G| &gt; {ENUM_CAP}，子群未枚举（守卫）</div>
  if (subs.length === 0) return <div className="insp-line dim">没有非平凡真子群</div>

  return (
    <div className="insp-subs">
      {subs.map((s) => (
        <div key={s.key} className="insp-sub">
          <span className="insp-sub-name">
            {s.structure ? <Tex tex={s.structure} /> : `阶 ${s.order}`}
          </span>
          <span className="insp-sub-meta">
            |H|={s.order} · [G:H]={s.index}
            {s.isNormal ? ' · ⊴' : ''}
            {s.orbitSize > 1 ? ` · ×${s.orbitSize}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

function OtherTab({ node }: { node: GalObject }) {
  const v = node.value
  switch (v.type) {
    case 'elements':
      return (
        <>
          <Row k="基数">
            <span>{v.elements.length}</span>
          </Row>
          <div className="insp-elems">{v.elements.map((e) => e.label).join(' ')}</div>
        </>
      )
    case 'subgroups':
      return (
        <div className="insp-tags">
          {v.subgroups.slice(0, 30).map((s, i) => (
            <span key={i} className="sub-tag" title={`阶 ${s.order} · 指数 ${s.index ?? '—'}`}>
              {s.label}
              <em>|H|={s.order}</em>
              {s.isNormal && <b>⊴</b>}
              {s.isSylow && <b className="syl">Syl</b>}
            </span>
          ))}
          {v.subgroups.length > 30 && (
            <div className="insp-line dim">…共 {v.subgroups.length} 个</div>
          )}
        </div>
      )
    case 'action':
      return (
        <>
          <Row k="类型">
            <span>{ACTION_KIND_LABEL[v.action.kind]}</span>
          </Row>
          <Row k="Ω">
            <span>{v.action.n} 个点</span>
          </Row>
        </>
      )
    case 'map':
      return (
        <>
          <Row k="域">
            <span>
              <Tex tex={v.map.domain.symbol} />（{v.map.domain.order} 阶）
            </span>
          </Row>
          <Row k="靶">
            <span>
              <Tex tex={v.map.codomain.symbol} />（{v.map.codomain.order} 阶）
            </span>
          </Row>
          <Row k="同态">
            <span>{v.map.isHomomorphism ? '是' : '否'}</span>
          </Row>
          {v.map.isInjective !== null && (
            <Row k="单 / 满">
              <span>
                {v.map.isInjective ? '单射' : '非单'}
                {' · '}
                {v.map.isSurjective ? '满射' : '非满'}
              </span>
            </Row>
          )}
          {v.map.kernel && (
            <Row k="核">
              <span>|ker| = {v.map.kernel.length}</span>
            </Row>
          )}
          {v.map.image && (
            <Row k="像">
              <span>|im| = {v.map.image.length}</span>
            </Row>
          )}
          {v.map.genImages.length > 0 && (
            <Row k="生成元">
              <span className="insp-elems">
                {v.map.genImages.map((g) => `${g.generator} ↦ ${g.image.label}`).join('，')}
              </span>
            </Row>
          )}
        </>
      )
    case 'number':
      return (
        <Row k="值">
          <span>{v.label}</span>
        </Row>
      )
    default:
      return null
  }
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="insp-row">
      <span className="insp-k">{k}</span>
      <span className="insp-v">{children}</span>
    </div>
  )
}
