import { AXIOM_FAIL_LABEL, STRUCTURE_LEVEL_LABEL, type AxiomProfile } from '../gal/algebra'
import { asciiSymbol } from '../gal/pretty'

/**
 * 公理档案的**读数行** —— 表格编辑器（`StructureBuilder`）与信息面板（`InfoDock`）
 * 共用的**同一份**格式化。
 *
 * 为什么抽出来：两处都要"逐条打勾打叉 + 给反例"，各写一份就等于把
 * "不结合的时候反例怎么写" 变成两条判据 —— 改了一处忘了另一处，两个面上的数字
 * 就会不一样（这个项目的老病根，见 MEMORY 的"判据散成多份就是病根"）。
 * 判据本身仍只有一份（`algebra.ts#verifyAxioms` 算出的 `AxiomProfile`），
 * 这里只负责把它**排版**成行。
 *
 * ⚠️ 输出走 **`asciiSymbol`**（纯文本面）：这两处都要落进 DOM 文本，
 * 而载体标号可能是 LaTeX（`asSet` 拿到的子群标号 `\langle ...\rangle`）。
 * 面板里那些要做 KaTeX 的地方用 `TexOrText`，而这里是一行行纯文本 —— 与
 * `labelCycleToNumeric` 的报错语同一条纪律（`pointSet.ts#labelsHint`）。
 */
export interface AxiomRow {
  /** 行名（封闭 / 结合 / 单位元 …）*/
  key: string
  /** `true` 成立 / `false` 不成立 / `null` 列表型读数（不分对错）*/
  ok: boolean | null
  /** 读数正文（纯文本，已过 `asciiSymbol`）*/
  text: string
}

/** 把一份 `AxiomProfile` 摊成逐行的读数（顺序即教材顺序：线 A 在前，判定在后）。 */
export function axiomRows(labels: string[], p: AxiomProfile): AxiomRow[] {
  const A = (i: number) => asciiSymbol(labels[i] ?? '?')
  const join = (xs: number[]) => xs.map(A).join(', ')
  const n = labels.length
  const rows: AxiomRow[] = []

  rows.push({
    key: '封闭',
    ok: p.closed,
    text: p.closed
      ? `每格都落在 ${n} 个元素里`
      : p.closedAt
        ? `第 ${p.closedAt[0] + 1} 行第 ${p.closedAt[1] + 1} 列读到 ${p.closedAt[2]}，不在 1..${n}`
        : '有格子落在载体之外',
  })
  rows.push({
    key: '结合',
    ok: p.associative,
    text: p.associative
      ? '(ab)c = a(bc) 恒成立'
      : p.assocCounterexample
        ? `反例：(${A(p.assocCounterexample[0])}${A(p.assocCounterexample[1])})${A(p.assocCounterexample[2])} != ${A(p.assocCounterexample[0])}(${A(p.assocCounterexample[1])}${A(p.assocCounterexample[2])})`
        : '不结合',
  })
  rows.push({
    key: '单位元',
    ok: p.hasIdentity,
    text: p.hasIdentity ? `e = ${A(p.identityIndex ?? 0)}` : '没有元素 e 使 ea = ae = a',
  })
  rows.push({
    key: '逆元',
    ok: p.hasInverses,
    text: p.hasInverses
      ? '每个元素都有逆'
      : p.notInvertible && p.notInvertible.length > 0
        ? `无逆：${join(p.notInvertible)}${p.notInvertible.length >= 8 ? ' ...' : ''}`
        : '无逆元可言（连单位元都没有）',
  })
  rows.push({
    key: '交换',
    ok: p.commutative,
    text: p.commutative ? 'ab = ba 恒成立' : '存在 ab != ba',
  })
  const canc = p.cancellation
  rows.push({
    key: '消去律',
    ok: canc.left && canc.right,
    text:
      canc.left && canc.right
        ? '左、右消去都成立'
        : canc.left
          ? '左成立、右不成立'
          : canc.right
            ? '右成立、左不成立'
            : '左、右都不成立',
  })
  rows.push({
    key: '拉丁方',
    ok: p.isLatin,
    text: p.isLatin
      ? '每行每列都是置换（群的必要条件，不是充分条件）'
      : p.latinBadRow !== undefined
        ? `第 ${p.latinBadRow + 1} 行有重复`
        : p.latinBadCol !== undefined
          ? `第 ${p.latinBadCol + 1} 列有重复`
          : '不是拉丁方',
  })

  // 列表型读数（不是对错，所以 `ok: null`）
  rows.push({
    key: '幂等元',
    ok: null,
    text: p.idempotents.length > 0 ? join(p.idempotents) : '（无）',
  })
  rows.push({
    key: '零元',
    ok: null,
    text: p.zeroElements.length > 0 ? join(p.zeroElements) : '（无）',
  })
  rows.push({
    key: '可逆元 U(M)',
    ok: null,
    text: p.units.length > 0 ? join(p.units) : '（无）',
  })

  return rows
}

/** 结论那一行（层级 + "就差一步"）。两个面共用，措辞不许各写各的。 */
export function verdictText(p: AxiomProfile): { level: string; gap: string | null } {
  return {
    level: STRUCTURE_LEVEL_LABEL[p.level],
    gap: p.failsAt ? AXIOM_FAIL_LABEL[p.failsAt] : null,
  }
}
