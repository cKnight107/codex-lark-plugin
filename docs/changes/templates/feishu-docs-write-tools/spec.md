# Spec: 飞书文档与云空间写入 MCP Tool 提案

## 文档状态

- 阶段：`spec-apply`
- 状态：实现与自动化验证已完成，review P1 路径问题已修复，真实飞书手工 smoke 等待测试空间与授权
- 需求目录：`docs/changes/templates/feishu-docs-write-tools/`
- 分支：`feature/feishu-docs-write-tools`
- 来源：用户要求为飞书文档增加创建、编辑能力，并通过 MCP tool 暴露；随后补充创建文件夹、移动文件到指定文件夹能力

## 当前假设

1. 首版文档内容写入只支持新版飞书文档 `docx`，不覆盖表格、多维表格、旧版文档或知识库节点创建。
2. 创建能力使用现有飞书 client 的通用 `request()` 封装，不引入飞书 SDK 或第三方依赖。
3. 编辑能力首版以“受控块操作”为边界，支持追加内容、插入内容和更新指定块文本，不支持整篇覆盖替换。
4. 内容输入支持 `plain_text` 与一个最小 Markdown 子集，复杂富文本、图片、表格、权限协作后续再议。
5. 写入型能力默认要求用户显式开启写入环境变量，避免只读检索用户误触发远端变更。
6. 文件夹创建和文件移动属于飞书 Drive 写入能力，与文档块写入共用同一个写入开关和鉴权配置。
7. 移动能力首版要求调用方显式传入 `file_token`、`file_type` 和目标 `folder_token`，不做模糊搜索后自动移动。

## 已确认事项

- 首版不支持整篇覆盖替换。
- 首版支持 `plain_text` 与最小 Markdown 子集。
- 写入后默认不刷新本地索引，仅通过 `index_after_create` / `refresh_index` 显式触发。
- 新增独立写入 skill，保留 `knowledge-search` 只读语义。
- 需求范围扩展为同时包含飞书文档写入和 Drive 文件夹/文件移动写入能力。

## 目标与成功标准

### 目标

在现有只读知识检索 MCP server 基础上，新增飞书文档创建与编辑能力，让 Codex 可以通过结构化 MCP tool 创建新版飞书文档，并对已有文档执行受控编辑。

### 成功标准

- MCP server 在保留现有 5 个只读 tools 的基础上，新增写入型 tools：
  - `create_feishu_doc`
  - `edit_feishu_doc`
  - `create_feishu_folder`
  - `move_feishu_file`
- `create_feishu_doc` 可以在指定 `folder_token` 下创建新版 `docx` 文档，并可选写入初始内容。
- `edit_feishu_doc` 可以对指定文档追加内容、在指定父块下插入内容，或更新指定块文本。
- `create_feishu_folder` 可以在指定父文件夹下创建子文件夹，并返回新文件夹 token、URL 和父级信息。
- `move_feishu_file` 可以把指定文件移动到目标文件夹，并返回飞书异步任务标识或移动结果。
- 写入 tool 必须 fail fast 校验写入是否启用、必填参数、内容类型、最大内容长度和操作模式。
- 写入请求必须复用 `FeishuApiError` 的上下文错误模型，保留 `document_id`、`folder_token`、`parent_folder_token`、`target_folder_token`、`file_token`、`file_type`、`block_id`、飞书错误码和 HTTP 状态，且不得打印 token、secret。
- README、`.mcp.json`、skill 文案和测试覆盖必须明确区分只读检索与写入编辑能力。
- 无凭证环境仍可运行 `npm test` 和 `npm run build`，不因真实飞书写入能力破坏 sample 基线。

## 代码现状

### 已有能力

- 当前 MCP server 是本地 `stdio` 协议壳层，`tools/list` 直接返回 `toolDefinitions`，`tools/call` 统一委派给 `executeTool()`。
  - 出处：`plugins/codex-lark-plugin/scripts/server.js:53-69`
