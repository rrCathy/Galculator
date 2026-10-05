/**
 * U51 回归线（2026-10-02）：半直积 `⋊` —— **记号欠定**时不许糊弄，要分诊。
 *
 * 起因是用户的两个追问（截图 + "所以到底是什么？GL(2,Z/4Z)，(C2)^4⋊S3 算不出来？"）：
 *
 *   · `GL(2,Z/4Z)` —— 群是确定的（96 阶），只是矩阵群层只做了**域**（**本套不管**，
 *     见 ROADMAP 的遗留账）；
 *   · `C_2^4 : S_3` —— core 回"**找不到**满足条件的非平凡作用 φ"。**这句话是错的**：
 *     非平凡作用一抓一大把（坐标写法 16800 种），core 把"不唯一"说成了"不存在"；
 *   · `C_2^2 : C_3` 更直接 —— 非平凡作用**唯一**（于是群唯一 = A_4），core 把有解说成无解。
 *
 * 三条判据（本套守的就是它们）：
 *   ① **「找不到」和「太多」是两件事** —— 分诊必须分开说；
 *   ② **唯一就建**（`C_2^2 : C_3` → A_4）—— 记号欠定 ≠ 无解；
 *   ③ **多解不许替用户挑** —— 列候选，且候选**必须能互相区分**（同一个记号下
 *      不同作用的群符号长得一模一样，只有不变量能认）。
 *
 * 外加内半直积那条路（画布上"从 G 里挑两个子群"）：
 *   ④ **母群在场时，作用由 G 的共轭定死** —— 这时"选哪个作用"不是用户要做的决定，
 *      答案就是 G 自己；不成立时**必须披露**（不许静默换成外半直积的答案）。
 *
 * ⚠️ 期望值**全部手算**，不从运行结果抄。手算过程：
 *
 *   `C_2^2 ⋊_φ C_3`（φ 非平凡，Aut(C_2^2) = GL(2,2) = S_3 里取一个 3 阶元 —— 两个
 *     非平凡选取共轭）：`(n,g)^3 = (n·φ(g)(n)·φ(g²)(n), 1) = (n(1+g+g²), 1)`，
 *     而 1+g+g² 在 F_2 上是幂零的（(1+g+g²)(1+g) = 1+g³ = 0，g³ = 1），
 *     非零向量被打到不动点集 {0, v} 里；具体取 g = 循环 (123) 作用在三非零向量上：
 *     轨道 {a, b, ab} 是一个 3-循环，1+g+g² 把三者都送到 a + b + ab 上。
 *     逐元素数阶 → 1 个 1 阶、3 个 2 阶（N 的三个非单位元）、8 个 3 阶 ⇒ 1/3/8。
 *     12 阶非交换群只有 A_4、D_12、Dic_3 三种，阶分布分别是 1/3/8、1/7/2/2、1/1/2/6/2
 *     ⇒ **1/3/8 唯一确定 A_4**。|Z(A_4)| = 1。
 *
 *   `C_7 ⋊_φ C_3`（φ 非平凡：3 | 6 = |Aut(C_7)| ⇒ 存在）：取 ω = 2（2³ = 8 ≡ 1 mod 7，
 *     1+2+4 = 7 ≡ 0）⇒ 1+φ+φ² = 0 ⇒ 每个 (n, g^i) 满足 (n,g)^3 = (n·0, 1) = 1
 *     ⇒ 14 个元素是 3 阶（i = 1, 2 各 7 个）；N 的 6 个非单位元是 7 阶 ⇒ 1/14/6，
 *     合计 21 ✓。非交换（若交换则只有 C_21 一种，其阶分布是 1/2/6/12）。
 *
 *   `C_4 ⋊_φ C_2`（φ 只能是取逆，Aut(C_4) = C_2）：经典 D_8（8 阶）——
 *     1 个 1 阶、5 个 2 阶（r² 与 4 个反射）、2 个 4 阶（r, r³）⇒ 1/5/2，|Z| = 2。
 *
 *   `C_2^2 ⋊_φ C_4`（C_4 嵌不进 GL(2,2)：|GL(2,2)| = 6，gcd(4,6) = 2 ⇒ φ 非单，
 *     只有**非忠实**作用可退）：ker φ = ⟨g²⟩ ⇒ g² 中心；G/⟨g²⟩ ≅ C_2^2 ⋊ C_2 = D_8。
 *     逐类数阶：(n,0) 与 (n,2) 全为 2 阶（4 + 4 个，含 3 个 N 的非单位元）⇒ 7 个 2 阶；
 *     (n,1) 与 (n,3) 各 4 个 4 阶 ⇒ 8 个 ⇒ 1/7/8。Z(G)：g^i 要同时与 N 和 g 交换
 *     ⇒ i ∈ {0,2}；而 n g² 与 g 交换 ⟺ φ(g)(n) = n ⟺ n ∈ ⟨a⟩（A 是不动点集 2 维的
 *     对换）⇒ Z = {1, g², a, a g²} ≅ C_2 × C_2，|Z| = 4。
 *
 *   `C_2 ⋊ C_2`：|Aut(C_2)| = 1 ⇒ Hom(C_2, 1) 只有平凡 ⇒ 记号指的就是 C_2 × C_2
 *     （4 阶交换，1 个 1 阶 + 3 个 2 阶）。
 */
