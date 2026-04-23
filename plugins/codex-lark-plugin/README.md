# codex-lark-plugin

这是 marketplace 中的单个插件目录。

## 当前定位

插件第一版聚焦：

- 团队知识库文档检索
- 项目文档摘要
- 最近更新查询与文档差异比较
- 飞书云空间原子读能力：列文件夹、读取 docx blocks、获取文件元数据
- 显式开启后的飞书文档创建、受控块编辑、文件夹创建和文件移动

当前支持两种数据源模式：

- `sample`：读取仓库内样本文档 fixture，适合本地开发、CI 和无凭证验证
- `feishu`：读取真实飞书 folder / wiki 根入口，先同步到本地索引后再提供 MCP 检索

真实飞书模式下又支持两种鉴权方式：

- `tenant`：应用身份，适合企业共享目录、wiki 根等应用可读资源
- `user`：用户身份，适合“我的文件夹”或仅当前用户可访问的云文档资源

写入能力默认关闭，只有配置 `LARK_FEISHU_WRITE_ENABLED=true` 后才会允许调用写入型 MCP tools。只读检索能力不需要开启该开关。

## MCP Tools

当前暴露 12 个 MCP tools。

只读检索 tools：

- `list_project_docs`：按项目列出本地索引中的文档。
- `search_docs`：按关键词检索本地索引。
- `get_doc_summary`：读取本地索引中的摘要与元数据。
- `list_recent_docs`：列出最近更新文档。
- `compare_doc_changes`：比较本地 revision 快照差异。

飞书原子读 tools：

- `list_folder_files`：按 `folder_token` 列飞书文件夹，支持递归、深度和数量上限。
- `get_docx_blocks`：分页读取新版 docx blocks，返回 `block_id`、`block_type`、`plain_text`、`elements`、`parent_id`。
- `get_file_meta`：按 token 或 URL 查询文件元信息。

写入 tools：

- `create_feishu_doc`：创建新版 docx 文档，可选 `dry_run` 预览。
- `edit_feishu_doc`：追加、插入或更新文本块，支持 `dry_run`、diff、`expected_old_text`、`document_revision_id`、`verify_after_write`。
- `create_feishu_folder`：创建文件夹，可选 `dry_run` 预览。
- `move_feishu_file`：移动文件或文件夹，可选 `dry_run` 预览。

后续新增具体操作时，优先用原子读写 tools 组合；只有高频、稳定、可审计的流程才沉淀为高阶模板。

## 目录说明

- `.codex-plugin/plugin.json`：插件 manifest
- `skills/`：面向 Codex 的知识检索与写入技能定义
- `scripts/`：样本文档同步、索引构建与 MCP server 脚本
- `data/`：用于本地验证的飞书样本文档 fixture
- `assets/`：图标、截图等静态资源
- `.mcp.json`：MCP 服务配置

## 发布说明

该插件由上层 marketplace 仓库通过：

- `.agents/plugins/marketplace.json`

进行暴露。发布到 GitHub 后，推荐用户通过：

```bash
codex marketplace add https://github.com/cKnight107/codex-lark-plugin
```

来接入整个 marketplace。

## Codex 安装后的本地目录

通过 `codex marketplace add ...` 安装后，这个插件通常会涉及两类本地目录：

- 插件包缓存目录：`~/.codex/plugins/cache/codex-lark-marketplace/codex-lark-plugin/<version>/`
- 插件运行时目录：`~/.codex/codex-lark-plugin/`

建议这样使用：

- `~/.codex/plugins/cache/...` 只放插件代码和 `.mcp.json` 模板，不要把 token、索引或其他运行时数据写进仓库或版本库。
- `~/.codex/codex-lark-plugin/` 用来放 `index.json`、`feishu-user-token.json` 这类本地运行时文件。

一个常见的目录布局如下：

```text
~/.codex/
├── config.toml
├── codex-lark-plugin/
│   ├── index.json
│   └── feishu-user-token.json
└── plugins/
    └── cache/
        └── codex-lark-marketplace/
            └── codex-lark-plugin/
                └── 0.2.0/
                    ├── .mcp.json
                    ├── scripts/
                    └── skills/
```

