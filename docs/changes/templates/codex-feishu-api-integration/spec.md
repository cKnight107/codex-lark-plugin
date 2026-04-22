# Spec: Codex 飞书真实 API 接入提案

## 文档状态

- 阶段：`spec-apply`
- 状态：实施中，按 `tasks.md` 逐项推进
- 需求目录：`docs/changes/templates/codex-feishu-api-integration/`
- 分支：`feature/codex-feishu-api-integration`
- 来源：在现有“样本文档闭环”基础上，补充真实飞书 API 接入方案
- 已确认事项：
  - 首版真实飞书同步范围收敛为“配置的文件夹和 wiki 根入口”
  - 首版认证模式收敛为“自建应用 + tenant_access_token”
  - 真实飞书模式下的文档 diff 采用“本地同步快照生成 revisions[]”

## 目标与成功标准

### 目标

在不改动现有 5 个 MCP tools 合同的前提下，为插件补充一条“真实飞书文档 -> 本地索引 -> MCP 检索”的可运行同步链路，让当前样本驱动的知识检索插件可以对接真实团队文档。

### 成功标准

- 保持现有 5 个 MCP tools 名称、输入结构和主要输出字段不变。
- 插件可基于飞书真实文档生成与当前索引兼容的结构化数据，而不是只依赖本地 fixture。
- 同步范围可配置，至少支持“按配置的文件夹或知识库根节点同步”，不默认扫描整个租户。
- 对新版文档 `docx` 提供稳定读取能力，至少覆盖标题、更新时间、URL、纯文本正文和路径信息。
- 保留当前本地索引检索模式，查询逻辑继续围绕索引工作，而不是在 tool 调用时直接打飞书 API。
- 仓库保留可重复验证的本地样本链路，用于无凭证环境下的自动化测试。
- 文档、命令和配置说明明确区分“样本模式”和“真实飞书模式”。

## 代码现状

### 已有能力

- 当前数据入口只支持读取本地 JSON fixture。
  - 事实：`loadFixture()` 仅从 `LARK_DOCS_FIXTURE` 或默认 sample 文件读取 JSON，并返回 `projects`、`docTypes`、`documents` 三段结构。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/fixture-client.js:5-18`
- 当前索引构建逻辑已经把上游文档源抽象成统一文档结构。
  - 事实：`buildIndex()` 只依赖文档对象的 `doc_id`、`title`、`author`、`updated_at`、`url`、`source_path`、`body`、`revisions` 等字段，再补充推断出的 `project_id`、`doc_type`、`inference_*`。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/index-store.js:9-42`
- 当前 MCP tools 全部依赖本地索引，而不是直接依赖 fixture。
  - 事实：`executeTool()` 统一通过 `ensureIndex()` 取索引，然后执行项目列表、关键词检索、摘要、最近更新和 revision diff。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js:166-245`
- 当前 diff 能力依赖 `revisions[]` 历史快照，而不是远端版本接口。
  - 事实：`compare_doc_changes` 会在本地 `revisions` 中选取基线和最新版本，再做段落 diff；如果 revision 不足会直接报错。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js:139-164`
  - 出处：`plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js:218-240`

### 当前约束

- `ensureIndex()` 当前强绑定 fixture 文件时间戳作为刷新依据。
  - 事实：刷新判断依赖 `fixture.fixturePath` 与索引文件的 `mtime` 比较；这套逻辑并不适用于远端 API 数据源。
  - 出处：`plugins/codex-lark-plugin/scripts/lib/index-store.js:65-95`
- 运行时校验脚本默认走 fixture 全量刷新。
  - 事实：`validate-runtime.js` 会调用 `ensureIndex({ forceSync: true, indexPath: tempIndexPath })`，因此当前 build 校验并不覆盖真实飞书接入路径。
  - 出处：`plugins/codex-lark-plugin/scripts/validate-runtime.js:11-32`
- 插件的 `.mcp.json` 只暴露 fixture 路径和索引路径，没有真实飞书凭证或同步配置。
  - 事实：当前环境变量只有 `LARK_DOCS_FIXTURE` 和 `LARK_INDEX_PATH`。
  - 出处：`plugins/codex-lark-plugin/.mcp.json:1-14`