import { build, eq, ok, suite } from '../harness'
import type { GalValue } from '../../src/gal/value'
import type { Group } from '@groupviz/core'
import { OPS, opById, opTemplate, opsFor, INFIX_TABLE } from '../../src/gal/ops'

/* ── 助手 ─────────────────────────────────────────────── */

type Built = ReturnType<typeof build>

function groupOfId(b: Built, id: string): Group | null {
  const o = b.byId(id)
  return o?.value.type === 'group' ? o.value.group : null
}

/** 元素阶分布 `{阶: 个数}` —— 强不变量（抓"建出来的其实是别的同阶群"）。 */
function orderDist(g: Group): Record<number, number> {
  const dist: Record<number, number> = {}
  for (const e of g.elements) {
    let o = 1
    let x = e
    while (x.id !== g.identity.id && o < 512) {
      x = g.multiply(x, e)
      o++
    }
    dist[o] = (dist[o] ?? 0) + 1
  }
  return dist
}

/** 中心的大小（用乘法表算，不比 `elementLabel` 那套语义）。 */
function centerSize(g: Group): number {
  let n = 0
  for (const x of g.elements) {
    let okAll = true
    for (const y of g.elements) {
      if (g.multiply(x, y).id !== g.multiply(y, x).id) {
        okAll = false
        break
      }
    }
    if (okAll) n++
  }
  return n
}

const distOf = (b: Built, id: string): string => {
  const g = groupOfId(b, id)
  return g ? JSON.stringify(orderDist(g)) : 'null'
}

const asDict = (o: Record<number, number>) =>
  JSON.stringify(Object.fromEntries(Object.entries(o).sort((a, b) => Number(a[0]) - Number(b[0]))))

function groupValue(b: Built, id: string): GalValue | null {
  const o = b.byId(id)
  return o ? o.value : null
}

/** 报错行的 error / hint（最后一行必须失败）。 */
function failOf(lines: string[]): { err: string; hint: string; ms: number } {
  const t0 = Date.now()
  const b = build(lines)
  const name = lines[lines.length - 1].split('=')[0].trim()
  const st = b.line(name)
  const bad = !!st && !st.ok
  return { err: bad ? (st.error ?? '') : '', hint: bad ? (st.hint ?? '') : '', ms: Date.now() - t0 }
}

/* ── 纯文本面判据 ─────────────────────────────────────── */

/**
 * 「键盘打不出来的字符」的**唯一**判据 —— 与 `e2e/no-unicode-leak.mjs` 的
 * `ALLOWED` 逐字相同（放行 ASCII / 中文 / 中文标点 / 中文引号 / 空白）。
 *
 * 为什么不各写一份：这条边界改一次就要改两处，迟早打架。语义层能扫到的串
 * （`sub` / `err` / `hint` / `note`）就是**离出界面最近的那一层**，在这里拦住
 * 比等走查去点便宜得多 —— `——` 与 `⇒` 就是这么漏进来的（本套第一次跑就抓到）。
 */
const PLAIN_OK = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const leakChars = (s: string) => [...new Set([...s].filter((c) => !PLAIN_OK.test(c)))]

