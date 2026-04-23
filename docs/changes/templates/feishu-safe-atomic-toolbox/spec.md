# Spec: 飞书安全原子工具箱路线提案

## 文档状态

- 阶段：`spec-apply`
- 状态：已按用户确认的选项 A 完成第一批实现与自动化验证
- 需求目录：`docs/changes/templates/feishu-safe-atomic-toolbox/`
- 分支：`feature/feishu-safe-atomic-toolbox`
- 来源：`prod.md` 中提出插件应从“具体业务动作工具”转向“低层原子能力 + 少量安全高阶编排”

## 结论

该方向可行，并且与当前代码结构匹配。现有项目已经具备 MCP 工具注册、真实飞书读取、受控写入、写入开关、参数校验和测试基线；后续应把能力边界从“创建/编辑/移动几个具体动作”升级为“安全、可审计、可组合的飞书读写积木”。

如果后续还有其他操作，不建议每次都新增一个强业务绑定 tool。推荐流程是：

- 先判断该操作能否由已有原子 tool 组合完成。
- 如果不能，优先补一个更通用的原子能力，例如读取块、列目录、获取元数据、批量块预览。
- 只有当某个流程高频、稳定且风险可控时，再沉淀成高阶模板 tool。
- 高阶模板必须基于原子能力实现，并继承 dry-run、diff、显式 token、上限控制和写后校验。

## 目标与成功标准

### 目标

把 `codex-lark-plugin` 的产品方向明确为“飞书文档/云盘操作的安全工具箱”，而不是继续堆叠一次性业务动作。

### 成功标准

- 形成一组稳定的原子读能力：列文件夹、读取 docx blocks、读取 raw content、获取文件元信息。
- 形成一组受控原子写能力：更新文本块、更新富文本 elements、批量更新 blocks、创建 blocks，删除 blocks 仅在强确认后开放。
- 所有写操作默认支持 dry-run 或预览模式，并返回修改目标、原值、目标值和风险提示。
- 写操作必须要求显式 token / block_id / document_id，不允许模糊搜索后直接写。
- 高阶模板数量保持少量，首批只覆盖高频稳定流程，例如索引链接化、文件夹索引同步、本地索引刷新、按清单移动文件。
- 现有只读检索与写入工具继续可用，不破坏当前 MCP tool 合同。
- 无真实飞书凭证时仍可运行 `npm test` 和 `npm run build`。

## 执行命令

提案阶段只允许运行只读分析和文档校验命令：

```bash
git status --short
npm test
npm run build
```

Apply 阶段如需真实飞书 smoke，必须由用户明确提供测试空间和授权前置条件后再执行：

```bash
npm run test:feishu-smoke
```

## 项目结构与边界

### 当前关键入口

- MCP server 的 `tools/list` 直接返回 `toolDefinitions`，`tools/call` 统一调用 `executeTool()`，说明新增工具可以继续走集中注册和集中分发模型。出处：`plugins/codex-lark-plugin/scripts/server.js:53`
- 只读工具当前定义在 `readToolDefinitions`，包含项目列表、关键词搜索、摘要、最近更新、revision 差异共 5 个工具。出处：`plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js:16`
- 写入工具定义通过 `writeToolDefinitions` 与只读工具合并为 MCP tool 列表。出处：`plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js:81`
- 写入调用在执行前会先检查 `isWriteTool()`，再进入 `executeWriteTool()`。出处：`plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js:180`
- 写入执行统一先调用 `assertFeishuWriteEnabled()` 和 `validateWriteToolArgs()`，再创建飞书写入 client。出处：`plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js:276`

### 已有能力

- 当前 README 已明确插件第一版支持知识检索、摘要、最近更新、差异比较，以及显式开启后的文档创建、受控块编辑、文件夹创建和文件移动。出处：`plugins/codex-lark-plugin/README.md:5`
- 真实飞书读取链路已有 `fetchDocxContent()`，使用 docx raw_content API 读取纯文本。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-docs-source.js:55`
- 真实飞书读取链路已有内部 `listFolderFiles()`，能分页列出文件夹文件，并在同步时递归进入子文件夹。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-docs-source.js:71`
- 当前写入合同已有 4 个工具：`create_feishu_doc`、`edit_feishu_doc`、`create_feishu_folder`、`move_feishu_file`。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-write-contract.js:36`
- 写入安全开关 `LARK_FEISHU_WRITE_ENABLED` 默认禁用写操作。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-write-contract.js:3`
- 写入错误上下文已有白名单脱敏机制，只保留 document、folder、file、block、operation 等安全上下文字段。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-write-contract.js:21`
- 当前文档写入已支持纯文本和最小 Markdown 到飞书 block 的转换。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-doc-write.js:56`
- 当前 `editFeishuDoc()` 支持 append、insert 和 update_text 三类受控块编辑。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-doc-write.js:201`
- 当前 Drive 写入已支持创建文件夹和移动文件。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-drive-write.js:41`
- `doc-write` skill 已要求用户提供明确目标 token，并禁止模糊标题搜索后直接写入。出处：`plugins/codex-lark-plugin/skills/doc-write/SKILL.md:10`

