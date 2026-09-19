/**
 * 交换图的**格点**（DIAGRAM_SPEC §1.1）。
 *
 * 「对象落在格点上」这条硬规范里的"格点"不是一个抽象约束，而是**画布上真实的点**。
 * 它的模型是一条**规则网格**：原点 + 固定步长，向四面八方**无限延伸**——
 * 像坐标纸一样铺满画布（拖动到多远都有格点可放），而**自动布局的位置也量化到网格上**，
 * 于是"对象落在格点上"在两条路径上都成立：
 *
 *   自动布局 → 算出行列中心 → **量化到最近的网格线** → 对象精确落在网格交点上
 *   手动拖动 → 松手吸附到**最近的空格点**
 *
 * 步长取"相邻行列间距的**中位数**"（粗化到 4 的倍数，有下限）：
 * 既不会把布局压扁，又能把不均匀的列宽差**拉平成等距**——
 * 顺手解决 DIAGRAM_SPEC §2.2"节点宽度参与布局"那条。
 *
 * 这里只做纯计算（不碰 DOM），于是"量化"与"吸附"都能被单测。
 */

export interface GridSpec {
  /** 网格原点（世界坐标） */
  x0: number
  y0: number
  /** 步长（世界坐标） */
  stepX: number
  stepY: number
}

export interface GridPoint {
  /** 网格索引（可为负——网格是无限的） */
  col: number
  row: number
  /** 世界坐标 */
  x: number
  y: number
}

/** 格点的稳定键（判重 / 判占用用） */
export const gridKey = (col: number, row: number) => `${col}:${row}`

/** 无内容时的兜底步长（世界坐标；与 COL_GAP / ROW_GAP 同量级） */
const DEFAULT_STEP_X = 112
const DEFAULT_STEP_Y = 96
const MIN_STEP = 48

const snapStep = (v: number) => Math.max(MIN_STEP, Math.round(v / 4) * 4)

/** 相邻值的中位间距（不足两个值 → 0） */
function medianGap(vals: number[]): number {
  if (vals.length < 2) return 0
  const gaps: number[] = []
  for (let i = 1; i < vals.length; i++) gaps.push(Math.abs(vals[i] - vals[i - 1]))
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)]
}

/**
 * 由**布局算出的理想行列位置**推出一张规则网格。
 * 原点取第一个位置，步长取中位间距粗化——这样量化后的位置与理想位置几乎重合，
 * 只是把不均匀的间距拉平。
 */
export function gridSpec(xs: number[], ys: number[]): GridSpec {
  return {
    x0: xs.length > 0 ? xs[0] : 0,
    y0: ys.length > 0 ? ys[0] : 0,
    stepX: snapStep(medianGap(xs) || DEFAULT_STEP_X),
    stepY: snapStep(medianGap(ys) || DEFAULT_STEP_Y),
  }
}

/**
 * 把一组理想位置**量化到网格线**上，并保证**严格递增**（量化可能把相邻两个挤到同一格，
 * 那时后面那个往后挪一格）。
 */
export function quantize(vals: number[], origin: number, step: number): number[] {
  const out: number[] = []
  let prev = -Infinity
  for (let i = 0; i < vals.length; i++) {
    let q = origin + Math.round((vals[i] - origin) / step) * step
    if (i > 0) q = Math.max(q, prev + step)
    out.push(q)
    prev = q
  }
  return out
}

const colOfX = (x: number, spec: GridSpec) => Math.round((x - spec.x0) / spec.stepX)
const rowOfY = (y: number, spec: GridSpec) => Math.round((y - spec.y0) / spec.stepY)

/** 离 `(x, y)` 最近的格点（**不**考虑占用） */
export function nearestGridPoint(x: number, y: number, spec: GridSpec): GridPoint {
  const col = colOfX(x, spec)
  const row = rowOfY(y, spec)
  return { col, row, x: spec.x0 + col * spec.stepX, y: spec.y0 + row * spec.stepY }
}

/** 某个世界坐标落在哪个格点上（用于"这个节点占了哪个格点"） */
export function gridOf(x: number, y: number, spec: GridSpec): string {
  return gridKey(colOfX(x, spec), rowOfY(y, spec))
}

/** 世界矩形（渲染时按可视范围取格点用） */
export interface WorldBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * **可见范围内的格点**——网格是无限的，所以按视口现算（而不是预先生成）。
 * `limit` 是安全阀：缩得很小时格点会密到没意义，超过就不画（返回空）。
 */
export function visibleGridPoints(box: WorldBox, spec: GridSpec, limit = 600): GridPoint[] {
  const c0 = Math.ceil((box.x0 - spec.x0) / spec.stepX)
  const c1 = Math.floor((box.x1 - spec.x0) / spec.stepX)
  const r0 = Math.ceil((box.y0 - spec.y0) / spec.stepY)
  const r1 = Math.floor((box.y1 - spec.y0) / spec.stepY)
  const cols = c1 - c0 + 1
  const rows = r1 - r0 + 1
  if (cols <= 0 || rows <= 0 || cols * rows > limit) return []
  const out: GridPoint[] = []
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      out.push({ col: c, row: r, x: spec.x0 + c * spec.stepX, y: spec.y0 + r * spec.stepY })
    }
  }
  return out
}

/**
 * 吸附：找**最近的空格点**。`occupied` 里是别的节点已经占住的位置（`col:row`）。
 *
 * 为什么要跳过被占用的：直接吸到最近点会让两个节点叠在一起（拖动本来就常发生在
 * 挤在一起的图上）。网格是**无限**的，所以"最近空格点"总能在附近找到——
 * 极端情况下（一圈都被占）会往外扩一圈，也正是用户想要的。
 */
export function snapToGrid(
  x: number,
  y: number,
  spec: GridSpec,
  occupied: ReadonlySet<string> | readonly string[] = [],
): GridPoint {
  const taken = occupied instanceof Set ? occupied : new Set(occupied)
  const base = nearestGridPoint(x, y, spec)
  if (!taken.has(gridKey(base.col, base.row))) return base
  // 从最近点向外一圈圈找：半径 1、2、3……（按距离排序取第一个空格点）
  const MAX_RING = 12
  const cand: GridPoint[] = []
  for (let ring = 1; ring <= MAX_RING; ring++) {
    for (let dc = -ring; dc <= ring; dc++) {
      for (let dr = -ring; dr <= ring; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue // 只取这一圈
        cand.push({
          col: base.col + dc,
          row: base.row + dr,
          x: spec.x0 + (base.col + dc) * spec.stepX,
          y: spec.y0 + (base.row + dr) * spec.stepY,
        })
      }
    }
    const free = cand
      .filter((p) => !taken.has(gridKey(p.col, p.row)))
      .sort(
        (a, b) =>
          Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
      )
    if (free.length > 0) return free[0]
    cand.length = 0
  }
  return base // 理论上到不了：格子是无限的
}
