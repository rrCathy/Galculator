import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildLines } from './gal/build'
import { deriveCanvas } from './gal/derive'
import { evalExpr } from './gal/evalDef'
import { opById, type OpDef } from './gal/ops'
import { composeCall, objectArity, scalarDefault, scalarSlots } from './gal/compose'
import {
  activeOpId,
  canPick,
  focusId,
  IDLE,
  multiOps,
  pickedIds,
  pendingHint,
  singleOpsFor,
  type Interaction,
} from './gal/interaction'
import { computedNumbers, type NumericEntry } from './gal/numeric'
import { nextAutoName } from './gal/naming'
import { CanvasView, type NodeAnchor } from './ui/CanvasView'
import { ObjectOrb, type OrbStage } from './ui/ObjectOrb'
import { MultiOrb } from './ui/MultiOrb'
import { ObjectDock } from './ui/ObjectDock'
import { OpDock } from './ui/OpDock'
import { InfoDock, type InfoTab } from './ui/InfoDock'
import { NumericDock } from './ui/NumericDock'
import type { GalValue } from './gal/value'

/**
 * 默认示范（U0–U2 能力清单）：
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

/**
 * 应用外壳（UI v3）。
 *
 * 布局原则改了：**画布占满窗口，面板浮在它上面**。
 *   左上 —— 并排三个下拉抽屉：对象（含输入框）· 操作 · 信息
 *   左下 —— 数值上拉抽屉
 *   顶部中央 —— 多对象操作悬浮球
 *   节点左上角 —— 对象悬浮球（看 / 单对象操作）
 */
