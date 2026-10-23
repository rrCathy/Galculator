import { useEffect, useMemo } from 'react'
import { menuLabel, needsEditor } from '../gal/interaction'
import { MECHANISM_LABEL, OPS, opsFor, type OpDef } from '../gal/ops'
import { BENCH_EXCLUDED, BENCH_FAMILIES, BENCH_PLUS, benchArity, familyOps } from '../gal/workbench'
import type { GalObject } from '../gal/types'
import { Tex } from './Tex'

/**
 * **操作表**（U8-a，2026-10-23）—— 回答"这个工具一共能做什么、我要的那个在哪"。
 *
 * ## 为什么需要它（而三条手势入口不够）
 *
 * 径向球 / ⊕ 球 / 拖拽问的全是"**你选中了什么**，它能做什么"。而
 * `pointSet(5)` / `labeledSet(a,b,c)` / `smallGroup(8,3)` 这三条 op
 * **一个对象参数都不吃** —— 三条入口一条都够不着，`pointSet` 这类连"选中后
 * 能做什么"里都不会出现（`CatalogDock` 的文件头就是为这件事写的）。
 *
 * 用户 2026-10-23 拍板形态：**"操作表既然是列表，那不如做成按钮弹出来"** ⇒
 * 右上角一颗按钮开合，居中浮层，`Esc` 关。
 *
 * ## ⚠️ 它**不是**「可用操作清单」的复活
 *
 * `INTERACTION.md:617` 判死过那个东西（"已被悬浮球和多对象球取代"）。两者判据不同：
 *
 * | | 旧的「可用操作清单」 | 本表 |
 * |---|---|---|
 * | 回答 | 选中这个对象**能做什么** | 工具**一共能做什么**、我要的功能在哪 |
 * | 内容 | `opsFor(selection)` 过滤后的子集 | **全量 46 条**，含当前用不了的（标灰 + 说清缺什么）|
 * | 入口 | 常驻面板 | 按需浮层，`Esc` 关 |
 *
 * 所以**必须列出用不了的**：一张"只列能用的"表就退化成第四个球了。
 * 每行的状态由 `opsFor([焦点])` 算（与球菜单**同一个函数**）—— 表里说"现在就能用"的，
 * 点下去一定真的能填；这是「菜单不撒谎」在这张表上的落点。
 *
 * ## 点一行之后发生什么
 *
 * 不在本组件里 —— 交给 App 的 `dispatchOp(op, picked)`，那边的四态分支
 * （pending / fill / editor / 直接执行）是现成的，三条入口共用同一处。
 * 本组件只是**第四个请求方**，不新增执行路径。
 */

/** `＋` 面板那三条（入口真的在那儿）—— 状态列与分组共用这一份 */
const PLUS_IDS = new Set(BENCH_PLUS)

