# archive —— 已完成使命的历史文档

这里的文档**不再是规范来源**，只作历史记录。当前规范见上一级目录。

| 文档 | 为什么归档 | 内容去哪了 |
|---|---|---|
| [DESIGN.md](DESIGN.md) | 全文八成本身就是指针（"详见 ARCHITECTURE / INTERACTION"），造成了文档间来回跳 | §1 产品定位 + 三档参照 → `README.md`「定位」；§2.1 引擎依赖 → `ARCHITECTURE.md` §11；§4 后端方针 → `ARCHITECTURE.md` §7；§3 契约 → `ARCHITECTURE.md` §12 契约索引 |
| [UI_PLAN.md](UI_PLAN.md) | 是 UI 重构的**规划稿**；5 条待拍板项已全部定案 | 已并入 `INTERACTION.md` **v2**（含 5 条决策），规划稿本身作废 |
| [GROUPVIZ_HANDOFF.md](GROUPVIZ_HANDOFF.md) | 给 GroupViz 仓库 agent 的**交接 prompt**，任务已完成（GroupViz 已做门面导出 descriptor + 清越界引用 + 补 `binomialMod`）| 结论已落在 `ARCHITECTURE.md` §12（契约索引）与 §11（引擎依赖）|

## 归档规则

1. **只移动，不删除**（本项目不是 git 仓库，删除不可回滚）。
2. 归档前必须确认内容已被现行文档吸收，并在上表登记去向。
3. 归档文档的头部加一行 `> 已归档，见 docs/archive/README.md`。
