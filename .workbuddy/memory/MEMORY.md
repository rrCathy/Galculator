# Galculator 项目长期笔记

> 只放跨会话必须记住的：决策 / 契约 / 坑 / API。
> **进度 = `docs/ROADMAP.md` · 交互规格 = `docs/INTERACTION.md` · 图规范 = `docs/DIAGRAM_SPEC.md` · 证明 = `docs/PROOF_SPEC.md` · 流水 = `.workbuddy/memory/YYYY-MM-DD.md`。**

## 定位与理念
群论计算器——"计算 + 证明可见化"，对标 Desmos/GeoGebra，市面空白。参照 Desmos/GeoGebra · Group Explorer（Lean/Coq 不碰）。
- **根本区别**：Desmos 的画布是输出，Galculator 的画布是**操作台**。
- **用户原话**：**用户应该在对象旁边完成他想要的操作。**
- 交换图简约风；web 优先。MVP = 用群作用证明 Sylow 定理（演示性、非形式化）。

## 仓库与协作
- git `main`；远端 `git@github.com:rrCathy/Galculator.git`。**push 要 `dangerouslyDisableSandbox`**；推完 `curl api.github.com/repos/rrCathy/Galculator/commits/main` 核 HEAD。
- `.gitattributes` = `* text=auto eol=lf`；忽略 `node_modules/ dist/ .tmp-*`。
- 活文档：README · docs/{ARCHITECTURE,INTERACTION,DIAGRAM_SPEC,ROADMAP,PROOF_SPEC,TASKS}.md；`docs/archive/` 只移动不删。
- **期望值一律来自数学（手算理论值），不从运行结果抄**。临时脚本放 `.tmp-*/`，验证线进 `verify/`。

## 已定决策
- 计算栈：Sage/GAP 后端（SymPy 不做主力）；M0/M1 前端即够，后端推迟。依赖 `@groupviz/core` + `@groupviz/react` v2.3.0。
- **渲染层自研交换图画布**（`@groupviz/react` 的 sylow 视图未入包，且证明可见化本就要自绘）。
- **两条核心契约**：①群描述 = GroupViz **GroupDescriptor v1** ②**Proof Spec** = 步骤序列（声明|计算）+ 展示方式。
- **5 条交互决策**：①径向菜单三类两层 ②宏先纯重放 ③集合描述式 = 属性谓词分面 + 字谓词，`∧∨` 组合，不开任意表达式 ④拖动 = 钉住 + 吸附网格 + 一键恢复 + 持久化 ⑤固化集合**不自动升级**。

## 核心理念（最易混）
1. **存在层级 `ValueSort`**（`value.ts` 的 `sortOf`，一处定义三处消费）：`vertex` · `edge`(map/action) · `list`(subgroups → 面板) · `scalar`；与 `ValueType` 正交。**判据：能作为某映射的源或靶的才配当顶点。**
2. **交换图硬规范**：对象落格点 · 水平箭头同高 / 垂直箭头同列（第一判据）· 方向只有水平/垂直/对角。**硬约束，不是"尽量对齐"**（软约束得到 nearly-but-not-quite，更难看）。
3. **两种"层"**：对象级（顶点 = 群/集合）vs 元素级。**画布画对象之间，面板画元素之间。** 一种语法 + 三层密度。
4. **记号两层**：core 的 `label`/`symbol` **本身就是 LaTeX**。展示层 `prettySymbol()` → 近 Unicode（面板纯文本串一律过它）；渲染层 `<Tex tex>` 吃原样 TeX、`<TexOrText>` 走 `toTex()`；回认层 `resolveElementLoose` ⓪ 级按 `prettySymbol` 唯一命中回退（`α₂`/`\alpha_2` 同值）。**展示成什么样，就得能照着敲回去**：系统生成的串不许含反斜杠。

