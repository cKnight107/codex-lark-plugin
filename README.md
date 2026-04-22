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

仓库内置一个基于 Node.js 标准库实现的本地 `stdio` MCP server，以及一份可重复验证的飞书样本文档集。

```bash
npm run build
npm run sync:sample
npm test
```

## 当前状态

当前仓库已经具备：

- marketplace 根结构
- 单插件目录结构
- 可运行的本地 `stdio` MCP 配置
- 样本文档同步、索引生成与 5 个知识检索 MCP tools
- 面向 Codex 的知识检索技能定义
- 文档目录骨架

尚未具备：

- 真实飞书 API 鉴权与远程同步
- 低置信度人工校正工作流
- 任务文档模板与状态管理实现
