# Galculator 项目长期笔记

> 排序即优先级：**前四节每次开工必看**（做什么 / 纪律 / 坑 / 理念）；细节一律在仓库里 ——
> `docs/ROADMAP.md`（进度）· `INTERACTION.md`（交互）· `DIAGRAM_SPEC.md`（图）· `PROOF_SPEC.md`（证明）·
> `TASKS.md`（输入视角）· `USABILITY.md`（动作视角）· 流水 `.workbuddy/memory/YYYY-MM-DD.md`

## 1. 遗留（详单在 ROADMAP / USABILITY §6 与 §8）
- **U0–U36 全部落地**：可用性缺口 ①–⑳ 全 ✅，逐批账在 `USABILITY.md §6.1–§6.20`，**别在这里复述**。
- **还留下的账**：③ 元素表仍未复现（等用户步骤）· **`包含(H, G)` / `像(f, H)` 遇独立构造的群不自动翻译**
  （现在给"元素不在同一个群里 + 可照抄配方"；要不要像集合运算那样唯一就翻译，等用户点名）·
  **关系层 `containment` 仍纯按 id 判**（U19 设计：靠自证式 id 发现"独立定义之间的包含"）——
  副作用：`C_4` 与 `V_4` 这种整表撞号的独立群会被判成「同一个群」，要不要给指数 1 那档加符号校验，等点名 ·
  **U36 的边界**：`G/K` 不在画布上就不画那条 `≅`；`N` 必须是**同一个对象**（同一子群写成两个对象就不连）。
- **U27 两条守卫（复用要自己拦）**：超限**明说没算**；`computeSubgroupLattice` 超限**静默退化成 {e} 与 G 两点**。
- **⑪ 只差三件**：Hall 子群（core 没有，要新写）· 子群格图（有列表没图）· 自定义作用编辑器。
- **草稿画布**（用户构思）：判据是"**位置有没有语义**"——交换图上位置是信息（格点 + 吸附 + 自动布局），
  草稿上不是（自由摆放 + 不画结构边 + 不做自动布局）。待定：分页 vs 同屏（推荐分页）· 产出就地留下 · 不连结构边。
- **定理库 5 条 ✅（M3/U17）**；还差 **Cayley 定理**——舞台现成（`正则作用(G)`），但"G ↪ Sym(Ω)"在图上
  **没有落点**（S₆ 已 720 阶、S₂₄ 建不出来）；方向是把「**作用的核**」变成一等对象（核 = {e} ⟺ 忠实 ⟺ 嵌入）。
- **布局两个缺口**：① OST 的图是两条斜线（`Orb` 与 `Stab` 同层但与 `G` 不同列）——缺"一个顶点带多个下层产物"的规范；
  ② Sylow III 里 `Stab ↪ G` 与 `Orb ↪ Ω` 撞同列 → 穿行检查拒绝合并 → 长对角线，正解是**每个竖直约束组各占一列**。
- 陪集视图 · 半直积 ⋊ · 集合节点展开（第 2 层密度）· 短正合列 / 五引理（只清了形状障碍）·
  U6 的 B/C（节点宽度解耦 / 画布分层）· U8 工具条 + 群目录 · U9 集合构造器 · U11 宏 · `ui/MapBuilder` 走查。

## 2. 仓库与协作纪律
- git `main`；远端 `git@github.com:rrCathy/Galculator.git`。**push 要 `dangerouslyDisableSandbox`**（被拒就别重试）；
  推完核 HEAD 要带 `-H 'Cache-Control: no-cache'` 打 `api.github.com/repos/rrCathy/Galculator/commits/main`
  （**不带会吃 CDN 缓存、返回上一个 sha，看着像推送失败**），或 `git status -sb` 看 ahead。
- `.gitattributes` = `* text=auto eol=lf`；忽略 `node_modules/ dist/ .tmp-*`。活文档在 `docs/`；`docs/archive/` 只移动不删。
- **期望值一律来自数学（手算），不从运行结果抄**。临时脚本放 `.tmp-*/`，验证线进 `verify/`（是资产不是临时物）。
- 跑法：`pnpm --filter @galculator/web verify`（语义层）· `verify:e2e`（真浏览器几何，需先起 dev server 5273）。
  ⚠️ **全套走查别用 wrapper 脚本递归 spawn**（见 §3.5 第一条），在 shell 里逐个 `node verify/e2e/*.mjs` 跑。
- 语义层探针现成写法：写 `.tmp-probe/x.ts` → `npx vite build --ssr .tmp-probe/x.ts --outDir .tmp-probe/out-x` → `node .tmp-probe/out-x/x.js`。
- **要数据时的快路**：core 是纯 ESM，**在 `apps/web/` 里直接 `node x.mjs` 就能 `import '@groupviz/core'`**（放仓库根不行）。
  建群走 `parseGroupNotation(s).symbol` → `createGroupFromSymbol(symbol)`——后者**只认规范形**，直接喂 `'S_4'` 返回 null。

