# Spec: Codex 飞书知识插件实现规格

## 文档状态

- 阶段：`spec-apply`
- 状态：已完成实现，待用户验收与后续 `spec-review`
- 需求目录：`docs/changes/templates/codex-feishu-knowledge-plugin/`
- 分支：`feature/codex-feishu-knowledge-plugin`

## 目标与成功标准

### 目标

为一个 5-20 人、以 Codex 为主要协作入口的团队，交付一版可运行的飞书知识插件，实现“稳定读取样本文档、完成索引、按结构化条件检索与摘要”的最小闭环。

### 成功标准

- 第一版承诺只覆盖知识检索，不纳入任务文档管理。
- 插件通过本地 `stdio` MCP server 暴露 5 个知识检索 tools：
  - `list_project_docs`
  - `search_docs`
  - `get_doc_summary`
  - `list_recent_docs`
  - `compare_doc_changes`
- 存在可执行的样本文档同步链路，能够基于文档内容自动推断 `project_id`、`doc_type`，并写入最小结构化索引。
- 仓库内提供可运行的验证命令与测试，覆盖同步、索引、查询与 MCP 调用入口。
- README、插件 manifest、插件目录文档与技能定义都收敛到“知识检索优先”的第一版边界。

## 假设

- 当前仓库没有真实飞书租户、应用凭证或稳定样本文档来源，因此第一版实现以仓库内置 fixture 作为可验证输入。
- 后续若接入真实飞书 API，应替换 `fixture-client` 层而不改变 MCP tool 合同。
- 当前回合目标是交付本地可运行的最小闭环，不引入新的第三方依赖或远程部署链路。

## 命令

```bash
# 运行运行时完整性校验
npm run build

# 用样本文档刷新索引
npm run sync:sample

# 运行 Node.js 测试
npm test

# 直接启动 MCP server
node plugins/codex-lark-plugin/scripts/server.js
```

## 项目结构与边界

### 当前结构

- `package.json`
  - 提供 `build`、`sync:sample`、`test` 命令，补齐第一版验证链路。
- `plugins/codex-lark-plugin/.mcp.json`
  - 使用本地 `node ./scripts/server.js` 启动 `stdio` MCP server。
- `plugins/codex-lark-plugin/scripts/`
  - 提供 MCP server、样本文档同步、索引生成、推断与查询实现。
- `plugins/codex-lark-plugin/data/feishu-docs.sample.json`
  - 提供可重复验证的飞书样本文档 fixture。
- `plugins/codex-lark-plugin/skills/knowledge-search/SKILL.md`
  - 定义面向 Codex 的知识检索技能入口。

### 本次实现影响范围

- 已修改：
  - `README.md`
  - `CHANGELOG.md`
  - `docs/changes/templates/README.md`
  - `docs/changes/templates/codex-feishu-knowledge-plugin/`
  - `plugins/codex-lark-plugin/.codex-plugin/plugin.json`
  - `plugins/codex-lark-plugin/.mcp.json`
  - `plugins/codex-lark-plugin/README.md`
  - `plugins/codex-lark-plugin/scripts/`
  - `plugins/codex-lark-plugin/skills/`
  - `plugins/codex-lark-plugin/data/`
  - `package.json`

### 明确不在当前实现内解决的内容

- 真实飞书 API 鉴权、远程拉取与增量订阅
- 任务文档模板创建、状态流转与项目任务聚合
- 低置信度人工校正后台或审核面板
- 远程 HTTP MCP 部署形态

## 功能点

### 第一版 MCP tools

1. `list_project_docs(project, limit=10)`
   - 返回某个项目下的文档清单，按更新时间倒序排列。
2. `search_docs(query, project?, doc_type?, limit=5)`
   - 基于标题、正文与摘要做简单打分检索，并支持项目和文档类型过滤。
3. `get_doc_summary(doc_id | url)`
   - 返回单篇文档的摘要、作者、更新时间和推断元数据。
