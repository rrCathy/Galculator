# Galculator 项目长期笔记

> 排序即优先级：**前四节是每次开工必看的**（做什么 / 纪律 / 坑 / 理念），参考资料在末尾（被截断也不伤）。
> 细节一律在仓库里。进度 `docs/ROADMAP.md` · 交互 `docs/INTERACTION.md` · 图 `docs/DIAGRAM_SPEC.md` · 证明 `docs/PROOF_SPEC.md` · 任务清单 `docs/TASKS.md`（输入视角）· 可用性 `docs/USABILITY.md`（动作视角）· 流水 `.workbuddy/memory/YYYY-MM-DD.md`

## 1. 遗留（详单在 ROADMAP）
- **可用性缺口**（`docs/USABILITY.md` §6，状态列在表里）：①②③④⑥⑦⑨ 已修（U18/U19/U20）；剩
  **⑤** list 值（`subgroups`/`elements`）的 `⋯` 操作入口 · **⑧** 伴生边（π/↪）还不是一等对象 ·
  **⑩** 拖拽连线 · **⑪** core 缺失项（极大子群 / Inn / Hall / 合成列 / Burnside / φ(n) / gcd / ⋊）。
- **第四批（交互，下一件）**：⑩ 拖拽连线（"把两个对象凑一起"，复用 `opsFor`，唯一候选直接执行、多个弹菜单；
  `像`/`包含` 已就位正是候选）· ⑤ list 值的 `⋯`。
- **第五批（补回归）**：重写 U10 走查（拖动/缩放/格点/钉住**整个功能零回归**）· 径向菜单走查 ·
  `grid.ts`/`interaction.ts` 的语义层断言。
- **草稿画布**（用户构思，已给设计推演）：判据是"**位置有没有语义**"——交换图上位置是信息
  （格点 + 吸附 + 自动布局），草稿上不是（自由摆放 + 不画结构边 + 不做自动布局）。
  要定三点：分页 vs 同屏（推荐分页）· 产出就地留下 · 不连结构边。
- **定理库 5 条 ✅（M3/U17）**；还差 **Cayley 定理**——舞台现成（`正则作用(G)`），
  但"G ↪ Sym(Ω)"在图上**没有落点**（S₆ 已 720 阶、S₂₄ 建不出来）；方向是把「**作用的核**」
  变成一等对象（核 = {e} ⟺ 忠实 ⟺ 嵌入），而不是把 S_n 画出来。
- **布局两个已知缺口**：① OST 的图是两条斜线（`Orb` 与 `Stab` 同层但与 `G` 不同列）——缺"一个顶点带
  多个下层产物"的规范；② Sylow III 图里 `Stab ↪ G` 与 `Orb ↪ Ω` 撞同列 → 穿行检查拒绝合并 → 长对角线，
  正解是**每个竖直约束组各占一列**（而非合并），风险在几何断言。
- 自定义作用编辑器 · **陪集视图** · 半直积 ⋊ · **集合节点展开**（第 2 层密度）· 短正合列/五引理
  （只清了形状障碍）· U6 的 B/C（节点宽度解耦 / 画布分层）· U8 工具条+群目录 · U9 集合构造器 · U11 宏。

## 2. 仓库与协作纪律
- git `main`；远端 `git@github.com:rrCathy/Galculator.git`。**push 要 `dangerouslyDisableSandbox`**（被拒就别重试）；
  推完核 HEAD 要带 `-H 'Cache-Control: no-cache'` 打 `api.github.com/repos/rrCathy/Galculator/commits/main`
  （**不带会吃 CDN 缓存、返回上一个 sha，看着像推送失败**），或 `git status -sb` 看 ahead。
- `.gitattributes` = `* text=auto eol=lf`；忽略 `node_modules/ dist/ .tmp-*`。活文档在 `docs/`；`docs/archive/` 只移动不删。
- **期望值一律来自数学（手算理论值），不从运行结果抄**。临时脚本放 `.tmp-*/`，验证线进 `verify/`（是资产不是临时物）。
- 跑法：`pnpm --filter @galculator/web verify`（语义层）· `verify:e2e`（真浏览器几何，需先起 dev server 5273）。

