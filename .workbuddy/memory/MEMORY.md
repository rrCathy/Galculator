# Galculator 项目长期笔记

## 项目定位
群论计算器——交互式"计算 + 证明可见化"工具，对标 Desmos/GeoGebra。市面空白领域。

## 已定决策
- 部署：web 优先，成熟后做 app。
- 计算栈：Sage/GAP 后端（SymPy 不做主力）。
- 可视化：GroupViz 引擎（import 包），非 iframe。
- 风格：交换图（commutative diagram）简约风，参考 Desmos。

## 核心契约（最高优先打磨）
1. **群描述 = GroupViz 的 GroupDescriptor v1**（src/core/descriptor.ts，zod：symbol/order/elements/multiply 乘法表/properties/construction/source）。不重造 Group Spec，直接对齐。
2. **Proof Spec（计算器独有）**：证明模板 = 步骤序列（声明 | 计算调用）+ 展示方式（符号/交换图/高亮）。Sylow I/II/III = 三份模板。

## MVP
通过群作用证明 Sylow 定理（演示性证明，非形式化）。群作用为一级对象。Wielandt 证明步骤：pᵏ 元子集 → 轨道分解 → orbit-stabilizer → 夹逼。

## 关键协作（GroupViz 对接）
- **双包已发布**：`@groupviz/core` / `@groupviz/react` 均 **v2.3.0**（2026-09 实测）。core 纯算法、零 React/DOM；react 收录 **10 个受控 Scene**。
- GroupViz 已有 GAP 4.16 后端（backend/gap_service.py + import-group + 六端点）。
- Sylow 已算结果（computeSylowAnalysis）未算证明；群作用五源（actions.ts）是 Proof Spec 的原语。
- 对接四结论：①群描述复用 GroupDescriptor v1 ②护城河=证明层 ③后端扩展 GroupViz GAP 不另起 Sage ④Proof Spec 执行器放前端。

## 已拍板（2026-09）
- 依赖：**直接装 `@groupviz/core` + `@groupviz/react` v2.3.0**（原"先用 `src/core` 源码 alias"方案作废——包已发布）。
- 后端：扩展 GroupViz 的 GAP 后端；但 **M0/M1 前端即够**，后端推迟到需要时。
- 演示性证明（非形式化）；Sylow I/II/III = 三份模板，全做。
- 渲染层**自研交换图画布**（core 的 `computeLatticeLayout` + 自写 SVG）：`@groupviz/react` 虽已发包，但 **`sylow` 视图未入包**，且证明可见化本就要自绘。
- GroupViz 侧对接待办已完成：门面导出 `descriptor` / `src/core` 越界引用清零 / 新增 `binomialMod`（Lucas）。

## 交互模型（2026-09-13 定稿，docs/INTERACTION.md）
- 画布 = **交换图**（对象=节点，操作=箭头，位置由关系决定），非坐标系。
- 视觉编码：**形状=类型**（群=方 / 集合=圆 / 映射=箭头 / 作用=作用线），**颜色=来源**（蓝=输入 / 紫=计算）。
- 输入：左侧栏**三区**（对象 / 操作 / 数值），统一语法「名字 = 定义」；对象与操作在输入层同构。
- **操作 = 结果对象 + 结构伴生**（伴生的映射/作用/包含 = 交换图箭头的真正来源，图由操作"长"出来）。
- 两种边：映射边（实线，一等对象）/ 来源线（淡虚线，辅助，默认显示可关）。
- 布局：分层（Sugiyama）+ **混合位置**（系统自动标准布局 + 用户拖拽微调 + 网格吸附）。
- 数值进「数值区（栈）」，不上画布。
- 节点浓缩两分：**数学浓缩**（复合节点，如商 G/N，复用 GroupViz `cosetInternal*` 字段）/ **视觉折叠**（纯收纳）。
- **画布图契约（§10）**：`CanvasGraph { nodes, edges }` 由 `derive(objects, ops)` 派生（非手画）。Node: kind(group|set) / origin(input|derived) / label / sub / level / collapse / ref；Edge: kind(map 实线 | provenance 淡虚线)。布局用 core `computeLatticeLayout`，拥挤用其 **LOD 三档**（full/compact/dots）；数学浓缩用 `mergeLatticeByConjugacy`。

## core 关键导出（v2.3.0，Proof Spec op 对标）
- 记号：`parseGroupNotation`（统一入口，本地优先）
- 布局/格：`computeLatticeLayout`、`SubgroupLatticeNode`/`Edge`、`mergeLatticeByConjugacy`
- Sylow：`factorizeOrder`、`binomialMod`、`findSylowSubgroups`、`computeSylowAnalysis`、`sylowConjugationPerms`
- 作用：`computeCosetActionPerms`、`computeOrbits`、`computeStabilizers`、`verifyOrbitStabilizer`
- 协议：`serializeDescriptor` / `deserializeDescriptor` / `GroupDescriptorSchemaV1`
- **子群 → 真群对象**：`buildSubgroupGroup(parent, elements, symbol, generators?)` → `Group`（元素沿用母群对象，id 一致）
- **元素引用**：`resolveElement(group, ref)` 接受 id / label / value / **循环记号**（`(123)`）；`resolveElementRefs` 返回 `{elements, ids, unresolved}`
- **结构伴生映射**：`naturalProjectionMapping` · `subgroupInclusionMapping` · `directProductProjectionMapping` · `trivialMapping`（→ 交换图上的实线箭头）
- **映射（同态）**：类型 `Homomorphism{id,source,target,mapping,result?,name?}`（不要另立结构）；`getGeneratorElements` · `extendFromGenerators(src,tgt,Map<生成元名,像引用>)` · `verifyHomomorphism`（返回 `violation{a,b,lhs,rhs}`）· `computeKernelFromMapping` · `computeImageFromMapping` · `getHomomorphismProperties` · `autoBuildMapping`
- **子群命名与候选**：`subgroupStructureSymbol(group, elementIds)`（不必先造 Group）· `listCosetStripSubgroups(group)`（按共轭轨道合并的候选）· `subgroupFromElementIds` · `isSubgroupElementSet` · `buildCosetViewData`
- **小群库**：`getAllSmallGroups()` → `SmallGroupEntry{order,index,group,precomputed}` · `getSmallGroup(order,index?)` · `getSmallGroupBySymbol` · `getPrecomputed(group)` → `{subgroups,normalSubgroups,conjugacyClasses,center,isSimple}`（**库群零计算**）
- **守卫阈值**（`guards.ts`）：`INTERACTIVE_LIMIT` 120 · `ENUMERATION_LIMIT` 144 · `STATIC_LIMIT` 240/480 · `SYLOW_MAX_ORDER` 144

