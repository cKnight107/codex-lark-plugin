# log

## 2026-04-23

- 进入 `spec-propose` 阶段。
- 根据 `prod.md` 判断方向可行：插件应优先演进为安全原子工具箱，再沉淀少量高阶模板。
- 当前未进入 Apply，等待用户确认第一批实现范围。
- 用户确认选项 A：先做 `list_folder_files`、`get_docx_blocks`、`get_file_meta`、写入 `dry-run/diff/verify`。
- 进入 `spec-apply` 阶段，当前分支为 `feature/feishu-safe-atomic-toolbox`。
- 新增 `plugins/codex-lark-plugin/scripts/lib/feishu-read-tools.js`，集中承载飞书原子读能力与返回归一化。
- 将飞书文件夹分页读取抽为可复用函数，并让现有同步链路复用，避免同步和 MCP tool 重复实现。
- 新增 MCP tools：`list_folder_files`、`get_docx_blocks`、`get_file_meta`。
- 增强写入合同：`dry_run`、`document_revision_id`、`expected_old_text`、`verify_after_write`。
- 增强写入执行：dry-run 返回预览和 diff，不执行写 API；`update_text` 支持原文本断言和写后读取校验；append/insert 支持 revision 透传和 created block 校验。
- 更新 README、`knowledge-search` skill、`doc-write` skill，明确原子读工具与写前 dry-run 流程。
- 验证结果：`npm test` 通过 40 项；`npm run build` 通过，MCP 注册 tools 为 12 个。