- 自动化测试全部基于 sample fixture。
  - 事实：现有测试用例只验证样本文档索引、检索、最近更新、diff 和 MCP 请求处理，没有任何真实 API 响应归一化或鉴权测试。
  - 出处：`plugins/codex-lark-plugin/scripts/__tests__/knowledge-tools.test.js:18-101`

### 与新需求的冲突

- 现有已完成规格明确把真实飞书 API 鉴权与远程拉取排除在第一版之外。
  - 事实：当前已归档到实现规格中的范围只承诺样本闭环，并将真实飞书接入列为后续事项。
  - 出处：`docs/changes/templates/codex-feishu-knowledge-plugin/spec.md:29-33`
  - 出处：`docs/changes/templates/codex-feishu-knowledge-plugin/spec.md:81-86`

## 功能点

### 本次提案要解决的用户价值

- 让当前插件从“演示样本可跑”升级为“可对接真实团队飞书文档”。
- 保持 Codex 侧的使用方式稳定，不要求调用方配合切换新的 MCP tool。
- 为后续真实团队试用建立一条可操作、可排错、可回退的同步链路。

### 计划覆盖的能力边界

1. 新增真实飞书文档数据源接入层。
2. 支持从配置的飞书根入口拉取文档元数据和纯文本正文。
3. 将飞书数据归一化为当前 `buildIndex()` 可消费的文档结构。
4. 保留本地索引和现有检索逻辑。
5. 为真实飞书模式增加最小 smoke test 与错误诊断说明。

### 明确不在本次提案内承诺

- 任务文档管理、状态流转或任务分发
- 主动订阅、Webhook 增量推送、消息通知
- 全租户无边界扫描
- 非 `docx` 类型文档的完整支持
- 远程 HTTP MCP 部署
- 富文本级精细 diff

## 执行命令

### 当前基线命令

```bash
npm run build
npm run sync:sample
npm run sync:feishu
npm run test:feishu-smoke
npm test
node plugins/codex-lark-plugin/scripts/server.js
```

### 提案阶段建议的手工联通校验

```bash
# 获取 tenant_access_token
curl -s https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal

# 拉取文件夹文件清单
curl -s "https://open.feishu.cn/open-apis/drive/v1/files?folder_token=<token>"

# 拉取 docx 纯文本
curl -s "https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>/raw_content"
```

## 项目结构与边界

### 预期修改范围

- `package.json`
  - 增加真实飞书同步和 smoke test 命令
- `plugins/codex-lark-plugin/.mcp.json`
  - 增加真实飞书运行所需环境变量约定
- `plugins/codex-lark-plugin/scripts/lib/`
  - 新增真实飞书 client、token 管理、文档归一化和路径遍历逻辑
  - 调整 `index-store.js`，让数据源可切换
- `plugins/codex-lark-plugin/scripts/`
  - 扩展 `sync-index.js` 或新增真实飞书同步入口
  - 扩展 `validate-runtime.js`
- `plugins/codex-lark-plugin/scripts/__tests__/`
  - 新增 API 响应归一化、配置校验与 fallback 测试
- `plugins/codex-lark-plugin/README.md`
  - 补充真实飞书模式接入说明
- `docs/changes/templates/codex-feishu-api-integration/`
  - 记录方案、任务和日志

### 预期不修改范围

- `plugins/codex-lark-plugin/scripts/server.js`
  - MCP 协议壳层原则上不应因数据源切换而变化
- `plugins/codex-lark-plugin/scripts/lib/knowledge-tools.js`
  - tool 名称和主查询逻辑应尽量保持稳定，仅允许为兼容真实数据做最小修正
- `plugins/codex-lark-plugin/scripts/lib/inference.js`
  - 除非真实数据字段变化导致推断效果失真，否则不主动扩展规则体系

## 代码风格与示例

### 风格约束

- 延续当前 Node.js ESM + 标准库实现，不默认引入第三方 SDK。
- 新数据源层输出结构必须兼容当前 `buildIndex()` 输入契约。
- 所有凭证仅从环境变量读取，不写入仓库文件。
- 错误处理优先返回可定位的上下文，例如 `folder_token`、`wiki token`、`document_id`、HTTP 状态码与飞书错误码。

### 归一化示例

