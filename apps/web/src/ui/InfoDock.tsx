import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  isGroupCyclic,
  isNilpotent,
  isSimpleGroup,
  isSolvable,
  listCosetStripSubgroups,
  subgroupFromElementIds,
  subgroupStructureSymbol,
  type Group,
} from '@groupviz/core'
import { ACTION_KIND_LABEL, VALUE_TYPE_LABEL, type NormalizedSubgroup } from '../gal/value'
import { actionInsights, groupInsights, mapInsights, type Insight } from '../gal/insights'
import { RELATION_LABEL, relationsFor, type Relation } from '../gal/relations'
import { STRUCTURAL_LABEL } from '../gal/derive'
import { menuLabel } from '../gal/interaction'
import { elementNotation, opTemplate, type OpDef } from '../gal/ops'
import { prettySymbol } from '../gal/pretty'
import { chainText, factorsText, STRUCTURE_CAP, structureFacts } from '../gal/structure'
import { Tex, TexList, TexOrText } from './Tex'
import { ElementsTable } from './ElementsTable'
import { DockPanel } from './DockPanel'
import type { GalEdge, GalObject, StructuralEdge } from '../gal/types'

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
  edge,
  table,
  onExtract,
  onCorrespond,
  singleOps = [],
  onRunOp,
}: {
  open: boolean
  onToggle: () => void
  tab: InfoTab
  onTab: (t: InfoTab) => void
  /** 焦点**对象**——不限于节点：映射只画箭头，但同样有信息可看 */
  node: GalObject | null
  /**
   * 焦点是一条**结构伴生边**（缺口 ⑧）——`π` / `π_1` / `↪` / `=` / `≅`。
   *
   * 与 `node` **互斥**：一条边要么背后有对象（那是 `node`），要么只有结构身份
   * （那是这里）。它只回答"这条箭头是什么、账是多少"——不列可做的操作
   * （它不是对象，列出来的按钮点了必然报错）。
   */
  edge?: { edge: GalEdge; info: StructuralEdge } | null
  /** 当前对象表（关系层要在里面找"谁包含我 / 我包含谁"）*/
  table: GalObject[]
  /**
   * 「取出为对象」：把列表里的一个成员变成一行定义。
   *
   * 列表（子群集）不上画布，但它是**入口**不是终点——DIAGRAM_SPEC §3：
   * "能作为某个映射的源或靶的，才配当顶点"，而子群集里的每一项**本身**就是子群。
   */
  onExtract?: (sub: NormalizedSubgroup) => void
  /**
   * 「看对应」：把这个**正规**子群与商群的对应定理（第四同构定理）摆到浮层上。
   *
   * 入口必须挂在这里 —— 用户在子群列表里看到 `V₄ ⊴ S₄` 这一行，"它和商群怎么对应"
   * 就是下一个自然的问题，而这一行正是他目光所在。
   */
  onCorrespond?: (nIds: string[]) => void
  /**
   * 「可做」那一行（第四批，缺口 ⑤）。
   *
   * **不上画布的对象没有悬浮球**（球挂在节点/箭头上）——于是 `Syl_p(G)` 这种
   * 子群集**根本点不出操作**，`Syl → 底集 → 共轭作用在` 那条链中间只能打字。
   * 把单对象操作摆在信息面板里，就补上了这个入口（同一个 `singleOpsFor`，零新机制）。
   */
  singleOps?: OpDef[]
  onRunOp?: (op: OpDef) => void
}) {
  const group = node && node.value.type === 'group' ? node.value.group : null

  // 结论层：这个对象"所以呢"——同构于什么 / 第一同构定理在这里具体是什么
  const insights = useMemo<Insight[]>(() => {
    const v = node?.value
    if (!v) return []
    // 传 node：结论层要看**这个对象是怎么来的**（手写记号 / 由操作构造）
    if (v.type === 'group') return groupInsights(v.group, node ?? undefined)
    if (v.type === 'map') return mapInsights(v.map)
    // 作用：轨道分解 + （Sylow III）n_p 的三条等式 —— MVP 的落点
    if (v.type === 'action') return actionInsights(v.action)
    return []
  }, [node])

  // 关系层：它落在哪个群里 / 它包含谁 / 它对谁正规 / 谁由它而来
  const relations = useMemo<Relation[]>(() => (node ? relationsFor(node, table) : []), [node, table])

  return (
    <DockPanel
      title="信息"
      open={open}
      onToggle={onToggle}
      bodyWidth={298}
      bodyClass={node ? 'info-split' : undefined}
    >
      {!node && !edge && <div className="empty">点画布上的对象，看它的信息</div>}

      {edge && <EdgeSection edge={edge} />}

      {node && (
        <>
          {/*
            摘要区（对象 / 结论 / 关系 / 可做）与 tab 区**上下分区**。
            —— 2026-09-30 用户第三次报元素列表：「你不会不知道信息栏有限高吧，
            关系条目太多给元素列表挤没了不知道？」

            实测（1500×950，点 S₄ 的 A₄）：面板高 540px，摘要区一路吃到底 ——
            info-target 19 + 结论 129 + **关系 199（2 条）** + 可做 95 = 442，
            「元素 / 子群」两个 tab 的按钮落到 top 502，元素表只剩 **38px** 可视
            （还被 flex 压扁，不是裁切）。分区之后：摘要区封顶 240px 自己滚，
            tab 区 **flex: 1 0 auto**（不许被压缩）拿剩下的全部，tabs 钉在区顶。

            之前只想治"表太宽"（24 行折成 5 行）是治错了地方 —— 表本身没问题，
            是**它够不到的可视高度**被上面的东西吃光了。
          */}
          <div className="info-brief">
            <div className="info-target">
              <span className={`chip chip-${node.value.type}`}>
                {VALUE_TYPE_LABEL[node.value.type]}
              </span>
              <strong>
                <TexOrText text={node.label} />
              </strong>
              <span className="info-def">
                {node.id} = <TexOrText text={node.def} />
              </span>
            </div>

            {insights.length > 0 && (
              <div className="insights">
                {insights.map((ins, i) => (
                  <div key={i} className={`insight insight-${ins.tone}`}>
                    <span className="insight-label">{ins.label}</span>
                    <div className="insight-body">
                      <Tex tex={ins.tex} />
                      {ins.detail && <div className="insight-detail">{ins.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {relations.length > 0 && (
              <div className="relations">
                <div className="rel-head">关系</div>
                {relations.map((r, i) => (
                  <div key={i} className={`rel rel-${r.kind}`}>
                    <span className="rel-tag">{RELATION_LABEL[r.kind]}</span>
                    <div className="rel-body">
                      {r.tex ? (
                        <Tex tex={r.tex} />
                      ) : (
                        <span className="rel-text">
                          <TexOrText text={r.text} />
                        </span>
                      )}
                      {r.detail && (
                        <div
                          className="rel-detail"
                          // 原始形态（`\trianglelefteq S_4 \cdot 指数[S_4:K] = 24/4=6`）——
                          // 走查与断言读它（DOM 文本是 KaTeX **渲染后**的，比不了源码串）
                          data-detail={r.detail}
                        >
                          <TexOrText text={r.detail} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {/*
                  这句话是 U18 那条教训的延伸：子群列表只列**共轭类代表**会被读成"全部"，
                  关系层只列**表里已经建出来的对象**同样会被读成"全部关系"。
                  边界写清楚，比多列两行更有用。
                */}
                {relations.some((r) => r.kind === 'subgroup' || r.kind === 'contains' || r.kind === 'equal') && (
                  <div className="rel-note">
                    只列「已经建出来」的对象之间能确定的关系；要看全部子群 / 正规子群，用「子群」tab 或
                    Sub(G) / 正规子群(G)。
                  </div>
                )}
              </div>
            )}

            {/* 「可做」：这个对象能立刻做的单对象操作。**不上画布的对象只有这一条入口** */}
            {onRunOp && singleOps.length > 0 && (
              <div className="info-ops">
                <span className="info-ops-head">可做</span>
                {singleOps.slice(0, 8).map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    className="info-op"
                    title={`${op.notation} ---- ${op.doc}`}
                    onClick={() => onRunOp(op)}
                  >
                    {menuLabel(op)}
                  </button>
                ))}
                {singleOps.length > 8 && (
                  <span className="info-ops-more">...还有 {singleOps.length - 8} 个（点对象旁的球看全部）</span>
                )}
              </div>
            )}
          </div>

          {/* tab 区：tab 头钉住，内容自己滚 */}
          <div className="info-panel">
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
                <div className="info-panel-body">
                  {tab === 'basic' && <BasicTab group={group} node={node} />}
                  {tab === 'elements' && <ElementsTable group={group} />}
                  {tab === 'subgroups' && (
                    <SubgroupsTab group={group} onCorrespond={onCorrespond} />
                  )}
                </div>
              </>
            ) : (
              <div className="info-panel-body">
                <OtherTab node={node} onExtract={onExtract} />
              </div>
            )}
          </div>
        </>
      )}
    </DockPanel>
  )
}

/**
 * 「这条箭头」—— 点一条**结构伴生边**时看到的（缺口 ⑧）。
 *
 * 从前这些线是**点不动的**：画布上 `π : G ↠ G/N`、`N ↪ G`、`G/ker φ ≅ im φ`
 * 明明画着，想知道"这根箭头到底是什么、核是谁、指数多少"却只能自己去面板里翻
 * —— 而且多半翻不到，因为伴生箭头根本没有对象。
 *
 * 这一节只回答两件事：**它是什么**（类型 + 一句话）与**账是多少**（就地算的）。
 * 底下那句边界是必须的（U18/U19 的教训）：它不是一等对象，别让人以为
 * "能点 = 能用"。要能引用、能删、能进证明的包含，请自己写一行。
 */
function EdgeSection({ edge }: { edge: { edge: GalEdge; info: StructuralEdge } }) {
  const { edge: e, info } = edge
  return (
    <>
      <div className="info-target">
        <span className="chip chip-structural">结构箭头</span>
        {/* 原始形态（`from|label|to`）—— 走查读它，DOM 文本是 KaTeX 渲染后的 */}
        <strong className="edge-target" data-edge-kind={info.kind} data-pair={`${info.from}|${e.label ?? ''}|${info.to}`}>
          <TexOrText text={info.from} />
          {e.label && <Tex tex={e.label} />}
          <TexOrText text={info.to} />
        </strong>
        <span className="info-def">{STRUCTURAL_LABEL[info.kind]}</span>
      </div>

      <div className="edge-doc">{info.doc}</div>

      {info.facts.length > 0 && (
        <div className="edge-facts">
          {info.facts.map((f, i) => (
            <div key={i} className="insp-row">
              <span className="insp-k">{f.k}</span>
              <span className="insp-v">
                <TexOrText text={f.v} />
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="rel-note">
        这条箭头是操作的伴生（由某个操作顺手长出来的），不是一等对象：
        它不能当参数、也不列可做的操作。要一条能引用、能删、能进证明的包含，
        自己写一行「R = 包含(A, B)」。
      </div>
    </>
  )
}

/**
 * 「基本」tab：**属性清单**。
 *
 * 这里**不再**放"识别"行。原来那一行读的是 `group.isoSymbol`，而那个字段只有
 * **从小群库建出来的群**才有 —— `createGroupFromSymbol` / `buildSubgroupGroup` 造的
 * 实测一律 `undefined`，所以那一行**基本是死代码**（只有库群才亮）。
 * 识别结果现在统一由上面的结论层说（`groupInsights`，带 SmallGroup 编号与惯用名），
 * 这里不重复。
 */
function BasicTab({ group, node }: { group: Group; node: GalObject }) {
  const info = useMemo(() => {
    const small = group.order <= ENUM_CAP
    return {
      cyclic: isGroupCyclic(group),
      simple: small ? isSimpleGroup(group) : null,
      solvable: small ? isSolvable(group) : null,
      nilpotent: small ? isNilpotent(group) : null,
    }
  }, [group])

  return (
    <>
      <Row k="阶">
        <span>|G| = {group.order}</span>
      </Row>
      <Row k="生成元">
        {group.generators.length > 0 ? (
          // core 的生成元符号是 **TeX**（`\sigma_{12}` / `\alpha_{2}`），
          // 原样贴出来就是反斜杠；必须过一遍 KaTeX
          <TexList items={group.generators.map((g) => g.symbol)} />
        ) : (
          <span>--</span>
        )}
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
      <StructureSection group={group} />
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

/**
 * 「结构」节（U27）—— 完美 / 合成列 / 导来列 / 半直积分解。
 *
 * 这四件事 `docs/TASKS.md` 的缺口清单里都有（②③④⑤⑥⑧），而在 core 里**全是现成原语**
 * （`computeSubgroupSeries` / `findSemidirectDecompositions` / `isPerfect`）——缺的只是接线。
 * 接在这里而不是结论层/操作的原因有两条：
 *
 *   ① **它是"属性"不是"一眼"**：结论层一条一行说"同构于谁"，而这里是一节四行 + 附注；
 *   ② **成本要自己兜住**：半直积分解要枚举子群（实测 S₅ 3 秒、A₅ 70ms、C₃³ 217ms）——
 *      结论层在选中对象的瞬间计算，扛不住；放在「基本」tab 里、自己带阶上限（`STRUCTURE_CAP`）
 *      并缓存（key 带元素 id 指纹，U26 的纪律），才既不卡操作、又不假装算得完。
 *
 * 超限时**明说没算**（`data-structure="capped"`），不显示半截答案。
 */
function StructureSection({ group }: { group: Group }) {
  const facts = useMemo(() => structureFacts(group), [group])

  if (!facts) {
    return (
      <div className="insp-line dim" data-structure="capped">
        |G| &gt; {STRUCTURE_CAP}：合成列 / 结构分解未自动计算（子群枚举代价高）
      </div>
    )
  }

  const comp = facts.composition
  const der = facts.derived
  const dec = facts.decomposition

  return (
    <div className="structure" data-structure="facts">
      <div className="rel-head">结构</div>

      <Row k="完美">
        <span data-perfect={facts.perfect ? '1' : '0'}>
          {facts.perfect ? '是（G = [G, G]）' : '否'}
        </span>
      </Row>

      {comp && comp.factors.length > 0 && (
        <Row k="合成列">
          <span className="insp-stack">
            {/* `data-factors` 放**原始形态**（断言的锚点）；DOM 文本是 KaTeX 渲染后的 */}
            <span data-factors={factorsText(comp.factors)}>
              <Tex tex={comp.factors.join(' \\cdot ')} />
            </span>
            <span className="insp-sub-note">
              {comp.alternativeCount > 1
                ? `合成列不唯一：本例共 ${comp.alternativeCount} 条，但因子多重集唯一（若尔当-赫尔德）`
                : `因子多重集唯一（若尔当-赫尔德）：合成列只有这一条`}
            </span>
          </span>
        </Row>
      )}

      {der && (
        <Row k="导来列">
          <span className="insp-stack">
            <span data-derived={chainText(der.orders)}>
              <Tex tex={der.orders.join(' \\triangleright ')} />
            </span>
            <span className="insp-sub-note">
              {der.reachesTrivial ? '降到底 {e}：这就是「可解」' : '没有降到底（不可解）'}
            </span>
          </span>
        </Row>
      )}

      {dec && (
        <Row k="分解">
          <span className="insp-stack">
            <span
              data-decomp={`${prettySymbol(dec.normal)} ${dec.trivialAction ? '\\times' : '\\rtimes'} ${prettySymbol(dec.acting)}`}
              data-decomp-kind={dec.kind}
            >
              <Tex
                tex={`${dec.normal} \\${dec.trivialAction ? 'times' : 'rtimes'} ${dec.acting}`}
              />
            </span>
            <span className="insp-sub-note">
              已重建验证（得到 {prettySymbol(dec.rebuilt)}）
              {dec.otherVerified > 0 ? `；同类候选另有 ${dec.otherVerified} 条` : ''}
            </span>
          </span>
        </Row>
      )}

      {!dec && facts.indecomposableReason && (
        <Row k="分解">
          <span className="insp-stack" data-decomp="none">
            <span>不可分解</span>
            <span className="insp-sub-note">{facts.indecomposableReason}</span>
          </span>
        </Row>
      )}
    </div>
  )
}

/** 「子群」tab 里的一行 = **一个共轭类**（同构类的成员）。 */
type CosetSub = ReturnType<typeof listCosetStripSubgroups>[number] & {
  /** 代表子群的生成元记号（`\langle s, r_2\rangle`）*/
  repr: string
  /** 同构类的钥匙（结构符号，拿不到就退化成阶）*/
  structKey: string
}

function SubgroupsTab({
  group,
  onCorrespond,
}: {
  group: Group
  onCorrespond?: (nIds: string[]) => void
}) {
  /**
   * 共轭类代表那一行里"**它是谁**"（生成元）—— 2026-09-30 用户反馈：
   * "3、群的子群列表里，重复的子群太多了吧。"
   *
   * 实测病征（`D_4`）：6 行里有**三行逐字相同** —— `C_2 |H|=2 [G:H]=4`。
   * 它们**互不共轭**（数学上确实该分行）却**同构**，界面上一个区分信息都没有；
   * `S_4` 里 `C_2` 同样有两行如此。补上代表子群（`⟨s⟩` / `⟨sr1⟩` / `⟨r2⟩`），
   * 三行立刻分得开 —— 而且给的是**那个子群本身**，不是又一层抽象。
   */
  const reprLabel = (elementIds: string[]): string => {
    const sub = subgroupFromElementIds(group, elementIds)
    const gens = (sub?.generators ?? []).filter((g) => g.id !== group.identity.id)
    if (gens.length === 0) return '{e}'
    return `\\langle ${gens.map((g) => elementNotation(group, g)).join(', ')}\\rangle`
  }

  const subs = useMemo(() => {
    if (group.order > ENUM_CAP) return null
    return listCosetStripSubgroups(group).map((s) => ({
      ...s,
      repr: reprLabel(s.elementIds),
      /** 同构类的钥匙 —— 结构符号（拿不到就退化成阶）*/
      structKey: s.structure ?? `阶 ${s.order}`,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group])

  /**
   * 按**同构类**分组（2026-09-30 用户第二个反馈："1、我的子群去重呢？"）。
   *
   * `listCosetStripSubgroups` 给的是**共轭类代表**（数学上对：`S_4` 的 9 行
   * 是 9 个共轭类）。但对着一张表读，同构而不共轭的两类（`C_2` 的换位类 ×6 与
   * 双对换类 ×3、`C_2×C_2` 的非正规 ×3 与正规 V₄）**只列符号就是"重复"**
   * ——U39 已经说过这条，当时等用户拍板；现在拍板了：**先折同构类，再摊共轭类**。
   *
   * 折叠后 `S_4` 是 7 组（`A_4 ×1 · D_4 ×3 · D_3 ×4 · C_2×C_2 ×4 · C_4 ×3 ·
   * C_3 ×4 · C_2 ×9`），组头一眼就是"这个群里有哪些**种类**的子群、各多少个"。
   */
  const groups = useMemo(() => {
    if (!subs) return []
    const m = new Map<
      string,
      { key: string; symbol: string; order: number; total: number; normal: boolean; rows: CosetSub[] }
    >()
    for (const s of subs) {
      let g = m.get(s.structKey)
      if (!g) {
        g = {
          key: s.structKey,
          symbol: s.structure ?? `阶 ${s.order}`,
          order: s.order,
          total: 0,
          normal: false,
          rows: [],
        }
        m.set(s.structKey, g)
      }
      g.total += s.orbitSize
      g.normal = g.normal || s.isNormal
      g.rows.push(s)
    }
    // 阶降序（与共轭类列表同序），同阶的按子群个数降序
    return [...m.values()].sort((a, b) => b.order - a.order || b.total - a.total)
  }, [subs])

  /** 默认展开**含正规子群**的组 —— 正规性（以及它的「对应」入口）不能藏在折叠里 */
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())
  useEffect(() => {
    setOpenKeys(new Set(groups.filter((g) => g.normal).map((g) => g.key)))
  }, [groups])

  if (!subs) return <div className="insp-line dim">|G| &gt; {ENUM_CAP}，子群未枚举（守卫）</div>
  if (subs.length === 0) return <div className="insp-line dim">没有非平凡真子群</div>

  const normalCount = subs.filter((s) => s.isNormal).length

  return (
    <div className="insp-subs">
      <div className="insp-note">
        按同构类分组（共 {groups.length} 组）：组头是这个同构类的符号与个数，点开看它的各共轭类。
        同构但不共轭的靠生成元区分，末尾 -xN 表示这一共轭类里有几个。
        平凡群与 G 自身不在此列。
      </div>

      {groups.map((g) => {
        const open = openKeys.has(g.key)
        return (
          <div key={g.key} className="insp-isogroup">
            <button
              type="button"
              className={`sub-group-head${open ? ' on' : ''}`}
              data-struct={g.key}
              data-count={g.total}
              onClick={() =>
                setOpenKeys((prev) => {
                  const next = new Set(prev)
                  if (next.has(g.key)) next.delete(g.key)
                  else next.add(g.key)
                  return next
                })
              }
              /*
               * title 里**不写** `g.symbol` —— 那是 LaTeX 原串（`C_{2}\times C_{2}`），
               * 出现在 HTML 属性里就是纯文本泄漏（`no-unicode-leak` 抓得到）。
               * `title` 这个面没有 KaTeX，写不出好看的记号，就只讲数量。
               */
              title={`这一类子群共 ${g.total} 个，分 ${g.rows.length} 个共轭类，点开看成员`}
            >
              <Tex tex={g.symbol} />
              <em>x{g.total}</em>
              {g.rows.length > 1 && <span className="sub-group-sub">{g.rows.length} 类</span>}
              {g.normal && (
                <b className="insp-normal" title="这一类里有正规子群">
                  <Tex tex={'\\trianglelefteq'} />
                </b>
              )}
            </button>
            {open && (
              <div className="insp-subs insp-isogroup-body">
                {g.rows.map((s) => (
                  <SubgroupRow key={s.key} sub={s} onCorrespond={onCorrespond} />
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div className="insp-note dim">
        这一屏里有 {normalCount} 个正规（共轭类口径）。要看全部子群 / 全部正规子群：
        用「操作」抽屉里的 Sub(G) 与 正规子群(G)（正规子群会把平凡群与 G 自身也算进来）。
        正规那一行右边的「对应定理」：看它和商群 G/N 的子群怎么一一对应（对应定理）。
      </div>
    </div>
  )
}

/** 「子群」tab 里的一行 = **一个共轭类**（同构类里的一项）。 */
function SubgroupRow({
  sub,
  onCorrespond,
}: {
  sub: CosetSub
  onCorrespond?: (nIds: string[]) => void
}) {
  return (
    <div
      className="insp-sub"
      data-struct={sub.structKey}
      data-order={sub.order}
      data-orbit={sub.orbitSize}
      data-normal={sub.isNormal ? '1' : '0'}
    >
      <span className="insp-sub-gen" title="这一共轭类的代表子群（生成元）">
        <Tex tex={sub.repr} />
      </span>
      <span className="insp-sub-meta">
        {sub.isNormal ? (
          <b className="insp-normal">
            <Tex tex={'\\trianglelefteq'} /> 正规
          </b>
        ) : null}
        |H|={sub.order} -[G:H]={sub.index}
        {sub.orbitSize > 1 ? ` -x${sub.orbitSize}` : ''}
      </span>
      {sub.isNormal && (
        <CorrespondButton
          title="看这个正规子群与商群 G/N 的对应定理（第四同构定理）"
          onClick={() => onCorrespond?.(sub.elementIds)}
        />
      )}
    </div>
  )
}

/**
 * 「对应定理」的入口按钮。
 *
 * 2026-09-30 用户反馈：「2、这就是你说的对应定理？」—— 卡片是能做出来的
 * （见 `ui/CorrespondenceCard.tsx`，实测 `S_4/V_4` 两侧 6↔6、覆盖边 8/8、正规 3/3），
 * 问题是它**藏在一个灰色小字按钮里**，用户根本没找到，于是在画布上手搭
 * `A_4 ⊴ S_4`、`V_4 ↪ S_4`、`S_4/V_4` 想自己把对应摆出来。
 * 所以这一轮把入口提到"一眼看得见"：**主色描边 + 写全「对应定理」**。
 */
function CorrespondButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button type="button" className="insp-sub-corr" title={title} onClick={onClick}>
      对应定理
    </button>
  )
}

/**
 * 「全部子群」这类**长列表**（`Sub(G)` / `pSub` / `Syl`）—— 2026-09-30 用户反馈：
 * "3、群的子群列表里，重复的子群太多了吧。"
 *
 * `Sub(S_4)` 一把列出 30 个，其中 9 个都是二元的（`⟨(12)⟩`、`⟨(13)⟩`…）——
 * 平铺时读不出结构，只觉得"怎么这么多一样的"。按**结构符号**折成组
 * （`C_2 x9` / `C_4 x3` / `D_4 x3`…）之后，一眼就是"这个群里有哪些种类的子群、
 * 各有多少个"；点开某一组才摊成员（成员按钮照旧能取出为对象）。
 *
 * 组数 ≤ 2 时**默认摊开** —— 免得两个组也包一层壳（`正规子群(A_4)` 那种短列表）。
 */
function SubgroupTagList({
  group,
  subs,
  onExtract,
  cap = 24,
}: {
  group: Group
  subs: NormalizedSubgroup[]
  onExtract?: (sub: NormalizedSubgroup) => void
  cap?: number
}) {
  const groups = useMemo(() => {
    const m = new Map<string, NormalizedSubgroup[]>()
    for (const s of subs) {
      const key = subgroupStructureSymbol(group, s.elements.map((e) => e.id)) ?? `阶 ${s.order}`
      const arr = m.get(key)
      if (arr) arr.push(s)
      else m.set(key, [s])
    }
    // 多的排前面（"这个群里最常见的子群长什么样"一眼可见）
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [group, subs])

  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())
  useEffect(() => {
    setOpenKeys(new Set(groups.length <= 2 ? groups.map(([k]) => k) : []))
  }, [groups])

  return (
    <div className="insp-subgroups">
      {groups.map(([key, list]) => {
        const open = openKeys.has(key)
        return (
          <div key={key} className="insp-subgroup">
            <button
              type="button"
              className={`sub-group-head${open ? ' on' : ''}`}
              onClick={() =>
                setOpenKeys((prev) => {
                  const next = new Set(prev)
                  if (next.has(key)) next.delete(key)
                  else next.add(key)
                  return next
                })
              }
              title={`${key} 的子群一共 ${list.length} 个，点开看成员（每个都能取出为对象）`}
            >
              <Tex tex={key} />
              <em>x{list.length}</em>
            </button>
            {open && (
              <div className="insp-tags">
                {list.slice(0, cap).map((s, i) => (
                  <SubgroupTag key={i} sub={s} onExtract={onExtract} />
                ))}
                {list.length > cap && (
                  <div className="insp-line dim">...这一组共 {list.length} 个</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SubgroupTag({
  sub,
  onExtract,
}: {
  sub: NormalizedSubgroup
  onExtract?: (sub: NormalizedSubgroup) => void
}) {
  return (
    <button
      type="button"
      className="sub-tag sub-tag-btn"
      title={`阶 ${sub.order} -指数 ${sub.index ?? '--'} -点击取出为对象`}
      onClick={() => onExtract?.(sub)}
    >
      <TexOrText text={sub.label} />
      <em>|H|={sub.order}</em>
      {sub.isNormal && (
        <b className="insp-normal">
          <Tex tex={'\\trianglelefteq'} />
        </b>
      )}
      {sub.isSylow && <b className="syl">Syl</b>}
    </button>
  )
}

function OtherTab({
  node,
  onExtract,
}: {
  node: GalObject
  onExtract?: (sub: NormalizedSubgroup) => void
}) {
  const v = node.value
  switch (v.type) {
    case 'elements':
      return (
        <>
          <Row k="基数">
            <span>{v.elements.length}</span>
          </Row>
          <TexList className="insp-elems" items={v.elements.map((e) => e.label)} sep=" " />
        </>
      )
    case 'subgroups':
      return <SubgroupTagList group={v.group} subs={v.subgroups} onExtract={onExtract} />
    case 'set':
      // 集合（Ω）：成员可能是子群、子集或元素——统一按记号列出来
      return (
        <>
          <Row k="基数">
            <span>{v.set.members.length}</span>
          </Row>
          <div className="insp-tags">
            {v.set.members.slice(0, 40).map((m, i) => (
              <span key={i} className="sub-tag">
                <TexOrText text={m.label} />
              </span>
            ))}
          </div>
          {v.set.members.length > 40 && (
            <div className="insp-line dim">...共 {v.set.members.length} 个</div>
          )}
        </>
      )
    case 'action': {
      const A = v.action
      const members = A.omega?.members ?? []
      return (
        <>
          <Row k="类型">
            <span>{ACTION_KIND_LABEL[A.kind]}</span>
          </Row>
          <Row k="群">
            <span>
              <Tex tex={A.group.symbol} />（|G| = {A.group.order}）
            </span>
          </Row>
          <Row k="Omega">
            <span>
              {A.n} 个点
              {A.omegaBase === 'self' ? '（就是 G 自身）' : ''}
            </span>
          </Row>
          {members.length > 0 && (
            <Row k="点">
              {/* `#` 在 math mode 里是非法字符 到编号留在纯文本，只有记号自己进 KaTeX */}
              <span className="insp-elems">
                {members.slice(0, 16).map((m, i) => (
                  <span key={i}>
                    {i > 0 && ' -'}
                    #{i + 1} <TexOrText text={m.label} />
                  </span>
                ))}
                {members.length > 16 ? ` ...共 ${members.length} 个` : ''}
              </span>
            </Row>
          )}
        </>
      )
    }
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
                {' -'}
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
                {v.map.genImages.map((g, i) => (
                  <span key={i}>
                    {i > 0 && '，'}
                    <TexOrText text={g.generator} /> 到<TexOrText text={g.image.label} />
                  </span>
                ))}
              </span>
            </Row>
          )}
        </>
      )
    case 'relation': {
      const R = v.relation
      return (
        <>
          <Row k="类型">
            <span>
              {R.isNormal ? '正规包含' : '包含'}
              {R.normalUnknown ? '（正规性未判定）' : ''}
            </span>
          </Row>
          <Row k="记号">
            <span>
              <Tex tex={R.from.symbol} />{' '}
              <Tex tex={R.isNormal ? '\\trianglelefteq' : '\\subseteq'} /> <Tex tex={R.to.symbol} />
            </span>
          </Row>
          <Row k="子群">
            <span>
              <Tex tex={R.from.symbol} />（|H| = {R.from.order}）
            </span>
          </Row>
          <Row k="母群">
            <span>
              <Tex tex={R.to.symbol} />（|G| = {R.to.order}）
            </span>
          </Row>
          <Row k="指数">
            <span>
              [G:H] = {R.to.order} / {R.from.order} = {R.index}
            </span>
          </Row>
          <Row k="正规">
            <span>{R.normalUnknown ? '未判定（群太大，未枚举）' : R.isNormal ? '是' : '否'}</span>
          </Row>
        </>
      )
    }
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
