import { useEffect, useMemo, useState } from 'react'
import { INFO_SECTIONS, SectionBody, sectionSummary, STRUCT_SECTIONS, type InfoTab } from './InfoDock'
import { STRUCTURE_LEVEL_LABEL } from '../gal/algebra'
import { subgroupClassCount } from './infoHelpers'
import { TexOrText } from './Tex'
import type { GalObject } from '../gal/types'
import type { GalValue, NormalizedSubgroup } from '../gal/value'
import { homeOf } from '../gal/value'
import type { OpDef } from '../gal/ops'
import { maxObjectArity } from '../gal/compose'
import { canPick, PARAM_LABEL } from '../gal/interaction'
import { BENCH_FAMILIES, benchArity, familyOps } from '../gal/workbench'
import type { Group } from '@groupviz/core'
import { isKnownGroup } from '../gal/known'

/**
 * **工作台**（P1，2026-10-05）—— 从**底部升起**的一个框，画布当背景。
 *
 * ## 形态（用户定的原话）
 *
 * 「工作台应该是从底部弹出的框，并且能在底部收起，交换图画布充当背景。」
 *
 * 两条硬约束：
 *   · **画布不重排** —— 面板 `position: absolute` 浮在画布上（`INTERACTION` §5
 *     「画布不给抽屉让位」），升起时 `CanvasView` 的尺寸与格点布局**一行都不改**。
 *     这与"三栏并排"是根本不同的事：后者把宽度切掉。
 *   · **收起要贴着它来的那条边** —— 收起后剩一条贴底的胶囊（点它落回去），
 *     位置与展开时一致，不"跳到别处"。
 *
 * ## 它装什么：**两件事，缺一不可**
 *
 * ⚠️ **第一版只装了第二件，把它做成了一个换了位置的信息面板。** 用户当场追问：
 * 「什么叫得选对象才能用工作台？那叫什么工作台？我创建了一个集合，这个工作台怎么只能看？
 *   工作台难道不就是用来放什么添加群结构之类的功能吗？」
 *
 * | | 是什么 | 什么时候需要 |
 * |---|---|---|
 * | **任务栏**（左） | **36 个功能按钮**，按"用户要做什么"分 7 族（`gal/workbench.ts`）：给集合加结构、群同态、群作用、半直积、自同构、共轭类…… | **不需要选中任何对象** |
 * | **细节区**（右） | 焦点对象的结构细节（元素表 / 子群表 / 运算表 / 公理档案） | 选了对象之后 |
 *
 * 两件事**互不依赖**：没选对象时任务栏照常可用（点一条就进 pending 去画布点参数），
 * 选了对象时细节区自动有内容。所以标题条**不再需要焦点对象**才显示任何东西。
 *
 * ## 为什么任务栏是"常驻清单"而不是"球菜单"
 *
 * ⊕ 球菜单（`multiOps`）是**全局**的，但要点开那颗球、再在卫星里找 —— 而球的位置
 * 跟着输入球走，用户想"加个结构"时未必想到要去点球。工作台是常驻在屏幕下沿的一条，
 * **抬眼就看见全部能力** —— 这是"工作台"与"菜单"的本质差别。
 */