如果你要手动核对插件安装位置，可以优先检查：

- `~/.codex/plugins/cache/codex-lark-marketplace/codex-lark-plugin/`
- `~/.codex/codex-lark-plugin/`

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
- `LARK_FEISHU_SYNC_ROOTS`
- `LARK_INDEX_PATH`
- `LARK_FEISHU_WRITE_ENABLED=false`

默认鉴权模式是 `tenant`，此时还需要：

- `LARK_FEISHU_TOKEN_MODE=tenant`
- `LARK_FEISHU_APP_ID`
- `LARK_FEISHU_APP_SECRET`

如果你要读取“我的文件夹”之类的个人文档，改用 `user` 模式：

- `LARK_FEISHU_TOKEN_MODE=user`
- `LARK_FEISHU_USER_TOKEN_PATH`

推荐把这些运行时路径统一放到：

- `LARK_INDEX_PATH=~/.codex/codex-lark-plugin/index.json`
- `LARK_FEISHU_USER_TOKEN_PATH=~/.codex/codex-lark-plugin/feishu-user-token.json`

如果要使用文档创建、编辑、文件夹创建或文件移动能力，需要额外设置：

```json
{
  "LARK_FEISHU_WRITE_ENABLED": "true",
  "LARK_FEISHU_OAUTH_SCOPE": "offline_access drive:drive space:document:retrieve docx:document"
}
```

写入建议优先使用 `user` 模式，因为创建到个人可访问空间、编辑个人文档和移动文件时，用户身份的权限语义更直观。`tenant` 模式也支持，但目标文件夹或文档必须已授予应用身份对应权限。

`LARK_FEISHU_SYNC_ROOTS` 的格式是 JSON 数组，例如：

```json
[
  { "type": "folder", "token": "fldcn_xxxxx" },
  { "type": "wiki", "token": "wikcn_xxxxx" }
]
```

`user` 模式推荐先跑一次本地 OAuth 登录脚本：

```bash
LARK_FEISHU_APP_ID=cli_xxx \
LARK_FEISHU_APP_SECRET=secret_xxx \
LARK_FEISHU_OAUTH_REDIRECT_URI=http://127.0.0.1:3333/callback \
npm run login:feishu-oauth
```

脚本会打印一条授权链接。浏览器完成登录后，会把 `user_access_token` 和 `refresh_token`
写到本地 token 文件，默认路径是：

```text
~/.codex/codex-lark-plugin/feishu-user-token.json
```

然后把 MCP 配置切到：

```json
{
  "LARK_DOCS_SOURCE": "feishu",
  "LARK_INDEX_PATH": "~/.codex/codex-lark-plugin/index.json",
  "LARK_FEISHU_TOKEN_MODE": "user",
  "LARK_FEISHU_USER_TOKEN_PATH": "~/.codex/codex-lark-plugin/feishu-user-token.json"
}
```

### 面向 Codex 安装用户的推荐配置步骤

如果你是在 Codex 中通过 marketplace 安装插件，推荐按下面的顺序配置：

1. 先安装插件。

```bash
codex marketplace add https://github.com/<your-github-username>/codex-lark-plugin.git
```

2. 确认本机存在运行时目录；没有就创建。

```bash
mkdir -p ~/.codex/codex-lark-plugin
```

3. 找到插件安装后的 `.mcp.json`。

```text
~/.codex/plugins/cache/codex-lark-marketplace/codex-lark-plugin/<version>/.mcp.json
```

4. 把 `env` 中的真实飞书配置改成类似下面这样。

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
  "LARK_FEISHU_OAUTH_SCOPE": "offline_access drive:drive space:document:retrieve docx:document",
  "LARK_FEISHU_WRITE_ENABLED": "false"
}
```

5. 在飞书开放平台的应用后台配置 OAuth 回调地址。

- 路径通常是：`开发配置 -> 安全设置`
- 至少加入：`http://127.0.0.1:3333/callback`
- 如果你本地习惯用 `localhost`，可以同时加入：`http://localhost:3333/callback`

