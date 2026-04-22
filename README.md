# codex-lark-plugin

一个面向团队协作场景的 Codex marketplace 仓库，当前包含一个插件：

- `codex-lark-plugin`

第一版目标聚焦知识检索闭环：

- 团队知识库检索：按项目、关键词、更新时间获取文档与摘要
- 飞书文档摘要与差异比较：帮助团队快速理解文档上下文与最近变化

## 仓库结构

```text
.
├── .agents/plugins/marketplace.json
├── plugins/
│   └── codex-lark-plugin/
│       ├── .codex-plugin/plugin.json
│       ├── .mcp.json
│       ├── assets/
│       ├── scripts/
│       └── skills/
└── docs/
```

这个结构适合通过 `codex marketplace add <git-url>` 作为一个远程 marketplace 仓库接入。

## 安装

将下面的 GitHub 地址替换成你实际发布后的仓库地址：

```bash
codex marketplace add https://github.com/<your-github-username>/codex-lark-plugin.git
```

如果你希望固定到某个版本或分支，可以使用：

```bash
codex marketplace add <your-github-username>/codex-lark-plugin@v0.1.0
```

或：

```bash
codex marketplace add https://github.com/<your-github-username>/codex-lark-plugin.git --ref v0.1.0
```

## 更新

建议使用 Git tag 管理版本，并保持：

- `plugins/codex-lark-plugin/.codex-plugin/plugin.json` 中的 `version`
- GitHub release tag

两者一致，例如都为 `v0.1.0` / `0.1.0`。

## 发布前需要替换的内容

以下信息目前已最小化处理，但在正式开源前建议补全：

- 作者邮箱
- 作者主页
- 仓库主页和文档链接
- 隐私政策与服务条款链接
- 插件图标与截图
- 实际的技能与脚本实现

## 本地验证

仓库内置一个基于 Node.js 标准库实现的本地 `stdio` MCP server，并支持两类验证路径：

- `sample`：使用仓库内样本文档 fixture，适合本地开发、CI 和无凭证环境
- `feishu`：使用真实飞书 folder / wiki 根入口，同步到本地索引后再提供 MCP 检索

Sample 模式基线验证：

```bash
npm run build
npm run sync:sample
npm test
```

真实飞书模式联通验证：

```bash
npm run sync:feishu
npm run test:feishu-smoke
```

真实飞书模式需要先在本地 MCP 配置的 `env` 中提供：

- `LARK_DOCS_SOURCE=feishu`
- `LARK_FEISHU_APP_ID`
- `LARK_FEISHU_APP_SECRET`
- `LARK_FEISHU_SYNC_ROOTS`
- `LARK_INDEX_PATH`

## 当前状态

当前仓库已经具备：

- marketplace 根结构
- 单插件目录结构
- 可运行的本地 `stdio` MCP 配置
- sample / feishu 双数据源同步入口与本地索引生成
- 5 个知识检索 MCP tools
- 面向 Codex 的知识检索技能定义
- 文档目录骨架

尚未具备：

- 低置信度人工校正工作流
- 任务文档模板与状态管理实现
- 已接入真实飞书模式的端到端生产环境验收说明
