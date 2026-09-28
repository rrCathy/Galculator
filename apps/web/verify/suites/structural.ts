/**
 * 回归：**结构伴生边的语义身份**（缺口 ⑧）。
 *
 * 画布上的 `π` / `π_1` / `↪` / `⊴` / `=` / `≅` 是操作的结构顺手长出来的箭头
 * （`derive.ts#alongsideEdges` + 轨道边）。这一批给它们挂上 `structural`——
 * 它是什么、两端是谁、账是多少——并立下三条纪律：
 *
 *   ① 伴生边**不是一等对象**：不带 `objectId`（焦点走 `struct:` 前缀），
 *      所以信息面板不给它列 `ker` / `im` 这类"点了必然报错"的按钮（菜单不撒谎）。
 *   ② 账**就地真算**：指数 / 正规性走 `relations.ts#containment()`（判据同源），
 *      核与阶直接读自操作已知的输入。期望值**全部手算**，不从运行结果抄。
 *   ③ 正规的包含画 `\trianglelefteq`、非正规的画 `\hookrightarrow`（U20 定的
 *      "画布上一眼可分"）——这条以前只对**声明的**包含成立，现在伴生的也一样。
 */
import { deriveCanvas, edgeFocusId, STRUCT_PREFIX } from '../../src/gal/derive'
import type { GalObject, StructuralEdge } from '../../src/gal/types'
import { build, eq, ok, suite } from '../harness'

/** 对象表 → 全部伴生边（带焦点 id 与结构身份）。 */
function edgesOf(objects: GalObject[]) {
  return deriveCanvas(objects).edges.map((e) => ({
    id: e.id,
    label: e.label ?? '',
    objectId: e.objectId ?? null,
    focus: edgeFocusId(e),
    info: (e.structural ?? null) as StructuralEdge | null,
  }))
}

const withInfo = (list: ReturnType<typeof edgesOf>) => list.filter((e) => e.info)
const factOf = (info: StructuralEdge | null, k: string) => info?.facts.find((f) => f.k === k)?.v ?? ''

