/**
 * 第八批（2026-09-29 用户实测反馈）的语义层回归。
 *
 * 对应 `docs/USABILITY.md` §6 的 ⑯ / ⑰ / ⑱ / ⑭：
 *   ⑯ 对象同一性 —— `im(\phi)` 与悬浮球点出来的 `im` 必须是**同一个对象**
 *   ⑰ 同构关系 —— `R = A \cong B` 能声明，判据与信息面板同源（三态，判不出不猜）
 *   ⑱ 标签展开 —— 画布上的复合节点显示数学（`S_4 / A_4`）而不是变量名（`A / N`）
 *   ⑭ 自动补顶点开开关 —— 关掉之后 `\varphi` 只长出它自己
 */
import { deriveCanvas } from '../../src/gal/derive'
import { evalExpr } from '../../src/gal/evalDef'
import { buildLines } from '../../src/gal/build'
import { pairOps } from '../../src/gal/interaction'
import { findExistingObject } from '../../src/gal/identity'
import { renameRefs } from '../../src/gal/naming'
import type { GalValue } from '../../src/gal/value'
import { build, eq, ok, suite } from '../harness'

const ids = (objects: { id: string }[]) => objects.map((o) => o.id).sort().join(' ')

/** 值 → 同构关系的三个字段（不是 JSON.stringify：Group 里有循环引用） */
const relOf = (v: GalValue | undefined) =>
  v && v.type === 'relation'
    ? { kind: v.relation.kind ?? 'contains', label: '', iso: v.relation.isoSymbol ?? null }
    : null