## 3. 项目内的坑（最贵的一节，都是真踩过的）
- **「造」类操作不能用 `opsFor` 筛**（它要参数被填满）→ 遍历 `OPS` + `paramAccepts`。
- **从 UI 状态取 id 拼表达式危险**（id 无类型保护）：`取出为对象` 拿焦点 id 拼出 `闭包(S,e)`——tsc 与单测全过，只有求值器拒。
- 集合运算 `∩`/`·` 结果若确是子群则**升级**为真群对象；∪/∖ 不升级。`stabilizers` 产出是 G 的子群 → `result:'group'`。
- `闭包` 的上下文群形态是 `if (G0 && a.length > 1)`——单个群参数走"取它的元素当种子"，否则返回平凡群。
- **KaTeX 后 DOM**：`S₄` 的 textContent 是 `S4` → 节点定位走 `<g class="gnode" data-label="S₄">`；断言别写展示形态。
- **`⟨⟩` 归一**只在**顶层（括号外）**改写（`normalizeExpr(s, angle=false)`）。
- **Ω 上的点怎么寻址看 Ω 是什么**（`ops.omegaIndexOf`）：Ω 是**集合**（成员是子群/陪集，标签含逗号）→
  **1 起的数字下标**（`轨道(B, 1)`）；Ω = **G 自身** → **元素记号**（`轨道(A, (123))`）。
  **C₆ 上 `轨道(A, 1)` 会侥幸成功**（真有元素 `1`），S₄ 上才暴露。
- **布局列约束不许传染**：竖直约束（`π`/`π₁`/`π₂`/`↪`/`=`/`⊴`/`relation`）用**贪心**（短跨度优先）+
  **合并后整组**全局穿行检查；**`π` 优先于 `↪`**、同层边不参与列合并。判据按**边的语义**不按几何猜。
- **不上画布的对象不占行**（`computeLevels`），否则图里留空行；**行内也防传染**（同层显式映射边两端之间不许夹列组）。
- **箭头形状 = marker**：`marker-end` 挂 `-surj`（满射双箭头）、`marker-start` 挂 `-hook`（单射尾钩，
  要 `orient="auto-start-reverse"`）、**同构两端都挂 `-head`**；marker 必须**按视觉族成套生成**。
  形状由 `arrowOf()` 推，判不出**不猜**。
- **指针拖动别信 `setPointerCapture`**（React 合成事件里只让第一次 `pointermove` 到位）→
  `pointerdown` 时把 `pointermove/up` 挂到 **window**。
- **画布包围盒要用"自动布局"的位置算**（不含被钉住/正在拖的节点），否则拖走一个节点整张图重新缩放。
- **格点 = 无限延伸的规则网格**（`gal/grid.ts` 纯函数）：`gridSpec` + `quantize`（顺带拉平列宽差）+
  `visibleGridPoints` + `snapToGrid`（跳过占用点）。格点必须**画出来**。
- `toTex()` 四步有序：上下标 → 运算符/希腊 → 函数名(`\operatorname{}`) → 中文(`\text{}`)。
  **`prettySymbol` 不认的宏会掉进"去反斜杠"兜底** → 希腊字母表 + `\mathrm/\mathbb/\operatorname` 展开必须齐。
- **上画布的节点不许是孤点**：来源若是一条**边**（作用/映射）而不是节点，来源线那支整条跳过 →
  飘一个没边的圆（`不动点` 就这样）。判据：`nodes.every(n => 有边)`。
- **图上同名节点 = 看不清**：标签要带**来源的名字**（`Orb_A(1)` / `Fix_B`）。
- **面板把文本当纯文本渲染**（只有 `tex` 走 KaTeX）：写 `**强调**` 会**原样显示两颗星**。要强调用「」。
- **循环群里的单字母一律视作那个生成元**（`resolveElementLoose` 第 ③ 级）：`映射(G, H, a→x)` 在 C₆ 上合法
  （`x` ≡ `a`），别拿它当"元素不存在"的反例。
- **轨道的值类型随 Ω 变**：Ω = G 自身 → `elements`；Ω 是集合 → `set`。读"轨道多大"要认两种。
- **dev server host**：`localhost` 在 Node 18+ 解析成 `::1` → 走查连 `127.0.0.1` 会 `ERR_CONNECTION_REFUSED`，
  看着像"服务没起"。`vite.config.ts` 已写死 `server.host`。
