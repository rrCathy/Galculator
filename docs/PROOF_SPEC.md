# Proof Spec 规范

> 证明模板的 schema 与执行语义。与 [ARCHITECTURE.md](ARCHITECTURE.md)（内核）、[INTERACTION.md](INTERACTION.md)（画布）并列。

## 1. 设计目标

- 把"证明"表达为**可执行、可实例化**的数据：模板 × 具体群 = 逐步演示。
- 演示性证明：正确性由模板作者保证，机器负责实例化 + 可视化（非形式化验证）。

## 2. Schema

```ts
type ProofStep =
  | { kind: 'claim';    id: string; text: string; tex?: string }
  | { kind: 'compute';  id: string; text: string; tex?: string; call: ComputeCall; show: ShowSpec }
  | { kind: 'conclude'; id: string; text: string; tex?: string }

type ComputeCall =
  | { target: 'local';   op: CoreOp; args: ArgRef[]; out: string }   // @groupviz/core 原语
  | { target: 'backend'; op: string; args: ArgRef[]; out: string }   // GAP 端点

type ArgRef = { step: string; path?: string } | string   // 引用前步 out / 字面量 / "$group" "$p"

type ShowSpec =
  | { mode: 'symbol' }
  | { mode: 'diagram'; view: SceneName; highlight?: string[] }
  | { mode: 'table' }

/**
 * SceneName 对齐 @groupviz/react v2.3.0 **实际入包的 10 个 Scene**。
 * 注意：sylow / tree / prestable 未 props 化、不入包，故不在此列。
 */
type SceneName =
  | 'set'           // SetView
  | 'cycle'         // CycleView
  | 'cayley'        // CayleyView
  | 'table'         // TableView
  | 'coset'         // CosetStripScene
  | 'action'        // ActionScene
  | 'homomorphism'  // HomomorphismScene
  | 'symmetry'      // SymmetryViewScene
  | 'cayley3d'      // Cayley3DScene
  | 'lattice'       // SublatticeScene

interface ProofSpec {
  id: string
  title: string
  theorem: string                       // TeX 定理陈述
  params: { group: GroupDescriptorV1; p: number }
  steps: ProofStep[]
}
```

## 2.5 落地形态（2026-09-20，M1）

§2 的第一版 schema 是按"通用引擎"设计的（`ComputeCall` + `ArgRef` 引用前步 `out`，
`ShowSpec.diagram` 映射到 `@groupviz/react` 的 10 个 Scene）。**实际实现收窄成了下面这样**，
理由是"演示性证明"的模板本来就由作者为具体群手写、且画布已换成自研交换图：

```ts
interface ProofStep {
  kind: 'claim' | 'compute' | 'conclude'
  text: string          // 面板里的中文陈述（**纯文本**，不能塞 TeX）
  tex?: string          // 同一句的 TeX（面板用 KaTeX 渲染）
  line?: string         // compute 步：要写进定义表的一整行（`P = 闭包(G, …)`）
  highlight?: string[]  // 这一步在画布上高亮哪些对象
}

interface ProofTemplate {
  id: string
  title: string
  theorem: string        // TeX 定理陈述
  blurb: string          // 一句话说明这条证明的"魂"
  params: { group: string; p: number }
  build(): ProofStep[]   // 模板 × 具体群 = 逐步演示（参数在 build 里实例化）
}
```

三条取舍：

1. **用"一整行定义"替代 `ComputeCall` + `ArgRef`。** 每一步直接把 `名字 = 表达式` 交给
   **现成的求值器**（`evalDef` → `ops.ts` 注册表）。于是：
   - **零新求值机制** —— 不会出现"证明引擎算出一个答案、画布算出另一个"；
   - step-through = **替用户一行行写定义**，机器写的东西**可见、可改**
     （与 U2 的"点出来的操作编回文本"同一条哲学）；
   - 走完一遍，画布上就是完整的证明图。
2. **`ShowSpec` 换成 `line` + `highlight`。** 画布是自研的交换图（不是 10 个 Scene 之一），
   所以"展示"就是两件事：这一步**投放**哪个对象、**高亮**谁。`SceneName` 那套留给
   未来的"教育模式联动 GroupViz GVL"。
3. **`ArgRef` 的 local/backend 分发没了。** 模板里全部是 local（走 core）；backend 仍未接入。
   代价是模板换群要作者改 `build()` —— 对演示性证明可接受（正确性本来就由作者负责）。

## 3. 执行语义（实际）

- **`proofLines(steps, cursor)`**：走到第 `cursor` 步为止该写下的定义行（纯函数）。
  App 里 `lines` **直接由它重建**（而不是增删一行）——幂等，跳步、回退、重来结果都一致。
- **`proofHighlight(steps, cursor)`**：这一步该高亮的对象；没写 `highlight` 就退回
  "这一步写出来的那个对象"（定义行等号左边的名字就是对象 id）。