export function run(): void {
  suite('batch8 \\cdot ⑯ 对象同一性（同一次推导只会有一个对象）')

  {
    const b = build(['G = C_6', 'H = C_6', '\\varphi = 映射(G, H, a->2)', 'K = ker(\\varphi)', 'I = im(\\varphi)'])
    const byId = new Map(b.objects.map((o) => [o.id, o]))
    ok('K 的指纹是「kernel + 参数 \\varphi」', byId.get('K')?.callKey === 'kernel::@\\varphi', byId.get('K')?.callKey)
    eq('I 的指纹是「image + 参数 \\varphi」', byId.get('I')?.callKey, 'image::@\\varphi')

    // 悬浮球点出来的那一下，编出来的表达式是 `im(\varphi)`；手打可能写 `像(\varphi)`。
    // 两种写法必须**归到同一个对象**（这就是用户撞上的那个坑）。
    const alias = evalExpr('像(\\varphi)', byId)
    ok('别名写法 `像(\\varphi)` 求值成功', alias.ok, alias.ok ? '' : alias.error)
    if (alias.ok) {
      eq('别名与原名的指纹相同', alias.callKey, byId.get('I')?.callKey)
      const hit = findExistingObject(b.objects, {
        callKey: alias.callKey,
        def: '像(\\varphi)',
        label: alias.label,
      })
      eq('于是它认出的就是 I（不会再长第二份）', hit?.id, 'I')
    }

    // 中缀写法与函数写法也是同一次推导
    const infix = evalExpr('G / K', byId)
    const call = evalExpr('商(G, K)', byId)
    ok('中缀 `G / K` 与 `商(G, K)` 指纹相同', !!infix.ok && !!call.ok && infix.callKey === call.callKey, `${infix.ok ? infix.callKey : infix.error}`)

    // 标量参数不同 = 不同的对象（别把 pSub(G, 2) 与 pSub(G, 3) 合并）
    const p2 = evalExpr('pSub(G, 2)', byId)
    const p3 = evalExpr('pSub(G, 3)', byId)
    ok('pSub(G, 2) 与 pSub(G, 3) 指纹不同', !!p2.ok && !!p3.ok && p2.callKey !== p3.callKey)

    // 声明类对象**没有**指纹 —— 用户要一个映射的定义域与靶群各一个，就该是两个对象
    ok('声明对象没有指纹（两个 C_6 不会被合并）', byId.get('G')?.callKey === undefined && byId.get('H')?.callKey === undefined)
    eq('G 与 H 都在表里', ids(b.objects), 'G H I K \\varphi')
  }

  suite('batch8 \\cdot ⑰ 同构关系（声明 A \\cong B）')

  {
    const b = build(['A = S_4', 'N = A_4', 'Q = 商(A, N)', 'Z = C_2', 'R = Q \\cong Z'])
    eq('Q \\cong Z 求值成功', b.err('R'), null)
    const v = b.byId('R')?.value
    eq('值类型是关系', v?.type, 'relation')
    eq('关系种类是同构', relOf(v)?.kind, 'isomorphic')
    const iso = (relOf(v)?.iso ?? '').replace(/[{}]/g, '')
    eq('识别出同构类（C_2）', iso, 'C_2')
    ok('标签用数学记号', (b.byId('R')?.label ?? '').includes('\\cong'), b.byId('R')?.label)

    // 画布上是一条**两端都有箭头**的 `\cong`（与第一同构那条同款）
    const es = deriveCanvas(b.objects).edges.filter((e) => e.kind === 'relation')
    eq('画布上有且只有一条关系边', es.length, 1)
    eq('关系边的标签是 \\cong', es[0]?.label, '\\cong')
    eq('关系边画成同构箭头', es[0]?.arrow, 'iso')
    eq('关系边可点选（背后是那个对象）', es[0]?.objectId, 'R')
  }

  {
    /**
     * **边界**（顺带记一笔，免得下一个人以为这里坏了）：关系的两端都得是
     * **画布上的对象** —— 内联的群记号（`R = Q \cong C_2` 里的 `C_2`）没有节点，
     * 画不出这条线。关系对象本身照旧存在、信息面板照旧能看。
     * 这与 U20 的 `包含` 是同一条规矩（边由对象派生，凭空的内联记号没有顶点）。
     */
    const b = build(['A = S_4', 'N = A_4', 'Q = 商(A, N)', 'R = Q \\cong C_2'])
    eq('内联记号那侧的声明照样求值成功', b.err('R'), null)
    eq('但画布上画不出这条边（那侧没有节点）', deriveCanvas(b.objects).edges.filter((e) => e.kind === 'relation').length, 0)
  }

  {
    // 阶不同 -> 必不同构（这一关不用识别，永远判得出来）
    const b = build(['A = S_4', 'N = A_4', 'R = A \\cong N'])
    ok('阶不同的同构声明被拒', !!b.err('R'), b.err('R') ?? '')
    ok('报错说的是阶', (b.err('R') ?? '').includes('阶不同'), b.err('R') ?? '')
  }

  {
    // 阶相同但结构不同 -> 判据来自同构类识别，不是"阶一样就算"
    const b = build(['R = C_6 \\cong S_3'])
    ok('C_6 与 S_3 不同构', !!b.err('R'), b.err('R') ?? '')
    ok('报错说的是"不同构"', (b.err('R') ?? '').includes('不同构'), b.err('R') ?? '')
  }

  {
    const b = build(['A = S_4', 'R = A \\cong A'])
    ok('同一个对象的同构声明被拒', !!b.err('R'), b.err('R') ?? '')
    ok('报错说的是"同一个对象"', (b.err('R') ?? '').includes('同一个对象'), b.err('R') ?? '')
  }

  {
    // 拖拽候选：同构该出现在"真的同构"的那一对上，不该出现在不同构的那一对上
    const b = build(['X = S_4', 'Y = S_4', 'Z = A_4', 'W = C_6', 'V = S_3'])
    const pick = (a: string, c: string): string[] => {
      const va = b.byId(a)?.value
      const vc = b.byId(c)?.value
      if (!va || !vc) return []
      return pairOps(va, vc).map((x) => x.op.id)
    }
    eq('两个 S_4 之间首选「同构」', pick('X', 'Y')[0], 'isomorphism')
    ok('S_4 与 A_4（阶不同）之间不列「同构」', !pick('X', 'Z').includes('isomorphism'), pick('X', 'Z').join(','))
    ok('C_6 与 S_3（阶同而不同构）之间不列「同构」', !pick('W', 'V').includes('isomorphism'), pick('W', 'V').join(','))
  }

  suite('batch8 \\cdot ⑱ 标签展开（显示数学，不显示变量名）')

  {
    const b = build(['A = S_4', 'N = A_4', 'Q = 商(A, N)'])
    eq('商节点显示 S_4 / A_4（不是 A / N）', b.byId('Q')?.label, 'S_4 / A_4')
  }

  {
    // 用户的原case（换个已验证过的映射）：`A = S_4`、`D = ker(...)`，想看到的是 D 展开
    const b = build(['G = C_6', 'H = C_6', '\\varphi = 映射(G, H, a->2)', 'D = ker(\\varphi)', 'J = G / D'])
    const j = b.byId('J')?.label ?? ''
    ok('商的分母展开成 ker(\\varphi)', j.includes('ker(\\varphi)'), j)
    ok('商的分子展开成 C_6', j.startsWith('C_6'), j)
  }

  {
    const b = build(['A = S_4', 'B = A_4', 'R = B \\subseteq A'])
    eq('包含标签两端都是数学记号', b.byId('R')?.label, 'A_4 \\trianglelefteq S_4')
  }

  {
    // 改名时同步改写别处的引用（缺口 ⑱）—— 纯函数，直接测边界
    const lines = ['A = S_4', 'J = A / K', 'M = 直积(A, B)', 'T = \\Alpha_1', 'U = AB']
    const r = renameRefs(lines, 0, 'A', 'S')
    eq('改到了引用它的两行', r.touched.join(','), '1,2')
    eq('商里的 A 改了', r.lines[1], 'J = S / K')
    eq('直积里的 A 改了', r.lines[2], 'M = 直积(S, B)')
    eq('\\Alpha_1 不动（那是命令名，不是引用）', r.lines[3], 'T = \\Alpha_1')
    eq('AB 不动（那是另一个名字）', r.lines[4], 'U = AB')
    eq('被改的那一行本身不动', r.lines[0], 'A = S_4')
  }

  suite('batch8 \\cdot ⑭ 自动补第一同构顶点的开关')

  {
    const on = buildLines(['G = C_6', 'H = C_6', '\\varphi = 映射(G, H, a->2)'])
    eq('默认开着：补出两个顶点', ids(on.objects), 'G H \\varphi \\varphi/im \\varphi/ker')
    const off = buildLines(['G = C_6', 'H = C_6', '\\varphi = 映射(G, H, a->2)'], { autoFirstIso: false })
    eq('关掉之后只长 \\varphi 自己', ids(off.objects), 'G H \\varphi')
  }
}
