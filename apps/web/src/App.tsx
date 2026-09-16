import { useMemo, useState, type ReactNode } from 'react'
import { computeOrbits } from '@groupviz/core'
import { buildLines } from './gal/build'
import { deriveCanvas } from './gal/derive'
import { InputPanel } from './ui/InputPanel'
import { CanvasView } from './ui/CanvasView'
import { ACTION_KIND_LABEL, VALUE_TYPE_LABEL, type GalValue } from './gal/value'
import type { CanvasNode } from './gal/types'

/**
 * 默认示范（U0 能力清单）：
 *   `G = D_4` 记号建群 · `Z(G)` 子群升级为**真群对象**（圆 → 方，于是 `Z(Z(G))` 合法）
 *   `换位子群(G)` 迭代闭包 · `Z ∩ C` 集合运算 · `G / Z` 商群 · `Sub(G)` 枚举 · `ord` 数值进栈
 */
const DEFAULT_LINES = [
  'G = D_4',
  'Z = Z(G)',
  'C = 换位子群(G)',
  'J = Z ∩ C',
  'Q = G / Z',
  'S = Sub(G)',
  'n = ord(G, r2)',
]

export default function App() {
  const [lines, setLines] = useState<string[]>(DEFAULT_LINES)
  const [selected, setSelected] = useState<string | null>(null)

  const { lineStates } = useMemo(() => buildLines(lines), [lines])
  const objects = useMemo(() => buildLines(lines).objects, [lines])
  const graph = useMemo(() => deriveCanvas(objects), [objects])
  const sel = graph.nodes.find((n) => n.id === selected) ?? null

  return (
    <div className="app">
      <InputPanel
        lineStates={lineStates}
        objects={objects}
        onAdd={(l) => setLines((p) => [...p, l])}
        onRemove={(i) => setLines((p) => p.filter((_, k) => k !== i))}
        selected={sel ? { label: sel.label, value: sel.value } : null}
      />
      <main className="stage">
        <CanvasView graph={graph} selectedId={selected} onSelect={setSelected} />
        <Detail node={sel} />
      </main>
    </div>
  )
}

function Item({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="detail-item">
      <span className="k">{k}</span>
      {children}
    </div>
  )
}

function Detail({ node }: { node: CanvasNode | null }) {
  if (!node) {
    return (
      <div className="detail detail-empty">
        点选画布上的节点查看详情；纯数值结果在左栏「数值」区
      </div>
    )
  }
  const v = node.value
  return (
    <div className="detail">
      <div className="detail-head">
        <span className={`chip chip-${v.type}`}>{VALUE_TYPE_LABEL[v.type]}</span>
        <strong>{node.label}</strong>
        {node.sub && <span className="detail-meta">{node.sub}</span>}
        <span className="detail-origin">{node.origin === 'input' ? '直接声明' : '运算结果'}</span>
      </div>
      <div className="detail-body">
        <Item k="定义">
          <code>
            {node.id} = {node.def}
          </code>
        </Item>
        {node.sources.length > 0 && (
          <Item k="来源">
            <span>{node.sources.join(' , ')}</span>
          </Item>
        )}
        <ValueDetail v={v} />
        {node.opId && (
          <Item k="操作">
            <code>{node.opId}</code>
          </Item>
        )}
        {node.recipe && (
          <Item k="配方">
            <code>{node.recipe}</code>
          </Item>
        )}
        {node.note && (
          <Item k="识别">
            <span>{node.note}</span>
          </Item>
        )}
      </div>
    </div>
  )
}

function ValueDetail({ v }: { v: GalValue }) {
  switch (v.type) {
    case 'group':
      return (
        <>
          <Item k="阶">
            <span>|G| = {v.group.order}</span>
          </Item>
          <Item k="生成元">
            <span>{v.group.generators.map((g) => g.symbol).join(', ') || '—'}</span>
          </Item>
          <Item k="交换">
            <span>{v.group.isAbelian ? '是' : '否'}</span>
          </Item>
          {v.group.elements.length <= 24 && (
            <Item k="元素">
              <span className="detail-elems">
                {v.group.elements.map((e) => e.label).join(' ')}
              </span>
            </Item>
          )}
        </>
      )
    case 'elements':
      return (
        <Item k="元素">
          <span className="detail-elems">
            {v.elements.length === 0
              ? '（平凡，只含单位元）'
              : v.elements.map((e) => e.label).join(' ')}
          </span>
        </Item>
      )
    case 'subgroups':
      return (
        <>
          <Item k="子群数">
            <span>{v.subgroups.length}</span>
          </Item>
          <Item k="列表">
            <span className="detail-subs">
              {v.subgroups.slice(0, 14).map((s, i) => (
                <span key={i} className="sub-tag" title={`阶 ${s.order} · 指数 ${s.index ?? '—'}`}>
                  {s.label}
                  <em>|H|={s.order}</em>
                  {s.isNormal && <b>⊴</b>}
                  {s.isSylow && <b className="syl">Syl</b>}
                </span>
              ))}
              {v.subgroups.length > 14 && <span className="sub-tag">…共 {v.subgroups.length} 个</span>}
            </span>
          </Item>
        </>
      )
    case 'action': {
      const A = v.action
      const orbitCount = computeOrbits(A.perms, A.n).orbits.length
      const transitive = orbitCount === 1
      return (
        <>
          <Item k="类型">
            <span>{ACTION_KIND_LABEL[A.kind]}</span>
          </Item>
          <Item k="Ω">
            <span>{A.n} 个点</span>
          </Item>
          <Item k="轨道数">
            <span>
              {orbitCount}
              {transitive ? '（传递）' : ''}
            </span>
          </Item>
        </>
      )
    }
    case 'map':
      return (
        <Item k="域 / 靶">
          <span>
            {v.map.domain.order} → {v.map.codomain.order}
          </span>
        </Item>
      )
    case 'number':
      return (
        <Item k="值">
          <span>{v.label}</span>
        </Item>
      )
  }
}
