# codex-lark-plugin

一个面向团队协作场景的 Codex marketplace 仓库，当前包含一个插件：

- `codex-lark-plugin`

第一版目标聚焦两类能力：

- 团队知识库检索：按项目、关键词、更新时间获取文档与摘要
- 文档化任务管理：创建任务文档、更新状态、追加进展、标记完成

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

## 当前状态

当前仓库已经具备：

- marketplace 根结构
- 单插件目录结构
- 可发布的基础 manifest
- 文档目录骨架

尚未具备：

- 飞书文档同步实现
- 任务文档模板与状态管理实现
- MCP 服务或应用接入实现
