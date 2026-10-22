/**
 * 草稿区（三区 P2，2026-10-22 拍板）：**对象表上的一个状态位**，不是第四个家。
 *
 * 十条判据见 `docs/PROPOSAL-zones.md` §5 顶部。这里只负责**存取那一串 id**：
 *   · 草稿是**状态**（「我此刻把它搁在一边」），不是值的属性 ⇒ 不能并进 `homeOf`；
 *   · 它仍然是**对象**（在 `lines` 派生的对象表里）⇒ 能选中、能当参数，
 *     只是**不占画布顶点**（`App` 传给画布的 objects 会排掉这批 id）。
 *
 * 三条与 `board.ts` 一致的纪律：
 *   · `?empty=1` **不读也不写**（走查专用，免得互相污染）；
 *   · **逐项校验**，坏数据一律当"没存过"（宁可没有草稿，也不拿半份脏 id 去糊画布）；
 *   · 空数组**照原样返回**（"我把草稿清空了" ≠ "从来没存过"）。
 *
 * 为什么单独一个 key：`galculator.board:v1` 存的是**定义行**（图的唯一真相），
 * 草稿是"这些 id 此刻收在哪"，两件事分开存，任何一边写坏都不至于带崩另一边。
 */

export const DRAFTS_KEY = 'galculator.drafts:v1'

/** 草稿条数上限（防御坏数据；正常一轮用不到几十条） */
const MAX_DRAFTS = 500
/** 单个 id 长度上限（对象名不会这么长） */
const MAX_ID_LEN = 200

export interface DraftStore {
  v: 1
  ids: string[]
}

interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

function pickStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    /* 隐私模式等场景下拿不到 */
    return null
  }
}

function disabled(): boolean {
  return typeof location !== 'undefined' && location.search.includes('empty')
}

/** 读回草稿 id。`null` = 从来没存过；`[]` = 存过一次空的（用户清过）。 */
export function loadDrafts(storage?: StorageLike): string[] | null {
  if (disabled()) return null
  const s = pickStorage(storage)
  if (!s) return null
  try {
    const raw = s.getItem(DRAFTS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const d = parsed as Partial<DraftStore>
    if (d.v !== 1 || !Array.isArray(d.ids)) return null
    const ids: string[] = []
    for (const id of d.ids) {
      if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LEN) return null
      if (id.includes('\n') || id.includes('\r')) return null
      ids.push(id)
    }
    if (ids.length > MAX_DRAFTS) return null
    return ids
  } catch {
    return null
  }
}

/** 存草稿 id；**空数组也存**（表示"草稿清空了"，见 `loadDrafts`）。 */
export function saveDrafts(ids: string[], storage?: StorageLike): void {
  if (disabled()) return
  const s = pickStorage(storage)
  if (!s) return
  try {
    s.setItem(DRAFTS_KEY, JSON.stringify({ v: 1, ids } satisfies DraftStore))
  } catch {
    /* 写不了就算了——不影响本次会话 */
  }
}