## 操作架构
- 两个平面：造对象（原子构造 / 作用导出 / 枚举筛 / 迭代）· 属性（筛选/判定/识别本质都是查属性）。
- **10 原语**：原子构造 5 · 作用导出 2 · 枚举筛 2 · 迭代 1。其余 50+ 是实例（`闭包` = 迭代(乘,封闭)；`不动点` = 轨道长 1；`所有 X-子群` = 筛(枚举,属性)）。
- **配方是元数据**（声明等价于哪些原语复合），只用于解释/演示；求值走 core 最优路径。

## core API 速查（v2.3.0）
> 包在 `node_modules/.pnpm/@groupviz+core@2.3.0/node_modules/@groupviz/core`，**先 grep `*.d.ts` 再动手**（踩过：误以为共轭作用要自己实现）。

- 记号 `parseGroupNotation`（统一入口）· 布局 `computeLatticeLayout`/`mergeLatticeByConjugacy`
- Sylow `factorizeOrder` `binomialMod` `findSylowSubgroups` `computeSylowAnalysis` · 共轭 `conjugateSubgroup`（返回**排序**后的元素数组）`sylowConjugationPerms`
- 作用 `computeCosetActionPerms` `computeOrbits` `computeStabilizers` `verifyOrbitStabilizer` `computeConjugationPerms` `computeLeftTranslationPerms` `computeFixedPoints`
- 子群 `buildSubgroupGroup(parent, elements, symbol, gens?)`（元素 id 沿用母群）· `subgroupStructureSymbol`（**返回 TeX**）· `subgroupSetKey(elementIds: string[])`（**收 id 不 收元素**）· `isSubgroupElementSet` · `listCosetStripSubgroups` · `closeUnderMultiply`
- 元素 `resolveElement`（认 id/label/value/循环记号）· `resolveElementRefs`
- 映射 `Homomorphism`（**不要另立结构**）· `getGeneratorElements` `extendFromGenerators` `verifyHomomorphism`（violation 全是**元素 id**）`computeKernelFromMapping` `computeImageFromMapping` `getHomomorphismProperties` `autoBuildMapping` `extractGeneratorMapping`
- 伴生 `naturalProjectionMapping` `subgroupInclusionMapping` `directProductProjectionMapping` `trivialMapping`
- 库 `getAllSmallGroups` `getSmallGroupBySymbol` `getPrecomputed`（库群零计算）· 识别 `detectIsomorphicGroup`（超限 null；**core 的 D₃ 就是 S₃**，UI 归一）
- 阈值（guards.ts）INTERACTIVE 120 · ENUMERATION 144 · STATIC 240/480 · SYLOW_MAX_ORDER 144

### core 的坑（全是静默失败）
- `extendFromGenerators`/`extractGeneratorMapping` 的 Map key 是**生成元元素的 id**，传 `gen.name` 得 `null` 且无报错。
- `createGroupFromSymbol` 不吃裸符号 → 先过 `parseGroupNotation`；群符号是 `\operatorname{Aut}(S_{4})` 这种完整 TeX。
- core 的 `C_n` 是**加法群**（生成元 `a`、元素 `0..n-1`），课本写乘法 `r^k` → 本地三级回退（精确 → 生成元的幂 → 单生成元群单字母别名）。
- `subgroupStructureSymbol` 返回 TeX → 展示前必须过 `prettySymbol`。
- **商群元素 id `qcoset-<i>` 的 `i` 只在自家母群里有意义**（= 陪集序）；跨商群按 id 匹配会**静默命中另一个陪集**（实测 9 组里 5 组侥幸通过——**概率性正确最危险**）。跨群比较要用 **`cosetMemberLabels`** 做语义键。
- **`Syl_p(G,p)` 与 `findSylowSubgroups` 逐项同序**（模板写 `轨道(B, k)` 这种按序号寻址靠这条）。**A₄ 的 n₂ = 1（V₄ 正规），n₃ = 4** —— 演示 Sylow II/III 要用 p = 3。

