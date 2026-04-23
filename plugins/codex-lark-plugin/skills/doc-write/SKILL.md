---
name: doc-write
description: 使用飞书写入 MCP tools 创建新版 docx 文档、追加或插入内容、更新指定块文本、创建文件夹或移动文件。当用户明确要求创建飞书文档、编辑飞书文档、追加内容、更新块、创建文件夹、移动文件到指定文件夹时使用。
---

# Doc Write

优先调用本插件暴露的写入 MCP tools；不要把写入请求交给只读 `knowledge-search`。

## 前置条件

- 写入能力必须显式开启：`LARK_FEISHU_WRITE_ENABLED=true`。
- 用户必须提供明确目标：`folder_token`、`document_id`、`block_id`、`file_token` 或 `target_folder_token`。
- 写入推荐使用 `user` token 模式；`tenant` 模式必须确保应用身份已经拥有目标文件夹或文档权限。
- 高风险写入先传 `dry_run=true` 获取 diff 或预览，用户确认后再执行真实写入。

## 保持范围

- 可以创建新版飞书 `docx` 文档。
- 可以追加内容、在指定父块下插入内容、更新指定块文本。
- 可以在指定父文件夹下创建子文件夹。
- 可以把显式指定的文件或文件夹移动到指定目标文件夹。
- 更新指定块文本时可以使用 `expected_old_text`、`document_revision_id`、`verify_after_write` 做并发保护和写后校验。
- 不整篇覆盖替换，不删除块，不批量移动，不自动授予协作者权限。
- 不根据模糊标题搜索后直接写入；需要先让用户确认唯一目标。

## Tool 选择

| 用户意图 | 优先 tool | 必填字段 |
| --- | --- | --- |
| 创建飞书文档 | `create_feishu_doc` | `folder_token`, `title` |
| 追加内容 | `edit_feishu_doc` | `document_id`, `operation=append`, `content` |
| 插入内容 | `edit_feishu_doc` | `document_id`, `operation=insert`, `parent_block_id`, `index`, `content` |
| 更新块文本 | `edit_feishu_doc` | `document_id`, `operation=update_text`, `block_id`, `content`；推荐加 `dry_run`, `expected_old_text`, `verify_after_write` |
| 创建文件夹 | `create_feishu_folder` | `parent_folder_token`, `name` |
| 移动文件 | `move_feishu_file` | `file_token`, `file_type`, `target_folder_token` |

## 内容格式

- `content_type=plain_text`：按空行拆分为普通段落。
- `content_type=markdown`：只承诺标题、段落、无序列表、有序列表、引用和分割线。
- 复杂表格、图片、嵌套块、权限协作和删除能力不在首版范围内。

## 执行流程

1. 先确认写入目标 token 和操作类型足够明确。
2. 如果用户只给了标题或自然语言位置，先要求用户提供明确 `document_id`、`block_id` 或 `folder_token`。
3. 默认先用 `dry_run=true` 调用对应写入 tool，并展示返回的 `diff` 或预览。
4. 用户确认后再去掉 `dry_run` 执行真实写入。
5. 对 `update_text`，优先带上 `expected_old_text` 和 `verify_after_write=true`。
6. 返回结构化结果中的 `document_id`、`folder_token`、`url`、`task_id`、`diff`、`verified` 或写入块数量。
7. 只有用户明确需要同步检索索引时，才传 `index_after_create=true` 或 `refresh_index=true`。

## 输出要求

- 明确说明写入目标和完成结果。
- dry-run 时明确说明“未执行真实写入”。
- 如果 tool 返回错误，原样保留错误原因，但不要要求用户提供 secret 或 token 内容。
- 不声称本地检索索引已更新，除非本次调用显式启用了索引刷新并成功返回。