- 当前 tool 注册集中在 `knowledge-tools.js`，只注册 5 个只读知识检索 tools。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js:4-63`
- 当前 tool 执行入口统一先 `ensureIndex()`，再围绕本地索引执行查询、摘要、最近更新和差异比较。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js:166-245`
- 当前飞书 client 已支持 tenant/user/app token 选择、Bearer 注入、JSON body 透传、HTTP 错误和飞书业务错误包装。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/feishu-client.js:72-222`
  - 出处：`plugins/codex-lark-plugin/scripts/lib/feishu-client.js:459-470`
- 当前真实飞书读取链路已经复用 `client.request()` 访问 docx、drive、wiki API。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/feishu-docs-source.js:55-129`
- 当前真实飞书读取链路已经使用 `GET /open-apis/drive/v1/files` 遍历文件夹清单，具备复用 Drive 路径和错误上下文的基础。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/feishu-docs-source.js:71-90`
- 当前鉴权配置支持 `tenant` 与 `user` 两种 token mode，真实飞书模式会从环境变量和本地 user token 文件构造 client。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/data-source.js:103-174`
  - 出处：`plugins/codex-lark-plugin/scripts/lib/data-source.js:176-249`
- 当前 README 的 OAuth scope 仅包含只读权限：`drive:drive:readonly`、`space:document:retrieve`、`docx:document:readonly`。
  - 出处：`plugins/codex-lark-plugin/README.md:186`
  - 出处：`plugins/codex-lark-plugin/.mcp.json:20`

### 当前缺口

- 现有技能文案明确禁止创建和修改文档。
  - 出处：`plugins/codex-lark-plugin/skills/knowledge-search/SKILL.md:12-13`
- 运行时校验脚本固定期望 tool 数量为 5，新增 tool 后必须同步更新。
  - 出处：`plugins/codex-lark-plugin/scripts/validate-runtime.js:21-30`
- MCP 请求测试同样断言 `tools/list` 返回 5 个工具，新增 tool 后必须扩展断言和调用测试。
  - 出处：`plugins/codex-lark-plugin/scripts/__tests__/knowledge-tools.test.js:78`
- 现有飞书读取数据源只同步 folder/wiki 下已有文档，没有任何创建文档、写入块、更新块、创建文件夹、移动文件或删除块封装。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/feishu-docs-source.js:55-270`
- 当前索引刷新仍是只读同步语义，写入后是否自动刷新本地索引尚未定义。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/index-store.js:195-258`

## 官方 API 依据

- 飞书官方文档存在新版文档创建接口：`POST /open-apis/docx/v1/documents`。
  - 来源：https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/create
- 当前代码已使用官方新版文档纯文本读取接口：`GET /open-apis/docx/v1/documents/:document_id/raw_content`。
  - 来源：https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/raw_content
  - 出处：`plugins/codex-lark-plugin/scripts/lib/feishu-docs-source.js:55-63`
- 飞书新版文档编辑基于块结构，创建子块、更新块、批量更新块等接口需要在 Apply 前再次按官方文档核对请求体和限制。
  - 参考入口：https://open.feishu.cn/document/server-docs/docs/docs/docx-v1
- 飞书官方文档存在 Drive 创建文件夹接口。
  - 来源：https://open.feishu.cn/document/server-docs/docs/drive-v1/folder/create_folder
- 飞书官方文档存在移动文件或文件夹接口。
  - 来源：https://open.feishu.cn/document/server-docs/docs/drive-v1/file/move

## 功能点

### `create_feishu_doc`

建议输入：

```json
{
  "folder_token": "fldcn_xxx",
  "title": "需求评审记录",
  "content": "# 标题\n\n正文",
  "content_type": "markdown",
  "index_after_create": true
}
```

建议输出：

```json
{
  "document_id": "doxcn_xxx",
  "title": "需求评审记录",
  "url": "https://feishu.cn/docx/doxcn_xxx",
  "folder_token": "fldcn_xxx",
  "content_written": true,
  "indexed": true
}
```

首版行为：

- 创建空文档时只调用文档创建接口。
- 传入 `content` 时先转换为受支持的 blocks，再写入文档根块。
- `content_type=markdown` 只承诺标题、段落、无序列表、有序列表、引用、分割线等基础结构。
- `content_type=plain_text` 按段落拆分为文本 blocks。

