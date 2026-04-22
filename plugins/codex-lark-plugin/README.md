# codex-lark-plugin

这是 marketplace 中的单个插件目录。

## 当前定位

插件第一版聚焦：

- 团队知识库文档检索
- 项目文档摘要
- 最近更新查询与文档差异比较

当前支持两种数据源模式：

- `sample`：读取仓库内样本文档 fixture，适合本地开发、CI 和无凭证验证
- `feishu`：读取真实飞书 folder / wiki 根入口，先同步到本地索引后再提供 MCP 检索

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

### Sample 模式

```bash
npm run sync:sample
node plugins/codex-lark-plugin/scripts/server.js
```

### 真实飞书模式

对外使用时，优先让用户在**本地 MCP 配置**的 `env` 中填写飞书参数，而不是手工设置 shell 环境变量。仓库中的 `.mcp.json` 只作为模板，不应提交真实 secret。

`feishu` 模式至少需要这些字段：

- `LARK_DOCS_SOURCE=feishu`
- `LARK_FEISHU_APP_ID`
- `LARK_FEISHU_APP_SECRET`
- `LARK_FEISHU_SYNC_ROOTS`
- `LARK_INDEX_PATH`

`LARK_FEISHU_SYNC_ROOTS` 的格式是 JSON 数组，例如：

```json
[
  { "type": "folder", "token": "fldcn_xxxxx" },
  { "type": "wiki", "token": "wikcn_xxxxx" }
]
```

可用命令：

```bash
# 强制同步真实飞书文档到本地索引
npm run sync:feishu

# 使用真实凭证做一次最小 smoke test
npm run test:feishu-smoke
```

`compare_doc_changes` 在真实飞书模式下基于**本地同步快照**工作：

- 第一次同步后，每篇文档只有 1 个本地 snapshot，还不能比较差异
- 对同一批 root 再同步一次后，如果文档正文发生变化，就会累积到 `revisions[]`
- 从第二次同步开始，可对已有多份 snapshot 的文档执行 diff

### 构建与测试

```bash
npm test
npm run build
```