## 3. 项目内的坑（最贵的一节，都真踩过）

### 3.1 跨 id 空间（核心病根）—— 详见 USABILITY §6.13/§6.16/§6.17
- **两个独立构造的群，元素 id 空间互不相通**：`S_4`/`A_4` 的 id 是**置换本身**，`V_4` 的是**抽象记号**（`e a b c`）。
  core 的 `findPermIndex` 查不到会**静默回退到单位元**（`A4·V4` → 只剩 `{e}` → `C_1`）——**调用方必须自己拦**。
  **修法**：`\cdot` 硬检查 + `ops.ts#foreignSubgroupFail` 分诊 + `isoSubgroupHint` 给可照抄的 `闭包(...)`
  （**唯一才给**；U30 起求商 / 陪集作用唯一时**直接翻译**；U32 起集合运算（∩ ∪ ∖ ·）也走同一条对齐）。
- **判定链顺序恰好相反**：`containment` 里"id 对齐"在**最前**、"正规性"在**最后**，且正规性判的是「G 里那个子集」
  （`normalKeys(G)` 查 `subgroupSetKey(sub.elements)`）——**没有对齐就没有可判的子集**（"先判正规"实现上不成立）。
- **core 没有「跨 id 空间建映射」的原语**：`autoBuildMapping` 只对**循环群**有结果（`V_4`/`S_3`/`A_4` 连自映射都 `null`）；
  `subgroupInclusionMapping` 纯按 id 匹配。⇒ 可行做法是应用层搜同构子群后**直接用那个子群**。
- **母群指针是 app 侧自己记的**（U32）：core 的 `Group` **没有 parent 字段**。现由 `gal/parents.ts`（WeakMap）
  在 `subgroupGroupOf` / `build.ts` 的 `im φ` 处记账，`rootOf` 一路回溯。
  **另一条**：`findAllSubgroups` **不含 G 自身**，凡"找与 X 同构的子群"都要自己把 G 补进候选。
- **记号群的元素 id 是"群内编号"，跨群会撞号**（最阴的一条）：`C_3` 的 `e0 e1 e2` 在 `C_7` 的 `e0…e6` 里"也有"
  （`V_4`/`D_4`/`Q_8`/`F_21` 同理）。**判据 = `parents.ts#idsComparable`**：id 能直接对着读 =
  **同一个世界**（根相同）**或两边都是自证式 id**（`id === value.join(',')`：置换群 true，其余 false）。
  集合运算 / `包含` / `像` / `商` / `陪集作用` 都走它；**陪集层（商群）除外**（按陪集成员语义走）。
  **`containment` 保持纯 id 判**（U19 设计），但**第①关已升级为语义键对齐**（陪集按成员比，普通元素退化成 id 比）。
- **求商路的候选恒唯一**：A₄ 的 Klein 子群 1 个（正规）；S₄ 的 4 个里正规的也 1 个（Aut(V₄)≅S₃ 的 6 种选法**像相同**）。
  `ops.ts#autoTranslatedSubgroup` 唯一时直接拿它当分母并把翻译写进 `sub`/`note`；报错路径归 `isoSubgroupHint`（带 `requireNormal`）。
  两道边界：**带陪集元素的任一边不翻译**（`商(G/N, K)` 必须继续报错）· 超 `ENUM_LIMIT`(120) 或算不出结构符号就不猜。
- **`subgroupStructureSymbol` 跨母群形式一致**（`V_4` 自身与 A₄ 的 Klein 子群都是 `C_{2}\times C_{2}`）→ 找同构子群可直接比字符串。
- **`identifyGroup` 的 key = `identity.ts#groupFingerprint`**（含元素 id，`relations.containment` 同源）。旧 key `symbol#order` 会串。
- **集合运算的候选母群还包含"画布上的群"**（U34）：`OpDef.run(a, ctx?)` 的 `OpContext`（`evalDef#opContextOf` 现造）；
  顺序 = 显式母群 → 根 → 各自群 → **画布上的群**。多个同构候选**枚举全部组合**：结果全同直接算（披露"N 个候选，结果相同"）、
  不同才停下。失败诊断的记分只认"可操作"的提示（另一边**原位**站住才算）。
- **`(G/N)/(K/N)` 的结论边判据 = `derive.ts#thirdIsoPartner`**（U36）：结构对应（`opId` + 实参 id），
  且分子分母商掉的必须是**同一个 `N` 对象**（换两个不同正规子群只同阶、不同构）。`G/K` 不在画布上就不画。