### 当前缺口

- `listFolderFiles()` 目前是同步链路内部函数，没有作为 MCP 原子读 tool 暴露。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-docs-source.js:71`
- 当前只读工具主要面向本地索引查询，不提供按 token 直接获取文件元信息或目录树的 tool。出处：`plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js:16`
- 当前读取 docx 只提供 raw content，同步逻辑没有暴露 blocks 列表、block_id、block_type、elements 和 parent_id。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-docs-source.js:55`
- 当前 `update_text` 是直接写入，没有统一 dry-run、diff 预览或写前读取原块内容的合同字段。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-doc-write.js:201`
- 当前创建 blocks 使用 `document_revision_id=-1`，还没有让调用方传入并校验指定 `document_revision_id`，并发写入保护不足。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-doc-write.js:269`
- 当前批量更新、富文本 elements 更新、删除块和写后 verify 尚未实现。出处：`plugins/codex-lark-plugin/scripts/lib/feishu-write-contract.js:36`

## 功能点

### 原子读能力

建议首批新增：

- `list_folder_files`
  - 输入：`folder_token`、`recursive`、`max_depth`、`limit`
  - 输出：`token`、`type`、`name`、`url`、`path`、`parent_folder_token`
  - 价值：为后续“按清单移动”“生成索引文档”“链接化目录”提供基础。
- `get_docx_blocks`
  - 输入：`document_id`、`page_size`、`page_token`
  - 输出：`block_id`、`block_type`、`plain_text`、`elements`、`parent_id`
  - 价值：让 agent 能定位可写 block，而不是要求用户手工提供所有 block_id。
- `get_docx_raw_content`
  - 输入：`document_id`
  - 输出：`content`
  - 价值：把当前内部 raw content 能力显式暴露为 MCP 原子工具。
- `get_file_meta`
  - 输入：`token` 或 `url`
  - 输出：文件类型、标题、链接、权限状态、可用操作提示
  - 价值：为写前确认、错误解释和高阶模板提供元信息。

### 原子写能力

建议分两批推进：

- 第一批：安全增强现有写入
  - 给 `edit_feishu_doc` 增加 `dry_run`、`document_revision_id`、`expected_old_text`、`verify_after_write`。
  - 给创建/移动类工具增加 `dry_run` 和明确的预览输出。
  - 统一返回 diff 或 operation preview。
- 第二批：新增更细颗粒能力
  - `update_block_elements`：支持 link、mention_doc 等受限 elements schema。
  - `batch_update_blocks`：批量更新多个块，强制 `dry_run=true` 默认开启，并支持 `max_updates`。
  - `create_blocks`：显式 parent、index、allowed block schema。
  - `delete_blocks`：后续再议，只能在强确认和上限保护下开放。

### 高阶模板

建议只保留少量模板：

- `link_doc_index_to_folder`：把目录文档里的条目链接到指定文件夹内文件。
- `sync_folder_index_doc`：根据文件夹生成或更新索引文档。
- `refresh_local_index`：刷新本地检索索引。
- `move_files_by_manifest`：按用户确认过的清单移动文件。

这些模板必须复用原子工具，不直接绕过安全合同。

## 变更范围

### 预期会修改

- `plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js`
  - 注册新增原子读工具和高阶模板工具。
- `plugins/codex-lark-plugin/scripts/lib/feishu-docs-source.js`
  - 将内部读取函数拆出可复用服务，避免同步逻辑和 MCP tool 重复实现。
- `plugins/codex-lark-plugin/scripts/lib/feishu-write-contract.js`
  - 扩展写入 schema，增加 dry-run、diff、revision、allowed block type、max update 等安全字段。
- `plugins/codex-lark-plugin/scripts/lib/feishu-doc-write.js`
  - 增加写前读取、diff 预览、写后 verify、富文本 elements 更新和批量更新。
