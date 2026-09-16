# Galculator — 群论计算器

> 交互式「计算 + 证明可见化」工具。对标 Desmos / GeoGebra 的成熟度，填补群论领域缺失的"计算器"。

![M0.5 里程碑：操作注册表落地，群作用与子群集上画布](docs/assets/m05-ops.png)

_（M0.5 截图：`G = D_4` → `Z(G)` / `G / Z` / `Sub(G)` / `共轭作用(G)` → `轨道(A, r)`，画布自动派生交换图）_

## 为什么做

- Desmos / GeoGebra 擅长实函数与几何，但市面上**没有群论计算器**。
- 群论抽象、难入门；Sylow 定理等证明人人会背，却没人真正"看见"论证如何展开。

## 定位

- **证明可见化器**：演示性证明（模板人工写、机器在具体群上实例化 + 可视化），非形式化证明。
- MVP：**通过群作用证明 Sylow 定理**（I / II / III 三份模板）。
- 三档参照：

| 参照 | 借什么 |
|---|---|
| **Desmos / GeoGebra** | 交互即时反馈（目标体验）。但画布角色相反：它们是**输出**，本项目的画布是**操作台** |
| **Group Explorer** | 群论可视化约定（Cayley 图 / 群作用）|
| **Lean / Coq** | —— **明确不碰**。形式化是另一个宇宙的工程 |

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 + TypeScript + Vite（pnpm monorepo，`apps/web`）|
| 引擎 | `@groupviz/core` + `@groupviz/react` **v2.3.0**（npm 包，零 alias）|
| 证明引擎 | Proof Spec（自研，见 [docs/PROOF_SPEC.md](docs/PROOF_SPEC.md)）|
| 计算后端 | GAP（**推迟接入**；`@groupviz/core` 已含 Sylow I 全部原语，小群前端即够）|
| 数学渲染 | KaTeX |

## 快速开始

```bash
pnpm install
pnpm dev          # → http://127.0.0.1:5273
```

在左栏输入一行「名字 = 定义」，画布自动长出节点。**所有操作都来自一张注册表**（[`src/gal/ops.ts`](apps/web/src/gal/ops.ts)，20 条，按机制分组），左栏「可用操作」面板可点选插入：

| 输入 | 机制 | 产物 |
|---|---|---|
| `G = D_4` | 记号建群 | 群节点（方，蓝）|
| `P = G x H` | 原子构造（直积）| 群节点（方，紫）|
| `Q = G / Z` | 原子构造（商群，要求 N ⊴ G）| 群节点（方，紫）|
| `A = 共轭作用(G)` | 原子构造（作用）| 作用节点（绿虚线方）+ **作用线** |
| `Z = Z(G)` | 作用导出（中心）| 集合节点（圆，紫）|
| `O = 轨道(A, r)` · `St = 稳定子(A, r)` | 作用导出（原语）| 集合节点（圆，紫）|
| `S = Sub(G)` · `P = pSub(G, 2)` · `Syl(G, 2)` | 枚举 + 筛 | **子群集**节点（圆，紫）|
| `Cg = 换位子群(G)` | 迭代（闭包）| 集合节点（圆，紫）|
| `n = ord(G, r2)` · `C(12, 4)` · `Cmod(12, 4, 2)` | 属性 / 算术 | **数值**（左栏「数值」区，不上画布）|

画布视觉：**形状 = 类型**（群 = 方 / 集合、子群集 = 圆 / 作用 = 虚线方），**颜色 = 来源**（蓝 = 输入 / 紫 = 运算 / 绿 = 作用），
淡虚线 = 来源线，实线 + ↷ = 作用线。规则见 [docs/INTERACTION.md](docs/INTERACTION.md) §10。

## 项目结构

```
apps/web/            Vite + React 19 + TS 前端
  src/gal/
    value.ts         6 种值类型 + 子群归一化
    ops.ts           操作注册表（机制 / 调用名 / 配方 / 求值）
    evalDef.ts       五级分发求值（引用 → 调用 → 中缀 → 记号）
    build.ts         定义行 → 对象表（纯函数）
    derive.ts        对象表 → 画布图
  src/ui/            左栏三区 + 操作面板 · SVG 交换图画布 · 详情条
docs/                设计 / 架构 / 交互 / 证明 / 规划文档
```

## 项目状态

- **M0 已完成**：对象与操作的输入输出跑通。
- **M0.5 已完成**：操作层走注册表，值类型扩到 6 种，作用线与子群集上画布。
- **规划已收敛**（[INTERACTION](docs/INTERACTION.md) v2 + [ROADMAP](docs/ROADMAP.md) 的 U0–U7）：操作入口搬到对象旁边；5 条决策已定。
- 下一步 **U0**：注册表补参数类型 + `opsFor(selection)` + 集合运算叶子 + `Z(G)` 升级为真群对象。

## 文档导航

| 文档 | 内容 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 内核架构：值类型 / 10 原语 / 60+ 操作清单 / 引擎依赖 / 契约索引 |
| [docs/INTERACTION.md](docs/INTERACTION.md) | **UI 规范 v2**：操作入口（`opsFor` + 径向菜单）/ 输入层 / 集合构造器 / 画布图 / 布局 |
| [docs/PROOF_SPEC.md](docs/PROOF_SPEC.md) | Proof Spec 规范（证明模板 schema + Sylow I 实例）|
| [docs/ROADMAP.md](docs/ROADMAP.md) | 规划：UI 重构线 U0–U7 + 里程碑 M0–M4 |
| [docs/archive/](docs/archive/) | 已完成使命的历史文档（交接 prompt / 早期规划稿）|