## 代码落点（apps/web/src/）
- `gal/`：`value.ts`(7 值类型 + `sortOf`) `ops.ts`(注册表 32 条：mechanism/primitive/recipe/impl/call/infix/params/arity/variadic/editor/result/run + `opsFor` + `paramAccepts`) `naming.ts` `compose.ts` `interaction.ts`(idle→selected→menu→pending/fill) `evalDef.ts`(五级分发) `build.ts`(`firstIsoObjects` 隐式补点) `derive.ts`(`arrowOf`/`alongsideEdges`/`computeLevels`) `insights.ts` `tex.ts`(`toTex`/`shouldTex`) `pretty.ts` `numeric.ts` `grid.ts` `proof.ts`
- `ui/`：`CanvasView` `DockPanel`（**收起时 body 整个不渲染**）`ObjectDock`/`OpDock`/`InfoDock`/`NumericDock` `ComposerOrb`（**类名 `.orb-center` 与 MultiOrb 撞车**，选择器要区分）`ObjectOrb`/`MultiOrb` `MapBuilder` `ElementsTable` `Tex`(`Tex`/`TexOrText`/`TexList`/`measureTex`) `ProofDock`
- `gal/proof.ts`：`ProofStep{kind,text,tex,line,highlight}` + `ProofTemplate{params,build()}` + `proofLines`/`proofHighlight`（纯函数）+ `SYLOW_I`/`SYLOW_II`/`SYLOW_III`。
  **设计支点：每步 `line` = 一整行定义 → 交给现成的求值器**（零新求值机制、机器写的行可见可改）。模板文本里的数字由 `build()` 真算。
  `SYLOW_III` 的关键是**换主角**：`G ↷ Ω` 只给 `n_p | m`，`n_p ≡ 1 (mod p)` 要 `P ↷ Ω`。
- `verify/`：**回归线（入库，资产不是临时物）**——`suites/`（语义层）+ `e2e/`（真浏览器几何）+ `README.md`。跑法 `pnpm --filter @galculator/web verify` / `verify:e2e`。

### 项目内的坑
- **「造」类操作不能用 `opsFor` 筛**（它要参数被填满）→ 遍历 `OPS` + `paramAccepts`。
- **从 UI 状态取 id 拼表达式危险**（id 无类型保护）：`取出为对象` 拿焦点 id 拼出 `闭包(S,e)`——tsc 与单测全过，只有求值器拒。
- `闭包` 的上下文群形态是 `if (G0 && a.length > 1)`——单个群参数走"取它的元素当种子"，否则返回平凡群。
- 集合运算 `∩`/`·` 结果若确是子群则**升级**为真群对象；∪/∖ 不升级。`stabilizers` 产出是 G 的子群 → `result:'group'`。
- **KaTeX 后 DOM**：`S₄` 的 textContent 是 `S4`、`α₁` 是 `α1` → 节点定位走 `<g class="gnode" data-label="S₄">`；断言别写展示形态。
- **`⟨⟩` 归一**只在**顶层（括号外）**改写（`normalizeExpr(s, angle=false)`）；Ω 成员标签含逗号 → 用**纯数字下标**寻址（`稳定子(A, 1)`）。
- **布局列约束不许传染**：竖直约束（`π`/`π₁`/`π₂`/`↪`/`=`）合并用**贪心**（短跨度优先）+ **合并后整组**全局穿行检查。**`π` 优先于 `↪`**、同层边不参与列合并。判据按**边的语义**，不按几何猜。
- **不上画布的对象不占行**（`computeLevels`），否则图里留空行；**行内也防传染**（同层显式映射边两端之间不许夹列组）。
- **箭头形状 = marker**：`marker-end` 挂 `-surj`（满射双箭头）、`marker-start` 挂 `-hook`（单射尾钩，要 `orient="auto-start-reverse"`）、**同构两端都挂 `-head`**；marker 必须**按视觉族成套生成**。形状由 `arrowOf()` 推，判不出**不猜**。
- **指针拖动别信 `setPointerCapture`**（React 合成事件里只让第一次 `pointermove` 到位）→ `pointerdown` 时把 `pointermove/up` 挂到 **window**。
- **画布包围盒要用"自动布局"的位置算**（不含被钉住/正在拖的节点），否则拖走一个节点整张图重新缩放。
- **格点 = 一条无限延伸的规则网格**（`gal/grid.ts` 纯函数）：`gridSpec` + `quantize`（顺带把列宽差拉平）+ `visibleGridPoints` + `snapToGrid`（跳过占用点）。格点必须**画出来**。
- `toTex()` 四步有序：上下标 → 运算符/希腊 → 函数名(`\operatorname{}`) → 中文(`\text{}`)。**`prettySymbol` 不认的宏会掉进"去反斜杠"兜底** → 希腊字母表 + `\mathrm/\mathbb/\operatorname` 展开必须齐。
- **上画布的节点不许是孤点**：来源若是一条**边**（作用/映射）而不是节点，来源线那支整条跳过 → 画布上飘一个没边的圆（`不动点` 就这样）。判据：`nodes.every(n => 有边)`。
- **图上同名节点 = 看不清**：标签要带**来源的名字**（`Orb_A(1)` / `Fix_B`）。

