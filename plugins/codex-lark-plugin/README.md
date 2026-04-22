# codex-lark-plugin

这是 marketplace 中的单个插件目录。

## 当前定位

插件第一版聚焦：

- 团队知识库文档检索
- 项目文档摘要
- 最近更新查询与文档差异比较

## 目录说明

- `.codex-plugin/plugin.json`：插件 manifest
- `skills/`：面向 Codex 的知识检索技能定义
- `scripts/`：样本文档同步、索引构建与 MCP server 脚本
- `data/`：用于本地验证的飞书样本文档 fixture
- `assets/`：图标、截图等静态资源
- `.mcp.json`：MCP 服务配置

## 发布说明

该插件由上层 marketplace 仓库通过：

- `.agents/plugins/marketplace.json`

进行暴露。发布到 GitHub 后，推荐用户通过：

```bash
codex marketplace add https://github.com/<your-github-username>/codex-lark-plugin.git
```

来接入整个 marketplace。

## 本地运行

```bash
npm run sync:sample
node plugins/codex-lark-plugin/scripts/server.js
```