```js
{
  doc_id: "doxc...",
  title: "Atlas 平台架构方案",
  author: "ou_xxx",
  updated_at: "2026-04-22T02:00:00.000Z",
  url: "https://feishu.cn/docx/doxc...",
  source_path: "知识库/Atlas 平台/方案",
  body: "纯文本正文",
  revisions: [
    {
      timestamp: "2026-04-22T02:00:00.000Z",
      content: "纯文本正文"
    }
  ]
}
```

## 测试策略

### 自动化验证

- 保留 `npm test` 对 sample 模式的现有覆盖，作为无凭证环境下的稳定基线。
- 新增真实飞书 client 的单元测试：
  - token 获取与刷新
  - drive / wiki / docx 响应归一化
  - 错误码与权限失败处理
- 新增数据源切换测试：
  - sample 模式仍可用
  - feishu 模式在缺少必需 env 时给出明确报错
- 新增索引兼容测试：
  - 真实飞书归一化结果可被 `buildIndex()` 正常消费

### 手工验证

- 使用真实凭证跑一次受限范围同步
- 对至少 1 个文件夹入口和 1 个 wiki 入口验证路径解析
- 对至少 1 篇文档验证：
  - 标题与 URL 正确
  - `raw_content` 正常入索引
  - `search_docs` 与 `get_doc_summary` 可命中

### 验收重点

- 现有 5 个 MCP tools 对调用方保持稳定
- 真实飞书模式不会破坏 sample 模式
- 配置错误、无权限、限频场景有明确错误提示
- 本地索引仍是唯一查询面，不在 tool 请求时直接放大远端 API 延迟

## 风险

| 风险 | 影响 | 当前判断 | 缓解思路 |
| --- | --- | --- | --- |
| 飞书资源权限不足导致 403 | 高 | 真实接入最常见阻塞点 | 文档中明确应用授权步骤，并在错误中打印资源上下文 |
| `drive/v1/files` 不递归 | 高 | 根入口遍历需要自行处理 | 在 client 层实现显式 BFS/DFS，并限制同步根范围 |
| wiki token 与 `document_id` 不同 | 高 | 直接用 URL token 会读错资源 | 对 wiki 入口先做节点解析，再拿 `obj_token` |
| 频控与同步耗时 | 中 | 文档纯文本接口有频率限制 | 做串行或受控并发，并预留重试/退避 |
| 远端历史版本接口不明确 | 中 | 现有 diff 依赖 `revisions[]` | 第一版优先本地快照 revision，而不是承诺远端版本对比 |
| 凭证配置错误或泄漏 | 高 | 接入真实 API 必然引入 secrets | 环境变量读取、日志脱敏、测试禁止打印敏感值 |

## 技术决策

### 已确认事实

1. 现有查询层已经围绕本地索引构建，适合在数据源层做替换，而不是重写 MCP tools。
2. 当前 build、测试和 `.mcp.json` 都绑定 sample 模式，因此真实飞书接入必然影响脚本和配置。
3. `compare_doc_changes` 依赖本地 `revisions[]`，真实飞书接入若不补快照层，现有 diff 能力会退化。

### 当前推荐方案

1. 真实飞书接入以“新增 client + 保持索引契约不变”为主方案。
2. 首版真实飞书同步范围收敛为“配置的文件夹 / wiki 根入口”，不做全租户扫描。
3. 首版认证优先支持自建应用 + `tenant_access_token`。
4. 首版继续保留 sample fallback，保证 CI 和本地无凭证开发体验。
5. 首版 diff 采用“本地索引快照版本”而不是承诺远端历史版本 API。
6. 首版优先支持 `docx`，其他类型后续再议。
7. 面向用户的真实飞书配置入口以“本地 MCP 配置中的 `env`”为主，而不是要求用户手工设置 shell 环境变量。

### 数据源选择与环境变量契约

1. 新增 `LARK_DOCS_SOURCE` 作为数据源选择开关，仅支持：
   - `sample`：继续读取本地 fixture，作为默认模式
   - `feishu`：启用真实飞书同步链路
2. `sample` 模式下：
   - `LARK_DOCS_FIXTURE` 保持现状，允许覆盖本地样本文件路径
   - `LARK_INDEX_PATH` 保持现状，作为本地索引输出位置