- **高亮落地**：并入画布的 `pickedIds` → 当前步的对象用选中态高亮。
- **数字从哪来**：模板 `text` 里的每个数字都由 `build()` **真算**（同一批 core 函数、同一份输入），
  不手写。`verify/suites/proof.ts` 再回过头把"文本里的数字"与"图上对象的阶"钉在一起。

> 初版 §2 的那套（依赖拓扑序解析 / `ShowSpec` 三模态 / local-backend 分发）**没有实现**，
> 原因见上；`ArgRef` 式的"前步输出引用"也不需要了——定义行里直接写对象名，
> 名字的作用域由求值器统一管（只能引用前面已定义的名字）。

## 4. op 对齐表（↔ `@groupviz/core` v2.3.0）

> 本表是 [ARCHITECTURE.md](ARCHITECTURE.md) §3.4「原语 → core 落点」在证明场景下的**收窄版**——只列 Sylow 三步证明实际用到的。
> 实际模板（`apps/web/src/gal/proof.ts`）写的是**操作注册表的调用名**，不是裸 core 函数名：
> 阶分解 `分解(12)` · 组合数模 `Cmod(12, 4, 2)` · 闭包 `闭包(G, (12)(34), (13)(24))` ·
> **陪集作用 `陪集作用(G, P)`**（本轮为 Sylow I 新增的操作）· 轨道 `轨道(A, 1)` · 稳定子 `稳定子(A, 1)`。
> 下表是它们各自落到的 core 导出。

| op | 状态 | core 导出 / 签名 | 用途 |
|---|---|---|---|
| `factorizeOrder` | ✅ | `(n) => {prime,exponent}[]` | 阶分解 |
| `binomialMod` | ✅ | `(n,k,p) => number`（Lucas） | C(n,pᵏ) mod p |
| `findSylowSubgroups` | ✅ | `(group,p) => SylowSubgroupInfo[]` | Sylow p-子群 |
| `computeSylowAnalysis` | ✅ | `(group,allowLarge?) => SylowAnalysis \| null` | n_p / 同余 / 整除 |
| `computeCosetActionPerms` | ✅ | `(group,subgroupElements) => {perms,n,setLabels}` | 陪集作用 |
| `computeOrbits` | ✅ | `(perms,n) => {orbits,orbitOf}` | 轨道分解 |
| `computeStabilizers` | ✅ | `(group,perms,n) => Map<number,string[]>` | 稳定子 |
| `verifyOrbitStabilizer` | ✅ | `(group,orbits,stabilizers) => OrbitStabilizerCheck[]` | OST 验证 |
| `sylowConjugationPerms` | ✅ | `(group,subgroups) => Map<string,number[]>` | Sylow II 共轭作用 |
| `computeSubgroupLattice` | ✅ | `(group,allowLarge?) => {nodes,edges}` | 子群格 |
| `mergeLatticeByConjugacy` | ✅ | `(group,nodes,edges) => MergedLatticeNode[] \| null` | 共轭合并（数学浓缩）|

**结论：Sylow I / II / III 所需原语，`@groupviz/core` v2.3.0 全部具备。**

> 遗留：若要"完整忠实版"枚举 `C(n,pᵏ)` 个子集并在其上作用，core 无直接原语。
> 当前采用**粒度 C**（只算计数 + 用陪集作用实例化轨道），不需要该原语。

## 5. 实例：Sylow I（Wielandt）在 A₄，p = 2

