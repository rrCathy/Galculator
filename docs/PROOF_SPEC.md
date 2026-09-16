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

## 3. 执行语义

- **依赖解析**：`compute.args` 引用前步 `out` 变量，按拓扑序执行。
- **逐步执行**：step-through（前进 / 后退 / 跳转）。
- **local / backend 分发**：local 走 `@groupviz/core`，backend 走 GAP 端点。
- **展示**：每步按 `ShowSpec` 渲染（符号 / 图 / 表），可高亮。
- **产出**：每步同时向画布投放节点 / 边（见 [INTERACTION.md](INTERACTION.md) 的"画布图"一节）。

## 4. op 对齐表（↔ `@groupviz/core` v2.3.0）

> 本表是 [ARCHITECTURE.md](ARCHITECTURE.md) §3.4「原语 → core 落点」在证明场景下的**收窄版**——只列 Sylow 三步证明实际用到的。
> `compute` 的 `op` 引用的是**操作注册表**里的 id（见 ARCHITECTURE §8），不是裸 core 函数名；下表是二者的对应关系。

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

- 已定：Sylow I（M1）、Sylow II / III（M2）。
- 候选：Cayley 定理、第一同构定理（`HomomorphismScene` 有 `theoremMode` 动画）、orbit–stabilizer 定理、Burnside 引理。

## 8. 待补细节

- `CoreOp` 收紧为类型安全的字面量联合（与 §4 表格一一对应）。
- backend 端点清单（Sylow 以外的大群场景）。
- 执行器的错误模型（某个 op 失败时如何降级 / 提示）。