3. `feishu` 模式下：
   - `LARK_FEISHU_APP_ID`：自建应用 app id
   - `LARK_FEISHU_APP_SECRET`：自建应用 app secret
   - `LARK_FEISHU_SYNC_ROOTS`：非空 JSON 数组，每个元素格式为 `{ "type": "folder" | "wiki", "token": "<root token>" }`
   - `LARK_INDEX_PATH`：真实飞书模式生成的本地索引输出位置
4. 数据源选择与配置校验必须在索引刷新前完成：
   - 非法模式直接报错
   - `feishu` 模式缺少必填 env 时直接 fail fast
   - 在真实 client 尚未实现前，不允许把 `feishu` 模式伪装成 sample fallback
5. 用户使用方式：
   - 对外说明和 README 默认引导用户在本地插件 MCP 配置的 `env` 中填写飞书参数
   - 仓库中的 `.mcp.json` 只作为模板或示例，不写入真实 secret
   - 终端环境变量仍保留为开发与调试兜底入口，但不是主要用户路径

### 认证与请求封装契约

1. 自建应用 token 获取使用官方接口 `POST /open-apis/auth/v3/tenant_access_token/internal`。
2. token 请求体字段固定为：
   - `app_id`
   - `app_secret`
3. 成功响应至少校验：
   - `tenant_access_token`
   - `expire`
4. 后续飞书 OpenAPI 请求统一走 Bearer 鉴权封装，而不是由调用方手写 header。
5. 错误处理要求：
   - HTTP 非 2xx 时返回包含方法、路径、状态码和业务上下文的报错
   - 飞书业务码 `code != 0` 时返回包含 `code`、`msg` 和业务上下文的报错
   - 网络异常、非法 JSON、缺字段响应都必须显式 fail fast
6. 进程内允许做最小 token 缓存，并在过期前预留缓冲时间刷新，避免每次请求都重新取 token。

### 遍历与归一化契约

1. 文件夹根入口：
   - 使用 `GET /open-apis/drive/v1/files`
   - 该接口只返回当前层级，不递归；插件侧必须自行做 BFS/DFS 遍历子文件夹
   - 只将 `docx` 和指向 `docx` 的快捷方式纳入索引，其他类型跳过
2. wiki 根入口：
   - 先通过 `GET /open-apis/wiki/v2/spaces/get_node` 解析 root token 对应的节点信息
   - 再通过 `GET /open-apis/wiki/v2/spaces/:space_id/nodes` 分页遍历子节点
   - 只对 `obj_type=docx` 的节点拉取正文，但对 `has_child=true` 的非 `docx` 节点仍需继续下探
3. docx 正文：
   - 通过 `GET /open-apis/docx/v1/documents/:document_id/raw_content` 获取纯文本内容
   - 第一版按串行拉取实现，先保证行为稳定和错误可诊断；并在文档中明确该接口存在频控
4. 归一化输出字段必须兼容当前 `buildIndex()` 输入契约，至少包含：
   - `doc_id`
   - `title`
   - `author`
   - `updated_at`
   - `url`
   - `source_path`
   - `body`
   - `revisions`
5. 第一版 `revisions` 的生成策略：
   - 真实同步首次接入时仅写入当前正文快照
   - 每篇文档初始化为单条 revision，后续再由索引快照机制扩展为多版本比较
6. URL 选择策略：
   - 文件夹入口文档优先使用 drive 返回的 `url`，快捷方式指向 `docx` 时使用目标 `docx` URL
   - wiki 入口文档使用节点 URL `https://feishu.cn/wiki/<node_token>`，保留知识库导航语义

### 索引刷新与数据源切换契约

1. 索引文件需要落盘数据源元信息，至少包含：
   - `source_type`
   - `source_signature`
   - `source`
2. `source_signature` 用于判断当前运行配置与已落盘索引是否属于同一数据源上下文：
   - `sample` 模式至少纳入 fixture 路径
   - `feishu` 模式至少纳入 `appId` 与 `syncRoots`
   - 不得把 `appSecret` 写入索引文件
3. `ensureIndex()` 刷新规则：
   - 显式 `forceSync=true` 时始终重建索引
   - 已落盘索引缺失时重建
   - `source_signature` 不匹配时重建
   - `sample` 模式在 signature 匹配后，继续使用 fixture mtime 与索引 mtime 比较判断是否重建
   - `feishu` 模式在 signature 匹配后默认直接复用已有索引，不应每次都先打远端 API