```jsonc
{
  "id": "sylow-1-wielandt",
  "title": "Sylow I — 存在性（Wielandt 群作用证明）",
  "theorem": "p^k \\mid |G| \\Rightarrow \\exists H \\le G,\\ |H| = p^k",
  "params": { "group": "<A₄ 的 GroupDescriptorV1>", "p": 2 },
  "steps": [
    { "kind": "claim", "id": "s1", "text": "设 |G| = pᵏ·m 且 p ∤ m" },

    { "kind": "compute", "id": "s2", "text": "|A₄| = 12 = 2²·3 ⇒ p = 2, k = 2, pᵏ = 4, m = 3",
      "call": { "target": "local", "op": "factorizeOrder", "args": [12], "out": "f" },
      "show": { "mode": "symbol" } },

    { "kind": "claim", "id": "s3", "text": "构造 X = { A ⊆ G : |A| = pᵏ }（全体 pᵏ 元子集），|X| = C(n, pᵏ)" },

    { "kind": "compute", "id": "s4", "text": "|X| = C(12,4) = 495；495 mod 2 = 1 ≠ 0，故 2 ∤ |X|",
      "call": { "target": "local", "op": "binomialMod", "args": [12, 4, 2], "out": "c" },
      "show": { "mode": "symbol" } },

    { "kind": "claim", "id": "s5", "text": "p ∤ |X| ⇒ 轨道分解 X = ⊔ Oᵢ 中必存在轨道 O 使 p ∤ |O|（否则每个 p | |Oᵢ|，其和 |X| 亦被 p 整除，矛盾）" },

    { "kind": "compute", "id": "s6", "text": "取 Sylow 2-子群 P（|P| = 4 ≅ V₄）作为 X 中元素 A 的实例",
      "call": { "target": "local", "op": "findSylowSubgroups", "args": ["$group", 2], "out": "P" },
      "show": { "mode": "diagram", "view": "set", "highlight": ["<P 的元素 id>"] } },

    { "kind": "compute", "id": "s7", "text": "G 左乘作用在 P 的左陪集上（共 [G : P] = 3 个点）",
      "call": { "target": "local", "op": "computeCosetActionPerms", "args": ["$group", { "step": "P" }], "out": "ca" },
      "show": { "mode": "diagram", "view": "coset" } },

    { "kind": "compute", "id": "s8", "text": "轨道 O(P) 只有一条，长度 3（传递）⇒ 2 ∤ |O(P)|",
      "call": { "target": "local", "op": "computeOrbits", "args": [{ "step": "ca", "path": "perms" }, { "step": "ca", "path": "n" }], "out": "orb" },
      "show": { "mode": "diagram", "view": "coset" } },

    { "kind": "compute", "id": "s9", "text": "稳定子 Stab(P) = P，|Stab(P)| = 4",
      "call": { "target": "local", "op": "computeStabilizers", "args": ["$group", { "step": "ca", "path": "perms" }, { "step": "ca", "path": "n" }], "out": "stab" },
      "show": { "mode": "symbol" } },

    { "kind": "compute", "id": "s10", "text": "orbit–stabilizer 验证：|G| = |O(P)| · |Stab(P)| = 3 × 4 = 12 ✓",
      "call": { "target": "local", "op": "verifyOrbitStabilizer", "args": ["$group", { "step": "orb", "path": "orbits" }, { "step": "stab" }], "out": "chk" },
      "show": { "mode": "table" } },

    { "kind": "claim", "id": "s11", "text": "p ∤ |O| ⇒ pᵏ | |Stab(A)|（由 |G| = |O|·|Stab| = pᵏm 且 p ∤ |O|），即 4 ≤ |Stab(A)|" },
    { "kind": "claim", "id": "s12", "text": "Stab(A)·a ⊆ A（∀a ∈ A）⇒ |Stab(A)| ≤ |A| = pᵏ = 4" },
    { "kind": "conclude", "id": "s13", "text": "4 ≤ |Stab(A)| ≤ 4 ⇒ |Stab(A)| = 4 = pᵏ，即 Stab(A) 是 pᵏ 阶子群 ∎" }
  ]
}
```

> **粒度 C 的关键**：s3–s5 只算 `|X|` 与模 p，**不枚举 X**（这本身是教学点：证明靠计数，不靠枚举）；
> 存在性由 s5 的反证**独立**成立，s6 的 P 只是把"存在"具象化，不是前提——**不循环**。

## 6. Sylow II / III（待写）

- **Sylow II**（共轭性）：用 `sylowConjugationPerms(group, subgroups)` 得 G 作用在全体 Sylow p-子群上的置换，`computeOrbits` 证传递（单轨道），稳定子 = 正规化子 N_G(P)。
- **Sylow III**（n_p ≡ 1 mod p 且 n_p | m）：`computeSylowAnalysis` 已给出 `np` / `congruentModP` / `dividesM`；模板负责把这两个结论"演"出来（轨道–稳定子 + 正规化子夹逼）。

## 7. 模板路线图

- **Sylow I（Wielandt）✅ 已落地（2026-09-20，M1）**：`gal/proof.ts` 的 `SYLOW_I`，
  A₄ / p = 2，13 步；UI 是右上角的**证明面板**（`ui/ProofDock.tsx`），
  前进 / 后退 / 跳步 / 重来，当前步在画布上高亮。
  验证：断言 `verify/suites/proof.ts` · 走查 `verify/e2e/proof-step.mjs`。
- 接着：Sylow II / III（M2）——`sylowConjugationPerms` 给传递性、`computeSylowAnalysis` 给 `n_p`。
- 候选：Cayley 定理、第一同构定理、orbit–stabilizer 定理、Burnside 引理。

## 8. 待补细节

- backend 端点清单（Sylow 以外的大群场景）。
- 模板的**入参界面**：现在群与 p 写死在 `params` 里（A₄/2）；要做成可切换（下拉选群 / 选 p），
  需要把"实例数据"（如 V₄ 的生成元）与模板骨架分开。
- 多个模板同时可走（现在一次只能走一条：`lines` 归证明独占，开始时会清空画布）。
