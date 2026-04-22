# tasks

## 已完成

- [x] 读取仓库规则与现有需求文档，确认本次工作受 `docs/rules` 约束。
- [x] 分析当前插件代码现状并记录关键出处：
  - `fixture-client.js` 只支持本地 sample 数据源。
  - `index-store.js` 负责索引构建与刷新判定。
  - `knowledge-tools.js` 围绕本地索引实现 5 个 MCP tools。
  - `validate-runtime.js`、`.mcp.json`、测试套件都绑定 sample 模式。
- [x] 判定“真实飞书接入”属于新需求扩展，不应复用 `spec-fix`。
- [x] 创建提案目录 `docs/changes/templates/codex-feishu-api-integration/`。
- [x] 创建 `spec.md`、`tasks.md`、`log.md`。
- [x] 创建特性分支 `feature/codex-feishu-api-integration`。

## 待确认

- [x] 用户确认首版真实飞书同步范围
- [x] 用户确认首版认证模式
- [x] 用户确认真实飞书模式下的 diff 保留策略
- [x] 用户确认提案可进入 Apply

## 实施任务（确认后执行）

| 状态 | 任务 | 依赖 | 验收口径 | 估算 |
| --- | --- | --- | --- | --- |
| done | 设计真实飞书数据源接口与环境变量契约 | 同步范围、认证模式已确认 | 能明确 sample / feishu 两种模式的选择方式和必填配置 | S |
| done | 实现真实飞书 token 获取与请求封装 | 认证模式已确认 | 能稳定获取 access token，并对常见错误给出可诊断报错 | S |
| done | 实现文件夹 / wiki 入口遍历与 docx 归一化 | 同步范围已确认 | 能把真实飞书数据转换为当前索引兼容结构 | M |
| done | 改造 `index-store.js` 支持可切换数据源 | 归一化结构已确认 | `buildIndex()` 与现有 MCP tools 无需大改即可消费真实数据 | M |
| done | 保留或降级 `compare_doc_changes` 的真实飞书模式行为 | diff 策略已确认 | 真实飞书模式下 diff 行为与 spec 一致，且错误边界清晰 | S |
| done | 扩展命令、README 与 `.mcp.json` 说明 | 数据源契约已确认 | 用户可按文档完成 sample / feishu 两种模式启动 | S |
| done | 补充自动化测试与 smoke test 方案 | 主要实现完成 | 同时覆盖 sample 基线、真实飞书归一化与配置错误场景 | M |

## 检查点

- [x] Checkpoint 1：提案阶段文档已落盘，未进入业务实现。
- [x] Checkpoint 2：所有架构级待确认项关闭。
- [x] Checkpoint 3：用户显式确认可进入 Apply。
- [x] Checkpoint 4：数据源模式与环境变量契约已在代码和 spec 中落地，并有自动化验证。
- [x] Checkpoint 5：token 获取与 Bearer 请求封装已落地，并覆盖缓存、HTTP 异常、业务异常与缺字段响应测试。
- [x] Checkpoint 6：folder / wiki 遍历与 docx 归一化已落地，并验证可生成兼容 `buildIndex()` 的文档结构。
- [x] Checkpoint 7：`index-store.js` 已支持基于 source signature 的数据源切换与缓存复用，`feishu` 模式不再默认每次触发远端同步。
- [x] Checkpoint 8：真实飞书模式下的本地快照 diff 行为已落地，首次同步有明确降级提示，多次同步后可正常 diff。
- [x] Checkpoint 9：命令、README、`.mcp.json` 模板与真实 smoke test 已落地，剩余任务已全部完成。
