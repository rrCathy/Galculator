/**
 * 回归：**格点与吸附**（`gal/grid.ts`，U10 的纯函数层）。
 *
 * 这一份补的是第五批最该补的缺口：`grid.ts` 从 U10 落地起就**零断言**，
 * 而它是"对象落在格点上"这条硬规范（DIAGRAM_SPEC §1.1）的唯一实现——
 * 格点算错了，画布上的一切对齐都错，但只看图看不出来（"差不多对齐"很像对齐）。
 *
 * 期望值**全部手算**，不从运行结果抄。
 */
import { gridOf, gridKey, gridSpec, nearestGridPoint, quantize, snapToGrid, visibleGridPoints } from '../../src/gal/grid'
import { eq, ok, suite } from '../harness'

/** 一份干净的手算基准：原点 0、步长 100（世界坐标） */
const SPEC = { x0: 0, y0: 0, stepX: 100, stepY: 100 }

export function run(): void {
  /* ══ ① 步长：中位间距粗化到 4 的倍数 ═════════════════════ */

  suite('grid · 步长取自"相邻间距的中位数"（粗化到 4 的倍数）')
  {
    // 等距：gaps = [100,100] → 中位 100 → round(100/4)*4 = 100
    const even = gridSpec([0, 100, 200], [0, 96])
    eq('等距列：步长 = 100', even.stepX, 100)
    eq('等距行：96 已是 4 的倍数，原样', even.stepY, 96)
    eq('原点取第一个位置', even.x0, 0)

    // 不均匀：gaps = [100,110,90] → 排序 [90,100,110] → 中位（下标 3/2=1）= 100
    const uneven = gridSpec([0, 100, 210, 300], [0, 50])
    eq('不均匀列宽：中位数说了算（不是平均）', uneven.stepX, 100)

    // 粗化：99 → round(24.75)=25 → 100；97 → round(24.25)=24 → 96
    eq('99 粗化到 100', gridSpec([0, 99], [0, 100]).stepX, 100)
    eq('97 粗化到 96', gridSpec([0, 97], [0, 100]).stepX, 96)

    // 下限 MIN_STEP = 48：10 → round(2.5)=3 → 12 → 抬到 48
    eq('过密的列被抬到下限 48', gridSpec([0, 10], [0, 100]).stepX, 48)

    // 无内容 / 单个值 → 兜底步长（112 / 96），不炸
    const empty = gridSpec([], [])
    eq('空输入：原点 0，列步长走兜底 112', `${empty.x0},${empty.stepX}`, '0,112')
    eq('空输入：行步长走兜底 96', empty.stepY, 96)
    const single = gridSpec([50], [30])
    eq('单值：原点就是它，步长走兜底', `${single.x0},${single.y0}`, '50,30')
  }

  /* ══ ② 量化：落到网格线，且严格递增 ══════════════════════ */

  suite('grid · 量化到网格线（并保证严格递增）')
  {
    eq('已然在格上的原样不动', quantize([0, 100, 205], 0, 100).join(','), '0,100,200')

    // **这条是那个"顺手拉平"的关键**：三个挤在一起的理想位置
    // 量化后全落到 col 0，若不设防就会重叠 —— 后移一格。
    eq('挤到同一格 → 后面那个往后挪', quantize([0, 10, 20], 0, 100).join(','), '0,100,200')
    eq('三个完全重合的也拉成等距', quantize([0, 0, 0], 0, 100).join(','), '0,100,200')

    eq('原点不为 0 时按它对齐', quantize([50, 150], 50, 100).join(','), '50,150')
    eq('负方向同样量化', quantize([-130], 0, 100).join(','), '-100')
    ok('结果为负也不算错（网格是无限的）', quantize([-130, -40], 0, 100)[0] === -100)

    // 拉平列宽差：100/110/90 变成 100/100/100 —— DIAGRAM_SPEC §2.2 的承诺
    const xs = [0, 100, 210, 300]
    const spec = gridSpec(xs, [])
    const q = quantize(xs, spec.x0, spec.stepX)
    eq('不均匀的理想列位被拉平为等距', q.map((v, i) => (i === 0 ? 0 : v - q[i - 1])).join(','), '0,100,100,100')
  }

  /* ══ ③ 最近格点：网格无限延伸 ═══════════════════════════ */

  suite('grid · 最近格点（col/row 可负 —— 网格无限延伸）')
  {
    const a = nearestGridPoint(40, 60, SPEC)
    eq('(40,60) 落在 (col0,row1)', `${a.col},${a.row}`, '0,1')
    eq('并还原出世界坐标', `${a.x},${a.y}`, '0,100')

    const b = nearestGridPoint(60, 40, SPEC)
    eq('(60,40) 落在 (col1,row0)', `${b.col},${b.row}`, '1,0')

    const c = nearestGridPoint(-140, -40, SPEC)
    eq('负方向：col 可为负', c.col, -1)
    eq('负方向：row 归零（-0 与 0 同一个格点）', String(c.row), '0')

    // 无限性：跑到一万以外仍有格点，且索引如实增长
    const far = nearestGridPoint(100000, 0, SPEC)
    eq('一万以外：col 如实涨到 1000', far.col, 1000)
    eq('且坐标真的在那儿', far.x, 100000)

    eq('占位键形态 col:row', gridOf(40, 60, SPEC), '0:1')
    eq('负数键形态', gridOf(-140, -40, SPEC), '-1:0')
    eq('gridKey 与 gridOf 一致', gridKey(-1, 0), gridOf(-140, -40, SPEC))
  }

  /* ══ ④ 可见格点：按视口现算（不是预生成的有限表）══════════ */

  suite('grid · 可见格点按视口现算')
  {
    const box = { x0: 0, y0: 0, x1: 100, y1: 100 }
    const pts = visibleGridPoints(box, SPEC)
    eq('100×100 的视口给出 2×2 = 4 个格点（含边界）', pts.length, 4)
    eq('索引从 0 开始', `${pts[0].col},${pts[0].row}`, '0,0')
    eq('最后一个在 (1,1)', `${pts[3].col},${pts[3].row}`, '1,1')

    // **无限延伸**：视口平移到五千以外，格点照样铺满 ——
    // 这条是用户在 U10 当天额外提的要求（"格点应该遍布全画布（即无限延伸）"），
    // 判据不能是"总有几个点"，必须是"**那一片**有那几个点"。
    const far = visibleGridPoints({ x0: 5000, y0: 3000, x1: 5100, y1: 3100 }, SPEC)
    eq('五千以外的视口同样铺满 4 个', far.length, 4)
    eq('而且索引跟到了那儿（col 从 50 起）', far[0].col, 50)
    eq('行索引也跟到了（row 从 30 起）', far[0].row, 30)

    // 非对齐视口：起点向上取整、终点向下取整，两头都不能多给
    // 手算：10~210 → col 从 ceil(0.1)=1 到 floor(2.1)=2 → 只有 1、2 两列（0 与 3 都在视口外）
    const off = visibleGridPoints({ x0: 10, y0: 10, x1: 210, y1: 210 }, SPEC)
    eq('非对齐视口：ceil/floor 两头都生效', off.length, 4)
    eq('第一个是 (1,1)（x=0 在视口外）', `${off[0].col},${off[0].row}`, '1,1')
    eq('最后一个是 (2,2)（x=200 刚在内，x=300 在外）', `${off[3].col},${off[3].row}`, '2,2')

    // 安全阀：缩得太小时格点会密到没意义 → 干脆不画
    eq('超过 limit 返回空（安全阀）', visibleGridPoints({ x0: 0, y0: 0, x1: 10000, y1: 10000 }, SPEC).length, 0)
    eq('恰好等于 limit 仍然画', visibleGridPoints(box, SPEC, 4).length, 4)
    eq('比 limit 多一个就不画', visibleGridPoints(box, SPEC, 3).length, 0)

    // 退化视口
    eq('反向的（退化）视口返回空', visibleGridPoints({ x0: 100, y0: 100, x1: 0, y1: 0 }, SPEC).length, 0)
  }

  /* ══ ⑤ 吸附：最近的**空格点** ═══════════════════════════ */

  suite('grid · 吸附到最近的空格点')
  {
    // 最近点空闲 → 直接给它
    const free = snapToGrid(30, 60, SPEC)
    eq('没有占用时：吸到最近点 (0,1)', `${free.col},${free.row}`, '0,1')
    eq('坐标与 nearestGridPoint 一致', `${free.x},${free.y}`, '0,100')

    // 最近点被占 → 让开
    // 手算：base=(0,1) 被占。ring=1 的 8 个候选里，到 (30,60) 最近的是
    //   (0,0) → 距离 √(30²+60²) = 67.08
    //   (1,1) → √(70²+40²) = 80.62 …… 故取 (0,0)
    const dodged = snapToGrid(30, 60, SPEC, ['0:1'])
    eq('最近点被占 → 让开，吸到 (0,0)', `${dodged.col},${dodged.row}`, '0,0')

    // 一圈全占 → 往外扩一圈（注释里的承诺：格子无限，总能找到）
    const ring1 = ['-1:0', '-1:1', '-1:2', '0:0', '0:2', '1:0', '1:1', '1:2', '0:1']
    const grown = snapToGrid(30, 60, SPEC, ring1)
    eq('一圈被占满 → 扩到第二圈', `${grown.col},${grown.row}`, '0,-1')
    ok('扩出来的点确实没被占', !ring1.includes(gridKey(grown.col, grown.row)))

    // 占用集合两种传法等价（Set / 数组）
    const asSet = snapToGrid(30, 60, SPEC, new Set(['0:1']))
    const asArr = snapToGrid(30, 60, SPEC, ['0:1'])
    eq('Set 与数组传法结果一致', `${asSet.col},${asSet.row}`, `${asArr.col},${asArr.row}`)

    // 多个空格点时取**距离**最近的（不是先遇到的）
    // 手算：base=(0,1) 被占；(0,0) 距离 67.08 胜出，虽然 (-1,0) 在候选里排更前
    const near = snapToGrid(30, 60, SPEC, ['0:1', '-1:0'])
    eq('取距离最近者而非数组里最靠前者', `${near.col},${near.row}`, '0,0')

    // 拖到很远的地方也照吸（网格无限）
    const farSnap = snapToGrid(5000, 3000, SPEC)
    eq('远方的落点照样有格点', `${farSnap.col},${farSnap.row}`, '50,30')
  }
}
