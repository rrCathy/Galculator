# GroupViz 交接 Prompt（发给 GroupViz 仓库 agent）

> **已归档**（2026-09-16）。该交接任务已完成（GroupViz 已补门面导出 `descriptor`、清理 `src/core` 越界引用、新增 `binomialMod`）。

> 用途：让 GroupViz 仓库的 agent 完成「让 `src/core` 成为可被外部项目干净 alias 的纯算法模块」所需的最小改动，以便 Galculator 对接。
> 复制下方代码块全文，直接发到 GroupViz 仓库下的 agent 会话。

---

## 背景

你是 GroupViz 仓库的开发 agent。另一个项目 **Galculator**（群论计算器，位于 `C:\newproject\Galculator`）即将复用 GroupViz 的 `src/core` 作为纯算法引擎（通过 Vite alias 直接引用源码），并以 `src/core/descriptor.ts` 的 **GroupDescriptor v1** 作为两项目之间的群描述契约。

为了让 Galculator 能干净地 alias `src/core`，需要你做下面的最小改动。**目标**：任何对 `src/core` 的引用，都不应把 React / katex / three / gifenc 等 UI 或渲染依赖拖进外部项目的构建。（第三方纯 JS 库 `zod` 不在清理范围，属于可接受的序列化依赖。）

---

## 任务（按优先级）

### P0-1：门面导出 GroupDescriptor v1 协议

- **现状**：`src/core/descriptor.ts` 定义了 `GroupDescriptorSchemaV1`、`GroupDescriptorV1`（类型）、`serializeDescriptor`、`deserializeDescriptor`、`descriptorToSymbol`，但**没有通过门面导出**。
- **证据**：`src/core/index.ts` 的 export 列表里没有 `./descriptor`；`src/core/types.ts` 也没有。
- **改动**：在 `src/core/index.ts`（和/或 `types.ts`，由你判断最合适的位置）补上 `export * from './descriptor'`，使协议通过公共门面可被 import。

### P0-2：清理 `src/core` 的越界引用

- **现状**：core 内部有两个文件引用了 core 之外的 `src/utils/`，而 `src/utils/` 含 katex / three / zod / gifenc 等依赖，破坏了 core 的零 UI 依赖边界。
- **证据**：
  - `src/core/algebra/notationParser.ts:1` → `import { createGroupFromSymbol } from '../../utils/groupFactory'`（运行时依赖）
  - `src/core/groups/importGroup.ts:3` → `import type { ApiImportGroup } from '../../utils/api'`（类型依赖）
- **改动方向**（选最不破坏现有功能的方式）：
  - `importGroup.ts`：把 `ApiImportGroup` 类型下沉/内联到 core（如移到 `src/core/types/` 下），消除对 `utils/api` 的引用；
  - `notationParser.ts`：把 `createGroupFromSymbol` 中被 core 需要的纯算法部分下沉到 core，或调整依赖方向，消除运行时对 `utils/groupFactory` 的引用。
- **约束**：不得改变 GroupViz 自身 app 的现有外部行为（功能不能回归）。

### P1（可选，顺路则做）：补组合数原语

- **背景**：Galculator 的 Proof Spec 需在证明里计算组合数 `C(n,k)` 并对素数 `p` 取模（Wielandt Sylow 证明的计数段）。
- **现状**：core 里 `factorizeOrder` 已有（`sylow.ts`），但**没有组合数函数**。
- **改动**：在 `src/core/algebra/` 下新增并导出 `binomialMod(n, k, p)`（或你认为更贴切的命名），返回 `C(n,k) mod p`。用 Lucas 定理或朴素递推均可；注意 `n` 可达 2000 量级，需避免整数溢出。若你认为放 GroupViz 不合适，可跳过并在回复里说明理由。

---

## 验收标准

1. 从 `src/core/index.ts` 能 import 到 `GroupDescriptorV1`、`serializeDescriptor`、`deserializeDescriptor`。
2. `src/core` 目录内不再有任何指向 `src/utils/`、`src/components/` 等 core 之外目录的 import（`import type` 也算）。
3. 改动后 GroupViz 自身的类型检查 / 构建 / lint 通过（运行仓库里对应的 check 命令）。
4. 回复中列明：改了哪些文件、每个文件改了什么、验收命令的执行结果。

## 不要做

- 不要改动 GroupDescriptor v1 的字段结构（这是两项目已对齐的契约）。
- 不要启动或构建 Galculator 项目。
- 不要重构 core 的整体目录结构，只做最小改动。
