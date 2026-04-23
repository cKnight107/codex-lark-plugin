# codex-lark-plugin

一个面向团队协作场景的 Codex marketplace 仓库，当前提供 `codex-lark-plugin`，用于把飞书文档同步到本地索引，再通过 MCP tools 在 Codex 中完成知识检索、摘要、最近更新和文档差异比较。

如果你是第一次接入，建议先看本文；如果你要看插件目录级说明和脚本细节，再看 [plugins/codex-lark-plugin/README.md](plugins/codex-lark-plugin/README.md)。

## 你第一次接入时，先理解这两种模式

真实飞书模式支持两种鉴权方式：

- `tenant`：应用身份。适合团队共享目录、共享 folder、wiki 根节点这类“应用本身就应该能读”的资源。
- `user`：用户身份。适合“我的文件夹”、个人私有文档、或者只有当前登录用户能访问的资源。

可以用这条经验快速判断：

- 如果你要接企业共享知识库，先试 `tenant`
- 如果你要接个人文档或遇到权限不够，再切 `user`

## 第一次接入的完整流程

### 1. 在 Codex 安装 marketplace

把下面地址替换成你实际发布的仓库地址：

```bash
codex marketplace add https://github.com/cKnight107/codex-lark-plugin
```

安装后通常会出现两类目录：

- 插件缓存目录：`~/.codex/plugins/cache/codex-lark-marketplace/codex-lark-plugin/<version>/`
- 插件运行时目录：`~/.codex/codex-lark-plugin/`

建议提前创建运行时目录，用来存放索引和用户 token：

```bash
mkdir -p ~/.codex/codex-lark-plugin
```

### 2. 在飞书开放平台创建应用

第一次接入时，先在飞书开放平台创建一个自建应用，并拿到：

- `App ID`
- `App Secret`

后面 README 中的这些配置都依赖这两个值：

- `LARK_FEISHU_APP_ID`
- `LARK_FEISHU_APP_SECRET`

## 在飞书里需要做哪些配置

### 3. 先开通应用权限

不管你最终用 `tenant` 还是 `user`，都建议先在飞书开放平台里为应用申请最小必需权限。

首次接入至少建议准备这些 scope：

- `drive:drive:readonly`：读取云空间/文件夹元数据
- `space:document:retrieve`：读取文档基础信息
- `docx:document:readonly`：读取文档正文
- `offline_access`：仅 `user` 模式需要，用于刷新用户 token

最小建议：

- 如果只想先验证目录能不能列出来，至少先有 `drive:drive:readonly`
- 如果要真正同步正文并做摘要/检索，补上 `docx:document:readonly`
- 如果要用 `user` 授权，补上 `offline_access`

### 4. 发布权限变更

在飞书开放平台里，给应用新增权限后，不要只停留在“已勾选”状态，还要完成应用发布或让当前租户可用；否则本地 OAuth 成功了，token 里也可能拿不到新 scope。

实操上要记住两点：

- 权限变更后，先在飞书后台完成发布
- 如果你之前已经拿过 `user_access_token`，新增权限后必须重新授权一次

旧 token 不会自动带上新权限。

### 5. 填写 OAuth 回调地址

如果你要使用 `user` 模式，需要在飞书开放平台里为应用配置 OAuth 回调地址。

本项目默认使用：

```text
http://127.0.0.1:3333/callback
```

建议在飞书后台的应用安全设置里至少加入这个地址；如果你本机更习惯用 `localhost`，可以额外加入：

```text
http://localhost:3333/callback
```

填写规则只有一条最重要：

- 飞书后台登记的回调地址，必须与本地发起 OAuth 时使用的 `redirect_uri` 完全一致，包括协议、域名、端口和路径

例如你本地如果填的是：

```text
http://127.0.0.1:3333/callback
```

那飞书后台也必须填这一条，不能只填 `localhost`，也不能少 `/callback`。

## 如何配置 Codex 里的 MCP

### 6. 找到安装后的 `.mcp.json`

通常在这里：

```text
~/.codex/plugins/cache/codex-lark-marketplace/codex-lark-plugin/<version>/.mcp.json
```

仓库里的 `.mcp.json` 只是模板，真正给自己机器配置时，建议把运行时数据写到：

- `~/.codex/codex-lark-plugin/index.json`
- `~/.codex/codex-lark-plugin/feishu-user-token.json`

### 7. 如果你先用 `tenant` 模式，`env` 可以这样填

```json
{
  "LARK_DOCS_SOURCE": "feishu",
  "LARK_INDEX_PATH": "~/.codex/codex-lark-plugin/index.json",
  "LARK_FEISHU_APP_ID": "cli_xxx",
  "LARK_FEISHU_APP_SECRET": "secret_xxx",
  "LARK_FEISHU_SYNC_ROOTS": "[{\"type\":\"folder\",\"token\":\"fldcn_xxxxx\"}]",
  "LARK_FEISHU_TOKEN_MODE": "tenant"
}
```

`LARK_FEISHU_SYNC_ROOTS` 是一个 JSON 数组，可以配置多个入口，例如：

```json
[
  { "type": "folder", "token": "fldcn_xxxxx" },
  { "type": "wiki", "token": "wikcn_xxxxx" }
]
```

### 8. 如果你要用 `user` 模式，`env` 推荐这样填

