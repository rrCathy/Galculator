/**
 * 画布自动保存（用户实测反馈："1，我希望刷新时保存画布"）。
 *
 * 从前落盘的只有两样：**钉住位置**（`CanvasView` 的 `PIN_KEY`）与
 * **「自动补第一同构顶点」开关**（`SETTINGS_KEY`）。**定义行本身不落盘** ——
 * 于是刷新后画布空空如也，而残留的钉住位置成了孤儿：自动命名又从 `A/B/…`
 * 开始，新对象会**继承旧位置**（画布一开就是歪的）。
 *
 * 定义行是整张图的唯一真相（对象表是它的纯函数），存下它就存下了整张图；
 * 钉住与视口归画布自己管（决策 ④ 的持久化），各存各的，互不覆盖。
 *
 * **"没存过"与"存过一次空的"必须分开**：前者落默认示范页（新用户打开就有东西看），
 * 后者就是空画布（用户点过「清空画布」）。所以清空写的是**空数组**，不是删档。
 *
 * 与快照（缺口 ⑫）的分工：**快照是"用户主动要把这张图带走"**（含钉住与视口，
 * 一段文本，能贴进笔记）；这里是"**回来时还是这张图**"（静默、只装定义行）。
 *
 * `?empty=1`（走查专用的空画布）**不读也不写** —— 与钉住同一个规矩，
 * 免得走查之间互相污染。
 */

export const BOARD_KEY = 'galculator.board:v1'

/** 定义行的条数上限（防御坏数据；正常证明模板几十行） */
const MAX_LINES = 2000
/** 单行长度上限（一行定义不会这么长） */
const MAX_LINE_LEN = 2000

export interface Board {
  v: 1
  lines: string[]
}

/** 能不能读写本地存储：`?empty=1` 时不读也不写（走查专用） */
export function boardDisabled(): boolean {
  return typeof location !== 'undefined' && location.search.includes('empty')
}

/** 可注入的存储（语义层测试里没有 localStorage，传个假的进来） */
export interface StorageLike {
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

/**
 * 读回定义行。**逐项校验**：坏数据一律当"没有存过"（宁可回到默认示范页，
 * 也不要拿半张残图去糊画布）。
 */
export function loadBoardLines(storage?: StorageLike): string[] | null {
  const s = pickStorage(storage)
  if (!s) return null
  try {
    const raw = s.getItem(BOARD_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const b = parsed as Partial<Board>
    if (b.v !== 1 || !Array.isArray(b.lines)) return null
    const lines: string[] = []
    for (const l of b.lines) {
      if (typeof l !== 'string') return null
      // 一条定义就是一行：混进换行说明这份数据不是本工具写的
      if (l.length > MAX_LINE_LEN || l.includes('\n') || l.includes('\r')) return null
      lines.push(l)
    }
    if (lines.length > MAX_LINES) return null
    /**
     * **空数组照原样返回**（不是 `null`）：它是"用户清空过"，
     * 与"从来没存过"（`null` ⇒ 落默认示范页）是两件事。
     * 混成一样的话，清空画布之后一刷新，示范页又回来了（实测踩到）。
     */
    return lines
  } catch {
    return null
  }
}

/** 存定义行；**空数组也要存**（表示"用户清空过"，见 `loadBoardLines`）。 */
export function saveBoardLines(lines: string[], storage?: StorageLike): void {
  const s = pickStorage(storage)
  if (!s) return
  try {
    s.setItem(BOARD_KEY, JSON.stringify({ v: 1, lines } satisfies Board))
  } catch {
    /* 写不了就算了——不影响本次会话 */
  }
}

/** 显式清档（清空画布时用）。 */
export function clearBoardLines(storage?: StorageLike): void {
  const s = pickStorage(storage)
  if (!s) return
  try {
    s.removeItem(BOARD_KEY)
  } catch {
    /* 同上 */
  }
}