4. `list_recent_docs(project?, days=7, limit=10)`
   - 返回最近更新时间窗口内的文档列表，默认按最近 7 天查询。
5. `compare_doc_changes(doc_id, from?, to?)`
   - 基于文档 revision 内容做段落级新增/删除对比，帮助快速理解变化。

### 最小索引字段

- `doc_id`
- `title`
- `project_id`
- `doc_type`
- `author`
- `updated_at`
- `summary`
- `url`
- `inference_source`
- `inference_confidence`

## 技术决策

### 已确认并落地

1. 第一版范围只做知识检索闭环，不纳入任务文档管理。
2. 运行时采用 Node.js ESM + 标准库实现，避免在仓库内新增第三方依赖。
3. MCP 连接方式采用本地 `stdio` server，并通过插件 `.mcp.json` 注册。
4. 元数据维护策略采用 Codex 自动推断优先；推断结果写入索引，并保留来源与置信度字段。
5. 第一版最近更新只做被动查询，不承担主动订阅能力。
6. 文档差异比较能力保留在第一版，并降级为基于 revision 内容的段落差异摘要，而不是完整富文本 diff。
7. README、manifest 与插件说明统一收敛到“知识检索优先”的第一版定位。

### 设计原则

- tool 输入输出保持结构化，避免把业务逻辑塞进技能文案。
- 查询优先走本地最小索引，必要的 revision 信息随索引一起缓存。
- 同步层与查询层分离，便于后续替换真实飞书客户端。
- 当前测试与样本以可重复验证优先，不假定外部网络或真实 API 可用。

## 测试策略

### 自动化验证

- `npm run build`
  - 校验 `.mcp.json`、manifest、fixture 与 tool 注册的一致性。
- `npm run sync:sample`
  - 使用样本文档生成索引并输出统计信息。
- `npm test`
  - 覆盖索引生成、元数据推断、查询行为、最近更新过滤、文档差异比较和 MCP 请求处理。

### 验收重点

- 样本文档能生成包含推断信息的结构化索引。
- 5 个 tool 能返回符合预期的结构化结果。
- 文档差异比较能清楚识别 revision 新增与删除段落。
- MCP server 至少支持 `initialize`、`tools/list`、`tools/call`、`ping` 这几个第一版所需的方法。

## 风险

| 风险 | 影响 | 当前判断 | 缓解思路 |
| --- | --- | --- | --- |
| 真实飞书接入尚未实现 | 高 | 当前仅能验证本地样本闭环 | 把客户端层抽象为独立模块，后续单独替换 |
| 自动推断误判 | 中 | 规则基于标题、正文与路径关键词，复杂场景仍可能漂移 | 保留 `inference_source` 与 `inference_confidence`，后续补人工校正 |
| 差异比较精度有限 | 中 | 当前为段落级对比，不理解富文本结构 | 将第一版定位为“快速浏览变化”，后续再升级 |
| 索引持久化在本地文件 | 低 | 当前适合本地插件和样本验证 | 后续真实部署时可替换为数据库或远程存储 |

## 边界

### Always

- 始终以 `docs/rules` 为最高优先级约束。
- 始终在 `feature/codex-feishu-knowledge-plugin` 分支上推进实现。
- 始终保持第一版只覆盖知识检索闭环，不重新引入任务管理承诺。
- 始终为每个已完成 task 提供验证证据并同步 `tasks.md`、`log.md`。

### Ask First

- 是否接入真实飞书 API 或新增外部依赖。
- 是否扩展主动订阅、通知或远程部署能力。
- 是否在推断低置信度时引入人工修正入口。

### Never

- 不在未扩展 spec 的情况下把任务文档管理混入当前版本。
- 不编造真实飞书凭证、租户信息或外部集成能力。
- 不在没有验证证据的情况下宣称任务完成。

## Open Questions

无。当前提案内问题均已在实现中收敛或显式延期。