- **跑中文输出的回归要防 PowerShell 乱码**：`node … | Out-File -Encoding utf8` 会先按 GBK 解码；
  先设 `[Console]::OutputEncoding = [Text.Encoding]::UTF8`，或让探针 `fs.writeFileSync(path, text, 'utf8')` 落盘。
- **走查点画布上的边/节点要派发事件**（`.gedge-hit`/`.gnode-hit` 是 `transparent`，Playwright 判 "not visible"
  → 白等 30s 超时）：`el.dispatchEvent(new MouseEvent('click',{bubbles:true}))`（React 18 监听在根容器）。
- **断言里不许 `JSON.stringify(值)`**：`Group.generators[].inverse` 是环 → `Converting circular structure to JSON`，
  **整份回归崩在那一行**。写 `describeValue()` 只摘 symbol/order/index/isNormal。
- **几何判据要成对**：只判"竖直不穿行"会让"水平穿行"藏很久（实测藏了 7 天）。
- **`verify/README.md`** 还收着：块注释不许有"星号+斜杠" · rolldown 对模板串换行转义 + 多字节与 U+2500 报错
  → 输出装饰一律 ASCII · 几何判据比**轴向**与**节点中心** · 别写恒真断言 · 回归失败先判"bug 还是期望值写错"。
- **教训：算得对 != 画得对**（第二同构在修 G3 前阶全对，图上 `H∩N` 却是集合圆、包含箭头是虚线）。

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
1. **存在层级 `ValueSort`**（`value.ts#sortOf`，一处定义三处消费）：`vertex` · `edge`(map/action/relation) ·
   `list`(subgroups) · `scalar`；与 `ValueType` 正交。**判据：能作为某映射的源或靶的才配当顶点。**
2. **交换图硬规范**：对象落格点 · 水平箭头同高 / 垂直箭头同列 · 方向只有水平/垂直/对角。
   **是硬约束不是"尽量对齐"**（软约束得到 nearly-but-not-quite，更难看）。
3. **两种"层"**：对象级（顶点 = 群/集合）vs 元素级。**画布画对象之间，面板画元素之间。**
4. **记号两层**：core 的 `label`/`symbol` **本身就是 LaTeX**。展示层 `prettySymbol()` → 近 Unicode
   （面板纯文本串一律过它）；渲染层 `<Tex tex>` 吃原样 TeX、`<TexOrText>` 走 `toTex()`；
   回认层 `resolveElementLoose` ⓪ 级按 `prettySymbol` 唯一命中回退。
   **展示成什么样就得能照着敲回去**：系统生成的串不许含反斜杠。
5. **操作架构**：两个平面——造对象（原子构造 / 作用导出 / 枚举筛 / 迭代）· 属性（筛选/判定/识别都是查属性）。
   **10 原语**：原子构造 5 · 作用导出 2 · 枚举筛 2 · 迭代 1；其余是实例（`闭包` = 迭代(乘,封闭)；`不动点` = 轨道长 1）。
   **配方是元数据**，只用于解释，求值走 core 最优路径。

### 4.2 交互模型（细看 docs/INTERACTION.md）
- 画布 = 交换图（对象 = 节点、操作 = 箭头），非坐标系。**形状 = 类型**（群 = 无形状 + 一小块常驻淡底 /
  集合 = 圆 / 映射 = 箭头）；**颜色 = 来源**（蓝 = 输入 / 紫 = 运算）。
- **操作 = 结果对象 + 结构伴生**（伴生的映射/作用/包含才是箭头真正来源）。边界：映射边（实线、一等对象、
  **可点选**）vs 来源线（淡虚线、辅助、可关）。
- 输入层三形态：文本定义 · 对象编辑器（映射构建器已落地）· 搭积木。
- **左上三栏**：`对象`（`origin === 'input'`）与 `操作`（`derived`）**同列上下**（`.dock-col`），`信息` 另起一列；
  封顶 `calc(100vh − 64px)`，两栏都展开时按内容比例让高度、缩下去可滚动。**收起时 body 整个不渲染** →
  走查不先展开「操作」抽屉就只读到一半对象。
- **点左栏的行要按 `.row-name` 的 id 匹配**，别按文本包含（行里是**原始定义** `S = S_4`，`S₄` 是展示形态；
  匹不上时信息面板停在上一个对象上，失败现象像"没渲染"）。
