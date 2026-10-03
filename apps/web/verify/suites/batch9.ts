/**
 * 第十七批（2026-09-30 用户实测反馈）的语义层回归。
 *
 * 对应 `docs/USABILITY.md` §6 的 ㉑–㉔：
 *   ㉑ `N_G` / `C_G` 的跨表示分诊 —— core 对"第二参放不进第一参"是**静默**的
 *      （`getNormalizer` 返回空集 ⇒ 画布上长出 **0 阶的"群"**；`getCentralizer` 返回**整个群**）
 *   ㉒ 求值的异常兜底 —— core 抛异常不许漏进界面
 *   ㉓ 商群（陪集层）上的元素记号 —— `e` 必须是单位元（曾被当成生成元：`ord(Q, e) = 2`）
 *   ㉔ 画布自动保存（`gal/board.ts`）—— 刷新回来还是这张图
 */
import { evalExpr } from '../../src/gal/evalDef'
import { build } from '../harness'
import {
  BOARD_KEY,
  clearBoardLines,
  loadBoardLines,
  saveBoardLines,
  type StorageLike,
} from '../../src/gal/board'
import { eq, ok, suite } from '../harness'

/** 内存版 localStorage（语义层没有浏览器存储） */
function memStorage(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v)
    },
    removeItem: (k) => {
      m.delete(k)
    },
  }
}

