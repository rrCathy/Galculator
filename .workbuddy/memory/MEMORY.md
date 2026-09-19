# Galculator 项目长期笔记

> 只放"跨会话必须记住"的：决策、契约、坑、API。进度看 `docs/`（ROADMAP / INTERACTION / ARCHITECTURE / DIAGRAM_SPEC），流水看 `.workbuddy/memory/YYYY-MM-DD.md`。

## 项目定位
群论计算器——"计算 + 证明可见化"。对标 Desmos/GeoGebra，市面空白。
- **根本区别**：**Desmos 的画布是输出，Galculator 的画布是操作台**。参照 Desmos/GeoGebra · Group Explorer ·（Lean/Coq **不碰**）。
- **理念（用户原话）**：**用户应该在对象旁边完成他想要的操作。**
- 交换图简约风；web 优先，成熟后 app。**MVP**：用群作用证明 Sylow 定理（演示性、非形式化）。

## 仓库
- git `main`；远端 `git@github.com:rrCathy/Galculator.git`（用户手建空库；MCP token 无建仓权）。
- **push 要 `dangerouslyDisableSandbox`**；推完 `curl api.github.com/repos/rrCathy/Galculator/commits/main` 核对 HEAD。
- `.gitattributes` = `* text=auto eol=lf` + 二进制例外。忽略 `node_modules/ dist/ .tmp-*`。
- 活文档 5 份：README · docs/{ARCHITECTURE,INTERACTION,DIAGRAM_SPEC,ROADMAP}.md；`docs/archive/` 只移动不删。

## 已定决策
- 计算栈：Sage/GAP 后端（SymPy 不做主力），M0/M1 前端即够，后端推迟。依赖直接装 `@groupviz/core` + `@groupviz/react` v2.3.0。
- **渲染层自研交换图画布**（`@groupviz/react` 的 sylow 视图未入包，且证明可见化本就要自绘）。
- **两条核心契约**：①群描述 = GroupViz **GroupDescriptor v1** ②**Proof Spec** = 步骤序列（声明|计算）+ 展示方式；Sylow I/II/III 三份模板。

## 核心概念（最易混）
1. **存在层级 `ValueSort`**（`value.ts` 的 `sortOf`，一处定义三处消费）：`vertex` · `edge`（map/action）· `list`（subgroups → 面板）· `scalar`。与 `ValueType` 正交。**判据：能作为某映射的源或靶的才配当顶点。**
2. **交换图硬规范**：对象落格点 · 水平箭头同高 / 垂直箭头同列（第一判据）· 方向只有水平/垂直/对角。**硬约束，不是"尽量对齐"**（软约束得到 nearly-but-not-quite，更难看）。
3. **两种"层"**：对象级（顶点=群/集合，证明用）vs 元素级（顶点=Ω 的点，举例用）。**画布画对象之间，面板画元素之间。** 一种语法 + 三层密度（对象级默认 / 集合内部展开 / 元素级去面板）。

## 操作架构
- 两个平面：造对象（原子构造/作用导出/枚举筛/迭代）· 属性（不变量清单 → 筛选/判定/识别本质都是查属性）。
- **10 原语**：原子构造 5（群记号·积·商·映射·作用）· 作用导出 2（轨道·稳定子）· 枚举筛 2 · 迭代 1。其余 50+ 是实例（`闭包`=迭代(乘,封闭)；`不动点`=轨道长度 1；`所有 X-子群`=筛(枚举,属性)）。
- **配方是元数据**（声明等价于哪些原语复合），只用于解释/演示；求值走 core 最优路径。

## core API 速查（v2.3.0）
> 包在 `node_modules/.pnpm/@groupviz+core@2.3.0/node_modules/@groupviz/core`，看 `*.d.ts`。