### 3.2 操作与入口 —— 其余细节见 **REFERENCE §9**
- **`objectArity` 不计可选参数**（U31）：`像(f, H)` 因此被判成"单对象操作" ⇒ ⊕ 菜单收不到它，入口整条消失，
  而按钮上还写着「像 f(H)」。判"要不要停下来等一个**可选**对象"要用 **`maxObjectArity`（含可选）**；
  `composeCall` 要丢掉超出必需位的空实参（别拼 `im(f, )`）。**加可选对象参数时必须同时问：这条 op 从哪个入口进得来？**
- **菜单 / 候选不撒谎**：列给用户点的东西，点下去必须真能跑（或至多"要补参 / 进编辑器"）。
- **「造」类操作不能用 `opsFor` 筛**（它要参数被填满）→ 遍历 `OPS` + `paramAccepts`。
- **从 UI 状态取 id 拼表达式危险**（id 无类型保护）：`取出为对象` 拿焦点 id 拼出 `闭包(S,e)`——tsc 与单测全过，只有求值器拒。

### 3.3 布局与画布
- **布局列约束不许传染**：竖直约束用**贪心**（短跨度优先）+ **合并后整组**全局穿行检查；**`π` 优先于 `↪`**、
  同层边不参与列合并。判据按**边的语义**不按几何猜。
- **不上画布的对象不占行**（`computeLevels`），否则留空行；**行内也防传染**（同层显式映射边两端之间不许夹列组）。
- **箭头形状 = marker**：`marker-end` 挂 `-surj`、`marker-start` 挂 `-hook`（要 `orient="auto-start-reverse"`）、
  **同构两端都挂 `-head`**；必须**按视觉族成套生成**。形状由 `arrowOf()` 推，判不出**不猜**。
- **边上带语义身份**：`data-edge-id` / `data-object-id` / `data-structural` / `data-label` 都在 `g.gedge` 上（走查拿它定位最稳）。
- **指针拖动别信 `setPointerCapture`**（React 合成事件里只让第一次 `pointermove` 到位）→ `pointerdown` 时挂到 **window**。
- **画布包围盒要用"自动布局"的位置算**，否则拖走一个节点整张图重新缩放。
- **格点 = 无限延伸的规则网格**（`gal/grid.ts` 纯函数）：`gridSpec` + `quantize` + `visibleGridPoints` +
  `snapToGrid`（跳过占用点）。必须**画出来**。
- **上画布的节点不许是孤点**：来源若是一条**边**而不是节点，来源线那支整条跳过 → 飘一个没边的圆。
- **图上同名节点 = 看不清**：标签要带**来源的名字**（`Orb_A(1)` / `Fix_B`）。
- **算得对 != 画得对**（第二同构修 G3 前阶全对，图上 `H∩N` 却是集合圆、包含箭头是虚线）。

### 3.4 文本与记号 —— **细节全在 REFERENCE §7**（含 `toTex` 四步序、`prettySymbol` 兜底、生成元写法、
**批量替换 LaTeX 记号踩的四个字符边界坑**）。只记两条判据：
- **文本形态 = 简化 LaTeX，全 ASCII**（U25 定案）：展示串一律 `S_4` / `\varphi`，**显示靠 KaTeX**，输入只认 ASCII。
- **渲染后 `textContent` 里没有空格** → **断言读 `data-*` 原始形态**；**纯文本面**（状态行 / 按钮 / 菜单 / 报错语）
  **不写 LaTeX 命令**；`prettySymbol` 里**空格不能删**（命令分隔符）。回归 `e2e/no-unicode-leak.mjs`。

### 3.5 走查与工具链 —— 细则见 **REFERENCE §8**
- ⚠️ **全套走查别用递归 spawn 的 wrapper**（2026-09-29 实测）：`execFileSync(process.execPath,…)` / `.tmp-probe/e2e-count.cjs`
  都报 `EBUSY`（孙进程起不来）→ **21 套全 0 PASS / 0 FAIL**，看着像"服务没起"。**正解：shell 里逐个 `node verify/e2e/*.mjs`**。
- **跑 e2e 前先 ping 5273**（dev server 会被环境回收，19–25 分钟不等）；`(npx vite &)` 会随调用结束而死 → `run_in_background`。
- **别写恒真断言**（U36 抓到的实例）：输入球是"预览不 ok 就不提交" ⇒ 失败的行**进不了对象表** ⇒ **`.row-err` 恒为空**，
  拿它判"这一整段求值成功"，全挂也报 PASS（真发生了）。要读**画布节点** + 点开看识别。
- **走查里名字不能重绑**（`G = S_4` 在已有 `G` 时报"名字重复定义"）→ 换场景要么换名、要么重开画布。
- **判据别用"节点数 +1"** → 比 **id 列表**；几何用 `getBBox()`；**判据要成对**（只判"竖直不穿行"会让"水平穿行"藏很久，实测藏了 7 天）。

