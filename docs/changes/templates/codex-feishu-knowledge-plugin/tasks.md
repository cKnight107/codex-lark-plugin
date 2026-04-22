# tasks

## 已完成

- [x] 读取仓库规则、需求想法文档、plugin 骨架与 marketplace 配置，并记录关键出处。
- [x] 识别当前提案的核心冲突：`README`/manifest 将任务管理列为第一版目标，但 idea 文档建议第一版优先聚焦知识检索。
- [x] 创建需求目录 `docs/changes/templates/codex-feishu-knowledge-plugin/`。
- [x] 在 `feature/codex-feishu-knowledge-plugin` 分支生成提案态 `spec.md`、`tasks.md`、`log.md`。
- [x] 更新 `docs/changes/templates/README.md`，登记本需求目录链接与简介。
- [x] 用户显式确认本提案可进入 Apply，并要求“完成所有需求”。

## 已完成实现任务

| 状态 | 任务 | 依赖 | 验收口径 | 估算 |
| --- | --- | --- | --- | --- |
| done | 固化第一版接口与索引字段 | Apply 已确认 | 对外文案、manifest、spec 与能力边界一致，只保留知识检索闭环 | S |
| done | 选定 MCP 运行时与本地启动形态 | 第一版接口确认 | `.mcp.json` 可启动本地 `stdio` server，并有可执行命令链路 | S |
| done | 实现飞书文档同步、Codex 元数据推断与最小索引更新 | 运行时方案确认 | 样本文档可生成包含 `project_id`、`doc_type`、来源与置信度的结构化索引 | M |
| done | 实现项目文档查询、关键词检索、摘要与最近更新能力 | 同步与索引可用 | 5 个核心 MCP tools 按 spec 返回正确结果 | M |
| done | 评估并决定是否加入文档差异比较 | 查询能力完成后 | 第一版保留该能力，并降级为 revision 段落差异比较 | S |
| canceled | 任务文档模板与状态流转方案 | 第一版范围已选择 A | 不进入本次第一版实现范围 | M |
| done | 补充测试、样本验证与回滚说明 | 核心能力完成 | 存在可执行验证命令、样本结果、推断准确性检查与清晰回滚边界 | S |

## 检查点

- [x] Checkpoint 1: 所有待确认项关闭，用户明确允许进入 Apply。
- [x] Checkpoint 2: 运行时与验证链路明确，可执行构建/测试命令被补齐。
- [x] Checkpoint 3: 第一版能力通过样本文档验证，并保留后续真实飞书接入边界。