```json
{
  "LARK_DOCS_SOURCE": "feishu",
  "LARK_INDEX_PATH": "~/.codex/codex-lark-plugin/index.json",
  "LARK_FEISHU_APP_ID": "cli_xxx",
  "LARK_FEISHU_APP_SECRET": "secret_xxx",
  "LARK_FEISHU_SYNC_ROOTS": "[{\"type\":\"folder\",\"token\":\"fldcn_xxxxx\"}]",
  "LARK_FEISHU_TOKEN_MODE": "user",
  "LARK_FEISHU_USER_TOKEN_PATH": "~/.codex/codex-lark-plugin/feishu-user-token.json",
  "LARK_FEISHU_OAUTH_REDIRECT_URI": "http://127.0.0.1:3333/callback",
  "LARK_FEISHU_OAUTH_SCOPE": "offline_access drive:drive:readonly space:document:retrieve docx:document:readonly"
}
```

## 如何使用 `user` 授权

### 9. 运行本地 OAuth 登录脚本

本项目已经内置用户授权脚本：

```bash
LARK_FEISHU_APP_ID=cli_xxx \
LARK_FEISHU_APP_SECRET=secret_xxx \
LARK_FEISHU_OAUTH_REDIRECT_URI=http://127.0.0.1:3333/callback \
LARK_FEISHU_OAUTH_SCOPE="offline_access drive:drive:readonly space:document:retrieve docx:document:readonly" \
LARK_FEISHU_USER_TOKEN_PATH=~/.codex/codex-lark-plugin/feishu-user-token.json \
npm run login:feishu-oauth
```

运行后脚本会：

1. 在本地启动一个 HTTP 回调服务
2. 在终端打印飞书授权链接
3. 你在浏览器里登录并授权
4. 飞书回调到本地地址
5. 脚本把 `user_access_token` 和 `refresh_token` 写入 `LARK_FEISHU_USER_TOKEN_PATH`

默认推荐的 token 文件位置是：

```text
~/.codex/codex-lark-plugin/feishu-user-token.json
```

### 10. 拿到用户 token 后怎么切回 MCP 配置

用户授权完成后，确保 `.mcp.json` 里的关键字段至少是这几个：

```json
{
  "LARK_DOCS_SOURCE": "feishu",
  "LARK_INDEX_PATH": "~/.codex/codex-lark-plugin/index.json",
  "LARK_FEISHU_TOKEN_MODE": "user",
  "LARK_FEISHU_USER_TOKEN_PATH": "~/.codex/codex-lark-plugin/feishu-user-token.json"
}
```

如果还要同步真实飞书，别忘了同时保留：

- `LARK_FEISHU_APP_ID`
- `LARK_FEISHU_APP_SECRET`
- `LARK_FEISHU_SYNC_ROOTS`

## 如何获取更多权限

当你发现“能列目录但读不了正文”或“新增文档类型后还是报权限不足”时，通常不是代码问题，而是权限还没补全。

建议按这个顺序处理：

1. 去飞书开放平台给应用新增所需权限
2. 完成应用发布，让权限变更生效
3. 更新本地 `LARK_FEISHU_OAUTH_SCOPE`
4. 重新执行一次 `npm run login:feishu-oauth`

最常见的场景：

- 能看到 folder，但读取正文失败：补 `docx:document:readonly`
- `user` 模式下 token 过期后不能续期：确认包含 `offline_access`
- 新增了权限但依然报错：通常是没有重新授权，旧 token 还在用旧 scope

## 第一次接入后，怎么验证是否成功

### 11. 做一次真实飞书联通验证

如果你已经填好 `.mcp.json` 对应的配置，也可以直接用命令做最小验证：

```bash
LARK_DOCS_SOURCE=feishu \
LARK_INDEX_PATH=~/.codex/codex-lark-plugin/index.json \
LARK_FEISHU_APP_ID=cli_xxx \
LARK_FEISHU_APP_SECRET=secret_xxx \
LARK_FEISHU_SYNC_ROOTS='[{"type":"folder","token":"fldcn_xxxxx"}]' \
LARK_FEISHU_TOKEN_MODE=user \
LARK_FEISHU_USER_TOKEN_PATH=~/.codex/codex-lark-plugin/feishu-user-token.json \
npm run test:feishu-smoke
```

如果你接的是共享知识库，也可以先把 `LARK_FEISHU_TOKEN_MODE` 改成 `tenant` 试通。

常用命令：

```bash
# 用真实飞书配置强制同步到本地索引
npm run sync:feishu

# 拉起用户 OAuth 授权
npm run login:feishu-oauth

# 做一次最小联通检查
npm run test:feishu-smoke
```

## 常见问题

### 回调地址报错

优先检查飞书开放平台里登记的回调地址是否与本地使用的 `LARK_FEISHU_OAUTH_REDIRECT_URI` 完全一致。

### `tenant` 能读共享目录，`user` 才能读个人目录

如果资源在某个用户的“我的空间”里，通常更适合 `user` 模式；如果是团队共享 folder / wiki，先用 `tenant` 更省事。

### 新增权限后为什么还报 403

最常见原因只有两个：

- 飞书后台已经勾选权限，但还没发布
- 旧的 `user_access_token` 没有重新授权

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

## 本地开发验证

Sample 模式：

```bash
npm run build
npm run sync:sample
npm test
```

真实飞书模式：

```bash
npm run sync:feishu
npm run test:feishu-smoke
```