4. `buildIndex()` 必须继续输出当前 MCP tools 可直接消费的结构，不得因 source metadata 变化而破坏既有查询层。

### 真实飞书模式下的 diff 契约

1. `compare_doc_changes` 在真实飞书模式下仍沿用现有 tool 名称和输出结构，不引入新的 tool。
2. 差异来源不是远端历史版本接口，而是本地索引在多次同步后累积的 `revisions[]` 快照。
3. 同一 source signature 下，对同一篇文档重复 `forceSync` 时：
   - 若正文未变化，则不新增 revision，只更新最新快照时间
   - 若正文变化，则追加新的本地快照 revision
4. 当真实飞书模式下某篇文档只有 1 条本地快照时，`compare_doc_changes` 必须明确降级报错，提示至少完成两次同步后再比较，而不是返回模糊异常。

### 本地 MCP 模板与 smoke test 契约

1. 仓库中的 `.mcp.json` 需要同时保留 sample 默认值与 feishu 配置模板字段，便于用户在本地直接修改：
   - `LARK_DOCS_SOURCE`
   - `LARK_DOCS_FIXTURE`
   - `LARK_INDEX_PATH`
   - `LARK_FEISHU_APP_ID`
   - `LARK_FEISHU_APP_SECRET`
   - `LARK_FEISHU_SYNC_ROOTS`
2. `.mcp.json` 中的飞书凭证必须是占位模板值，不得写入真实 secret。
3. 需要提供一个真实飞书 smoke test 命令，用真实 env 对受限 root 做一次同步并验证：
   - 成功进入 `feishu` 模式
   - 至少同步到 1 篇文档
   - 首篇文档包含 `doc_id`、`title`、`updated_at`、`url`、`body`、`source_path`
   - `get_doc_summary` 能命中该文档

### 放弃方案及原因

- 直接在 `knowledge-tools.js` 中调用飞书 API
  - 放弃原因：会破坏当前索引优先架构，且把远端延迟与权限错误暴露到每次查询。
- 首版就做全租户扫描
  - 放弃原因：权限、性能、可控性和排错成本都过高。
- 首版即要求真实飞书模式替代 sample 模式
  - 放弃原因：会失去无凭证自动化验证路径，不利于开发和 CI。

## Always / Ask First / Never

### Always

- 始终保持 5 个 MCP tools 的合同稳定，除非用户显式批准 breaking change。
- 始终把真实飞书数据归一化为本地索引，再提供查询能力。
- 始终保留无凭证可运行的 sample 验证路径。
- 始终以 `docs/rules` 为最高优先级约束。

### Ask First

- 是否支持 `user_access_token`，而不只做 `tenant_access_token`
- 是否把同步范围扩大到整个知识库 space 或整个租户 drive
- 是否引入第三方 SDK、持久化数据库或后台服务
- 是否把 diff 升级为远端历史版本能力
- 是否将非 `docx` 文档纳入第一批范围

### Never

- 不在未确认范围前默认扫描整个租户
- 不把飞书 app secret、access token 或真实资源标识写入仓库
- 不在提案阶段直接改业务实现
- 不把当前样本模式验证链路直接删除

## 待澄清

### 已确认：首版真实飞书同步范围

- 已确认选项 A：只同步配置的文件夹和 wiki 根入口
  - 影响：范围最可控，权限和排错成本最低，适合第一轮落地。

### 已确认：首版认证模式

- 已确认选项 A：只支持自建应用 + `tenant_access_token`
  - 影响：服务端实现最稳定，和当前本地 MCP server 形态最一致。

### 已确认：真实飞书模式下的 diff 策略

- 已确认选项 A：使用本地同步快照生成 `revisions[]`
  - 影响：最符合现有实现，能快速保住 diff 能力。

## Open Questions

- 以下问题暂不阻断当前 Apply 阶段前两项任务，若后续实现受影响，再回写 spec：
- 当前团队真实使用场景里，首批文档是否仅限 `docx`，还是必须同时覆盖 wiki 下的多种对象类型？
- 真实同步后的 `author` 字段是接受飞书 ID，还是必须补齐为可读姓名？