export interface WorkbenchProps {
  open: boolean
  onToggle: () => void
  /** 发起一条 op（与球菜单 / 拖拽 / 目录共用同一条路，见 `App.tsx#dispatchOp`）*/
  onRunOp: (op: OpDef) => void
  /** 焦点对象（与 `InfoDock` 同一个）*/
  node: GalObject | null
  /**
   * **正在等对象的那条 op**（`inter.kind === 'pending'`）。
   *
   * ⚠️ 这是 2026-10-05 自查补的，修的是一个**结构性卡死**：
   * 工作台里发起二元操作（如 `semidirectProduct(N, H)`）⇒ 提示"去画布点 N"
   * ⇒ **而画布节点全被工作台盖住**（工作台 `top≈380`、节点自动布局在 `y≈450`）
   * ⇒ 点不动、pending 永远挂着。真机截图里 pending 条让用户"去画布点对象"，
   * 而画布上一个节点都看不见。
   *
   * ⇒ 工作台必须**自己能把对象填进槽位**，不依赖画布。
   */
  pending?: { op: OpDef; picked: string[] } | null
  /** 全部对象（槽位候选的来源）*/
  objects: GalObject[]
  /**
   * 把某个对象**填进当前槽位** —— 直接复用画布点击那条路（`App.tsx#onNodeClick`）。
   *
   * 刻意不新写一套"填槽位"逻辑：点画布节点与点槽位候选**在语义上是同一件事**
   * （"用这个对象"），各写一份必然分家（这个项目反复栽的"判据散多份"）。
   */
  onPick: (id: string) => void
  /**
   * **编辑器卡片开着吗**（映射 / 作用 / 运算表那三张）。
   *
   * ⚠️ 它们是**贴底居中**的浮层（P0-1），而工作台也贴底 ⇒ 两者重叠，
   * 编辑器卡片 z-index 18 压在工作台上（真机截图：编辑器把「任务栏右半」盖掉一半）。
   * ⇒ 开着编辑器时工作台**只留任务栏那一半**，细节区让位。
   * 任务栏留着是故意的：用户改主意要点别的操作时不必先关编辑器。
   */
  editorBusy?: boolean
  onExtract?: (sub: NormalizedSubgroup) => void
  /** 视口尺寸（算升起高度用；不给就按 CSS 的 max-height 走）*/
  viewportH?: number
}

/** 升起的最大高度（视口的百分之几）。CSS 里另有 `max-height` 兜底。 */
const MAX_H_RATIO = 0.52