export function OpTable({
  open,
  onClose,
  focused,
  onPick,
}: {
  open: boolean
  onClose: () => void
  /** 当前焦点对象 —— 决定每行"能不能现在就填上" */
  focused: GalObject | null
  /** 点一行：App 那边转给 `dispatchOp`（与球菜单 / 拖拽 / 工作台同一条路） */
  onPick: (op: OpDef) => void
}) {
  /**
   * 分组走**工作台那张任务表**（`BENCH_FAMILIES` / `BENCH_PLUS` / `BENCH_EXCLUDED`），
   * 不用 `opsByMechanism()`。
   *
   * 为什么换：机制分组是**内核视角**（`atomic` / `enumerate`），用户在里面会看到
   * 「共轭作用」落在「原子构造」下 —— 实测截图看着就是错的。而任务表中的分组
   * （造新东西 / 读它的结构 / 作用与集合）与工作台键盘**是同一份**，
   * 用户在两个面看到的位置永远一致；完备性另有 `workbench.ts#assertPartition`
   * 在模块加载时断言（分组 ∪ 排除 = 全部 op），所以这里不必再自查。
   *
   * 后两组是工作台里"按不到键"的那两批：
   *   · `＋` 面板造 —— 实参全是标量，键盘按不出来；
   *   · 归画布 / 不进工作台 —— 关系（拖拽与 ⊕ 球）与纯整数算术。
   * 表里仍要列出来：**"这工具一共能做什么"必须含它们**，否则就是又一张"只列能用的"表。
   */
  const groups = useMemo(() => {
    const byId = new Map(OPS.map((o) => [o.id, o]))
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((o): o is OpDef => !!o)
    return [
      ...BENCH_FAMILIES.map((f) => ({
        key: f.key,
        label: f.label,
        hint: f.hint,
        ops: familyOps(f),
      })),
      {
        key: 'plus',
        label: '＋ 面板造',
        hint: '凭空造：实参全是标量，工作台键盘按不出来',
        ops: pick(BENCH_PLUS),
      },
      {
        key: 'canvas',
        label: '归画布 / 不进工作台',
        hint: '关系类归画布（拖拽与 ⊕ 球）；纯整数算术与群论无关',
        ops: pick(Object.keys(BENCH_EXCLUDED)),
      },
    ].filter((g) => g.ops.length > 0)
  }, [])
  const total = useMemo(() => groups.reduce((n, g) => n + g.ops.length, 0), [groups])

  /**
   * "现在就能用"的那批 —— **`opsFor` 只调一次**（它内部对每条 op 逐个
   * `paramAccepts`，46 条乘一遍不贵，但没必要每行算一次）。
   *
   * ⚠️ `opsFor([])` 返回 `[]`（空选中什么都不列），所以没有焦点时全靠下面
   * `benchArity === 0` 那一档区分"凭空造"。
   */
  const ready = useMemo(
    () => new Set(opsFor(focused ? [focused.value] : []).map((o) => o.id)),
    [focused],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* 遮罩：点空白处关（与 `.settings-menu` 同一套做法） */}
      <div className="optable-scrim" onClick={onClose} aria-hidden="true" />
      <div className="optable" role="dialog" aria-modal="true" aria-label="操作表">
        <header className="optable-head">
          <div className="optable-head-main">
            <span className="optable-title">操作表</span>
            <span className="optable-sub">
              {total} 条 - 按任务分组 - 点一行就开始（用不了的会标出来）
            </span>
          </div>
          {/* 右侧两件套在一层里：没有焦点时 `Esc` 也要靠右，不能跟着副标跑 */}
          <div className="optable-head-right">
            {focused && (
              <span className="optable-focus" title="每行的状态按它算：能填就是能填">
                焦点 <b>{focused.id}</b>
              </span>
            )}
            <button className="optable-close" onClick={onClose} title="关掉（Esc）">
              Esc
            </button>
          </div>
        </header>

        <div className="optable-body">
          {groups.map((g) => (
            <section key={g.key} className="optable-group">
              <div className="optable-group-head" title={g.hint}>
                <span className="optable-group-label">{g.label}</span>
                <span className="count">{g.ops.length}</span>
              </div>
              {g.ops.map((op) => {
                const can = ready.has(op.id)
                const need = benchArity(op)
                /**
                 * "＋ 面板造"的判据是**它在那三条名单里**（`BENCH_PLUS`），
                 * 不是 `benchArity === 0`。两者不等价：
                 * `gcd(12, 18)` / `phi(n)` 这类纯算术也是 0 个对象，
                 * 但它们的入口是**输入框**，跟 `＋` 面板（只有造点集 / 按标号造 / 造结构三个表单）
                 * 毫无关系 —— 第一版用 arity 判，9 行都写着"＋ 面板造"，是撒谎。
                 */
                const buildOnly = PLUS_IDS.has(op.id)
                const arithOnly = !buildOnly && need === 0
                /**
                 * 状态文案的三档（**没有焦点是单独一档**）。
                 *
                 * 用户打开这张表时，问的通常不是"用当前焦点能做什么"，而是"**我能开始做什么**"。
                 * 空画布 / 没焦点时若一律写"还要 2 个对象"，整表就是一片灰、像全不可点 ——
                 * 而实际上**点了就能进 pending 去选对象**（`dispatchOp(op, [])` 的既有行为）。
                 * 所以那一档要写"点它开始"，把这层因果说出来。
                 */
                const state = can
                  ? needsEditor(op)
                    ? '要填表'
                    : '现在能用'
                  : buildOnly
                    ? '＋ 面板造'
                    : arithOnly
                      ? '输入框敲'
                      : focused
                        ? `还差 ${need} 个对象`
                        : `选 ${need} 个对象`
                return (
                  <button
                    key={op.id}
                    className={`optable-row${can ? ' on' : ''}`}
                    data-op={op.id}
                    data-state={can ? 'ready' : buildOnly ? 'build' : 'need'}
                    onClick={() => onPick(op)}
                    title={`${op.doc}\n照这个敲：${op.notation}\n内核机制：${MECHANISM_LABEL[op.mechanism]}`}
                  >
                    <span className="optable-name">{menuLabel(op)}</span>
                    {/*
                     * 记号走 KaTeX（`A \cap B` / `G \rtimes H` 里的符号键盘打不出来），
                     * 纯文本面（title / 状态）只写 ASCII —— 与 `no-unicode-leak` 同一条纪律。
                     */}
                    <code className="optable-sig">
                      <Tex tex={op.notation} />
                    </code>
                    <span
                      className={`optable-state${can ? ' ready' : buildOnly ? ' build' : ''}`}
                    >
                      {state}
                    </span>
                  </button>
                )
              })}
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
