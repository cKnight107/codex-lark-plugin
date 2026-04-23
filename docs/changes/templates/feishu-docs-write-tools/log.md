# log

## 2026-04-23

- 创建 `feature/feishu-docs-write-tools` 分支。
- 按 `spec-propose` 阶段完成代码现状分析和提案文档落盘。
- 当前未进入实现阶段，等待用户确认 Apply 门控。
- 用户确认首版边界：不支持整篇覆盖、支持 `plain_text` + 最小 Markdown、默认不刷新索引、新增独立写入 skill。
- 已同步 `spec.md` 与 `tasks.md`，当前仅等待用户显式确认进入 Apply。
- 用户补充创建文件夹、移动文件到指定文件夹能力。
- 已将需求范围扩展为飞书文档与 Drive 写入 MCP tools：`create_feishu_doc`、`edit_feishu_doc`、`create_feishu_folder`、`move_feishu_file`。
- 用户通过 `spec-apply` 指定本需求目录，视为显式确认进入 Apply。
- 完成任务“定义写入 tool 合同与安全开关”：新增 `plugins/codex-lark-plugin/scripts/lib/feishu-write-contract.js`，定义 4 个写入 tool 的 JSON Schema、`LARK_FEISHU_WRITE_ENABLED=true` 显式开关、参数校验、禁止整篇覆盖的 `edit_feishu_doc` 操作枚举、移动文件类型 allowlist 和 `FeishuWriteError` 脱敏上下文。
- 当前切片未接入 MCP `tools/list` 和 `tools/call`，保留现有 5 个只读 tool；写入注册与执行入口留给后续“接入 MCP tool 注册与执行入口”任务。
- 验证结果：`npm test -- plugins/codex-lark-plugin/scripts/__tests__/knowledge-tools.test.js` 通过 8 项；`npm test` 通过 30 项；`npm run build` 通过，运行时仍注册 5 个只读 tool。
- 批量执行剩余任务：新增 `feishu-doc-write.js`，支持 `create_feishu_doc`、`edit_feishu_doc(append|insert|update_text)`，并实现 `plain_text` 和最小 Markdown 到飞书 block 的本地转换。
- 新增 `feishu-drive-write.js`，支持 `create_feishu_folder` 与 `move_feishu_file`，按飞书 Drive 接口返回文件夹 token、URL 和移动 `task_id`。
- 更新 `knowledge-tools.js`，将 4 个写入 tool 接入 MCP `tools/list` 与 `tools/call`；写入调用会先检查 `LARK_FEISHU_WRITE_ENABLED=true`，再做参数校验和真实飞书 client 构造，避免禁用状态下访问远端。
- 更新 `data-source.js`，补充写入场景专用飞书 client 构造逻辑，复用 tenant/user token 模式和本地 user token 持久化。
- 更新 `.mcp.json`、`validate-runtime.js`、README、插件 manifest 和 skills，新增默认关闭的 `LARK_FEISHU_WRITE_ENABLED=false`、写入 scope 示例、写入风险边界和独立 `doc-write` skill。
- 补充 `write-tools.test.js`，覆盖内容转换、写入开关 fail-fast、MCP 禁用错误、mock 文档创建与块写入、append/insert/update_text、mock 文件夹创建和文件移动。
- 验证结果：`npm test -- plugins/codex-lark-plugin/scripts/__tests__/write-tools.test.js plugins/codex-lark-plugin/scripts/__tests__/knowledge-tools.test.js` 通过 14 项；`npm test` 通过 36 项；`npm run build` 通过并确认注册 9 个 tools；`git diff --check` 通过。
- 真实飞书手工 smoke 验证未执行：当前 shell 无 `LARK_*` 环境变量，也没有用户提供的测试 `folder_token`、可写授权和待移动测试文件 token。为避免误写真实飞书，保持该项阻塞，后续需用户提供测试空间与授权后再执行。
- 进入 `spec-fix`：读取 `docs/rules`、`spec.md`、`tasks.md`、`log.md` 后，先运行 `npm test` 与 `npm run build`，现有自动化均通过；未发现独立 review finding 文件。
- 代码级核对发现验收缺口：`create_feishu_folder` 的成功标准要求返回新文件夹 token，但当前实现会在飞书响应缺少 `folder_token` / `token` 时返回空 token，存在把远端异常伪装成成功的风险。
- 修正动作：更新 `plugins/codex-lark-plugin/scripts/lib/feishu-drive-write.js`，在创建文件夹响应缺少 token 时抛出 `FeishuApiError`，并保留 `parent_folder_token` 上下文。
- 防回归证明：更新 `plugins/codex-lark-plugin/scripts/__tests__/write-tools.test.js`，新增 `create_feishu_folder 会拒绝缺少 folder_token 的飞书响应` 测试。
- 验证结果：`npm test -- plugins/codex-lark-plugin/scripts/__tests__/write-tools.test.js` 通过 7 项；`npm test` 通过 37 项；`npm run build` 通过并确认仍注册 9 个 tools。
- 文档同步：`spec.md` 的需求边界和验收口径未变化；`tasks.md` 已新增并关闭本次 fix task；`log.md` 记录问题来源、修正动作和验证结果。
- 进入 `spec-fix`：根据 `spec-review` P1 finding 修正 `create_feishu_folder` 调用错误 Drive API 路径的问题。review 证据指出官方接口是 `POST /open-apis/drive/v1/files/create_folder`，当前实现和测试错误使用 `drive/v1/folders`。
- 失败复现：先将 `write-tools.test.js` 中创建文件夹 mock 与断言改为官方路径，运行 `npm test -- plugins/codex-lark-plugin/scripts/__tests__/write-tools.test.js`，`Drive 写入 tool 会创建文件夹并移动文件` 失败，错误上下文显示当前实现仍请求 `drive/v1/folders`。
- 修正动作：更新 `plugins/codex-lark-plugin/scripts/lib/feishu-drive-write.js`，将创建文件夹请求路径和缺 token 错误上下文统一为 `drive/v1/files/create_folder`；同步更新 `plugins/codex-lark-plugin/scripts/__tests__/write-tools.test.js`，防止错误路径回归。
- 文档同步：`spec.md` 明确 `create_feishu_folder` 使用官方 `POST /open-apis/drive/v1/files/create_folder`；`tasks.md` 新增并关闭本次 P1 fix task；`log.md` 记录复现、修正与验证证据。
- 验证结果：`npm test -- plugins/codex-lark-plugin/scripts/__tests__/write-tools.test.js` 通过 7 项；`npm test` 通过 37 项；`npm run build` 通过并确认仍注册 9 个 tools；`git diff --check` 通过。