- 记号 `parseGroupNotation`（统一入口）· 布局 `computeLatticeLayout` / `mergeLatticeByConjugacy`
- Sylow `factorizeOrder` `binomialMod` `findSylowSubgroups` `computeSylowAnalysis`
- **共轭** `conjugateSubgroup(group, elements, g)` = gHg⁻¹（返回**排序**后的元素数组）· `sylowConjugationPerms(group, subgroups)` = G 在 Syl_p(G) 的共轭作用
- 作用 `computeCosetActionPerms` `computeOrbits` `computeStabilizers` `verifyOrbitStabilizer` `computeConjugationPerms` `computeLeftTranslationPerms` `computeFixedPoints`
- 子群 `buildSubgroupGroup(parent, elements, symbol, gens?)`（子群→真群对象，元素 id 沿用母群）· `subgroupStructureSymbol`（**返回 TeX**）· `listCosetStripSubgroups` · `isSubgroupElementSet` · `closeUnderMultiply`
- 元素 `resolveElement`（认 id/label/value/循环记号）· `resolveElementRefs` → `{elements,ids,unresolved}`
- 映射 类型 `Homomorphism`（**不要另立结构**）· `getGeneratorElements` · `extendFromGenerators` · `verifyHomomorphism`（violation 全是**元素 id**，展示前翻 label）· `computeKernelFromMapping` · `computeImageFromMapping` · `getHomomorphismProperties` · `autoBuildMapping` · `extractGeneratorMapping`
- 伴生映射 `naturalProjectionMapping` `subgroupInclusionMapping` `directProductProjectionMapping` `trivialMapping`
- 库 `getAllSmallGroups` `getSmallGroupBySymbol` `getPrecomputed`（库群零计算）· 识别 `detectIsomorphicGroup`（超限 null；**core 的 D₃ 就是 S₃**，UI 要归一）
- 阈值（guards.ts）INTERACTIVE 120 · ENUMERATION 144 · STATIC 240/480 · SYLOW_MAX_ORDER 144

### core 的坑（都是静默失败）
- `extendFromGenerators` / `extractGeneratorMapping` 的 Map key 是**生成元元素的 id**，传 `gen.name` 得 `null` 且无报错。生成元记号要同时认 `gen.name` 与 `el.label`。
- `createGroupFromSymbol` 不吃裸符号 → 先过 `parseGroupNotation`。
- core 的 `C_n` 是**加法群**（生成元 `a`、元素 `0..n-1`），课本写乘法 `r^k` → 本地 `resolveElementLoose` 三级回退（精确 → 生成元的幂 `r4`/`r^4` → 单生成元群单字母别名 `r`/`a`/`g` 互通）。
- `subgroupStructureSymbol` 返回 TeX → 展示前必须过 `prettySymbol`。
- **写「core 没有 X」之前先 `grep` 一遍 `.d.ts`**（踩过：误以为共轭作用要自己实现）。

## 代码落点（apps/web/src/）
- `gal/`：`value.ts` `ops.ts`（注册表 30 条：mechanism/primitive/recipe/impl/call/infix/params/arity/variadic/editor/result/run + `opsFor` + `paramAccepts`）`naming.ts` `compose.ts` `interaction.ts`（idle→selected→menu→pending/fill）`evalDef.ts`（五级分发）`build.ts` `derive.ts` `insights.ts` `tex.ts` `numeric.ts`
- `ui/`：`CanvasView`（SVG 自绘 + 硬约束网格）`DockPanel` `ObjectDock`/`OpDock`/`InfoDock`/`NumericDock` `ComposerOrb` `ObjectOrb`/`MultiOrb` `MapBuilder` `ElementsTable` `Tex`