### `edit_feishu_doc`

建议输入：

```json
{
  "document_id": "doxcn_xxx",
  "operation": "append",
  "content": "新增段落",
  "content_type": "plain_text",
  "parent_block_id": "doxcn_xxx"
}
```

支持操作建议：

- `append`：向文档根块或指定父块末尾追加内容。
- `insert`：向指定父块的指定 index 插入内容。
- `update_text`：更新指定 `block_id` 的文本内容。

首版不建议默认支持：

- 整篇覆盖替换。
- 删除块。
- 图片、表格、复杂嵌套块。
- 自动把任意 Markdown 完整映射为飞书富文本。

### `create_feishu_folder`

建议输入：

```json
{
  "parent_folder_token": "fldcn_parent",
  "name": "需求评审资料"
}
```

建议输出：

```json
{
  "folder_token": "fldcn_child",
  "name": "需求评审资料",
  "parent_folder_token": "fldcn_parent",
  "url": "https://feishu.cn/drive/folder/fldcn_child"
}
```

首版行为：

- 调用飞书 Drive 创建文件夹接口：`POST /open-apis/drive/v1/files/create_folder`。
- `parent_folder_token` 必填，不默认写入根目录，避免租户或用户空间语义不一致。
- `name` 必填，并限制长度与非法字符。
- 不自动添加协作者或改权限；权限管理后续再议。

### `move_feishu_file`

建议输入：

```json
{
  "file_token": "doxcn_xxx",
  "file_type": "docx",
  "target_folder_token": "fldcn_target"
}
```

建议输出：

```json
{
  "file_token": "doxcn_xxx",
  "file_type": "docx",
  "target_folder_token": "fldcn_target",
  "task_id": "12345"
}
```

首版行为：

- 调用飞书 Drive 移动文件或文件夹接口。
- 要求显式传入 `file_type`，默认推荐 `docx`，避免 token 类型推断错误。
- 支持移动 `docx` 和飞书 Drive API 可接受的常见文件类型；实现阶段以官方接口枚举和测试 fixture 收敛 allowlist。
- 不做文件搜索、同名冲突处理、批量移动或权限授予。

## 变更范围

### 预期修改范围

- `plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js`
  - 注册新增 MCP tools，或拆分只读/写入工具模块后统一导出。
- `plugins/codex-lark-plugin/scripts/lib/feishu-doc-write.js`
  - 新增文档写入服务，封装创建文档、内容转换、创建子块、更新块。
- `plugins/codex-lark-plugin/scripts/lib/feishu-drive-write.js`
  - 新增 Drive 写入服务，封装创建文件夹和移动文件。
- `plugins/codex-lark-plugin/scripts/lib/data-source.js`
  - 复用现有飞书配置解析，必要时增加写入开关和写入权限校验。
- `plugins/codex-lark-plugin/scripts/lib/feishu-client.js`
  - 原则上只做最小增强，例如请求重试、限流上下文或写入 authMode 覆盖；不重写 client。
- `plugins/codex-lark-plugin/.mcp.json`
  - 增加写入开关、写入 scope 示例和默认禁用配置。
- `plugins/codex-lark-plugin/scripts/validate-runtime.js`
  - 更新 tool 数量和写入配置模板校验。
- `plugins/codex-lark-plugin/scripts/__tests__/`
  - 增加写入 tool schema、参数校验、mock 飞书写入请求、错误处理测试。
- `plugins/codex-lark-plugin/README.md`
  - 补充文档写入、文件夹创建、文件移动、权限、风险、OAuth scope 和示例。
- `plugins/codex-lark-plugin/skills/`
  - 保留 `knowledge-search` 的只读边界；新增或更新写入技能，避免混淆。

### 明确不修改范围

- 不改变现有 5 个只读 MCP tools 的输入输出合同。
- 不把写入能力混入 `sync:sample` 的数据生成流程。
- 不把真实 token、secret、索引文件或用户 token 文件写入仓库。
- 不新增数据库、远程服务或非标准库依赖，除非用户另行确认。

## 技术决策

### 推荐方案