export default function App() {
  const [lines, setLines] = useState<string[]>(DEFAULT_LINES)
  const [inter, setInter] = useState<Interaction>(IDLE)
  const [orbStage, setOrbStage] = useState<OrbStage>('closed')
  const [multiOpen, setMultiOpen] = useState(false)
  const [anchors, setAnchors] = useState<NodeAnchor[]>([])
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 620 })
  const [notice, setNotice] = useState<{ text: string; hint?: string } | null>(null)

  // 默认只展开「对象」：三个都摊开会把画布左上角整片盖住，连顶部那颗球都压上去了
  const [openObjects, setOpenObjects] = useState(true)
  const [openOps, setOpenOps] = useState(false)
  const [openInfo, setOpenInfo] = useState(false)
  const [openNumeric, setOpenNumeric] = useState(true)
  const [infoTab, setInfoTab] = useState<InfoTab>('basic')
  const [dragged, setDragged] = useState<NumericEntry[]>([])

  const { lineStates, objects } = useMemo(() => buildLines(lines), [lines])
  const graph = useMemo(() => deriveCanvas(objects), [objects])
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects])
  const valuesById = useMemo(() => new Map(objects.map((o) => [o.id, o.value])), [objects])
  const usedNames = useMemo(() => objects.map((o) => o.id), [objects])

  const focus = focusId(inter)
  const focusedNode = graph.nodes.find((n) => n.id === focus) ?? null
  const anchor = focus ? (anchors.find((a) => a.id === focus) ?? null) : null

  const pendOp = useMemo(() => {
    const id = activeOpId(inter)
    return id ? (opById(id) ?? null) : null
  }, [inter])

  /** 对象悬浮球里的「单对象操作」（产数值的已被排除） */
  const singleOps = useMemo(() => (focusedNode ? singleOpsFor(focusedNode.value) : []), [focusedNode])
  /** 顶部多对象球的内容：全局列表 */
  const allMultiOps = useMemo(() => multiOps(), [])

  /** pending 时可点的节点（匹配规则与 opsFor 同一份，所以永远一致） */
  const pickableIds = useMemo(() => {
    if (inter.kind !== 'pending' || !pendOp) return null
    const pickedValues = inter.picked
      .map((id) => valuesById.get(id))
      .filter((v): v is GalValue => !!v)
    return graph.nodes
      .filter((n) => canPick(pendOp, inter.picked.length, pickedValues, n.value))
      .map((n) => n.id)
  }, [inter, pendOp, graph.nodes, valuesById])

  const numericEntries = useMemo<NumericEntry[]>(
    () => [...computedNumbers(objects), ...dragged],
    [objects, dragged],
  )

  const onAnchors = useCallback((a: NodeAnchor[], s: { w: number; h: number }) => {
    setAnchors(a)
    setCanvasSize(s)
  }, [])

  /**
   * 浮层面板占掉的区域量出来交给画布，让节点避开。
   * 面板宽度随开合变（收起只剩标题胶囊），所以用 ResizeObserver 跟，而不是只在开合时算一次。
   */
  const dockTopRef = useRef<HTMLDivElement>(null)
  const dockBottomRef = useRef<HTMLDivElement>(null)
  const [insets, setInsets] = useState({ left: 0, bottom: 0 })

  useEffect(() => {
    const measure = () => {
      const t = dockTopRef.current?.getBoundingClientRect()
      const b = dockBottomRef.current?.getBoundingClientRect()
      const next = {
        left: t && t.width > 0 ? Math.round(t.right) : 0,
        bottom: b && b.height > 0 ? Math.round(window.innerHeight - b.bottom) : 0,
      }
      setInsets((p) => (p.left === next.left && p.bottom === next.bottom ? p : next))
    }
    measure()
    const els = [dockTopRef.current, dockBottomRef.current].filter(Boolean) as HTMLElement[]
    if (typeof ResizeObserver === 'undefined' || els.length === 0) return
    const ro = new ResizeObserver(measure)
    els.forEach((el) => ro.observe(el))
    return () => ro.disconnect()
  }, [openObjects, openOps, openInfo, openNumeric, lines])

  const reset = useCallback(() => {
    setInter(IDLE)
    setOrbStage('closed')
    setMultiOpen(false)
    setNotice(null)
  }, [])

  const removeLine = useCallback((index: number) => {
    setLines((p) => p.filter((_, k) => k !== index))
    setInter(IDLE)
    setOrbStage('closed')
  }, [])

  /* ── 执行：把点选出来的操作编成一行定义，交给同一个求值器 ───────── */

  const runOp = useCallback(
    (op: OpDef, picked: string[], scalars: (string | null)[] = []) => {
      const args: (string | null)[] = op.params.map((_, i) => scalars[i] ?? null)
      picked.forEach((p, i) => {
        args[i] = p
      })
      const expr = composeCall(op, args)
      if (!expr) {
        setNotice({ text: `${op.notation} 的参数还没凑齐` })
        return
      }
      const check = evalExpr(expr, byId)
      if (!check.ok) {
        setNotice({ text: check.error, hint: check.hint })
        return
      }
      // 已经算过的同一个东西就不重复添行，直接选中它
      const dup = objects.find((o) => o.def === expr && o.label === check.label)
      if (dup) {
        setInter({ kind: 'selected', target: dup.id })
        setOrbStage('closed')
        setNotice(null)
        return
      }
      const name = nextAutoName(usedNames)
      setLines((p) => [...p, `${name} = ${expr}`])
      setInter({ kind: 'selected', target: name })
      setOrbStage('closed')
      setNotice(null)
    },
    [byId, objects, usedNames],
  )

  /** 从某个节点发起一个操作：一元直接算，多元进 pending，缺标量进 fill。 */
  const startOp = useCallback(
    (op: OpDef, from: string) => {
      const slots = scalarSlots(op)
      if (objectArity(op) > 1) {
        setInter({ kind: 'pending', opId: op.id, picked: [from] })
        setOrbStage('closed')
        return
      }
      if (slots.length > 0) {
        const scalars: (string | null)[] = op.params.map(() => null)
        slots.forEach((s) => {
          scalars[s] = scalarDefault(op, s)
        })
        setInter({ kind: 'fill', opId: op.id, picked: [from], scalars })
        setOrbStage('closed')
        return
      }
      runOp(op, [from])
    },
    [runOp],
  )

  /** 顶部球选了一个多对象操作 → 空着手进 pending，等用户点对象。 */
  const startMultiOp = useCallback((op: OpDef) => {
    setMultiOpen(false)
    setOrbStage('closed')
    setNotice(null)
    setInter({ kind: 'pending', opId: op.id, picked: [] })
  }, [])

  /* ── 画布点击 ──────────────────────────────────────── */

  const onNodeClick = useCallback(
    (id: string) => {
      setNotice(null)
      if (inter.kind === 'pending' && pendOp) {
        const picked = [...inter.picked, id]
        if (picked.length < objectArity(pendOp)) {
          setInter({ kind: 'pending', opId: pendOp.id, picked })
          return
        }
        const slots = scalarSlots(pendOp)
        if (slots.length > 0) {
          const scalars: (string | null)[] = pendOp.params.map(() => null)
          slots.forEach((s) => {
            scalars[s] = scalarDefault(pendOp, s)
          })
          setInter({ kind: 'fill', opId: pendOp.id, picked, scalars })
          return
        }
        runOp(pendOp, picked)
        return
      }
      setInter({ kind: 'selected', target: id })
      setOrbStage('closed')
    },
    [inter, pendOp, runOp],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (inter.kind === 'pending' || inter.kind === 'fill') reset()
      else if (orbStage !== 'closed' || multiOpen) {
        setOrbStage('closed')
        setMultiOpen(false)
      } else reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inter, orbStage, multiOpen, reset])

  /* ── 数值区 ────────────────────────────────────────── */

  const removeNumeric = useCallback(
    (key: string) => {
      if (key.startsWith('c:')) {
        const id = key.slice(2)
        const st = lineStates.find((s) => s.ok && s.object?.id === id)
        if (st) removeLine(st.index)
        return
      }
      setDragged((p) => p.filter((d) => d.key !== key))
    },
    [lineStates, removeLine],
  )

  const dropNumber = useCallback((label: string, value: number) => {
    setDragged((p) => {
      const key = `d:${label}:${value}`
      if (p.some((d) => d.key === key)) return p
      return [...p, { key, label, value, source: 'drag' }]
    })
    setOpenNumeric(true)
  }, [])

  /* ── 待选 / 补参提示条 ─────────────────────────────── */

  const banner = (() => {
    if (!pendOp) return null
    if (inter.kind === 'pending') {
      return (
        <div className="pending-bar">
          <span className="pending-hint">{pendingHint(pendOp, inter.picked.length)}</span>
          <code className="pending-what">{pendOp.notation}</code>
          {inter.picked.length > 0 && (
            <span className="pending-picked">
              已选 {inter.picked.map((id) => byId.get(id)?.label ?? id).join(' , ')}
            </span>
          )}
          <button className="pending-btn" onClick={reset}>
            Esc 取消
          </button>
        </div>
      )
    }
    if (inter.kind === 'fill') {
      const slots = scalarSlots(pendOp)
      return (
        <div className="pending-bar">
          <span className="pending-hint">补参数</span>
          <code className="pending-what">{pendOp.notation}</code>
          {slots.map((s) => (
            <label key={s} className="fill-field">
              <span>{pendOp.params[s].name}</span>
              <input
                value={inter.scalars[s] ?? ''}
                onChange={(e) =>
                  setInter({
                    ...inter,
                    scalars: inter.scalars.map((v, i) => (i === s ? e.target.value : v)),
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runOp(pendOp, inter.picked, inter.scalars)
                }}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          ))}
          <button
            className="pending-btn primary"
            onClick={() => runOp(pendOp, inter.picked, inter.scalars)}
          >
            执行
          </button>
          <button className="pending-btn" onClick={reset}>
            Esc 取消
          </button>
        </div>
      )
    }
    return null
  })()

  const busy = inter.kind === 'pending' || inter.kind === 'fill'

  return (
    <div className="app">
      <CanvasView
        graph={graph}
        selectedId={busy ? null : focus}
        onSelect={onNodeClick}
        onBackgroundClick={reset}
        onAnchors={onAnchors}
        pickedIds={pickedIds(inter)}
        pickableIds={pickableIds}
        insets={insets}
      />

      {focusedNode && anchor && !busy && (
        <ObjectOrb
          anchor={anchor}
          stage={orbStage}
          singleOps={singleOps}
          containerW={canvasSize.w}
          containerH={canvasSize.h}
          onOpen={() => setOrbStage('ring')}
          onClose={() => setOrbStage('closed')}
          onToggleOps={() => setOrbStage(orbStage === 'ops' ? 'ring' : 'ops')}
          onInspect={(tab) => {
            setInfoTab(tab)
            setOpenInfo(true)
            setOrbStage('closed')
          }}
          onRun={(op) => startOp(op, focusedNode.id)}
        />
      )}

      <div className="dock-topleft" ref={dockTopRef}>
        <ObjectDock
          open={openObjects}
          onToggle={() => setOpenObjects((v) => !v)}
          lineStates={lineStates}
          objects={objects}
          onAdd={(l) => setLines((p) => [...p, l])}
          onRemove={removeLine}
        />
        <OpDock
          open={openOps}
          onToggle={() => setOpenOps((v) => !v)}
          lineStates={lineStates}
          onRemove={removeLine}
        />
        <InfoDock
          open={openInfo}
          onToggle={() => setOpenInfo((v) => !v)}
          tab={infoTab}
          onTab={setInfoTab}
          node={busy ? null : focusedNode}
        />
      </div>

      <MultiOrb
        open={multiOpen}
        onToggle={() => setMultiOpen((v) => !v)}
        ops={allMultiOps}
        onPick={startMultiOp}
        minLeft={insets.left}
      />

      <div className="dock-bottomleft" ref={dockBottomRef}>
        <NumericDock
          open={openNumeric}
          onToggle={() => setOpenNumeric((v) => !v)}
          entries={numericEntries}
          onRemove={removeNumeric}
          onDropNumber={dropNumber}
        />
      </div>

      {banner}

      {notice && (
        <div className="notice">
          <span>
            {notice.text}
            {notice.hint ? ` · ${notice.hint}` : ''}
          </span>
          <button onClick={() => setNotice(null)} title="关闭">
            ×
          </button>
        </div>
      )}
    </div>
  )
}