export function Workbench({
  open,
  onToggle,
  onRunOp,
  node,
  pending,
  objects,
  onPick,
  editorBusy,
  onExtract,
  viewportH,
}: WorkbenchProps) {
  /*
   * 哪几节摊开：**默认全摊**（这正是工作台与抽屉的差别 —— 抽屉默认全收）。
   * 用户可以点标题收掉某节；换对象时回到"全摊"。
   */
  const [closed, setClosed] = useState<Set<InfoTab>>(new Set())
  /**
   * 哪几族的任务栏折起来了。
   *
   * ⚠️ 默认**全折**，不是为了省地方，是为了让抬眼的第一眼是「7 类 / 加结构 · 同态 · 作用 · …」
   * 而不是 36 个记不住的英文函数名。族名是**用户要做什么**，族里的按钮才是记号。
   */
  const [famOpen, setFamOpen] = useState<Set<string>>(new Set())

  const group: Group | null = node?.value.type === 'group' ? node.value.group : null
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

  /*
   * ⚠️ **升起不再依赖有没有选中对象**（第一版的错就在这里）。
   * 细节区自己按 `homeOf` 决定给不给内容；任务栏永远在。
   */
  const showDetail = !editorBusy && !!node && homeOf(node.value) === 'bench'
  /*
   * ⚠️ **`pending` 也算"有内容"**（T1）：槽位区不需要焦点对象 ——
   * 用户很可能在空画布上先点操作、再选对象（这正是工作台该支持的方向）。
   * 第一版只写了 `!!node` ⇒ pending 且无焦点时工作台**不升起**、槽位区看不见。
   */
  const hasContent = open && (!!node || !!pending)

  /*
   * **槽位候选**（T1，2026-10-05）。
   *
   * 判据用 `canPick` —— 与"画布上点节点"**同一个函数**（见 `App.tsx#pickableFor` 的
   * 那段注释：`canPick` 复用的就是 `opsFor` 的匹配规则）。所以工作台列出的候选
   * **与画布上高亮的可点节点完全一致**，不会出现"这里说能选、点下去报错"。
   */
  const slotIdx = pending ? pending.picked.length : 0
  const pickedVals = useMemo<GalValue[]>(
    () =>
      pending
        ? pending.picked
            .map((id) => objects.find((o) => o.id === id)?.value)
            .filter((v): v is GalValue => !!v)
        : [],
    [pending, objects],
  )
  const cands = useMemo(
    () =>
      pending
        ? objects.filter(
            (o) => !pending.picked.includes(o.id) && canPick(pending.op, slotIdx, pickedVals, o.value),
          )
        : [],
    [pending, objects, slotIdx, pickedVals],
  )

  /**
   * 按钮角标：这个操作要几个对象 / 是不是要填表。
   *
   * ⚠️ 判据是 `benchArity`（**与 `objectArity` 同源**，见 `gal/workbench.ts`）——
   * 标一个"1 个对象"却要用户点两个，比不标更坏。
   */
  const howOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of BENCH_FAMILIES) {
      for (const op of familyOps(f)) {
        const a = benchArity(op)
        m.set(op.id, op.editor ? '填表' : a === 0 ? '直接算' : a === 1 ? '1 个对象' : `${a} 个对象`)
      }
    }
    return m
  }, [])

  return (
    <section
      className={`bench${open ? ' open' : ''}${hasContent ? ' risen' : ''}`}
      style={bodyH ? { maxHeight: `${bodyH}px` } : undefined}
      data-node={node?.id ?? ''}
    >
      {/*
        标题条 = 收起后那条胶囊。**贴着底**（CSS 里 `bottom: 52px`，输入球正上方），
        所以点它落回去时位置不变 —— 收起 / 展开是同一根轴上的两个位置。
      */}
      <header className="bench-head">
        <button className="bench-toggle" onClick={onToggle} title={open ? '收起工作台' : '展开工作台'}>
          <span className="bench-caret">{open ? 'v' : '^'}</span>
          <span className="bench-title">工作台</span>
          {/* 收起态也要说清"它能干什么"，否则一条光秃秃的胶囊没人敢点 */}
          {!open && <span className="bench-peek">7 类 36 个操作：加结构 / 同态 / 作用 / 半直积 / 自同构 / 共轭类</span>}
        </button>
        {node && <span className="bench-target">{node.id}</span>}
      </header>

      {open && (
        <div className="bench-body">
          {/* ── 左：任务栏（常驻，不需要选中任何对象）────────────── */}
          <nav className="bench-tasks" aria-label="工作台任务">
            {BENCH_FAMILIES.map((f) => {
              const isOpen = famOpen.has(f.key)
              const ops = familyOps(f)
              return (
                <section key={f.key} className={`bench-fam${isOpen ? ' open' : ''}`}>
                  <button
                    className="bench-fam-head"
                    onClick={() =>
                      setFamOpen((prev) => {
                        const next = new Set(prev)
                        if (next.has(f.key)) next.delete(f.key)
                        else next.add(f.key)
                        return next
                      })
                    }
                  >
                    <span className="bench-fam-caret">{isOpen ? 'v' : '>'}</span>
                    <span className="bench-fam-label">{f.label}</span>
                    <span className="bench-fam-n">{ops.length}</span>
                  </button>
                  {isOpen && (
                    <>
                      <p className="bench-fam-hint">{f.hint}</p>
                      <div className="bench-fam-ops">
                        {ops.map((op) => (
                          <button
                            key={op.id}
                            className={`bench-op${op.editor ? ' ed' : ''}`}
                            onClick={() => onRunOp(op)}
                            title={op.doc}
                          >
                            <span className="bench-op-name">{op.notation}</span>
                            <span className="bench-op-how">{howOf.get(op.id) ?? ''}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              )
            })}
          </nav>

          {/* ── 右：细节区（选中对象才有内容）──────────────────── */}
          <div className={`bench-detail${editorBusy ? ' busy' : ''}`}>
            {editorBusy ? (
              <p className="bench-blank">
                正在填一张表（下面那张卡片就是）。
                <br />
                填完提交，或者点它右上角的 x 取消 —— 左边这 7 类随时可以改主意。
              </p>
            ) : pending ? (
              /*
               * **对象槽位**（T1）—— 工作台自己把参数对象凑齐，**不依赖画布**。
               *
               * 为什么必须有它（真机复现过）：工作台升起时 `top≈380`，
               * 而画布节点自动布局在 `y≈450` ⇒ **全被盖住**。于是
               * "点一条二元操作 → 按提示去画布点对象" 这条主路径**走不通**：
               * pending 条让用户去画布点，画布上一个节点都看不见。
               * ⇒ 槽位区就是那条路的工作台版本。
               */
              <div className="bench-slots">
                <div className="bench-slot-head">
                  正在选对象：<code>{pending.op.notation}</code>
                  <span className="bench-slot-hint">（在下面点，不用去画布）</span>
                </div>
                <div className="bench-slot-list">
                  {Array.from({ length: Math.max(maxObjectArity(pending.op), slotIdx) }).map((_, i) => {
                    const id = pending.picked[i]
                    const obj = id ? objects.find((o) => o.id === id) : null
                    const p = pending.op.params[i]
                    return (
                      <div
                        key={i}
                        className={`bench-slot${obj ? ' filled' : i === slotIdx ? ' want' : ''}`}
                      >
                        <span className="bench-slot-n">{i + 1}</span>
                        {obj ? (
                          <>
                            <span className="bench-slot-id">{obj.id}</span>
                            <span className="bench-slot-def">{obj.def}</span>
                          </>
                        ) : (
                          <span className="bench-slot-want">
                            待选{p ? `：${p.name}（${PARAM_LABEL[p.type]}）` : ''}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {cands.length === 0 ? (
                  <p className="bench-blank">
                    画布上还没有能填这一位的对象 —— 先造一个（左栏「目录」或输入球）。
                  </p>
                ) : (
                  <>
                    <div className="bench-cands-title">点一下填进第 {slotIdx + 1} 位：</div>
                    <div className="bench-cands-list">
                      {cands.map((o) => (
                        <button key={o.id} className="bench-cand" onClick={() => onPick(o.id)}>
                          <span className="bench-cand-id">{o.id}</span>
                          <span className="bench-cand-def">{o.def}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : !node ? (
              <p className="bench-blank">
                左边 7 类操作，<b>点一条就能开始</b>，不用先选中什么。
                <br />
                选一个对象（画布上点节点，或左栏点对象行），这里摊开它的结构细节。
              </p>
            ) : !showDetail ? (
              <p className="bench-blank">
                <code>{node.id}</code> 是
                {node.value.type === 'map'
                  ? '一条映射 —— 画布上那根箭头就是它'
                  : node.value.type === 'action'
                    ? '一个作用 —— 画布上那条作用线就是它'
                    : node.value.type === 'relation'
                      ? '一条关系边 —— 画布上那条线就是它'
                      : '一条边 —— 画布上那条线就是它'}
                ，答案在画布上。左边选一个操作继续。
              </p>
            ) : sections ? (
              <div className="info-acc">
                {sections.map((t) => {
                  const isClosed = closed.has(t.id)
                  return (
                    <section key={t.id} className="info-sec">
                      <div className={`info-sec-head${isClosed ? '' : ' on'}`}>
                        <span className="info-sec-label">{t.label}</span>
                        {t.id === 'axioms' && struct ? (
                          <span className="info-sec-sum">{STRUCTURE_LEVEL_LABEL[struct.axioms.level]}</span>
                        ) : t.id === 'table' && struct ? (
                          <span className="info-sec-sum">
                            {struct.carrier.length > 0 ? `${struct.carrier.length} x ${struct.carrier.length}` : ''}
                          </span>
                        ) : showGroup &&
                          (t.id === 'basic' || t.id === 'elements' || t.id === 'conj' || t.id === 'subgroups') ? (
                          /* `sectionSummary` 的 id 窄成那四档（`axioms`/`table` 各有自己的摘要，
                             上面两行已单独处理）—— 保持同样的窄化，不去改它的签名 */
                          <span className="info-sec-sum">{sectionSummary(t.id, showGroup, subCount)}</span>
                        ) : null}
                        <button
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
                          {isClosed ? '展开' : '收起'}
                        </button>
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
        </div>
      )}
    </section>
  )
}