1. 新增独立写入模块 `feishu-doc-write.js`，避免把查询和写入逻辑混在当前 `knowledge-tools.js` 内。
2. 写入 tool 默认通过 `LARK_FEISHU_WRITE_ENABLED=true` 显式开启。
3. 写入鉴权优先推荐 `user` 模式，因为用户身份更符合“创建到我的可访问空间”和个人文档编辑场景。
4. `tenant` 模式仍可支持，但文档必须明确应用需要目标文件夹或文档权限。
5. 内容转换首版采用本地最小转换器，先覆盖 `plain_text` 和基础 Markdown 子集。
6. 写入成功后默认不强制同步全量索引，只在 `index_after_create=true` 或 `refresh_index=true` 时触发 `ensureIndex({ forceSync: true })`。
7. Drive 写入能力拆成独立模块 `feishu-drive-write.js`，与 docx 块写入模块并列，统一由 MCP tool 层做参数校验和写入开关检查。
8. 文件移动不做 token 类型自动推断，要求调用方传入 `file_type`，把错误定位前置到 schema 和参数校验。

### 放弃方案

- 不使用“自然语言编辑整篇文档”的单一 tool。
  - 原因：隐式 diff 与覆盖写入风险高，且当前仓库没有块树读取和定位能力。
- 不在首版实现删除块。
  - 原因：删除是高风险破坏性操作，且需要更强的定位、确认和回滚设计。
- 不默认把 `knowledge-search` skill 扩展成读写混合 skill。
  - 原因：当前 skill 明确只读，读写混用会降低安全边界。
- 不在首版自动授予文件夹或文件协作者权限。
  - 原因：权限写入比文件移动更高风险，需要单独设计外部实体、权限级别和审计记录。

## 执行命令

### 提案阶段已使用命令

```bash
git checkout -b feature/feishu-docs-write-tools
rg --files docs/rules
sed -n '1,220p' docs/rules/README.md
sed -n '1,220p' docs/rules/git.md
rg -n "toolDefinitions|executeTool|createFeishuClient|LARK_FEISHU_OAUTH_SCOPE" plugins/codex-lark-plugin
rg -n "drive/v1/files|folder_token|move|folder" plugins/codex-lark-plugin docs/changes/templates/feishu-docs-write-tools
```

### Apply 阶段建议验证命令

```bash
npm test
npm run build
node plugins/codex-lark-plugin/scripts/server.js
```

### 真实飞书手工验证命令

```bash
LARK_DOCS_SOURCE=feishu \
LARK_FEISHU_WRITE_ENABLED=true \
LARK_FEISHU_TOKEN_MODE=user \
LARK_FEISHU_USER_TOKEN_PATH=~/.codex/codex-lark-plugin/feishu-user-token.json \
node plugins/codex-lark-plugin/scripts/server.js
```

## 项目结构与边界

### 代码风格

- 延续 Node.js ESM + 标准库实现。
- 继续使用小函数封装校验、归一化、请求构造和错误上下文。
- MCP tool schema 使用 JSON Schema 明确 required 字段、枚举、长度限制和默认值。
- 写入代码中的错误消息必须可诊断，但不得包含 token、app secret、refresh token。

### 示例：写入 tool 定义风格

```js
{
  name: "create_feishu_folder",
  description: "在指定飞书父文件夹下创建子文件夹。",
  inputSchema: {
    type: "object",
    properties: {
      parent_folder_token: { type: "string" },
      name: { type: "string", minLength: 1, maxLength: 200 }
    },
    required: ["parent_folder_token", "name"]
  }
}
```

## 测试策略

### 自动化测试

- tool schema 测试：
  - `tools/list` 包含 9 个 tools，且新增写入 tools 的 schema 稳定。
- 参数校验测试：
  - 未开启 `LARK_FEISHU_WRITE_ENABLED` 时写入 tool 直接拒绝。
  - 缺少 `folder_token`、`title`、`document_id`、`operation`、`content`、`parent_folder_token`、`file_token`、`file_type`、`target_folder_token` 时给出明确错误。
  - 非法 `content_type`、非法 `operation`、超长内容被拒绝。
  - 非法 `file_type`、空文件夹名、源文件 token 与目标文件夹 token 相同等场景被拒绝。