- **证明面板**：step-through = 替用户一行行写定义；当前步的对象在画布上**高亮**；**开始证明清空画布、结束证明保留画布**。
- **可用性三条实测**（`docs/USABILITY.md`）：①三个操作入口都是"先选操作再点参数"同一个模式，缺"把两个对象
  凑一起"那条路（第四批要做）；②不上画布的中间产物选不中 → 操作点不到；③结论区"识别结果 ≠ 自身符号才说"
  → 结构记号（`C₂`、`C₂×C₂`）的构造物**永远沉默**（判据已改成看 `node.opId`；`isoSymbol` 是死代码）。

## 5. 参考：core v2.3.0 速查＋坑
> 包在 `node_modules/.pnpm/@groupviz+core@2.3.0/...`，**先 grep `*.d.ts` 再动手**（踩过：误以为共轭作用要自己实现）。
> 下面只记**容易找错的那几个**，不是全表。

**入口** `parseGroupNotation`（统一入口；`createGroupFromSymbol` 不吃裸符号）· `computeLatticeLayout` ·
`detectIsomorphicGroup`（超限 null；**core 的 D₃ 就是 S₃**）· `getAllSmallGroups`/`getSmallGroupBySymbol`/`getPrecomputed`。
**Sylow** `findSylowSubgroups`（与 op `Syl_p` **逐项同序**）`conjugateSubgroup`（返回**排序**后的数组）。
**作用** `computeOrbits` `computeStabilizers` `computeConjugationPerms` `computeLeftTranslationPerms` `computeCosetActionPerms`。
**子群** `buildSubgroupGroup(parent, elements, symbol, gens?)`（元素 id 沿用母群）· `subgroupStructureSymbol`（**返回 TeX**）·
`subgroupSetKey(elementIds)`（**收 id 不收元素**）· `subgroupFromElementIds`（**静默**，见坑）· `isSubgroupElementSet` ·
`findAllNormalSubgroups` · `getCentralizer`/`getNormalizer`/`getGroupCenter` · `computeQuotientGroup`。
**映射** `Homomorphism`（**不要另立结构**）· `extendFromGenerators`/`extractGeneratorMapping`（key 是**元素 id**）·
`verifyHomomorphism`（violation 全是**元素 id**）`computeKernelFromMapping`/`computeImageFromMapping` · `autoBuildMapping`。
**元素** `resolveElement`（认 id/label/value/循环记号）。**阈值**（guards.ts）ENUMERATION 144 · SYLOW_MAX_ORDER 144。

### 5.1 core 的坑（全是静默失败）
- `extendFromGenerators`/`extractGeneratorMapping` 的 Map key 是**生成元元素的 id**，传 `gen.name` 得 `null` 且无报错。
- `createGroupFromSymbol` 不吃裸符号 → 先过 `parseGroupNotation`；群符号是 `\operatorname{Aut}(S_{4})` 这种完整 TeX。
- `C_n` 是**加法群**（生成元 `a`、元素 `0..n-1`），课本写乘法 `r^k` → 本地三级回退（精确 → 生成元的幂 →
  单生成元群单字母别名）。
- `subgroupStructureSymbol` 返回 TeX → 展示前必须过 `prettySymbol`。
- **商群元素 id `qcoset-<i>` 的 `i` 只在自家母群里有意义**（= 陪集序）；跨商群按 id 匹配会**静默命中另一个陪集**
  （实测 9 组里 5 组侥幸通过）。跨群比较用 **`cosetMemberLabels`** 做语义键。
- **`subgroupFromElementIds` 对认不得的引用是静默的**（丢掉 → 返回平凡子群）。判包含必须另加两道关：
  id 全覆盖 + 校验出的阶 = `|H|`（`gal/relations.ts#containment`）。
- **A₄ 的 n₂ = 1（V₄ 正规）、n₃ = 4** —— 演示 Sylow II/III 要用 p = 3。
- **S₄ 的生成元是 `s12`（σ₁₂）与 `c`（σ₁₂₃₄）**；S₄ ↠ S₃ 用 `映射(G, S_3, s12→23, c→13)`（两像**必须是对换且不同**）。
  `c` 是 4-循环 → 像的阶只能整除 4 → S₃ 里就是对换，所以"`c ↦ 3-循环`"永远报不是同态；两像相同则退化成符号映射（ker = A₄）。

