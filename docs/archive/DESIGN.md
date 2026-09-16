# 设计文档

> **已归档**（2026-09-16）。规范来源请见 `docs/` 下的当前文档；本文件的去向见本目录 `README.md`。

## 1. 产品定位

- **证明可见化器**：把"计算器"（输入 → 结果）与"证明演示"（定理 → 逐步论证）结合。
- 三档参照：
  - Desmos / GeoGebra —— 交互即时反馈（目标体验）。
  - Group Explorer —— 群论可视化参考（Cayley 图 / 群作用约定）。
  - Lean / Coq —— 形式化证明（**明确不碰**）。

## 2. 架构与引擎依赖

- 三层：前端（UI + 交换图画布）/ 证明引擎（Proof Spec 执行器）/ 计算后端（GAP）。
- **内核架构（对象模型 / 操作体系 / 求值）见 [docs/ARCHITECTURE.md](ARCHITECTURE.md)。**

### 2.1 引擎依赖（已是 npm 包）

| 包 | 版本 | 内容 |
|---|---|---|
| `@groupviz/core` | 2.3.0 | 纯算法层：群构造 / 布局 / 序列化；零 React/DOM 依赖，仅依赖 zod |
| `@groupviz/react` | 2.3.0 | 10 个受控 Scene + `useSceneState` + `SceneWindow` + i18n；peer: react 19 / three / r3f / katex |

**已发包，直接装依赖，不再 alias 源码**（原"先用 GroupViz `src/core` 源码过渡、等包再切"的方案作废）。

关键事实（v2.3.0 实测）：

- `@groupviz/react` 收录 **10 个 Scene**：`SetView` / `CycleView` / `CayleyView` / `TableView` / `CosetStripScene` / **`ActionScene`** / **`HomomorphismScene`** / `SymmetryViewScene` / `Cayley3DScene` / **`SublatticeScene`**。
- **`sylow` / `tree` / `prestable` 未 props 化、不入包** → Sylow 可视化需自绘（或用 Set / Coset 组合表达）。这是"渲染层自研"方针的直接依据。
- 官方 `API.md` 随包分发（`node_modules/@groupviz/core/API.md`），是消费端的权威 props 表。

## 3. 核心契约

### 3.1 GroupDescriptor v1（复用 GroupViz）

- 定义于 `@groupviz/core` 的 `descriptor`：`GroupDescriptorSchemaV1` / `serializeDescriptor` / `deserializeDescriptor` / `descriptorToSymbol`。
- 字段：`schemaVersion` / `symbol` / `order` / `elements` / `multiply`（乘法表，行序隐式索引）/ `properties` / `construction` / `source`。
- **计算器不重造，直接对齐。**

### 3.2 Proof Spec（自研）

- 证明模板 = 步骤序列（`claim` / `compute` / `conclude`）。
- `compute` 双 target：`local`（GroupViz 原语）/ `backend`（GAP 端点）。
- 详见 [docs/PROOF_SPEC.md](PROOF_SPEC.md)。

## 4. 计算后端

- **M0 / M1 前端即可跑通**：`@groupviz/core` 已含 Sylow I 全部原语（见 [PROOF_SPEC.md](PROOF_SPEC.md) §4），A₄ 这类小群无需后端。
- 后端（GAP）**推迟到需要时**：复用 / 扩展 GroupViz 的 GAP 后端（`gap_service.py` + import-group），补大群与 `parseGroupNotation` 的 `backend` 分支。
- 分工原则：local 原语优先，backend 补大群 / 大组合数 / 未本地化的记号。

## 5. 输入模型

- **详见 [docs/INTERACTION.md](INTERACTION.md) §3。**
- 一句话：左侧栏三区（对象 / 操作 / 数值），统一语法「名字 = 定义」。
- 记号导入：`@groupviz/core` 的 `parseGroupNotation(input)`（v2.2.2+ 统一入口；吃人类写法 `S_3` / `F21` / `C4` / `Q8` …；**本地优先**——能本地建群就不退化到后端）。
- 分层：记号 / 构造子 / 生成元（置换 / 矩阵）/ 目录点选。
- Cayley 定理：置换生成元是通用底层表示。

## 6. 展示层

- **详见 [docs/INTERACTION.md](INTERACTION.md)。**
- 画布 = **交换图**（对象=节点，操作=箭头），非坐标系；见 INTERACTION §1。
- 视觉编码：形状 = 类型（群=方 / 集合=圆 / 映射=箭头），颜色 = 来源（蓝=输入 / 紫=计算）。
- 数学符号：KaTeX（算法层输出 TeX 字符串，零依赖）。
- step-through：逐步高亮论证对象。

## 7. 待补细节（TODO）

- 后端端点清单（推迟项）、`CoreOp` 类型化、执行器错误模型。
- 架构图定稿（原会话内 SVG 未落文档）。
- `@groupviz/react` 已发包，需实测 10 个 Scene 在 Galculator 里的嵌入效果。
