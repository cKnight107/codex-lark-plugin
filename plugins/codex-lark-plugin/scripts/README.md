# scripts

这里存放插件内部使用的脚本。

第一版当前已落地：

- `server.js`
  - 本地 `stdio` MCP server
- `validate-runtime.js`
  - 校验 manifest、`.mcp.json` 模板字段、默认数据源与 tool 注册结果
- `sync-index.js`
  - 根据当前数据源配置刷新本地索引，支持 `sample` 与 `feishu`
- `sync-feishu.js`
  - 显式触发真实飞书同步入口，要求 `LARK_DOCS_SOURCE=feishu`
- `feishu-smoke.js`
  - 使用真实飞书配置做一次最小联通 smoke test
- `lib/`
  - 元数据推断、数据源切换、飞书请求封装、索引读写、知识检索与 MCP 协议处理
- `__tests__/`
  - 覆盖 sample 基线、feishu 数据源契约、同步、检索、最近更新、文档差异和 MCP 入口的 Node.js 测试