### 项目内的坑
- **「造」类操作不能用 `opsFor` 筛**（它要参数被填满）→ 遍历 `OPS` + `paramAccepts`。
- **从 UI 状态取 id 拼表达式危险**（id 无类型保护）：`取出为对象` 拿焦点 id（子群集 S）拼出 `闭包(S,e)`——tsc 与单测全过，只有求值器拒。
- `闭包` 的上下文群形态是 `if (G0 && a.length > 1)`——单个群参数走"取它的元素当种子"，否则返回平凡群。
- 集合运算 `∩`/`·` 结果若**确是子群**则**升级**为真群对象（定理，非猜测）；∪/∖ 不升级（决策⑤针对手工造集合）。`stabilizers` 产出是 G 的子群 → `result:'group'`。
- **KaTeX 后 DOM**：`S₄` 的 textContent 是 `S4` → 节点定位统一走 `<g class="gnode" data-label="S₄">`。
- **`⟨⟩` 归一**只在**顶层（括号外）**改写，**实参位置一律不改**（`normalizeExpr(s, angle=false)`）；Ω 成员标签含逗号用**纯数字下标**寻址（`稳定子(A, 1)`）。
- **布局列约束不许传染**：竖直约束（`π`/`π₁`/`π₂`/`↪`/`↷`）合并用**贪心**（短跨度优先）+ **不许跨过已在同列的节点**；判据按**边的语义**，不按几何猜。
- **行内也要防传染**（2026-09-19）：同层的**显式映射边**两端之间不许夹列组（夹着的组挪到行末）——否则 `C₆ ──φ──▶ C₃` 中间夹个无关的 `D₄`，箭头从它身上穿过去。竖直方向有"不许跨过同列节点"，水平方向就靠这条。
- **箭头形状 = marker**：`marker-end` 挂 `-surj`（满射双箭头）、`marker-start` 挂 `-hook`（单射尾钩，要 `orient="auto-start-reverse"`）、**同构 = 两端都挂 `-head`（双向箭头，因为同构是双射）**；marker 必须**按视觉族成套生成**（颜色写死在定义里会出现"蓝灰线配深色箭头"）。形状由 `derive.ts` 的 `arrowOf()` 从映射属性推，判不出**不猜**。
- **竖直约束的标签集合**：`π`/`π₁`/`π₂`/`↪`/**`=`**（漏了 `=` 会让 Sylow III 的 `Orb = Ω` 横着跑、三层结构散掉）。`≅` 是对角、用户映射是水平，都不参与。
- **指针拖动别信 `setPointerCapture`**：在 React 合成事件里它只让**第一次** `pointermove` 到位（平移量只有 1/8）。改成 `pointerdown` 时把 `pointermove/up` 挂到 **window**。
- **画布包围盒要用"自动布局"的位置算**（不含被钉住/正在拖的节点），否则拖走一个节点整张图重新缩放、**落点不再是格点**。
- **格点 = 一条无限延伸的规则网格**（`gal/grid.ts`，纯函数）：`gridSpec`（步长取相邻间距的中位数）+ `quantize`（自动布局的行列中心**量化到网格线**，顺带把列宽差拉平成等距）+ `visibleGridPoints`（按视口现算，所以 pan/zoom 到多远都铺满）+ `snapToGrid`（跳过被占用的格点，一圈圈外扩）。格点必须**画出来**——用户看不到等于不存在。
- `toTex()` 四步有序：上下标 → 运算符/希腊 → 函数名（`\operatorname{}`）→ 中文（`\text{}`）。

## 交互模型（细看 docs/INTERACTION.md）
- 画布 = 交换图（对象=节点、操作=箭头），非坐标系。**形状=类型**（群=无形状+一小块常驻淡底 / 集合=圆 / 映射=箭头）；**颜色=来源**（蓝=输入 / 紫=运算）。
- **操作 = 结果对象 + 结构伴生**（伴生的映射/作用/包含才是箭头真正来源）。边界：映射边（实线、一等对象、**可点选**）vs 来源线（淡虚线、辅助、可关）。
- 输入层三形态：文本定义 · 对象编辑器（映射构建器已落地）· 搭积木。
- **5 条决策**：①径向菜单三类两层 ②宏先纯重放（排 M1 后）③集合描述式=属性谓词分面+字谓词，`∧∨` 组合，不开任意表达式 ④拖动=钉住+吸附网格+一键恢复+持久化 ⑤固化集合**不自动升级**。
- 集合构造（§6）：点击流与文本流 = 同一 `FilterSpec` AST 的两个前端。

## 进度（详见 docs/ROADMAP.md）
U0–U6 ✅（注册表 / 输入框 / 径向菜单 / 浮层面板 / 映射构建器 / 结论层 / 交换图化 / 网格化 / 箭头形状）· **U7 ✅** Sylow III 的图 · **U10 ✅** 开放视图编辑（格点可见 · 缩放平移 · 拖动吸附钉住）· U8 工具条/群目录 · U9 集合构造器 · U11 宏。
**DIAGRAM_SPEC §1 的六条硬规范已全部落地**（2026-09-19）。

## 已知缺口（体检挖出）
| # | 缺口 | 挡住 |
|---|---|---|
| G4 | 商群的子群判定失败（两商群元素 id 体系不同）| 第三同构 |
| G8 | 不自动补 `im φ` | 第一同构正方形 |

**教训：算得对 ≠ 画得对**（第二同构在修 G3 前阶全对，图上 `H∩N` 却是集合圆、包含箭头是虚线）。

## 遗留给未来
自定义作用编辑器；伴生箭头还不是映射对象（不能对 π 做 ker/im）；陪集作用的轨道/稳定子分支；半直积 ⋊；**集合节点展开成轨道切块**（第 2 层密度）。