export function run(): void {
  /* ══ 1 · 外半直积的三态 ══════════════════════════════════════ */
  suite('u51 \\cdot 半直积：唯一就建（记号欠定 != 无解）')
  {
    /*
     * `C_2^2 : C_3` —— core 说"找不到非平凡作用 φ"，实际**唯一**（两个 3 阶作用共轭）。
     * 这是本条最刺眼的证据：有解被说成无解，用户连"填什么"都不知道。
     */
    const a4 = build(['P = C_2^2 \\rtimes C_3'])
    eq('|C_2^2 : C_3| = 12', groupOfId(a4, 'P')?.order ?? null, 12)
    eq('阶分布 = 1/3/8（= A_4）', distOf(a4, 'P'), asDict({ 1: 1, 2: 3, 3: 8 }))
    eq('|Z| = 1', groupOfId(a4, 'P') ? centerSize(groupOfId(a4, 'P') as Group) : null, 1)
    ok('非交换', groupOfId(a4, 'P')?.isAbelian === false, String(groupOfId(a4, 'P')?.isAbelian))

    // 12 阶非交换群只有 A_4 / D_12 / Dic_3，阶分布 1/3/8 只在 A_4 上出现 —— 同表对拍
    const both = build(['A = A_4', 'P = C_2^2 \\rtimes C_3'])
    eq('与引擎自己的 A_4 阶分布一致', distOf(both, 'P'), distOf(both, 'A'))

    /*
     * `C_7 : C_3` —— 3 | |Aut(C_7)| = 6，非平凡作用存在且唯一（两个都是取 ω 的 3 阶元）。
     * 从前这条会**退化**（core 判"没有非平凡作用"）或报错；现在必须是 21 阶非交换群。
     * 手算：14 个 3 阶 + 6 个 7 阶 + 1 个 1 阶 ⇒ 1/3:14/7:6。
     */
    const f21 = build(['P = C_7 \\rtimes C_3'])
    eq('|C_7 : C_3| = 21', groupOfId(f21, 'P')?.order ?? null, 21)
    eq('阶分布 = 1/14/6（不是 C_21 的 1/2/6/12）', distOf(f21, 'P'), asDict({ 1: 1, 3: 14, 7: 6 }))
    ok('非交换（C_21 会是交换的）', groupOfId(f21, 'P')?.isAbelian === false)

    // `C_4 : C_2` —— core 给了 symbol 却建不出（`createGroupFromSymbol` 返回 null）那一档
    const d8 = build(['P = C_4 : C_2'])
    eq('|C_4 : C_2| = 8（= D_8）', groupOfId(d8, 'P')?.order ?? null, 8)
    eq('阶分布 = 1/5/2（D_8 手算值）', distOf(d8, 'P'), asDict({ 1: 1, 2: 5, 4: 2 }))
    eq('|Z| = 2', groupOfId(d8, 'P') ? centerSize(groupOfId(d8, 'P') as Group) : null, 2)

    /*
     * `C_2^2 : C_4` —— **不存在忠实作用**（C_4 嵌不进 GL(2,2)，|GL(2,2)| = 6、
     * gcd(4,6) = 2）⇒ 必须退到非忠实。若写成"先忠实、忠实的没有就判直积"，这条会被误判成
     * `C_2^2 x C_4` —— 实测踩过这个坑（faithful / loose 双桶就是为它改的）。
     *
     * ⚠️ 光看阶分布**分不开**这两个群：`C_2^2 x C_4` 也是 1/7/8。
     *    手算 C_2^2 x C_4：o(c)=1 -> lcm(o(n),1) ∈ {1,2} 出 1 个 1 阶 + 3 个 2 阶；
     *    o(c)=2 -> 全部 lcm(·,2) = 2 出 4 个 2 阶；o(c)=4 -> 全部 4 阶出 8 个
     *    ⇒ 1/7/8，与半直积那条**一模一样**。所以判据必须再上 |Z| 与交换性：
     *    直积是交换群（|Z| = 16），而 `C_2^2 : C_4` 手算是 |Z| = 4（见文件头）。
     *    这也是 `planSemidirect` 的指纹为什么除了阶分布还要带 |Z|、|[G,G]|。
     */
    const c24 = build(['P = C_2^2 \\rtimes C_4'])
    eq('|C_2^2 : C_4| = 16（非忠实作用）', groupOfId(c24, 'P')?.order ?? null, 16)
    eq('阶分布 = 1/7/8（手算；注意 C_2^2 x C_4 也是 1/7/8）', distOf(c24, 'P'), asDict({ 1: 1, 2: 7, 4: 8 }))
    eq('|Z| = 4（手算：{1, g^2, a, a g^2} = C_2 x C_2）', groupOfId(c24, 'P') ? centerSize(groupOfId(c24, 'P') as Group) : null, 4)
    ok('非交换（真退成了直积就会是交换群、|Z| = 16）', groupOfId(c24, 'P')?.isAbelian === false)
    eq('对照：C_2^2 x C_4 的 |Z| = 16（阶分布一样，靠这条分开）', (() => {
      const d = build(['P = C_2^2 x C_4'])
      const g = groupOfId(d, 'P')
      return g ? centerSize(g) : null
    })(), 16)
  }

  suite('u51 \\cdot 半直积：多解不替用户挑，算不动说清卡在哪')
  {
    /*
     * `C_2^4 : S_3` —— 忠实作用的等价类有 **3** 个（轨道枚举互证过：
     * 3360 + 10080 + 3360 = 16800 个 (A,B) 对，全覆盖）。三类的 |Z| 分别是 4 / 2 / 1，
     * 互不同构 ⇒ 记号确实定不下一个群。
     */
    const multi = failOf(['P = C_2^4 \\rtimes S_3'])
    ok('报"不是一个群"', multi.err.includes('不是一个群'), multi.err)
    ok('说清是**几个**本质不同的选法（3 个）', multi.err.includes('3 个'), multi.err)
    ok('不再说 core 那句错话"找不到非平凡作用"', !multi.err.includes('找不到非平凡作用') && !multi.hint.includes('找不到非平凡作用'), `${multi.err} | ${multi.hint}`)
    ok('候选里给出不变量（|Z| 三个值 4 / 2 / 1 都在）', ['|Z| = 4', '|Z| = 2', '|Z| = 1'].every((s) => multi.hint.includes(s)), multi.hint)
    /*
     * 候选**必须两两分得开**：同一个记号下不同作用的群符号长得一模一样
     *（`C_{2}^{4} \rtimes_{\phi} S_{3}`），光列符号等于没列 —— 这条是本轮的核心判据之一。
     */
    const cands = multi.hint.split('；').filter((s) => s.includes('|G| = 96'))
    eq('候选三段都在（每段都带阶）', cands.length, 3)
    eq('三段互不相同（用户能据此区分）', new Set(cands).size, 3)
    ok('抽样结论标了"是下界"（分层抽样不是完整枚举，不许假装完整）', multi.hint.includes('下界'), multi.hint)
    ok('当场给结论（不是慢慢卡住）', multi.ms < 20_000, `${multi.ms}ms`)

    // 记号那条路（`:`）也要给同样的结论
    const multi2 = failOf(['P = C_2^4 : S_3'])
    ok('`C_2^4 : S_3` 与 `\\rtimes` 写法同结论', multi2.err.includes('3 个') && multi2.hint.includes('|G| = 96'), `${multi2.err} | ${multi2.hint}`)

    /*
     * 真算不动的仍然拦住，但理由必须是**本地能力**，不是"待后端"（本项目没有后端）。
     * `C_2^5`：Aut(C_2^5) = GL(5,2) 有 9999360 个，core 那条 DFS 的组合数是 28629151。
     */
    const big = failOf(['P = C_2^5 \\rtimes C_3'])
    ok('C_2^5 : C_3 拦住', big.err.length > 0, big.err)
    ok('理由说"本地不跑"、并给出压力数字', big.hint.includes('本地不跑') && big.hint.includes('30000'), big.hint)
    ok('不说"后端 / 待接入"', !big.err.includes('后端') && !big.hint.includes('后端') && !big.hint.includes('待接入'), `${big.err} | ${big.hint}`)

    // Aut 搜索守卫复用（`Aut(C_3^3)` 自身实测 8.8 秒，超过 core 自己的线）
    const c33 = failOf(['P = C_3^3 \\rtimes C_2'])
    ok('C_3^3 : C_2 也拦住（Aut 那一步就超线）', c33.err.length > 0, c33.err)
    ok('C_3^3 : C_2 当场返回', c33.ms < 2000, `${c33.ms}ms`)

    /*
     * 只有平凡作用 ⇒ 这个记号指的其实是直积。必须**说清楚**，而不是让用户以为算不出来
     * （|Aut(C_2)| = 1 ⇒ Hom(C_2, 1) 只有平凡）。
     */
    const triv = build(['P = C_2 \\rtimes C_2'])
    eq('|C_2 : C_2| = 4', groupOfId(triv, 'P')?.order ?? null, 4)
    ok('是交换群（= C_2 x C_2，不是"多解"也不是"算不动"）', groupOfId(triv, 'P')?.isAbelian === true)
    ok('副行说明"只有平凡作用 ⇒ 就指直积"', (triv.byId('P')?.sub ?? '').includes('直积'), String(triv.byId('P')?.sub))
  }

  /* ══ 2 · 内半直积：母群在场时作用定死 ════════════════════════ */
  suite('u51 \\cdot 内半直积：从母群里挑两个子群，答案就是母群')
  {
    /*
     * 画布上最常发生的一种：G = S_4 摆着，挑出 A_4（正规）与一个 C_2，拉一条线。
     * 这时的作用**唯一且由 G 内的共轭给定** —— 不该被外路径报成"有 3 类"。
     * 手算：|A_4| x |C_2| = 24 = |S_4| ✓、A_4 ⊴ S_4 ✓、A_4 ∩ C_2 = 1 ✓（C_2 由奇置换生成）。
     */
    const inner = build(['G = S_4', 'N = closure(G, (123), (124))', 'K = closure(G, (12))', 'P = N \\rtimes K'])
    eq('N = A_4（12 阶）', groupOfId(inner, 'N')?.order ?? null, 12)
    eq('K = C_2（2 阶）', groupOfId(inner, 'K')?.order ?? null, 2)
    eq('P = 24 阶', groupOfId(inner, 'P')?.order ?? null, 24)
    ok('P 就是母群 G **本身**（同一个对象，不是同构的另一份）', groupOfId(inner, 'P') === groupOfId(inner, 'G'))
    ok('副行说明是内半直积', (inner.byId('P')?.sub ?? '').includes('内半直积'), String(inner.byId('P')?.sub))

    /*
     * 内半直积**不成立**时必须披露是哪一条不成立，而且不许静默换成外半直积的答案
     * （换群是静默改题）。四个分支各来一个：
     */
    const byOrder = build(['G = S_4', 'K = closure(G, (12), (34))', 'L = closure(G, (13), (24))', 'P = K \\rtimes L'])
    ok('阶乘不出来：note 说清 |N| x |H| 与母群阶不等', (byOrder.byId('P')?.note ?? '').includes('阶不等'), String(byOrder.byId('P')?.note))
    ok('且副行标明"按外半直积算"（不许静默改题）', (byOrder.byId('P')?.sub ?? '').includes('外半直积'), String(byOrder.byId('P')?.sub))

    const byMeet = build(['G = D_4', 'N = closure(G, r)', 'K = closure(G, r2)', 'P = N \\rtimes K'])
    ok('交不平凡：note 说"相交于 2 个元素"', (byMeet.byId('P')?.note ?? '').includes('相交于 2 个元素'), String(byMeet.byId('P')?.note))

    const byNormal = build(['G = S_4', 'N = closure(G, (12))', 'K = closure(G, (123), (124))', 'P = N \\rtimes K'])
    const nNote = byNormal.byId('P')?.note ?? ''
    ok('左边不正规：note 说"不正规"', nNote.includes('不正规'), nNote)
    ok('并指出右边反过来正规、对调即可（省用户一次试错）', nNote.includes('对调'), nNote)

    /*
     * **各造各的**两个群（没有共同母群）不是"内半直积不成立"，是"这条路不适用"——
     * 混为一谈会让用户以为自己哪里写错了。
     */
    const unrelated = build(['A = C_2', 'B = C_2', 'P = A \\rtimes B'])
    eq('两个独立 C_2 走外路径：4 阶', groupOfId(unrelated, 'P')?.order ?? null, 4)
    eq('不多嘴说"内半直积"', unrelated.byId('P')?.note ?? null, null)
    ok('副行里没有"外半直积"字样', !(unrelated.byId('P')?.sub ?? '').includes('外半直积'), String(unrelated.byId('P')?.sub))

    /*
     * 母群超过子群枚举线（144）也要成立 —— 正规性走**逐生成元共轭**（O(|生成元| x |N|)），
     * 不借 `findAllNormalSubgroups`（那条路在 144 阶以上直接不判）。
     * D_100：|N| = 100（⟨r⟩ 正规）、|K| = 2（⟨s⟩）、100 x 2 = 200 = |D_100| ✓。
     */
    const big = build(['G = D_100', 'N = closure(G, r)', 'K = closure(G, s)', 'P = N \\rtimes K'])
    eq('母群 200 阶（远超子群枚举线）照样判出内半直积', groupOfId(big, 'P')?.order ?? null, 200)
    ok('P 就是 D_100 本身', groupOfId(big, 'P') === groupOfId(big, 'G'))
  }

  /* ══ 3 · 四个入口（画布上自动获得）══════════════════════════ */
  suite('u51 \\cdot 半直积 op：四个入口从注册表派生，自动就有')
  {
    const def = opById('semidirectProduct')
    ok('注册表里有 semidirectProduct', !!def, 'byId 返回 undefined')
    eq('两个参数、无可选', `${def?.arity}/${def?.optional ?? 0}/${def?.params.map((p) => p.type).join(',')}`, '2/0/group,group')
    eq('产出群', def?.result, 'group')
    ok('中缀收 `\\rtimes`', (def?.infix ?? []).includes('\\rtimes'), String(def?.infix))
    ok('调用名全是 ASCII（U54 起不收中文别名）', (def?.call ?? []).every((c) => /^[\x21-\x7e]+$/.test(c)), String(def?.call))
    eq('面板模板可照抄（G \\rtimes H）', opTemplate(def!), 'G \\rtimes H')
    eq('面板模板真的打得出结果（同一个注册表）', (() => {
      const r = build(['G = C_3', 'H = C_3', 'P = G \\rtimes H'])
      return r.err('P') ?? String(groupOfId(r, 'P')?.order)
    })(), '9')

    ok('中缀表里 `\\rtimes` 指向它', INFIX_TABLE.some((x) => x.sym === '\\rtimes' && x.op.id === 'semidirectProduct'))
    ok('没有把 `:` 也收进中缀表（`:` 那条路由输入层的记号分诊接）', !INFIX_TABLE.some((x) => x.sym === ':'))

    // 画布上选中两个群 → 菜单里必须**列得出**（列不出等于这个 op 在画布上不存在）
    const r = build(['G = C_3', 'H = C_3'])
    const sel = ['G', 'H'].map((id) => groupValue(r, id)).filter((v): v is GalValue => !!v)
    const listed = opsFor(sel).map((o) => o.id)
    ok('选中两个群时列得出「半直积」', listed.includes('semidirectProduct'), listed.join(','))
    ok('选一个群时不列（还差一个群）', !opsFor([sel[0]]).map((o) => o.id).includes('semidirectProduct'))

    // 注册表自洽：每个 op 的参数表长度 == arity + optional（模块加载时已断言，这里再钉一次）
    // （U52 又加了一条「自定义作用」→ 41；U53 再加「点集」「集合」→ 43；U55 加「小群表」→ 44；
    //  这条断言的用意是"有人动过面就得有人知道"）
    ok('注册表长度就是 45 条（U51 半直积 + U52 自定义作用 + U53 点集/集合 + U55 小群表 + U60 代数结构）', OPS.length === 45, String(OPS.length))

    /*
     * **预算预检**（菜单不撒谎）：`A_4 ⋊ S_4` 那条要枚举 160 组生成元像、
     * 每组建一个 288 阶群再算指纹 —— 实测单候选 ~90ms、合计 14 秒。列出来就是撒谎。
     * 判据与 `planSemidirect` 的首道门共用 `semidirectBudget`，所以两处一定一致。
     */
    const big2 = build(['A = A_4', 'G = S_4'])
    const bigSel = ['A', 'G'].map((id) => groupValue(big2, id)).filter((v): v is GalValue => !!v)
    const bigListed = opsFor(bigSel).map((o) => o.id)
    ok('S_4 与 A_4（288 阶，超规模线）：菜单**不列**半直积', !bigListed.includes('semidirectProduct'), bigListed.join(','))
    ok('同一对对象下，直积照列（它没预算问题）', bigListed.includes('directProduct'), bigListed.join(','))
    eq('的确是被预算拦下的（同一对参数直接调那个 op 会报错）', (() => {
      const r = build(['A = A_4', 'G = S_4', 'P = A \\rtimes G'])
      return r.err('P') !== null
    })(), true)
    // 线内的一对必须仍然列得出（别把预检做成"一律不列"）
    const small = build(['A = C_2^2', 'B = C_3'])
    const smallSel = ['A', 'B'].map((id) => groupValue(small, id)).filter((v): v is GalValue => !!v)
    ok('线内的一对（C_2^2 与 C_3）照列', opsFor(smallSel).map((o) => o.id).includes('semidirectProduct'))
  }

  /* ══ 4 · 措辞：报错语落在纯文本面上 ══════════════════════════ */
  suite('u51 \\cdot 措辞：纯文本面不写 LaTeX，也不许说"待后端"')
  {
    const cases = [
      ['C_2^4 \\rtimes S_3', '多解'],
      ['C_2^5 \\rtimes C_3', '算不动'],
      ['C_3^3 \\rtimes C_2', 'Aut 超线'],
      ['C_2^4 : S_3', '记号路的多解'],
      ['C_2^4:C_3', '记号路的紧凑写法'],
    ]
    for (const [expr, tag] of cases) {
      const f = failOf([`P = ${expr}`])
      const all = `${f.err} ${f.hint}`
      ok(`${tag}：有话说`, all.trim().length > 8, all)
      ok(`${tag}：不出现反斜杠（纯文本面不写 LaTeX 命令）`, !all.includes('\\'), all)
      ok(`${tag}：不出现花括号（记号不该原样进状态行）`, !all.includes('{') && !all.includes('}'), all)
      ok(`${tag}：不说"后端 / 待接入 / 尚未接入 / GAP"`, !['后端', '待接入', '尚未接入', 'GAP'].some((w) => all.includes(w)), all)
      // 键盘打不出来的字符（`—` `⇒` `·` `×` …）—— 与走查同一条判据
      ok(`${tag}：没有键盘打不出的字符`, leakChars(all).length === 0, leakChars(all).join('') + ' :: ' + all)
    }

    /*
     * 成功那几条路的显示串同样要过这一关 —— `sub` 落在 `.composer-status` 的
     * `.status-meta`（`flex: none`，不换行），`note` 进对象记录，都是**离界面最近**的文本。
     */
    const shown: Array<[string, Built]> = [
      ['唯一就建（C_2^2 : C_3）', build(['P = C_2^2 \\rtimes C_3'])],
      ['退成直积（C_2 : C_2）', build(['P = C_2 \\rtimes C_2'])],
      ['内半直积（S_4 里挑两个子群）', build(['G = S_4', 'N = closure(G, (123), (124))', 'K = closure(G, (12))', 'P = N \\rtimes K'])],
    ]
    for (const [tag, r] of shown) {
      const o = r.byId('P')
      const text = `${o?.sub ?? ''} ${o?.note ?? ''} ${o?.label ?? ''}`
      ok(`${tag}：显示串里没有键盘打不出的字符`, leakChars(text).length === 0, leakChars(text).join('') + ' :: ' + text)
    }

    // 多解那条的候选列表是**最长**的一段显示文本，单独钉一遍
    const mm = failOf(['P = C_2^4 \\rtimes S_3'])
    ok('多解候选列表里没有键盘打不出的字符', leakChars(mm.hint).length === 0, leakChars(mm.hint).join('') + ' :: ' + mm.hint)

    // 报错语里必须有"出路"，不能只判死刑
    const f = failOf(['P = C_2^4 \\rtimes S_3'])
    ok('多解时报错语给出路（SmallGroup 或从母群里挑子群）', f.hint.includes('smallGroup') || f.hint.includes('内半直积'), f.hint)
  }
}
