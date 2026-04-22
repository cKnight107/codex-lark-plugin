# scripts

这里存放插件内部使用的脚本。

第一版当前已落地：

- `server.js`
  - 本地 `stdio` MCP server
- `sync-index.js`
  - 从样本文档 fixture 生成最小结构化索引
- `lib/`
  - 元数据推断、索引读写、知识检索与 MCP 协议处理
- `__tests__/`
  - 覆盖同步、检索、最近更新、文档差异和 MCP 入口的 Node.js 测试
