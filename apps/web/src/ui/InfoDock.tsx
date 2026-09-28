import { useMemo, type ReactNode } from 'react'
import {
  isGroupCyclic,
  isNilpotent,
  isSimpleGroup,
  isSolvable,
  listCosetStripSubgroups,
  type Group,
} from '@groupviz/core'
import { ACTION_KIND_LABEL, VALUE_TYPE_LABEL, type NormalizedSubgroup } from '../gal/value'
import { actionInsights, groupInsights, mapInsights, type Insight } from '../gal/insights'
import { RELATION_LABEL, relationsFor, type Relation } from '../gal/relations'
import { STRUCTURAL_LABEL } from '../gal/derive'
import { menuLabel } from '../gal/interaction'
import { opTemplate, type OpDef } from '../gal/ops'
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
    <DockPanel title="信息" open={open} onToggle={onToggle} bodyWidth={298}>
      {!node && !edge && <div className="empty">点画布上的对象，看它的信息</div>}

      {edge && <EdgeSection edge={edge} />}

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
            <OtherTab node={node} onExtract={onExtract} />
          )}
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

function SubgroupsTab({ group }: { group: Group }) {
  const subs = useMemo(
    () => (group.order <= ENUM_CAP ? listCosetStripSubgroups(group) : null),
    [group],
  )

  if (!subs) return <div className="insp-line dim">|G| &gt; {ENUM_CAP}，子群未枚举（守卫）</div>
  if (subs.length === 0) return <div className="insp-line dim">没有非平凡真子群</div>

  const normalCount = subs.filter((s) => s.isNormal).length

  return (
    <div className="insp-subs">
      {/*
        这个列表是**共轭类代表**（core 的 `listCosetStripSubgroups`），**不是全部子群**。
        不写清会被读成"G 只有这么几个子群"----S_4 只列 9 条，实际有 30 个非平凡真子群。
      */}
      <div className="insp-note">
        共轭类代表：同一行里的子群彼此共轭，「\\xn」是这一类有几个。
        平凡群与 G 自身不在此列。
      </div>

      {subs.map((s) => (
        <div key={s.key} className="insp-sub">
          <span className="insp-sub-name">
            {s.structure ? <Tex tex={s.structure} /> : `阶 ${s.order}`}
          </span>
          <span className="insp-sub-meta">
            {s.isNormal ? (
              <b className="insp-normal">
                <Tex tex="\\trianglelefteq" /> 正规
              </b>
            ) : null}
            |H|={s.order} -[G:H]={s.index}
            {s.orbitSize > 1 ? ` -x${s.orbitSize}` : ''}
          </span>
        </div>
      ))}

      <div className="insp-note dim">
        这一屏里有 {normalCount} 个正规。要看全部子群 / 全部正规子群：
        用「操作」抽屉里的 Sub(G) 与 正规子群(G)（正规子群会把平凡群与 G 自身也算进来）。
      </div>
    </div>
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
      return (
        <div className="insp-tags">
          {v.subgroups.slice(0, 30).map((s, i) => (
            <button
              key={i}
              type="button"
              className="sub-tag sub-tag-btn"
              title={`阶 ${s.order} -指数 ${s.index ?? '--'} -点击取出为对象`}
              onClick={() => onExtract?.(s)}
            >
              <TexOrText text={s.label} />
              <em>|H|={s.order}</em>
              {s.isNormal && <b>\\normal in</b>}
              {s.isSylow && <b className="syl">Syl</b>}
            </button>
          ))}
          {v.subgroups.length > 30 && (
            <div className="insp-line dim">...共 {v.subgroups.length} 个</div>
          )}
        </div>
      )
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