## 交互模型（细看 docs/INTERACTION.md）
- 画布 = 交换图（对象 = 节点、操作 = 箭头），非坐标系。**形状 = 类型**（群 = 无形状 + 一小块常驻淡底 / 集合 = 圆 / 映射 = 箭头）；**颜色 = 来源**（蓝 = 输入 / 紫 = 运算）。
- **操作 = 结果对象 + 结构伴生**（伴生的映射/作用/包含才是箭头真正来源）。边界：映射边（实线、一等对象、**可点选**）vs 来源线（淡虚线、辅助、可关）。
- 输入层三形态：文本定义 · 对象编辑器（映射构建器已落地）· 搭积木。
- **证明面板**（右上角）：step-through = 替用户一行行写定义；当前步的对象在画布上**高亮**（并入 `pickedIds`）；**开始证明清空画布、结束证明保留画布**；只有带 `line` 的步骤写定义表。

## 附属清单（细节在仓库里，别在这儿重抄）
- **`docs/TASKS.md`**：群论常见计算/证明清单 66 条 + 缺口表（Burnside · Inn · 极大子群 · gcd/φ · 合成列 · Hall · ⋊ · 子群格图）。
- **`verify/README.md`**：写断言七条坑（块注释不许有"星号+斜杠" · rolldown 对模板串换行转义+多字节与 U+2500 报错 → 输出装饰一律 ASCII · 域对象不能 `JSON.stringify` · 几何判据比**轴向**与**节点中心** · 别写恒真断言 · 回归失败先判"bug 还是期望值写错"）。
- **教训：算得对 != 画得对**（第二同构在修 G3 前阶全对，图上 `H∩N` 却是集合圆、包含箭头是虚线）。

## 遗留（详单在 ROADMAP）
自定义作用编辑器 · 伴生箭头还不是映射对象（不能对 π 做 ker/im）· **陪集视图** · 半直积 ⋊ · **集合节点展开**（第 2 层密度）· 短正合列/五引理（只清了形状障碍，未实跑）· U6 的 B/C（节点宽度解耦 / 画布分层）· U8 工具条+群目录 · U9 集合构造器 · U11 宏。
**Sylow III 图的布局**：`G`、`Ω` 都在第 1 列，`Stab ↪ G` 与 `Orb ↪ Ω` 两条竖直约束撞同列 → 全局穿行检查拒绝合并 → 长对角线横穿。正解是**让每个竖直约束组各占一列**（而非合并），风险在 13+24+5 条几何断言。
