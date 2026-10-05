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
import { ACTION_KIND_LABEL, VALUE_TYPE_LABEL, type GalAction, type GalMap, type GalStructure, type NormalizedSubgroup } from '../gal/value'
// 作用的核（U52）：判据只有一份 —— 结论层那条 insight 用的是同一个函数
import { actionKernel } from '../gal/customAction'
import { actionInsights, groupInsights, mapInsights, type Insight } from '../gal/insights'
import { STRUCTURAL_LABEL } from '../gal/derive'
import { elementNotation } from '../gal/ops'
import { labelWritable } from '../gal/pointSet'
import { STRUCTURE_LEVEL_LABEL } from '../gal/algebra'
// 公理读数行（S2c）：与表格编辑器**同一份**排版 —— 两个面不许各写一份
import { axiomRows, verdictText } from './axiomReadout'
import { prettySymbol } from '../gal/pretty'
import { chainText, factorsText, STRUCTURE_CAP, structureFacts } from '../gal/structure'
// 「已知群」（U48）：结论表给的群只有符号 + 阶，没有元素表 —— 面板各节都得改口径
// `knownFacts` 则相反：常见族的**闭式结论**（Aut / Out / Z / [G,G] / 幂指数）先查表，
// 让「基本」节能直接把课本答案摆出来（不必先跑一遍操作）
import { isKnownGroup, knownFacts, knownGroupInfo } from '../gal/known'
import { Tex, TexList, TexOrText } from './Tex'
import { ElementsTable } from './ElementsTable'
import { DockPanel } from './DockPanel'
import type { GalEdge, GalObject, StructuralEdge } from '../gal/types'

const ENUM_CAP = 144

export type InfoTab = 'basic' | 'elements' | 'subgroups' | 'axioms' | 'table'

export const INFO_SECTIONS: { id: InfoTab; label: string }[] = [
  { id: 'basic', label: '基本' },
  { id: 'elements', label: '元素' },
  { id: 'subgroups', label: '子群' },
]

/**
 * 代数结构自己的两节（S2c）。
 *
 * 为什么级别**不上画布**（§11.2）：画布是交换图，节点只有符号。级别是"这一章最想让
 * 用户看见的那个结论"，但它的位置在**面板**——这里可以说清"是 magma / semigroup /
 * monoid / group 里的哪一级"，还能把**为什么**（逐条公理 + 反例）一起摆出来。
 * 画布上只承载最强的那一个视觉信号：**是不是群**（圆 / 方，§11.1）。
 */
export const STRUCT_SECTIONS: { id: InfoTab; label: string }[] = [
  { id: 'axioms', label: '公理档案' },
  { id: 'table', label: '运算表' },
]

/**
 * 「子群」标题行上那个数字的**成本闸门**（U45，2026-10-01）。
 *
 * 实测一次 `listCosetStripSubgroups`：S₄ 7ms · A₅ 61ms · **C₂⁵ 472ms** · S₅ 2.1s。
 * 成本跟着**子群个数**走，不跟阶走 —— 阶数当阈值分不开 A₅（60 阶 61ms）和
 * C₂⁵（32 阶 472ms）。库群也没有免费路：`getPrecomputed` 按符号精确匹配，
 * `C_2^4` 这种照样 MISS。
 *
 * 于是两道防线：
 *   ① **60 阶上限**（与 `gal/structure.ts` 的 `STRUCTURE_CAP` 同源，那儿也是实测
 *      「60 阶（A₅）一次约 250ms」）；超限就不报数字，标题行只留标签。
 *   ② 计算**放到当前任务之后**（`setTimeout` 0），让面板先画出来再枚举 ——
 *      点一个群不该为了一个折叠标题卡住。
 *
 * 结果缓存进 `WeakMap`（按对象身份，与 `gal/identity.ts` 同纪律）：同一个群反复
 * 聚焦只算一次。
 */
const SUB_COUNT_CAP = 60
const subCountCache = new WeakMap<Group, number>()

function subgroupClassCount(group: Group): number {
  // 「已知群」没有元素表（U48）：枚举不了，标题行不给数字（`sectionSummary` 也不显示）
  if (isKnownGroup(group)) return 0
  const hit = subCountCache.get(group)
  if (hit !== undefined) return hit
  // 与 `SubgroupsTab` **同一个表达式**（`structKey`），标题与正文的数字不许打架
  const subs = listCosetStripSubgroups(group)
  const n = new Set(subs.map((s) => s.structure ?? `阶 ${s.order}`)).size
  subCountCache.set(group, n)
  return n
}