- 飞书请求测试：
  - `create_feishu_doc` 先调用文档创建接口，再按需调用块写入接口。
  - `edit_feishu_doc(operation=append)` 调用创建子块接口。
  - `edit_feishu_doc(operation=update_text)` 调用更新块接口。
  - `create_feishu_folder` 调用 Drive 创建文件夹接口。
  - `move_feishu_file` 调用 Drive 移动文件接口，并透传 `task_id`。
- 错误处理测试：
  - HTTP 403、404、429 和飞书业务错误保留上下文。
  - 错误文本不包含 token、secret。
- 回归测试：
  - 现有只读检索测试继续通过。
  - `npm run build` 继续在 sample 模式无凭证通过。

### 手工验证

- 使用测试文件夹创建一篇文档。
- 对创建文档追加 1 段文本和 1 个标题。
- 更新一个已知文本块。
- 在测试父文件夹下创建一个子文件夹。
- 将测试文档移动到新建子文件夹。
- 使用现有 `get_doc_summary` 或重新同步后确认文档可被只读索引读取。

## 风险

| 风险 | 影响 | 当前判断 | 缓解思路 |
| --- | --- | --- | --- |
| 写入权限配置错误 | 高 | 新增写能力必然涉及更高权限 | 默认禁用写入，README 明确 scope 和授权步骤 |
| 误改生产文档 | 高 | MCP tool 可被自然语言触发 | 写入开关、参数显式化、禁止整篇覆盖作为默认能力 |
| Markdown 到飞书 blocks 映射不完整 | 中 | 飞书文档是块树模型 | 首版只支持最小子集，复杂结构后续扩展 |
| block 定位困难 | 中 | 更新块需要 `block_id` | 首版 `update_text` 要求显式 `block_id`，后续再做搜索定位 |
| 本地索引与远端写入不同步 | 中 | 当前查询基于本地索引 | 写入后提供可选刷新，不默认全量同步 |
| tenant/user 权限差异 | 中 | 创建和编辑权限与读取权限不同 | 推荐 user 模式，tenant 模式只作为显式高级配置 |
| 文件移动权限不足 | 高 | 移动通常要求源父级和目标父级都有权限 | 错误上下文保留源文件、目标文件夹和飞书错误码 |
| API 创建的文件夹对用户不可见 | 中 | 机器人或应用身份创建资源时可能缺少用户侧可见性 | README 明确权限限制，权限授予能力后续单独设计 |
| 文件类型推断错误 | 中 | 飞书移动接口需要 `type` | `file_type` 必填并使用 allowlist，首版不自动猜测 |

## Always / Ask First / Never

### Always

- 始终读取并遵守 `docs/rules`。
- 始终在 `feature/feishu-docs-write-tools` 分支推进。
- 始终保持现有只读 tools 向后兼容。
- 始终让写入能力默认禁用，用户显式配置后才可用。
- 始终在写入 tool 中做参数校验、长度限制和敏感信息脱敏。
- 始终要求移动文件时显式传入目标文件夹和文件类型。

### Ask First

- 是否支持整篇覆盖替换。
- 是否支持删除块或批量删除。
- 是否新增第三方 Markdown 转换库。
- 是否默认在写入后强制刷新本地索引。
- 是否把写入能力加入现有 `knowledge-search` skill，还是新增独立 skill。
- 是否为创建的文件夹或移动后的文件自动设置协作者权限。
- 是否支持批量移动或按关键词搜索后移动。

### Never

- 不在未确认前修改业务代码或实现写入 tool。
- 不提交真实飞书 token、secret、文档 token 或用户 token 文件。
- 不默认扫描或写入非用户明确指定的文档。
- 不默认移动非用户明确指定 token 的文件。
- 不把破坏性删除能力伪装成普通编辑。
- 不在未验证官方接口契约前承诺复杂富文本完全兼容。

## 待澄清

无架构级待澄清项。

## 是否满足进入 Apply 条件

当前满足。用户已通过 `spec-apply` 指定本需求目录进入实施阶段，后续按 `tasks.md` 默认一次推进一个 task。