export function run(): void {
  /* ══ ① 商群的自然投影 ══════════════════════════════════════ */

  suite('structural \\cdot 商群的 \\pi（自然投影）与第二参的 \\trianglelefteq')

  {
    // S_4 / A_4 \cong C_2：|Q| = 24 / 12 = 2
    const b = build(['G = S_4', 'N = A_4', 'Q = 商(G, N)'])
    const es = edgesOf(b.objects)
    const pis = withInfo(es).filter((e) => e.label === '\\pi')
    eq('商群给一条 \\pi', pis.length, 1)
    const pi = pis[0]
    ok('\\pi 的身份是 naturalProjection', pi.info?.kind === 'naturalProjection', pi.info?.kind)
    ok('\\pi 两端是 G 与 Q', `${pi.info?.from} -> ${pi.info?.to}` === 'S_4 -> G / N', `${pi.info?.from} -> ${pi.info?.to}`)
    ok('\\pi 的核是 N（A_4）', factOf(pi.info, '核') === '\\ker \\pi = A_4', factOf(pi.info, '核'))
    ok('\\pi 的阶写着 24 / 12 = 2（手算）', factOf(pi.info, '阶').includes('24 / 12 = 2'), factOf(pi.info, '阶'))
    ok('\\pi 恒满射', factOf(pi.info, '满射').includes('是'), factOf(pi.info, '满射'))

    const incl = withInfo(es).filter((e) => e.label === '\\trianglelefteq')
    eq('N \\trianglelefteq G 有一条（商群的前提就是 N 正规）', incl.length, 1)
    ok('那条 \\trianglelefteq 的账里有指数 24 / 12 = 2', (incl[0].info?.facts ?? []).some((f) => f.v.includes('24 / 12 = 2')), JSON.stringify(incl[0].info?.facts))
    ok('那条 \\trianglelefteq 的账里说正规', (incl[0].info?.facts ?? []).some((f) => f.k === '正规' && f.v.includes('正规')), JSON.stringify(incl[0].info?.facts))
  }

  /* ══ ② 正规性决定标签：正规 -> \trianglelefteq，非正规 -> \hookrightarrow ═══ */

  suite('structural \\cdot 包含边的标签由正规性定（U20 原则扩展到伴生边）')

  {
    // S_4 的中心是平凡群：|Z| = 1，指数 24。平凡群总正规 -> \trianglelefteq
    const b = build(['G = S_4', 'Z = Z(G)'])
    const es = edgesOf(b.objects)
    const zs = withInfo(es).filter((e) => e.id.startsWith('Z->'))
    eq('Z(G) 给一条包含边', zs.length, 1)
    ok('平凡中心正规 -> \\trianglelefteq', zs[0].label === '\\trianglelefteq', zs[0].label)
    ok('指数写着 24 / 1 = 24（手算）', factOf(zs[0].info, '指数').includes('24 / 1 = 24'), factOf(zs[0].info, '指数'))
  }

  {
    // C_G((12)) = {e, (12), (34), (12)(34)} \cong V_4（共轭类大小 6 -> 阶 24/6 = 4）。
    // S_4 里正规的 V_4 只有双对换那一个，这个不是 -> 非正规 -> \hookrightarrow
    const b = build(['G = S_4', 'C1 = C_G(G, (12))'])
    const es = edgesOf(b.objects)
    const cs = withInfo(es).filter((e) => e.id.startsWith('C1->'))
    eq('中心化子给一条包含边', cs.length, 1)
    eq('|C_G((12))| = 4（手算：类大小 6）', b.orderOf('C1'), 4)
    ok('非正规 -> \\hookrightarrow', cs[0].label === '\\hookrightarrow', cs[0].label)
    ok('账里明说非正规', factOf(cs[0].info, '正规').includes('非正规'), factOf(cs[0].info, '正规'))
  }

  /* ══ ③ 轨道边：传递时是 =（equality），否则是子集 ═════════════ */

  suite('structural \\cdot 轨道边（Sylow III 默认示范的那两条）')

  {
    // S_4 共轭作用于 Syl_3(G)：n_3 = 4，作用传递 -> 轨道 = 整个 Omega
    const b = build([
      'G = S_4',
      'Syl = Syl_p(G, 3)',
      'Omega = 底集(Syl)',
      'A = 共轭作用在(G, Omega)',
      'O = 轨道(A, 1)',
    ])
    const es = edgesOf(b.objects)
    const eqs = withInfo(es).filter((e) => e.info?.kind === 'equality')
    eq('传递作用给一条 =（equality）', eqs.length, 1)
    ok('它的账说 |O| = |Omega| = 4（手算 n_3 = 4）', factOf(eqs[0].info, '大小').includes('= 4') && factOf(eqs[0].info, 'Omega').includes('= 4'), JSON.stringify(eqs[0].info?.facts))
    ok('它的账点名"传递"', factOf(eqs[0].info, '传递').includes('是'), factOf(eqs[0].info, '传递'))
  }

  /* ══ ④ 第一同构的 \cong 与 \pi ═════════════════════════════ */

  suite('structural \\cdot 第一同构定理的 \\pi 与 \\cong')

  {
    // C_6 -> C_6，a |-> 2：|ker| = 2、|im| = 3、G/ker \cong im \cong C_3
    const b = build(['G = C_6', 'H = C_6', 'f = 映射(G, H, a->2)'])
    const es = edgesOf(b.objects)
    const iso = withInfo(es).filter((e) => e.label === '\\cong')
    eq('补出一条 \\cong', iso.length, 1)
    ok('\\cong 的身份是 isomorphism', iso[0].info?.kind === 'isomorphism', iso[0].info?.kind)
    ok('两边同阶 3 = 3（手算）', factOf(iso[0].info, '两边同阶').includes('3'), factOf(iso[0].info, '两边同阶'))

    const pi = withInfo(es).filter((e) => e.label === '\\pi')
    eq('补出一条 \\pi（G ->> G/ker）', pi.length, 1)
    ok('\\pi 的账里核是 f 的核', factOf(pi[0].info, '核').includes('\\ker f'), factOf(pi[0].info, '核'))
    ok('\\pi 的阶写着 6 / 2 = 3（手算 |ker| = 2）', factOf(pi[0].info, '阶').includes('6 / 2 = 3'), factOf(pi[0].info, '阶'))
  }

  /* ══ ⑤ 直积的投影 ═════════════════════════════════════════ */

  suite('structural \\cdot 直积的 \\pi_1 / \\pi_2')

  {
    const b = build(['A = C_2', 'B = C_3', 'P = A x B'])
    const es = edgesOf(b.objects)
    const projs = withInfo(es).filter((e) => e.info?.kind === 'projection')
    eq('两条积投影', projs.length, 2)
    const kers = projs.map((p) => factOf(p.info, '核')).sort()
    // 因子是**节点**，引用它们用画布上的记号（与 from/to 同源），不是对象名
    eq('核各是另一个因子（按画布记号）', kers.join(' | '), '\\ker \\pi_1 = C_3 | \\ker \\pi_2 = C_2')
  }

  /* ══ ⑥ 边的焦点身份（三分支）══════════════════════════════ */

  suite('structural \\cdot edgeFocusId 的三分支')

  {
    const b = build(['G = S_4', 'H = S_3', 'f = 映射(G, H, s12->23, c->13)', 'Q = 商(G, H)'])
    const es = edgesOf(b.objects)

    const mapEdge = es.find((e) => e.id === `map:f`)
    eq('显式映射：焦点 = 对象本身（能接着 ker / im）', mapEdge?.focus, 'f')
    const piEdge = es.find((e) => e.info?.kind === 'naturalProjection')
    ok('伴生边：焦点带 struct: 前缀（不与对象名撞——NAME_RE 不许冒号）', !!piEdge?.focus?.startsWith(STRUCT_PREFIX), piEdge?.focus ?? '')
    ok('伴生边不带 objectId（不是一等对象）', piEdge?.objectId === null, String(piEdge?.objectId))

    // 来源线（provenance）：没有对象也没有结构身份 -> 不可点
    const prov = es.filter((e) => e.info === null && e.objectId === null)
    ok('来源线全部不可点（焦点 null）', prov.every((e) => e.focus === null), `count=${prov.length}`)
  }
}
