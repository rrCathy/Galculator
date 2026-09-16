import { useCallback, useEffect, useMemo, useState } from 'react'
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
  pickedIds,
  pendingHint,
  splitForNode,
  type Interaction,
} from './gal/interaction'
import { nextAutoName } from './gal/naming'
import { InputPanel } from './ui/InputPanel'
import { CanvasView, type NodeAnchor } from './ui/CanvasView'
import { RadialMenu, type MenuStage } from './ui/RadialMenu'
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

/** `entry` = 只显示节点旁那个入口按钮；其余是径向菜单的两层（§4.3） */
type Stage = 'entry' | MenuStage

export default function App() {
  const [lines, setLines] = useState<string[]>(DEFAULT_LINES)
  const [inter, setInter] = useState<Interaction>(IDLE)
  const [stage, setStage] = useState<Stage>('entry')
  const [anchors, setAnchors] = useState<NodeAnchor[]>([])
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 620 })
  const [notice, setNotice] = useState<{ text: string; hint?: string } | null>(null)

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

  /** 径向菜单第二层的内容：算（一元）/ 造（以它为第一个参数、还需再选） */
  const groups = useMemo(() => {
    if (!focusedNode) return { compute: [] as OpDef[], build: [] as OpDef[] }
    return splitForNode(focusedNode.value)
  }, [focusedNode])

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

  const onAnchors = useCallback((a: NodeAnchor[], s: { w: number; h: number }) => {
    setAnchors(a)
    setCanvasSize(s)
  }, [])

  const reset = useCallback(() => {
    setInter(IDLE)
    setStage('entry')
    setNotice(null)
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
        setStage('entry')
        setNotice(null)
        return
      }
      const name = nextAutoName(usedNames)
      setLines((p) => [...p, `${name} = ${expr}`])
      setInter({ kind: 'selected', target: name })
      setStage('entry')
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
        setStage('entry')
        return
      }
      if (slots.length > 0) {
        const scalars: (string | null)[] = op.params.map(() => null)
        slots.forEach((s) => {
          scalars[s] = scalarDefault(op, s)
        })
        setInter({ kind: 'fill', opId: op.id, picked: [from], scalars })
        setStage('entry')
        return
      }
      runOp(op, [from])
    },
    [runOp],
  )

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
      setStage('entry')
    },
    [inter, pendOp, runOp],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (inter.kind === 'pending' || inter.kind === 'fill') reset()
      else if (stage !== 'entry') setStage('entry')
      else reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inter, stage, reset])

  /* ── 提示条 ────────────────────────────────────────── */

  const banner = (() => {
    if (!pendOp) return null
    if (inter.kind === 'pending') {
      return (
        <div className="pending-bar">
          <span className="pending-hint">{pendingHint(pendOp, inter.picked.length)}</span>
          <code className="pending-what">{pendOp.notation}</code>
          <span className="pending-picked">
            已选 {inter.picked.map((id) => byId.get(id)?.label ?? id).join(' , ')}
          </span>
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
          <button className="pending-btn primary" onClick={() => runOp(pendOp, inter.picked, inter.scalars)}>
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

  return (
    <div className="app">
      <InputPanel
        lineStates={lineStates}
        objects={objects}
        onAdd={(l) => setLines((p) => [...p, l])}
        onRemove={(i) => setLines((p) => p.filter((_, k) => k !== i))}
        selected={focusedNode ? { label: focusedNode.label, value: focusedNode.value } : null}
        inspect={inter.kind === 'selected' ? focusedNode : null}
        onCloseInspect={() => reset()}
      />
      <main className="stage">
        <div className="stage-canvas">
          <CanvasView
            graph={graph}
            selectedId={inter.kind === 'pending' || inter.kind === 'fill' ? null : focus}
            onSelect={onNodeClick}
            onBackgroundClick={reset}
            onAnchors={onAnchors}
            pickedIds={pickedIds(inter)}
            pickableIds={pickableIds}
          />

          {focusedNode && anchor && stage === 'entry' && inter.kind !== 'pending' && inter.kind !== 'fill' && (
            <button
              className="radial-entry"
              style={{ left: anchor.x + anchor.r + 14, top: anchor.y }}
              title="可用操作（在这个对象旁边）"
              onClick={() => setStage('ring')}
            >
              ◎
            </button>
          )}

          {focusedNode && anchor && stage !== 'entry' && (
            <RadialMenu
              anchor={anchor}
              stage={stage}
              compute={groups.compute}
              build={groups.build}
              containerW={canvasSize.w}
              containerH={canvasSize.h}
              onInspect={() => setStage('entry')}
              onOpenGroup={(g) => setStage(g === '算' ? 'compute' : 'build')}
              onBack={() => setStage('ring')}
              onPick={(op) => startOp(op, focusedNode.id)}
            />
          )}

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
      </main>
    </div>
  )
}
