/**
 * 交换图的**格点**（DIAGRAM_SPEC §1.1）。
 *
 * 「对象落在格点上」这条硬规范里的"格点"不是一个抽象的约束，而是**画布上真实的点**：
 * 布局先定出每一列的**中心 x** 与每一行的**中心 y**，对象只允许停在它们的**交点**上。
 * 拖动节点时，松手就往最近的**空格点**吸附——所以用户看到的小点就是"能放的位置"。
 *
 * 这里只做纯计算（不碰 DOM），于是"吸附"这件事可以被单测。
 */

export interface GridPoint {
  /** 列号（0 起） */
  col: number
  /** 行号（0 起） */
  row: number
  /** 世界坐标 */
  x: number
  y: number
}

/** 格点的稳定键（判重 / 判占用用） */
export const gridKey = (col: number, row: number) => `${col}:${row}`

/** 列中心 × 行中心 → 全部格点（行优先，顺序稳定） */
export function gridPoints(xs: number[], ys: number[]): GridPoint[] {
  const out: GridPoint[] = []
  for (let r = 0; r < ys.length; r++) {
    for (let c = 0; c < xs.length; c++) out.push({ col: c, row: r, x: xs[c], y: ys[r] })
  }
  return out
}

/**
 * 离 `(x, y)` 最近的格点（**不**考虑占用）。
 * 行列分开取最近，于是结果是"最近的列 × 最近的行"——这正是网格的意义：
 * 横竖各自对齐，不是欧氏距离最近。
 */
export function nearestGridPoint(x: number, y: number, xs: number[], ys: number[]): GridPoint {
  const col = nearestIndex(xs, x)
  const row = nearestIndex(ys, y)
  return { col, row, x: xs[col], y: ys[row] }
}

function nearestIndex(vals: number[], v: number): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < vals.length; i++) {
    const d = Math.abs(vals[i] - v)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/**
 * 吸附：找**最近的空格点**。`occupied` 里是别的节点已经占住的位置（`col:row`）。
 *
 * 为什么要跳过被占用的：直接吸到最近点会让两个节点叠在一起（拖动本来就常发生在
 * 挤在一起的图上）。全被占满时退回最近点——这时候没有更好的选择。
 */
export function snapToGrid(
  x: number,
  y: number,
  xs: number[],
  ys: number[],
  occupied: ReadonlySet<string> | readonly string[] = [],
): GridPoint {
  const taken = occupied instanceof Set ? occupied : new Set(occupied)
  const all = gridPoints(xs, ys)
  const near = nearestGridPoint(x, y, xs, ys)
  const rank = (p: GridPoint) =>
    // 主序：到目标点的距离（行列各自的距离之和，等价于曼哈顿度量，与"最近行列"一致）
    Math.abs(p.x - near.x) + Math.abs(p.y - near.y) ||
    // 次序：离指针更近的优先（同距离时横竖对齐没差别，用几何距离定胜负）
    Math.abs(p.x - x) + Math.abs(p.y - y)
  const free = all
    .filter((p) => !taken.has(gridKey(p.col, p.row)))
    .sort((a, b) => rank(a) - rank(b))
  return free[0] ?? near
}

/** 某个世界坐标落在哪个格点上（用于"这个节点占了哪个格点"） */
export function gridOf(x: number, y: number, xs: number[], ys: number[]): string {
  const p = nearestGridPoint(x, y, xs, ys)
  return gridKey(p.col, p.row)
}