## UI 方向（2026-09-15 规划 → docs/UI_PLAN.md + ROADMAP 的 U0–U6）
- **理念（用户原话）**：**用户应该在对象旁边完成他想要的操作。** 与 Desmos 的最大区别 = **交换图本身可交互**（直接在图上操作对象）。
- **地基**：注册表补 `OpDef.params`（**命名参数 + 类型**）→ 纯函数 `opsFor(selection)` 同时喂三个入口（节点旁径向菜单 / 顶部工具条 / 查表面板）。"操作别扭"的根因 = 入口死、操作活、靠用户脑中对齐。
- **交互状态机**：`idle → selected → menu`；`idle/工具条 → pending(opId,picked[]) → 凑够 arity → 执行/editor`；`LayoutMode = auto|manual`。
- **左栏两态**：输入态（三区 + 两块输入框）/ 详情态（**竖卡**，输入区折叠成一行）—— 竖卡是临时详情，不并存。
- **输入框两块**：`名字(可空) | 表达式`；自动命名 `A,B,…,Z,A₁,B₁…`，**必须避开注册表所有调用名**（否则 `Z = …` 会遮蔽 `Z(G)`）。
- **径向菜单三类两层**：看（只填竖卡）/ 算（一元产出对象）/ 造（多元进 pending）。
- **集合构造（UI_PLAN §9）**：点击流与文本流 = **同一个 `FilterSpec` AST 的两个前端**；点击流要**顺手写出等价文本**（教学价值）。竖卡列表做成**带分面的表格**（列头可点、就地筛选），**筛选状态 = 对象表里的一行** → 结果节点可再编辑（改成 `阶=3` 整图重派生，免费）。
- **「类型 × 属性」表（架构 §4）的第二重身份**：同时是竖卡表格的列定义。**一处定义，两处消费（筛选 + 展示）**，列随对象类型变。
- **谓词两条**：属性谓词（分面，可补全）+ **字谓词**（`x²=e`/`xy=yx`，走 `parseWord` + `group.multiply` 折叠）。属性谓词可自动翻译成字谓词（`阶=2 ⇔ x²=e`）。
- **宏与 Proof Spec 同构**（`(opId,参数引用)` 序列）→ 先纯重放，排在 M1 之后复用执行器。**M1 依赖改为 U0–U3**。
- **集合对象对齐 GroupViz 的 subset**：`{label,color,isSubgroup,isNormalSubgroup,type:'subset'|'subgroup'|'normal-subgroup'}` + `SUBSET_COLORS`（`types/view.d.ts`）。

## 操作架构（2026-09-15 定稿 → docs/ARCHITECTURE.md，M0.5 已落地代码）
- **两个平面**：①造对象平面 = 原子构造 / 作用导出 / 枚举+筛 / 迭代 ②**属性平面** = 不变量清单（按类型），喂给 **筛选 / 判定 / 识别**（三者本质都是"查属性"）。算术为独立库。
- **三个层次**（别再混为一谈）：**机制**（操作怎么造出来）→ **原语**（每个机制里互不可导出的最小操作，共 **10** 个）→ **实例**（填参得到的 60+ 条）。
- **10 原语**：原子构造 5（群记号·积·商·映射·作用）+ 作用导出 2（轨道·稳定子）+ 枚举筛 2 + 迭代 1。
- **降级为实例**：`闭包 ⟨S⟩` = 迭代(乘法,封闭)；`不动点` = 轨道长度 1 特例。
- **`所有 X-子群` 不是一族操作** = `筛(枚举(G,子群), 属性)`，对外给配方名。
- **识别不是独立类** = 收集全部属性 + 匹配小群库（属性平面的视图）。
- **输入层三种形态**：文本定义（群/集合/数值）· **对象编辑器**（映射/作用，填生成元的像）· 搭积木（枚举块 + 属性筛块）。
- **配方是元数据**（声明"等价于哪些原语复合"）：只用于解释与逐步演示，**求值走 core 最优路径**。
- **代码落点（v0.0.0，apps/web/src/gal/）**：`value.ts` 6 值类型 + 归一化 · `ops.ts` **操作注册表 20 条**（`OpDef` = mechanism/primitive/recipe/impl/call/infix/arity/result/run）· `evalDef.ts` 五级分发（对象引用→调用→顶层中缀→记号→报错，sources 自动收集）· `build.ts` 行→对象表（纯函数）· `derive.ts` 对象表→画布图。UI：`InputPanel` 三区 + 注册表驱动的操作面板；`CanvasView` SVG 自绘（标签实测宽度自适应节点 + 同层对齐去重叠 + 统一缩放）。
- **遗留**：`map` 值类型无生产者（待对象编辑器）；陪集作用的轨道/稳定子分支；半直积 ⋊；识别类。