/**
 * 信息区面板（UI v3）：三个「看」入口（基本 / 元素 / 子群）**共用这一个面板**。
 *
 * U45（2026-10-01）把 tab 条换成**可折叠分区**。用户原话：
 * 「重点还是不够突出，基本/元素/子群 tab 明显可以折叠起来不是吗」——
 * tab 条是"永远有一块内容被摊开"，折叠分区是"想看的才摊开"。
 *
 * 三条定案（用户拍的）：**单开**（展开一个自动收其余）· **默认全收** ·
 * 标题行**带一行摘要**（基本 = 阶 + 交换性 / 元素 = 元素个数 / 子群 = 同构类数）。
 *
 * 悬浮球那三个入口照旧可用：点「元素」= 打开面板 + 展开「元素」这一节。
 */
export function InfoDock({
  open,
  onToggle,
  tab,
  onTab,
  node,
  edge,
  onExtract,
}: {
  open: boolean
  onToggle: () => void
  /** 当前**展开**的那一节；`null` = 全收（默认） */
  tab: InfoTab | null
  /** 切换展开项（传 `null` 收起全部）；面板内部按"点同一节 = 收起"调用 */
  onTab: (t: InfoTab | null) => void
  /** 焦点**对象**——不限于节点：映射只画箭头，但同样有信息可看 */
  node: GalObject | null
  /**
   * 焦点是一条**结构伴生边**（缺口 ⑧）——`π` / `π_1` / `↪` / `=` / `≅`。
   *
   * 与 `node` **互斥**：一条边要么背后有对象（那是 `node`），要么只有结构身份
   * （那是这里）。它只回答"这条箭头是什么、账是多少"。
   */
  edge?: { edge: GalEdge; info: StructuralEdge } | null
  /**
   * 「取出为对象」：把列表里的一个成员变成一行定义。
   *
   * 列表（子群集）不上画布，但它是**入口**不是终点——DIAGRAM_SPEC §3：
   * "能作为某个映射的源或靶的，才配当顶点"，而子群集里的每一项**本身**就是子群。
   */
  onExtract?: (sub: NormalizedSubgroup) => void
}) {
  const group = node && node.value.type === 'group' ? node.value.group : null
  /**
   * 代数结构（S2c）：`carrier` / `op.table` / `axioms`，够格成群时还有 `group`。
   *
   * ⚠️ 够格成群的**结构**在面板上走**两套节**：群那三节（基本 / 元素 / 子群，
   * 载体就是升格出来的那个群）+ 结构自己的两节（公理档案 / 运算表）。
   * 这是 §11.6「形状与能力同一个判据」在面板上的落法 —— 画布上它是方（=群），
   * 球上列得出 `Sub`，那面板里也就该看得到元素表；否则"升格"只升了外观。
   */
  const struct = node && node.value.type === 'structure' ? node.value.structure : null
  /** 面板里"群那几节"要看的群：真群，或结构升格出来的群 */
  const showGroup = group ?? struct?.group ?? null
  /** 本节点该有哪几节；`null` = 没有分节（走 `OtherTab` 的扁平排版） */
  const sections: { id: InfoTab; label: string }[] | null = showGroup
    ? [...INFO_SECTIONS, ...(struct ? STRUCT_SECTIONS : [])]
    : struct
      ? STRUCT_SECTIONS
      : null

  /**
   * 「子群」标题行的数字（U45）。**不许卡住渲染** —— 见 `SUB_COUNT_CAP` 那段注释：
   * 枚举放到当前任务之后，面板先画出来，数字随后补上。
   */
  const [subCount, setSubCount] = useState<number | null>(null)
  useEffect(() => {
    if (!showGroup || showGroup.order > SUB_COUNT_CAP) {
      setSubCount(null)
      return
    }
    let alive = true
    const id = setTimeout(() => {
      if (!alive) return
      setSubCount(subgroupClassCount(showGroup))
    }, 0)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [showGroup])

  /** 折叠标题行右边的摘要（`axioms` / `table` 两节用结构的读数，不是群的）*/
  const sumOf = (id: InfoTab): string => {
    if (id === 'axioms') return struct ? STRUCTURE_LEVEL_LABEL[struct.axioms.level] : ''
    if (id === 'table') {
      const n = struct?.carrier.length ?? 0
      return n > 0 ? `${n} x ${n}` : ''
    }
    return showGroup ? sectionSummary(id, showGroup, subCount) : ''
  }

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
            摘要区 = **身份 + 结论**，就这两块（U44，2026-10-01）。

            用户原话：「信息栏现状就是信息塞太满了，让用户找不到重点……
            至于目前面板上的什么关系，什么可做操作，说实话，我都不看。」

            砍掉的两块各有出处：
              · **关系**（核/像/商/同一/子群/包含/派生）—— 它是把对象表里
                所有沾边的对象**罗列一遍**。那些关系画布上的箭头已经画了，
                面板里再抄一遍就成了 wiki；用户在面板里要的是"这个对象是什么"，
                不是"它和表里哪些行有关系"。
              · **可做**（≤8 个操作按钮）—— 操作本来该在画布上（悬浮球 / 拖拽）。
                它当初存在的唯一理由是"不上画布的对象没有悬浮球"，那个缺口
                现在由「操作」抽屉的列表型行补（见 `ui/OpDock.tsx`）。

            于是摘要区只剩：对象身份（19px 上下）+ 结论（同构 / 第一同构定理 /
            轨道分解）。这既是"计算器给的那个结果"，也是用户排在第一位的诉求
            ——「这个群和哪个常见群同构？」。

            U45 起底下不再是 tab 条，而是**可折叠分区**（单开 / 默认全收）。
            U42 那条"分区里容器高度必须确定"的规矩随之改写：全收时面板本来就该矮，
            所以高度回到**内容驱动 + max-height 封顶**，由 `.info-acc` 自己滚。
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
                  /* 第一条 = **头条**（U46）：识别 / 第一同构定理 / 轨道分解 本来就是
                     结论层的第一个答案，字号要比其余结论再大一档 —— 见 `.insight-lead` */
                  <div key={i} className={`insight insight-${ins.tone}${i === 0 ? ' insight-lead' : ''}`}>
                    <span className="insight-label">{ins.label}</span>
                    <div className="insight-body">
                      <Tex tex={ins.tex} />
                      {ins.detail && <div className="insight-detail">{ins.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {sections ? (
            <div className="info-acc">
              {sections.map((t) => {
                const openSec = tab === t.id
                return (
                  <section key={t.id} className="info-sec" data-sec={t.id}>
                    <button
                      type="button"
                      className={`info-sec-head${openSec ? ' on' : ''}`}
                      data-sec={t.id}
                      aria-expanded={openSec}
                      title={openSec ? `收起「${t.label}」` : `展开「${t.label}」`}
                      onClick={() => onTab(openSec ? null : t.id)}
                    >
                      <span className="info-sec-label">{t.label}</span>
                      <span className="info-sec-sum">{sumOf(t.id)}</span>
                      {/* 展开三角用**内联 SVG** —— `▾` 键盘打不出来（no-unicode-leak 会抓） */}
                      <svg className="info-sec-caret" viewBox="0 0 8 6" aria-hidden="true">
                        <path d="M0.6 0.8 L7.4 0.8 L4 5.2 Z" fill="currentColor" />
                      </svg>
                    </button>
                    {openSec && (
                      <div className="info-sec-body">
                        {t.id === 'basic' && showGroup && <BasicTab group={showGroup} node={node} />}
                        {t.id === 'elements' && showGroup && <ElementsTable group={showGroup} />}
                        {t.id === 'subgroups' && showGroup && <SubgroupsTab group={showGroup} />}
                        {t.id === 'axioms' && struct && <AxiomArchive structure={struct} />}
                        {t.id === 'table' && struct && <StructureTable structure={struct} />}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          ) : (
            <div className="info-acc">
              <div className="info-sec-body">
                <OtherTab node={node} onExtract={onExtract} />
              </div>
            </div>
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
        自己写一行「R = contains(A, B)」。
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
  const known = knownGroupInfo(group)
  const info = useMemo(() => {
    // 「已知群」没有元素表（U48）：循环 / 单 / 可解 / 幂零都要遍历元素 —— 一律不给
    const small = !isKnownGroup(group) && group.order <= ENUM_CAP
    return {
      cyclic: small ? isGroupCyclic(group) : null,
      simple: small ? isSimpleGroup(group) : null,
      solvable: small ? isSolvable(group) : null,
      nilpotent: small ? isNilpotent(group) : null,
    }
  }, [group])

  /*
   * 「已知群」只给两件**真**的东西：阶，与它是从哪来的。
   * 其余属性（交换 / 单 / 可解 / 合成列）全要遍历元素 —— 一律不显示：
   * stub 上的 `isAbelian = false` 是**占位值**，把它渲染成"非交换"就是撒谎。
   */
  if (known) {
    return (
      <>
        <Row k="阶">
          <span>|G| = {group.order}</span>
        </Row>
        <Row k="来源">
          <span>结论表（本地没有这个群的元素表）</span>
        </Row>
        <div className="insp-line dim">{known.plain}</div>
      </>
    )
  }

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
      <BookFacts group={group} />
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
 * 「课本结论」（U48）—— 常见族的**闭式结论**，进「基本」节就能看到，不必先跑一遍操作。
 *
 * 用户的原话："作为群论计算器，起码得把常见结论硬编码吧"。硬编码之后得**看得见**
 * ——否则那只是一张只发给测试用的表（"能过测试但用户感知不到"是无效改动）。
 *
 * ## 为什么落在「基本」节，而不是结论区（`insights.ts`）
 *
 *   ① **结论区有契约**：对**手写的群**只给「识别 + 阶」两条（U18 立、U44 复核 ——
 *      用户嫌"信息塞太满"）。往里塞第三行会破那条契约，也会把"一眼"级的结论区
 *      变成"一节"内容。
 *   ② **零视觉成本**：「基本」节**默认收着**（U45），不展开就不占地方。
 *   ③ **成本**：这一块只是查表（`knownFacts` 全是整数算术，不碰元素）。
 *
 * ## 只对命中的常见族出现
 *
 * `knownFacts` 的判据是「记号 + 阶」双重的，认不出就返回 `null` —— 整块不渲染。
 * 这段回答的是"**这个群落在课本哪一条闭式里**"；认不出就不猜。
 */
function BookFacts({ group }: { group: Group }) {
  const facts = useMemo(() => knownFacts(group), [group])
  if (!facts) return null

  /*
   * 每行一条结论：TeX 主体给 `Tex` 渲染，纯文本形态放 `data-book-plain` 当断言锚点
   * （KaTeX 渲染后 `textContent` 里没有空格，断言读不了原文 —— 见走查纪律）。
   */
  const rows: { k: string; tex: string; plain: string }[] = []
  const add = (k: string, s: { tex: string; plain: string } | undefined) => {
    if (s) rows.push({ k, tex: s.tex, plain: s.plain })
  }
  add('自同构', facts.aut)
  add('内自同构', facts.inn)
  add('中心', facts.center)
  add('换位子群', facts.commutator)
  if (facts.outOrder !== undefined) {
    rows.push({
      k: '外自同构',
      tex: `\\lvert \\operatorname{Out}(G)\\rvert = ${facts.outOrder}`,
      plain: `|Out| = ${facts.outOrder}（Out = Aut / Inn）`,
    })
  }
  if (facts.exponent !== undefined) {
    rows.push({
      k: '幂指数',
      tex: `\\exp(G) = ${facts.exponent}`,
      plain: `幂指数 = ${facts.exponent}（各元素阶的 lcm）`,
    })
  }
  if (rows.length === 0) return null

  return (
    <div className="structure" data-book="facts">
      <div className="rel-head">课本结论</div>
      {rows.map((r) => (
        <Row key={r.k} k={r.k}>
          <span data-book-plain={r.plain}>
            <Tex tex={r.tex} />
          </span>
        </Row>
      ))}
      <div className="insp-line dim">{facts.source}</div>
    </div>
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
    // 「已知群」不是"超限没算"，是"没有元素表"（U48）—— 两种"没算"要说不同的话
    if (isKnownGroup(group)) {
      return (
        <div className="insp-line dim" data-structure="known">
          这是结论表给出的已知群：本地没有元素表，合成列 / 结构分解都无从算起
        </div>
      )
    }
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

function SubgroupsTab({ group }: { group: Group }) {
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
    if (isKnownGroup(group) || group.order > ENUM_CAP) return null
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

  if (!subs) {
    return (
      <div className="insp-line dim">
        {isKnownGroup(group)
          ? '这是结论表给出的已知群：本地没有元素表，子群无从枚举'
          : `|G| > ${ENUM_CAP}，子群未枚举（守卫）`}
      </div>
    )
  }
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
                  <SubgroupRow key={s.key} sub={s} />
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div className="insp-note dim">
        这一屏里有 {normalCount} 个正规（共轭类口径）。要看全部子群 / 全部正规子群：
        用「操作」抽屉里的 Sub(G) 与 normalSubgroups(G)（正规子群会把平凡群与 G 自身也算进来）。
      </div>
    </div>
  )
}

/** 「子群」tab 里的一行 = **一个共轭类**（同构类里的一项）。 */
function SubgroupRow({ sub }: { sub: CosetSub }) {
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
    </div>
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
 * 组数 ≤ 2 时**默认摊开** —— 免得两个组也包一层壳（`normalSubgroups(A_4)` 那种短列表）。
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

/**
 * 「元素送到哪里去了」（U44，2026-10-01）—— 映射该吐出来的那个**结果**。
 *
 * 用户点名要看这个（"元素送到哪里去了？（映射信息）"）。从前映射这一栏只有
 * `|ker| / |im|` 两个数字加上生成元的像，等于没回答"每个元素落到哪"。
 *
 * `GalMap.mapping` 本来就是**完整映射表**（域元素 id → 靶元素 id），
 * 逐行铺出来就是答案。列头写「元素 / 像」而不是「x / f(x)」——
 * 这一列在 298px 面板里放得下，也不必再渲染一次 KaTeX 公式。
 */
function MapCorrespondence({ map }: { map: GalMap }) {
  const m = map.mapping
  if (!m || m.size === 0) return null
  const byId = new Map(map.codomain.elements.map((e) => [e.id, e]))
  const rows = map.domain.elements
  const CAP = 60
  return (
    <div className="map-corr">
      <div className="rel-head">元素送到哪里去</div>
      <div className="etable-wrap">
        <table className="etable map-corr-table">
          <thead>
            <tr>
              <th>元素</th>
              <th>像</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, CAP).map((e) => {
              const t = byId.get(m.get(e.id) ?? '')
              return (
                <tr key={e.id} data-src={e.id} data-dst={t?.id ?? ''}>
                  <td>
                    <TexOrText text={e.label} />
                  </td>
                  <td>
                    <TexOrText text={t?.label ?? '--'} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > CAP && (
        <div className="insp-line dim">...共 {rows.length} 个元素（这里只列前 {CAP} 个）</div>
      )}
    </div>
  )
}

/**
 * 0 起置换 → 循环记号，点用 `pt` 渲染。恒等回 `e`（与编辑器、`IDENTITY_TOKEN` 同款写法）。
 *
 * ⚠️ 与 `ActionBuilder.tsx` 里那个 `cycleNotation` 的差别只有一处：那边点号固定是
 * `i + 1`（用户输入的就是点号），这边要能换成 Ω 的**标号**。两条路的循环写法
 * （跳不动点、按最左元素开环）必须一致 —— 所以这里只把"点怎么写"参数化。
 */
function cycleNotationOf(perm: readonly number[] | undefined, pt: (i: number) => string): string {
  if (!perm) return '--'
  const n = perm.length
  const seen = new Array<boolean>(n).fill(false)
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue
    seen[i] = true
    if (perm[i] === i) continue
    const cyc = [pt(i)]
    let j = perm[i]
    while (j !== i) {
      seen[j] = true
      cyc.push(pt(j))
      j = perm[j]
    }
    parts.push(`(${cyc.join(' ')})`)
  }
  return parts.length > 0 ? parts.join('') : 'e'
}

/**
 * 「元素送到哪里去了」—— **作用版**（U58）。
 *
 * 用户原话（2026-10-03，对着作用问的）：「群作用的信息显示了什么？**元素映射到哪去了**？」
 *
 * 这张表与映射那张（`MapCorrespondence`）回答同一个问题，只是答案的形式不同：
 * 映射是"元素 → 另一个元素"，作用是"元素 → **Ω 上的一个置换**"。
 * 数据一直都在 —— `GalAction.perms` 就是"G 的每个元素在 Ω 上的置换"，作用本来就是
 * 由它定义的（`buildActionComputation` 交出来的就是这张表）。可从没人把它铺出来：
 * 信息面板从前只给了 核 / |Ω| / 点列表，等于把"这个作用到底怎么动"藏起来了。
 *
 * 三个细节：
 *   ① **点优先用标号写**：标号能直接进循环记号时（`labeledSet(a, b, c)`）就写 `(a b)`，
 *      屏幕上写着 `a` 就看得见 `a`；标号是子群记号那种 LaTeX（`Syl(S_4,3)` 的成员）
 *      时退回**点号**，并在表下注明"1..n 是点号，对应上面「点」那一行"——
 *      把 `\langle 234\rangle` 塞进 `( )` 里没法读，硬塞反而更糟。
 *   ② 恒等写 `e`。
 *   ③ **对四个内置作用一样成立**：共轭作用的表就是"每个元素把每个元素送到哪"
 *      （`Z(G)` 那几行的像是 `e`，一眼可见）。
 */
function ActionCorrespondence({ A }: { A: GalAction }) {
  const labels = A.setLabels ?? A.omega?.members.map((m) => m.label) ?? []
  // 标号能写进循环记号吗？（`labelWritable` = 无空白 / 括号 / 逗号；再去掉 LaTeX 记号）
  const byLabel = labels.length === A.n && labels.every((l) => labelWritable(l) && !/\\/.test(l))
  const pt = (i: number) => (byLabel ? labels[i] : String(i + 1))
  const rows = A.group.elements
  const CAP = 60
  if (A.perms.size === 0) return null
  return (
    <div className="map-corr">
      <div className="rel-head">元素送到哪里去</div>
      <div className="etable-wrap">
        <table className="etable map-corr-table">
          <thead>
            <tr>
              <th>元素</th>
              <th>像</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, CAP).map((e) => (
              <tr key={e.id} data-src={e.id}>
                <td>
                  <TexOrText text={e.label} />
                </td>
                <td>
                  <TexOrText text={cycleNotationOf(A.perms.get(e.id), pt)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!byLabel && A.n > 0 && (
        <div className="insp-line dim">像里的 1..{A.n} 是点号，对应上面「点」那一行</div>
      )}
      {rows.length > CAP && (
        <div className="insp-line dim">...共 {rows.length} 个元素（这里只列前 {CAP} 个）</div>
      )}
    </div>
  )
}

/** 「运算表」一节最多显示这么多行列 —— 超过就**明说**，不静默截断（§11.4）。 */
const STRUCT_TABLE_CAP = 12

/**
 * 「公理档案」节（S2c）—— 这个结构**到哪一级**，以及**为什么**。
 *
 * 与表格编辑器同一份排版（`axiomReadout.ts#axiomRows`）：两处读数不许各写一份，
 * 否则"不结合时的反例怎么写"会变成两条判据（面板与编辑器说法打架）。
 *
 * ⚠️ 级别**不上画布**（§11.2）—— 画布只承载"是不是群"（圆 / 方）。
 * 这里才是"magma / semigroup / monoid / group 里的哪一级"唯一能看的地方。
 */
function AxiomArchive({ structure }: { structure: GalStructure }) {
  const labels = structure.carrier.map((m) => m.label)
  const p = structure.axioms
  const rows = axiomRows(labels, p)
  const v = verdictText(p)
  return (
    <>
      <div className={`sb-verdict verdict-${p.level}`} data-verdict={p.level}>
        <span className="sb-verdict-label">层级</span>
        <strong>{v.level}</strong>
        {v.gap && <span className="sb-verdict-gap">就差一步：{v.gap}</span>}
      </div>

      <div className="sb-axioms" data-level={p.level}>
        {rows.map((r) => (
          <div key={r.key} className={`sb-ax${r.ok === null ? ' note' : r.ok ? ' ok' : ' bad'}`}>
            <span className={`sb-mark${r.ok === null ? ' note' : r.ok ? ' ok' : ' bad'}`}>
              {r.ok === null ? '-' : r.ok ? 'v' : 'x'}
            </span>
            <span className="sb-ax-k">{r.key}</span>
            <span className="sb-ax-v">{r.text}</span>
          </div>
        ))}
      </div>

      <Row k="载体">
        <span>{labels.length} 个点</span>
      </Row>
      {/*
        「非群里藏着群」这一句是 Q3 的落点（§13.3）：`units` 就是可逆元集合，
        `structure.unitGroup` 是它**算出来的群**（不封闭时是 undefined —— 那就别吹）。
      */}
      {p.units.length > 0 && (
        <div className="insp-line dim">
          可逆元那 {p.units.length} 个元素在乘法下构成一个群 U(M)
          {p.units.length !== labels.length ? `（比整个载体小：|U(M)| = ${p.units.length}）` : ''}
        </div>
      )}
    </>
  )
}

/**
 * 「运算表」节（S2c）—— 那张 n×n 的表本身（§11.4：表是**信息**，不上画布）。
 *
 * 落点参照 `ElementsTable`（同样的 `.etable-wrap` 横滚壳）。超过
 * `STRUCT_TABLE_CAP` 行列时只显示左上角那一块，并**附注说明** —— 默默截断是
 * "静默假装支持"，这个项目栽过。
 */
function StructureTable({ structure }: { structure: GalStructure }) {
  const labels = structure.carrier.map((m) => m.label)
  const t = structure.op.table
  const n = labels.length
  const show = Math.min(n, STRUCT_TABLE_CAP)
  const cell = (v: number) => prettySymbol(labels[v - 1] ?? String(v))
  return (
    <>
      <div className="etable-wrap">
        <table className="etable struct-table" data-size={n}>
          <thead>
            <tr>
              <th className="etable-corner">*</th>
              {labels.slice(0, show).map((l, j) => (
                <th key={j}>
                  <TexOrText text={prettySymbol(l)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.slice(0, show).map((row, i) => (
              <tr key={i}>
                <th className="etable-rowhead">
                  <TexOrText text={prettySymbol(labels[i])} />
                </th>
                {row.slice(0, show).map((val, j) => (
                  <td key={j} className="etable-cell struct-cell" data-cell={`${i}-${j}`}>
                    <TexOrText text={cell(val)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {n > show && (
        <div className="insp-line dim">
          只显示前 {show} 行 {show} 列 - 这张表共 {n} x {n}，没有省略整张表
        </div>
      )}
      {structure.group && (
        <div className="insp-line dim">
          够格成群：已升格为群（元素顺序在内部做过一次置换，见「基本」节）
        </div>
      )}
    </>
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
      const kernel = actionKernel(A)
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
          {/*
            核（U52）：作用作为同态的核 —— 「忠实吗」是看作用时第一个该知道的事实。
            从前这一行没有，用户只能自己猜"这个作用丢了多少信息"；
            对共轭作用它就是 Z(G)、对左正则作用它是 {e}（Cayley 定理）。
            判据与「自定义作用」的披露、结论层那条共用 `actionKernel`。
          */}
          <Row k="核">
            <span>
              {kernel.length === 1 ? '忠实（只有单位元）' : `不忠实，阶 ${kernel.length}`}
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
          {/*
            元素送到哪里去（U58）：作用的**结果**本身。
            用户原话：「群作用的信息显示了什么？**元素映射到哪去了**？」
            上面那几行只说"核多大 / Ω 有几个点"，回答不了"这个作用怎么动"。
          */}
          <ActionCorrespondence A={A} />
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
          <MapCorrespondence map={v.map} />
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
    /* `structure` 不在这里：它有自己的两节（公理档案 / 运算表），见 `AxiomArchive` */
    default:
      return null
  }
}

/**
 * 折叠标题行右边那行摘要（U45）——「不点开也看得到的关键数字」。
 *
 * 全是**免费**的量：阶与交换性是现成字段；元素个数就是阶；子群类数走
 * `subgroupClassCount`（延迟 + 上限 + 缓存，见 `SUB_COUNT_CAP`），拿不到就留空
 * ——**宁可没有数字，也不写个猜的**。
 *
 * 分隔一律用 ASCII `-`：`·` 键盘打不出来（`no-unicode-leak` 判据）。
 */
function sectionSummary(
  id: 'basic' | 'elements' | 'subgroups',
  group: Group,
  subCount: number | null,
): string {
  /*
   * 「已知群」（U48）：只有阶是真的，交换性是**未知**（`isAbelian` 在 stub 上是占位的
   * false）—— 摘要行不能把"未知"说成"非交换"，那是最容易骗过人的那种谎。
   */
  if (isKnownGroup(group)) {
    switch (id) {
      case 'basic':
        return `|G| = ${group.order} - 已知群（无元素表）`
      case 'elements':
        return '无元素表'
      case 'subgroups':
        return ''
    }
  }
  switch (id) {
    case 'basic':
      return `|G| = ${group.order} - ${group.isAbelian ? '交换' : '非交换'}`
    case 'elements':
      return `${group.order} 个元素`
    case 'subgroups':
      return subCount === null ? '' : `${subCount} 类`
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
