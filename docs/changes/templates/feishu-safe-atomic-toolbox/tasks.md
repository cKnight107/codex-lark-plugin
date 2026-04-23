# tasks

## 已完成

- [x] 读取 `docs/rules` 并确认仓库级强制规范。
- [x] 读取 `prod.md` 并提炼产品方向。
- [x] 分析 MCP server、tool 注册、只读同步、写入合同、文档写入、Drive 写入和 skill 文案现状。
- [x] 创建 `feature/feishu-safe-atomic-toolbox` 分支，避免在 `main` 上落提案文档。
- [x] 生成本需求提案 `spec.md`、`tasks.md`、`log.md`。

## 待确认

- [x] 用户确认第一批 Apply 范围采用选项 A。
- [x] 用户确认本提案可进入 Apply 阶段。
- [ ] 若选择真实飞书 smoke，用户确认测试空间、授权模式和可写目标。

## 实施任务（确认后执行）

- [x] 拆分可复用飞书读取服务，暴露 `list_folder_files` 的 MCP tool。
- [x] 增加 `get_docx_blocks`，返回 block_id、block_type、plain_text、elements、parent_id。
- [x] 增加 `get_file_meta`，支持按 token 或 URL 获取文件元信息。
- [x] 为写入工具增加 `dry_run`、diff 预览、`document_revision_id` 和 `verify_after_write`。
- [ ] blocked: 增加批量写入上限、允许块类型约束和错误上下文脱敏测试。
- [x] 更新 README 和 skill 文案，明确“原子工具优先，高阶模板克制沉淀”。
- [x] 补充无凭证单元测试，并运行 `npm test` 与 `npm run build`。

## 后续再议

- [ ] 是否开放 `delete_blocks`。
- [ ] 是否增加 `link_doc_index_to_folder` 高阶模板。
- [ ] 是否增加 `sync_folder_index_doc` 高阶模板。
- [ ] 是否增加 `move_files_by_manifest` 高阶模板。