6. 在飞书开放平台为 `user_access_token` 开通并发布所需权限。

- 列文件夹至少需要：`drive:drive:readonly`
- 读取文档正文至少需要：`docx:document:readonly`
- 创建文件夹、移动文件至少需要：`drive:drive`
- 创建和编辑新版文档至少需要：`docx:document`
- 如果新增了权限，必须重新走一次 OAuth 授权；旧的 `user_access_token` 不会自动带上新 scope

7. 运行本地 OAuth 登录脚本，拿到用户 token。

```bash
LARK_FEISHU_APP_ID=cli_xxx \
LARK_FEISHU_APP_SECRET=secret_xxx \
LARK_FEISHU_OAUTH_REDIRECT_URI=http://127.0.0.1:3333/callback \
LARK_FEISHU_OAUTH_SCOPE="offline_access drive:drive space:document:retrieve docx:document" \
LARK_FEISHU_USER_TOKEN_PATH=~/.codex/codex-lark-plugin/feishu-user-token.json \
npm run login:feishu-oauth
```

8. 最后再做联通验证。

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

### 目录与权限排错

如果真实飞书模式没有按预期工作，可以先检查这几项：

- 不要把 `index.json` 或 `feishu-user-token.json` 写到插件仓库目录或待提交代码目录。
- `~/.codex/plugins/cache/.../.mcp.json` 是插件安装后的配置入口；`~/.codex/codex-lark-plugin/` 才是推荐的运行时数据目录。
- 如果能列出 folder，但读取 docx 正文时报权限错误，优先检查 `docx:document:readonly` 是否已在 `user_access_token` 下开通并重新授权。
- 如果授权页提示 `重定向 URL 有误`，优先检查 `开发配置 -> 安全设置` 中登记的回调地址是否与 `redirect_uri` 完全一致。

可用命令：

```bash
# 强制同步真实飞书文档到本地索引
npm run sync:feishu

# 启动本地 OAuth 登录并生成 user_access_token
npm run login:feishu-oauth

# 使用真实凭证做一次最小 smoke test
npm run test:feishu-smoke
```

`compare_doc_changes` 在真实飞书模式下基于**本地同步快照**工作：

- 第一次同步后，每篇文档只有 1 个本地 snapshot，还不能比较差异
- 对同一批 root 再同步一次后，如果文档正文发生变化，就会累积到 `revisions[]`
- 从第二次同步开始，可对已有多份 snapshot 的文档执行 diff

### 写入型 MCP tools

写入 tools 与只读检索 tools 分离，并且默认禁用。启用后可用：

- `create_feishu_doc`：在指定 `folder_token` 下创建新版 `docx`，可选写入初始 `plain_text` 或最小 Markdown 内容。
- `edit_feishu_doc`：对指定 `document_id` 执行 `append`、`insert` 或 `update_text`。首版不支持整篇覆盖替换和删除块。
- `create_feishu_folder`：在指定 `parent_folder_token` 下创建子文件夹。
- `move_feishu_file`：把显式指定的 `file_token` 按 `file_type` 移动到 `target_folder_token`。

示例：

```json
{
  "folder_token": "fldcn_xxxxx",
  "title": "需求评审记录",
  "content": "# 结论\n\n- 先上线最小闭环",
  "content_type": "markdown",
  "index_after_create": false
}
```

安全边界：

- 必须显式提供目标 token，不做模糊搜索后自动写入或移动。
- 写入默认不刷新本地索引；只有 `index_after_create=true` 或 `refresh_index=true` 时才强制重建索引。
- `edit_feishu_doc` 只支持追加、插入和更新指定块文本；不提供删除块或整篇覆盖能力。
- 错误上下文只保留文档、文件夹、文件、块 ID、文件类型和飞书错误码，不输出 app secret、access token 或 refresh token。
- API 创建资源的可见性取决于飞书权限模型；应用身份创建的文件夹或文档可能需要管理员提前共享父文件夹或补充协作者权限。

### 构建与测试

```bash
npm test
npm run build
```
