---
name: knowledge-search
description: 使用飞书知识检索 MCP tools 查询项目文档、按关键词检索知识库、读取单篇文档摘要、查看最近更新，或比较文档 revision 差异。当用户提到飞书文档、项目文档、需求文档、最近更新、这篇文档改了什么、版本对比、某项目有哪些文档、给我相关资料摘要时使用。
---

# Knowledge Search

优先调用本插件暴露的 MCP tools，不要只靠自由发挥的自然语言总结。

## 保持范围

- 只处理文档检索、摘要、最近更新和差异比较。
- 不创建文档，不修改文档，不维护任务状态，不承诺主动通知。
- 无法定位到唯一文档时，先返回候选，再继续读取摘要或比较差异。

## 先判断用户意图

按下面的顺序选择 tool：

| 用户意图 | 优先 tool | 说明 |
| --- | --- | --- |
| 已知项目，想看该项目有哪些文档 | `list_project_docs` | 按更新时间倒序返回文档列表 |
| 只有关键词、主题、问题 | `search_docs` | 先检索，再决定是否继续读摘要 |
| 已知 `doc_id` 或文档链接 | `get_doc_summary` | 直接读取摘要与元数据 |
| 想看最近几天更新了什么 | `list_recent_docs` | 可带 `project` 和 `days` |
| 想知道文档改了什么 | `compare_doc_changes` | 需要先拿到 `doc_id` |

## 执行流程

1. 从用户请求中提取 `project`、`query`、`doc_id`、`url`、`doc_type`、`days`、`from`、`to`。
2. 没有唯一文档标识时，先用 `search_docs` 或 `list_project_docs` 缩小范围。
3. 检索命中多篇文档时，先返回候选列表；只有单篇高相关结果时，再继续读取 `get_doc_summary`。
4. 需要比较差异但用户只给标题、主题或链接时，先定位文档，再调用 `compare_doc_changes`。
5. 返回结果时，优先复用 tool 的结构化字段，不要编造正文细节。

## 输出要求

- 列表结果优先包含：`title`、`project_id`、`doc_type`、`updated_at`、`author`、`summary`、`url`。
- 检索结果按相关性展示；最近更新结果按时间展示；项目文档列表按更新时间展示。
- 差异比较时，先说明 `from` 和 `to` 的具体 revision 时间，再总结新增段落与删除段落。
- 只有 tool 已返回的摘要时，只基于摘要归纳，不把未读取的正文内容说成事实。
- 没有结果时，明确说明未命中，并建议缩小项目范围、补关键词或提供文档链接。

## 常见模式

- “支付项目最近有什么文档更新？”
  - 调用 `list_recent_docs(project="payment", days=7)`
- “帮我找 Atlas 架构相关文档”
  - 先调用 `search_docs(query="Atlas 架构")`
- “总结这篇飞书文档”
  - 已知链接或 `doc_id` 时调用 `get_doc_summary`
- “这篇需求文档上周到现在改了什么？”
  - 先定位 `doc_id`，再调用 `compare_doc_changes`