## 6. 参考：代码落点（apps/web/src/）
- `gal/`：`value`(8 值类型 + `sortOf`) `ops`(注册表 34 条：mechanism/call/infix/params/arity/optional/variadic/
  editor/result/run + `opsFor`/`paramAccepts`) `naming` `compose` `interaction`(idle→selected→menu→pending/fill)
  `evalDef` `build`(`firstIsoObjects` 隐式补点) `derive`(`arrowOf`/`alongsideEdges`/`computeLevels`) `insights`
  `relations` `tex` `pretty` `numeric` `grid` `proof` · `ui/`：`CanvasView` `DockPanel`（**收起时 body 不渲染**）
  `ObjectDock`/`OpDock`/`InfoDock`/`NumericDock` `ComposerOrb`（**`.orb-center` 与 MultiOrb 撞类名**）
  `ObjectOrb`/`MultiOrb` `MapBuilder` `ElementsTable` `Tex` `ProofDock`
- **证明（`gal/proof.ts`）**：`ProofStep{kind,text,tex,line,highlight}` + `ProofTemplate{slots,defaults,suggest?,
  build(group?,p?,extra?)}` + 5 条模板（Sylow I/II/III · ORBIT_STABILIZER · FIRST_ISO）。
  **支点：每步 `line` = 一整行定义 → 交给现成的求值器**（零新求值机制、机器写的行可见可改）；数字由 `build()` 真算。
  `extra` 装参数槽值（全是文本）；`templateReady` 与 `build` 共用同一批纯函数。**`SYLOW_III` 的关键是换主角**：
  `G ↷ Ω` 只给 `n_p | m`，`n_p ≡ 1 (mod p)` 要 `P ↷ Ω`。**OST** = 共轭作用在自身上（轨道 = 共轭类、稳定子 =
  中心化子，两路交叉核对）。**FirstIso** = 只写 3 行，`φ/ker` 与 `φ/im` 靠 `build.ts` 自动补 ——
  **模板绝不产出 `ker`/`im` 的定义行**。
- **关系层（`gal/relations.ts`，U19）**：`relationsFor(node, table)` → kind = `kernel`|`image`|`quotient`|`equal`|
  `subgroup`|`contains`|`derived`。两条来源：**① `node.sources` + `node.opId`**；**② `containment(H, G)`**
  三道关（id 全覆盖 → `subgroupFromElementIds` → **阶相等**）再 `findAllNormalSubgroups` + `subgroupSetKey` 判 ⊴。
  **指数 1 单列成 `equal`**（元素完全相同 = 同一个群）。面板落点：`InfoDock` 在**结论层与 tab 之间**插一节「关系」。
- **`relation` 值类型（U20）**：`GalRelation{from,to,index,isNormal,normalUnknown}`；`sortOf → 'edge'`
  （**是边不是顶点**，不占节点不占行）。**`像(f, H)`** = `image` op 的**可选第二参**（`arity 1 / optional 1`）：
  同一个 op，别名只指向一条路；建出**靶群里的子群**（第二同构的 `H′`）；**叙述分家**——两参说 `= f(H)`、
  单参说 `= im f`。**`包含(H, G)`**（`call: ['包含','include','subset']`、`infix: ['⊆']`）→ 一条
  `gedge-relation` 边，`label = isNormal ? '⊴' : '↪'`，带 `objectId`（**可点选**）；判定复用 `containment()`
  （判据同源），**声明的压过自动生成的同向 `↪`**（不叠两条）。**正规性是算出来的不是声明的** →
  没有"声明正规子群"这个操作；**指数 1 拒收**（包含是严格小于）。三种写法等价：`A ⊆ G` / `A⊆G` / `包含(A, G)`。
- **列序规则（U20 换掉）**：水平边当约束图 → **分量内穷举列序，取"两端之间夹着别的组"的边数最少者**；
  **并列只接受严格更优**（布局稳，多一条边不重排）；分量 > 7 保持原序**不猜**。
  换掉的是"夹在中间的组挪到行尾"——它在**两条水平边共用一个端点**时自相打架。