- `plugins/codex-lark-plugin/scripts/__tests__/`
  - 增加原子读、dry-run、diff、verify、批量限制和高阶模板测试。
- `plugins/codex-lark-plugin/README.md`
  - 更新产品定位、工具列表、写入安全模型和后续操作指南。
- `plugins/codex-lark-plugin/skills/`
  - 更新 skill 文案，让 agent 优先用原子工具组合，只有高频流程才用模板。

### 不应修改

- 不重写 MCP stdio server 壳层。
- 不引入飞书 SDK 作为必需依赖。
- 不把 token、secret、索引运行时文件写入仓库。
- 不在首批实现无限制删除、整篇覆盖、自动授权协作者或模糊搜索后直接写入。

## 技术决策

### 已确认

- 方向上采用“低层原子能力 + 少量安全高阶编排”。
- 写操作继续默认禁用，必须显式开启写入开关。
- 写操作继续要求明确 token / id，不允许搜索后直接写。
- 现有 4 个写入工具不应删除，应通过向后兼容字段逐步增强。
- 高阶模板不直接调用飞书 API，必须复用原子能力。

### 建议决策

- 原子读能力优先级高于新高阶模板，因为它们会降低后续任意操作的实现成本。
- dry-run 和 diff 应作为写入合同的一等字段，而不是只写在 skill 流程里。
- `document_revision_id` 应进入写入合同，避免并发编辑时覆盖他人更新。
- `delete_blocks` 暂不进入第一批实现，直到 dry-run、diff、强确认和回滚说明稳定。

### 放弃方案

- 放弃继续堆叠大量一次性业务 tool。
  - 原因：MCP 无法预判所有用户操作，会导致工具爆炸、测试矩阵膨胀和安全边界模糊。
- 放弃让高阶模板绕过原子工具直接调用飞书 API。
  - 原因：会复制权限校验、dry-run、diff 和 verify 逻辑，增加安全不一致风险。

## 测试策略

- 单元测试覆盖 tool schema、参数校验、默认值、非法参数和错误上下文脱敏。
- fixture client 测试覆盖飞书 API 请求路径、请求体、分页、block 结构解析和返回归一化。
- dry-run 测试必须证明不会发起写入 API 请求。
- diff 测试必须覆盖原文本、目标文本、链接 elements 和批量块变更摘要。
- verify 测试必须覆盖写后读取成功、写后读取不一致和飞书 API 错误。
- `npm test` 和 `npm run build` 必须在无凭证环境通过。
- 真实飞书 smoke 只在用户提供测试空间、授权和可写目标后执行。

## 风险

- 兼容性风险：现有 MCP tool 名称和字段已被 skill 使用，字段改动必须向后兼容。
- 数据风险：批量更新和删除块存在误写风险，必须默认 dry-run、限制数量并强制明确目标。
- 并发风险：如果不校验 `document_revision_id`，可能覆盖协作者刚写入的内容。
- 权限风险：不同 token mode 下同一 token 可读写权限不同，错误提示需要保留足够上下文但不能泄露 secret。
- 性能风险：递归列文件夹和读取 blocks 可能触发大量 API 调用，需要 limit、max_depth 和分页。
- 产品风险：高阶模板过多会回到业务助手模式，必须坚持“高频、稳定、可审计”才沉淀。

## Always / Ask First / Never

### Always

- 始终优先复用现有 client、错误模型和写入开关。
- 始终为写入类能力提供 dry-run 或等价预览。
- 始终要求明确 token / id 后再写入。
- 始终给批量操作设置上限。
- 始终在文档中区分原子工具与高阶模板。

### Ask First

- 是否开放删除块。
- 是否允许批量移动或批量更新超过默认上限。
- 是否把某个临时流程沉淀为高阶模板。
- 是否执行真实飞书 smoke。
- 是否新增 OAuth scope 或改变默认鉴权建议。

### Never

- 不在用户未确认目标时写入飞书。
- 不根据模糊搜索结果直接修改或移动文件。
- 不把真实 token、secret、用户 token 文件或本地索引提交进仓库。
- 不在 main/master 分支开发。
- 不在 propose 阶段修改业务代码。

## 待澄清

已确认：第一批 Apply 按“安全原子能力优先”推进。

- 已完成 `list_folder_files`。
- 已完成 `get_docx_blocks`。
- 已完成 `get_file_meta`。
- 已完成写入 `dry_run`、diff、`document_revision_id`、`expected_old_text`、`verify_after_write`。

当前无阻断实现的待澄清项。删除块、批量更新和高阶模板仍为后续再议。