export function run(): void {
  suite('batch9 \\cdot ㉑ N_G / C_G 的跨表示分诊（不再静默给空集 / 整个群）')

  {
    const b = build(['A = S_4', 'B = A_4', 'V = V_4'])
    const byId = new Map(b.objects.map((o) => [o.id, o]))
    const order = (e: string) => {
      const r = evalExpr(e, byId)
      return r.ok && r.value.type === 'group' ? r.value.group.order : null
    }
    const err = (e: string) => {
      const r = evalExpr(e, byId)
      return r.ok ? null : r.error
    }

    /* ── 正解必须照旧 ───────────────────────────────── */
    eq('N_G(S_4, A_4) = S_4（24 阶）', order('N_G(A, B)'), 24)
    eq('C_G(S_4, A_4) = Z(S_4) = {e}', order('C_G(A, B)'), 1)
    eq('C_G(A_4, A_4) = Z(A_4) = {e}（A₄ 无中心）', order('C_G(B, B)'), 1)

    /* ── 错位：从前 4 条静默给错值、1 条直接崩 ─────────── */
    ok('N_G(A_4, S_4) 报错（从前静默给 0 阶群）', err('N_G(B, A)') !== null, err('N_G(B, A)') ?? '')
    ok(
      '措辞是"元素不在同一个群里"',
      (err('N_G(B, A)') ?? '').includes('不在'),
      err('N_G(B, A)') ?? '',
    )
    ok('N_G(S_4, 独立 V_4) 报错（从前静默给 0 阶群）', err('N_G(A, V)') !== null)
    ok('N_G(A_4, 独立 V_4) 报错（从前静默给 0 阶群）', err('N_G(B, V)') !== null)
    ok('N_G(V_4, S_4) 报错（从前直接抛异常）', err('N_G(V, A)') !== null)
    ok('C_G(A_4, S_4) 报错（从前静默给 1，看着像"只有单位元交换"）', err('C_G(B, A)') !== null)
    ok('C_G(A_4, 独立 V_4) 报错（从前静默给 12 = 整个群）', err('C_G(B, V)') !== null)
    ok('C_G(S_4, 独立 V_4) 报错（从前静默给 24 = 整个群）', err('C_G(A, V)') !== null)

    /* ── 出路：给可照抄的配方（不是干巴巴一句"错了"）──── */
    const hint = (() => {
      const r = evalExpr('C_G(A, V)', byId)
      return r.ok ? '' : (r.hint ?? '')
    })()
    ok('失败时给出路（配方 / 下一步）', hint.length > 0, hint)

    /* ── 独立 V₄ 的正确姿势：先在 A₄ 里把它构造出来 ───── */
    eq(
      'C_G(A_4, closure(A_4, (12)(34), (13)(24))) = Klein（4 阶）',
      order('C_G(B, closure(B, (12)(34), (13)(24)))'),
      4,
    )
    eq(
      'N_G(A_4, closure(...)) = A_4（Klein 正规）',
      order('N_G(B, closure(B, (12)(34), (13)(24)))'),
      12,
    )
  }

  suite('batch9 \\cdot ㉑ 画布上不该出现 0 阶的"群"')

  {
    const b = build(['A = S_4', 'B = A_4', 'V = V_4', 'Q = quotient(A, B)'])
    const byId = new Map(b.objects.map((o) => [o.id, o]))
    const probe = [
      'N_G(B, A)', 'N_G(A, V)', 'N_G(B, V)', 'N_G(V, A)',
      'C_G(B, A)', 'C_G(B, V)', 'C_G(A, V)',
      'N_G(Q, A)', 'C_G(A, Q)',
    ]
    for (const e of probe) {
      const r = evalExpr(e, byId)
      const zero = r.ok && r.value.type === 'group' && r.value.group.order === 0
      ok(`${e} 不产出 0 阶群对象`, !zero, zero ? '居然建出来了' : '')
    }
  }

  suite('batch9 \\cdot ㉓ 商群（陪集层）的元素记号')

  {
    const b = build(['A = S_4', 'B = A_4', 'Q = quotient(A, B)', 'R = quotient(A, V_4)'])
    const byId = new Map(b.objects.map((o) => [o.id, o]))

    const num = (e: string) => {
      const r = evalExpr(e, byId)
      return r.ok && r.value.type === 'number' ? r.value.value : null
    }
    const ord2 = (e: string) => {
      const r = evalExpr(e, byId)
      return r.ok && r.value.type === 'group' ? r.value.group.order : null
    }

    // 陪集层：core 给单位元的 label 是 `e, \dots`，pretty 回认命不中 ⇒ 曾被桥当生成元
    eq('商群里 ord(e) = 1（从前是 2）', num('ord(Q, e)'), 1)
    eq('商群里 closure(Q, e) = 平凡群（从前是 2 阶）', ord2('closure(Q, e)'), 1)
    eq('普通群 ord(e) 照旧 = 1', num('ord(B, e)'), 1)
    eq('生成元的阶照旧 = 2（Q ≅ C_2）', num('ord(Q, qcoset-1)'), 2)
    eq('另一条商链上的单位元也是 1', num('ord(R, e)'), 1)
  }

  suite('batch9 \\cdot ㉒ 求值的异常兜底（core 崩了也要给人话）')

  {
    const b = build(['A = S_4', 'B = A_4', 'Q = quotient(A, B)'])
    const byId = new Map(b.objects.map((o) => [o.id, o]))
    /**
     * 加固之后**已知的崩点都没了**，所以这里测的不是"某条错输入会崩"，
     * 而是**求值层对任何怪输入都不许把异常漏出去** —— 真实用户会打各种半截表达式。
     */
    const junk = [
      'N_G(', '来(', 'quotient(quotient(quotient(A, B), B), B)', 'closure(closure(closure(A, e), e), e)',
      'G / / N', '()', '((()))', 'A \\cap', '\\cong \\cong', 'Z(', 'Z()',
      'N_G(N_G(A, B), C_G(A, B))', 'quotient(intersection(union(A, B), difference(A, B)), B)',
      'ord(ord(A, e), e)', 'x'.repeat(300), '', '   ', 'image(quotient(A, B), A)',
      'orbits(quotient(A, B), e)', 'stabilizer(conjAction(A), e)',
    ]
    for (const j of junk) {
      let threw: string | null = null
      try {
        evalExpr(j, byId)
      } catch (e) {
        threw = e instanceof Error ? e.message : String(e)
      }
      ok(`「${j.slice(0, 24)}」不把异常漏出来`, threw === null, threw ?? '')
    }
  }

  suite('batch9 \\cdot ㉔ 画布自动保存（gal/board.ts）')

  {
    const s = memStorage()
    eq('没存过 → null（回落到默认示范）', loadBoardLines(s), null)

    saveBoardLines(['A = S_4', 'B = quotient(A, V_4)'], s)
    const back = loadBoardLines(s)
    eq('存进去两行', back?.length, 2)
    eq('第一行原样回来', back?.[0], 'A = S_4')
    eq('第二行原样回来', back?.[1], 'B = quotient(A, V_4)')

    /**
     * 空画布不能删档 —— 删了就回到"从来没存过"，刷新时默认示范页**又冒出来**
     * （走查里实测踩到）。所以清空写的是空数组，与 `null` 分得开。
     */
    saveBoardLines([], s)
    const empty = loadBoardLines(s)
    ok('空画布存成空数组（不是删档）', Array.isArray(empty) && empty.length === 0, JSON.stringify(empty))

    saveBoardLines(['A = S_4'], s)
    s.setItem(BOARD_KEY, '{"v":1,"lines":"不是数组"}')
    eq('坏数据（lines 不是数组）→ null', loadBoardLines(s), null)
    s.setItem(BOARD_KEY, '{"v":2,"lines":["A = S_4"]}')
    eq('版本对不上 → null', loadBoardLines(s), null)
    s.setItem(BOARD_KEY, '{"v":1,"lines":["A = S_4\\nB = A_4"]}')
    eq('一行里混了换行 → null', loadBoardLines(s), null)
    s.setItem(BOARD_KEY, '{{{')
    eq('JSON 坏了 → null', loadBoardLines(s), null)

    saveBoardLines(['A = S_4'], s)
    clearBoardLines(s)
    eq('显式清档', loadBoardLines(s), null)
  }
}
