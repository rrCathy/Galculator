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
  needsEditor,
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
import { ComposerOrb } from './ui/ComposerOrb'
import { MapBuilder } from './ui/MapBuilder'
import { ObjectDock } from './ui/ObjectDock'
import { OpDock } from './ui/OpDock'
import { InfoDock, type InfoTab } from './ui/InfoDock'
import { NumericDock } from './ui/NumericDock'
import type { GalValue, NormalizedSubgroup } from './gal/value'

/**
 * 默认示范（U0–U2 能力清单）：
 *   `G = D_4` 记号建群 · `Z(G)` 子群升级为**真群对象**（圆 → 方，于是 `Z(Z(G))` 合法）
 *   `换位子群(G)` 迭代闭包 · `Z ∩ C` 集合运算 · `G / Z` 商群 · `Sub(G)` 枚举 · `ord` 数值进栈
 */
const DEFAULT_LINES = [
  // Sylow III 的完整故事（MVP 的落点）：
  //   造 Ω → 让 G 作用上去 → 轨道 / 稳定子 → 三条结论
  // 打开就能看到交换图：`G ↷ Ω`、`Orb(H) = Ω`（传递）、`N_G(H) ↪ G`
  'G = S_4',
  'Syl = Syl_p(G, 3)',
  'Ω = 底集(Syl)',
  'A = 共轭作用在(G, Ω)',
  'O = 轨道(A, 1)',
  'N = 稳定子(A, 1)',
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
  const [lines, setLines] = useState<string[]>(() =>
    // `?empty=1` 从**空画布**起（走查脚本用它，免得依赖默认示范的内容）
    typeof location !== 'undefined' && location.search.includes('empty') ? [] : DEFAULT_LINES,
  )
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
  const [composerOpen, setComposerOpen] = useState(false)

  const { lineStates, objects } = useMemo(() => buildLines(lines), [lines])
  const graph = useMemo(() => deriveCanvas(objects), [objects])
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects])
  const valuesById = useMemo(() => new Map(objects.map((o) => [o.id, o.value])), [objects])
  const usedNames = useMemo(() => objects.map((o) => o.id), [objects])

  const focus = focusId(inter)
  /**
   * 焦点**对象**（不一定是节点）：映射不占节点、只画箭头，但它是一等对象——
   * 点箭头就能选中它（U3.1）。所以这里查的是对象表，不是节点表。
   */
  const focusedObj = useMemo(() => {
    const hit = objects.find((o) => o.id === focus)
    if (hit) return hit
    // 有些节点是 derive **就地造**的（作用的 Ω）——它们不在对象表里，
    // 但同样该能点、能看信息（CanvasNode 就是带 shape/level 的 GalObject）。
    return graph.nodes.find((n) => n.id === focus) ?? null
  }, [objects, graph.nodes, focus])
  const anchor = focus ? (anchors.find((a) => a.id === focus) ?? null) : null

  const pendOp = useMemo(() => {
    const id = activeOpId(inter)
    return id ? (opById(id) ?? null) : null
  }, [inter])

  /** 对象悬浮球里的「单对象操作」（产数值的已被排除）——映射会拿到 ker / im */
  const singleOps = useMemo(() => (focusedObj ? singleOpsFor(focusedObj.value) : []), [focusedObj])
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
   * 量出左上/左下面板各自的右边界，给顶部多对象球与底部输入球做避让——
   * **只挪球，不动画布**（UI v3.1）：面板收展时画布节点纹丝不动。
   */
  const dockTopRef = useRef<HTMLDivElement>(null)
  const dockBottomRef = useRef<HTMLDivElement>(null)
  const [barriers, setBarriers] = useState({ top: 0, bottom: 0 })

  useEffect(() => {
    const measure = () => {
      const t = dockTopRef.current?.getBoundingClientRect()
      const b = dockBottomRef.current?.getBoundingClientRect()
      const next = {
        top: t && t.width > 0 ? Math.round(t.right) : 0,
        bottom: b && b.width > 0 ? Math.round(b.right) : 0,
      }
      setBarriers((p) => (p.top === next.top && p.bottom === next.bottom ? p : next))
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
    setComposerOpen(false)
    setNotice(null)
  }, [])

  const removeLine = useCallback((index: number) => {
    setLines((p) => p.filter((_, k) => k !== index))
    setInter(IDLE)
    setOrbStage('closed')
  }, [])

  /** 面板里点对象行 = 选中它：画布高亮 + 对象球出现 + 信息面板打开（信息都在那边看） */
  const selectFromDock = useCallback((id: string) => {
    setInter({ kind: 'selected', target: id })
    setOrbStage('closed')
    setOpenInfo(true)
    setNotice(null)
  }, [])

  /**
   * 「取出为对象」：把子群集里的一项变成一行定义（DIAGRAM_SPEC §3）。
   *
   * 列表不上画布，**但它是入口不是终点**——因为列表里的每一项本身就是个对象
   * （子群）。走的是同一条路：编出一行文本 → 交给同一个求值器，
   * 于是"取出来的"与"手写的"完全等价，用户也看得见系统写了什么。
   */
  const extractSubgroup = useCallback(
    (sub: NormalizedSubgroup) => {
      const v = focusedObj?.value
      if (!v || v.type !== 'subgroups') return
      // 上下文群必须取**群**那一行的名字——子群集那一行（S）本身不是群，
      // 拿它当 `闭包(S, …)` 的上下文会被求值器拒掉（真浏览器走查抓到的）。
      const parent = objects.find(
        (o) => o.value.type === 'group' && o.value.group === v.group,
      )
      if (!parent) return
      const name = nextAutoName(objects.map((o) => o.id))
      // 平凡子群没有生成元，用单位元记号兜底（`闭包(G, e)` 合法）
      const gens =
        sub.generators.length > 0
          ? sub.generators.map((g) => g.label)
          : [v.group.identity.label]
      setLines((p) => [...p, `${name} = 闭包(${parent.id}, ${gens.join(', ')})`])
      setNotice(null)
    },
    [focusedObj, objects],
  )

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

  /** 从某个节点发起一个操作：一元直接算，多元进 pending，缺标量进 fill，要编辑器进 editor。 */
  const startOp = useCallback(
    (op: OpDef, from: string) => {
      if (needsEditor(op) && objectArity(op) === 1) {
        setInter({ kind: 'editor', opId: op.id, picked: [from] })
        setOrbStage('closed')
        return
      }
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

  /** 编辑器确认：产出一行定义，走与"打出来的"完全相同的那条求值路径。 */
  const submitEditorLine = useCallback(
    (line: string) => {
      const eq = line.indexOf('=')
      if (eq <= 0) return
      const name = line.slice(0, eq).trim()
      const expr = line.slice(eq + 1).trim()
      const check = evalExpr(expr, byId)
      if (!check.ok) {
        setNotice({ text: check.error, hint: check.hint })
        return
      }
      const dup = objects.find((o) => o.def === expr && o.label === check.label)
      if (dup) {
        setInter({ kind: 'selected', target: dup.id })
        setNotice(null)
        return
      }
      setLines((p) => [...p, line])
      setInter({ kind: 'selected', target: name })
      setNotice(null)
    },
    [byId, objects],
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
      // 编辑器开着时画布点击不改状态（用户在弹层里填像，别误触丢输入）
      if (inter.kind === 'editor') return
      setNotice(null)
      if (inter.kind === 'pending' && pendOp) {
        const picked = [...inter.picked, id]
        if (picked.length < objectArity(pendOp)) {
          setInter({ kind: 'pending', opId: pendOp.id, picked })
          return
        }
        // 对象参数齐了：要编辑器的转交构建器，缺标量的走补参条，其余直接执行
        if (needsEditor(pendOp)) {
          setInter({ kind: 'editor', opId: pendOp.id, picked })
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
      // 点对象 = 想看它 —— 信息面板直接打开（与"点对象行"的行为一致）
      setOpenInfo(true)
    },
    [inter, pendOp, runOp],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (inter.kind === 'pending' || inter.kind === 'fill' || inter.kind === 'editor') reset()
      else if (composerOpen) setComposerOpen(false)
      else if (orbStage !== 'closed' || multiOpen) {
        setOrbStage('closed')
        setMultiOpen(false)
      } else reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inter, orbStage, multiOpen, composerOpen, reset])

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

  const busy =
    inter.kind === 'pending' || inter.kind === 'fill' || inter.kind === 'editor'

  /** 编辑器（映射构建器）：两端必须都落在画布节点上 */
  const editorNodes = (() => {
    if (inter.kind !== 'editor') return null
    const [a, b] = inter.picked
    const s = graph.nodes.find((n) => n.id === a)
    const t = graph.nodes.find((n) => n.id === b)
    return s && t ? ([s, t] as const) : null
  })()

  return (
    <div className="app">
      <CanvasView
        graph={graph}
        selectedId={busy ? null : focus}
        onSelect={onNodeClick}
        onBackgroundClick={() => {
          // 编辑器开着时点空白不关它（填了一半的像不该被误触清掉）
          if (inter.kind !== 'editor') reset()
        }}
        onAnchors={onAnchors}
        pickedIds={pickedIds(inter)}
        pickableIds={pickableIds}
      />

      {focusedObj && anchor && !busy && (
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
          value={focusedObj.value}
          onRun={(op) => startOp(op, focusedObj.id)}
        />
      )}

      <div className="dock-topleft" ref={dockTopRef}>
        <ObjectDock
          open={openObjects}
          onToggle={() => setOpenObjects((v) => !v)}
          lineStates={lineStates}
          onRemove={removeLine}
          onSelect={selectFromDock}
        />
        <OpDock
          open={openOps}
          onToggle={() => setOpenOps((v) => !v)}
          lineStates={lineStates}
          onRemove={removeLine}
          onSelect={selectFromDock}
        />
        <InfoDock
          open={openInfo}
          onToggle={() => setOpenInfo((v) => !v)}
          tab={infoTab}
          onTab={setInfoTab}
          node={busy ? null : focusedObj}
          onExtract={extractSubgroup}
        />
      </div>

      <MultiOrb
        open={multiOpen}
        onToggle={() => setMultiOpen((v) => !v)}
        ops={allMultiOps}
        onPick={startMultiOp}
        minLeft={barriers.top}
      />

      <ComposerOrb
        open={composerOpen}
        onToggle={() => setComposerOpen((v) => !v)}
        objects={objects}
        onAdd={(l) => setLines((p) => [...p, l])}
        minLeft={barriers.bottom}
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

      {inter.kind === 'editor' && pendOp && editorNodes && (
        <MapBuilder
          op={pendOp}
          src={editorNodes[0]}
          tgt={editorNodes[1]}
          objects={objects}
          onSubmit={submitEditorLine}
          onCancel={reset}
        />
      )}

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