## 4. 理念与已定决策
群论计算器——"计算 + 证明可见化"，对标 Desmos/GeoGebra，市面空白（参照 Desmos / Group Explorer；Lean/Coq 不碰）。
- **根本区别**：Desmos 的画布是输出，Galculator 的画布是**操作台**。**用户原话：用户应该在对象旁边完成他想要的操作。**
- 交换图简约风；web 优先。MVP = 用群作用证明 Sylow 定理（演示性、非形式化）。
- 计算栈：Sage/GAP 后端（SymPy 不做主力）；M0/M1 前端即够，后端推迟。依赖 `@groupviz/core` `@groupviz/react` v2.3.0。
- **渲染层自研交换图画布**（`@groupviz/react` 的 sylow 视图未入包，且证明可见化本就要自绘）。
- **两条核心契约**：①群描述 = GroupViz **GroupDescriptor v1** ②**Proof Spec** = 步骤序列（声明|计算）+ 展示方式。
- **5 条交互决策**：①径向菜单三类两层 ②宏先纯重放 ③集合描述式 = 属性谓词分面 + 字谓词，`∧∨` 组合
  ④拖动 = 钉住 + 吸附网格 + 一键恢复 + 持久化 ⑤固化集合**不自动升级**。

### 4.1 核心理念（最易混）
1. **存在层级 `ValueSort`**（`value.ts#sortOf`，一处定义三处消费）：`vertex` · `edge` · `list` · `scalar`；
   与 `ValueType` 正交。**判据：能作为某映射的源或靶的才配当顶点。**
2. **交换图硬规范**：对象落格点 · 水平箭头同高 / 垂直箭头同列 · 方向只有水平 / 垂直 / 对角。
   **是硬约束不是"尽量对齐"**（软约束得到 nearly-but-not-quite，更难看）。
3. **两种"层"**：对象级（顶点 = 群 / 集合）vs 元素级。**画布画对象之间，面板画元素之间。**
4. **文本形态**：core 的 `label`/`symbol` 本身就是 LaTeX；`prettySymbol()` 只规整成**简化 LaTeX**（细则 `DIAGRAM_SPEC §1.7`）。
5. **操作架构**：两个平面——造对象（原子构造 / 作用导出 / 枚举筛 / 迭代）· 属性（筛选 / 判定 / 识别都是查属性）。
   **10 原语**（原子 5 · 作用 2 · 枚举 2 · 迭代 1）；其余是实例（`闭包` = 迭代(乘,封闭)；`不动点` = 轨道长 1）。
   **配方是元数据**，只用于解释，求值走 core 最优路径。

### 4.2 交互模型（细则看 **INTERACTION.md**）
- 画布 = 交换图（对象 = 节点、操作 = 箭头），非坐标系。**形状 = 类型**（群 / 集合 = 圆 / 映射 = 箭头）；**颜色 = 来源**（蓝 = 输入 / 紫 = 运算）。
- **操作 = 结果对象 + 结构伴生**：伴生箭头有 `π`（商）/ `π_1 π_2`（积投影）/ `↪ ⊴`（子群 / 核 / 像 / 稳定子）/
  `≅`（第一同构、**第三同构 U36**）。边界：映射边（实线、一等对象、**可点选**）vs 来源线（淡虚线、辅助、可关）。
- 输入层三形态：文本定义 · 对象编辑器（映射构建器已落地）· 搭积木。
- **左上三栏**：`对象`（`origin === 'input'`）与 `操作`（`derived`）**同列上下**，`信息` 另起一列。**收起时 body 整个不渲染**
  → 走查不先展开「操作」抽屉就只读到一半对象；**点行的判据按 `.row-name` 的 id**，别按文本包含。
- **拖拽连线**（U21，第四个入口）：A 拖到 B → `pairOps(a,b)`；**唯一候选直接执行**；起点 / 落点**都能是边背后的对象**；
  参数顺序先猜、正序不通就反序（**只在这条手势上**，手打错序照旧报错）。
- **证明面板**：step-through = 替用户一行行写定义；**开始证明清空画布、结束证明保留画布**。
- **结论区判据**："识别结果 ≠ 自身符号才说"会让构造物永远沉默 → 判据看 `node.opId`。
- **视图归属**：`pins` / `userView` 是 `CanvasView` 自己的 state —— 读它走 `CanvasHandle`，别改成往上报。

## 5. 参考（**按需读**，不常驻本文件）
- **core v2.3.0 速查＋坑**与**代码落点**（`apps/web/src/` 各文件职责与关键导出）→ 见 **`.workbuddy/memory/REFERENCE.md`**。
