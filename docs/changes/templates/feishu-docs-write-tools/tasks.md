# tasks

## 已完成

- [x] 读取 `docs/rules`，确认本仓库规则要求任务必须遵守 `docs/rules`。
- [x] 读取 Git 规则，确认涉及分支工作必须遵守 `git-workflow-and-versioning`。
- [x] 创建需求分支 `feature/feishu-docs-write-tools`。
- [x] 分析当前 MCP server、tool 注册、飞书 client、真实飞书读取数据源、README、`.mcp.json`、测试和运行时校验脚本。
- [x] 确认当前插件只具备只读知识检索能力，缺少文档创建和编辑型 MCP tool。
- [x] 创建提案目录 `docs/changes/templates/feishu-docs-write-tools/`。
- [x] 生成 `spec.md`、`tasks.md`、`log.md`。
- [x] 更新 `docs/changes/templates/README.md`，登记本需求目录链接与简介。

## 待确认

- [x] 用户确认首版编辑能力不允许整篇覆盖替换。
- [x] 用户确认首版内容输入格式为 `plain_text` + 最小 Markdown 子集。
- [x] 用户确认写入后默认不刷新本地索引。
- [x] 用户确认新增独立写入 skill。
- [x] 用户补充创建文件夹、移动文件到指定文件夹能力，已纳入提案范围。
- [x] 用户显式确认提案可进入 Apply。

## 实施任务

| 状态 | 任务 | 依赖 | 验收口径 | 估算 |
| --- | --- | --- | --- | --- |
| done | 定义写入 tool 合同与安全开关 | 待确认项关闭 | `create_feishu_doc`、`edit_feishu_doc`、`create_feishu_folder`、`move_feishu_file` schema、写入开关和错误边界明确 | S |
| done | 新增飞书文档写入模块 | tool 合同确认 | 能创建 docx、转换基础内容、追加/插入 blocks、更新指定块文本 | M |
| done | 新增飞书 Drive 写入模块 | tool 合同确认 | 能创建文件夹、移动指定文件到目标文件夹，并返回飞书任务结果 | S |
| done | 接入 MCP tool 注册与执行入口 | 写入模块完成 | `tools/list` 返回新增 tools，`tools/call` 可调用写入能力 | S |
| done | 补充写入配置和权限文档 | 写入安全策略确认 | `.mcp.json`、README、OAuth scope、Drive 权限和风险提示完整 | S |
| done | 补充自动化测试 | tool 注册与写入模块完成 | `npm test` 覆盖 schema、参数校验、mock 文档写入、mock Drive 写入请求和错误脱敏 | M |
| done | 更新运行时校验 | tool 数量和配置确认 | `npm run build` 在 sample 模式无凭证通过，且校验新增 tool 与配置模板 | S |
| done | 增加或更新写入 skill | 是否独立 skill 已确认 | Codex 能根据用户意图区分只读检索与写入编辑 | S |
| done | Fix：创建文件夹响应缺失 token 时 fail fast | 代码核对发现验收缺口 | `create_feishu_folder` 不再把缺少 `folder_token` 的飞书响应伪装成成功，并有回归测试覆盖 | S |
| done | Fix：创建文件夹使用官方 Drive API 路径 | spec-review P1 finding | `create_feishu_folder` 调用 `drive/v1/files/create_folder`，测试不再固化错误的 `drive/v1/folders` 路径 | S |
| blocked | 真实飞书手工 smoke 验证 | 用户提供测试空间和写入授权 | 当前环境无 `LARK_*` 写入凭证和测试文件夹 token；不能擅自写真实飞书 | M |

## 检查点

- [x] Checkpoint 1：提案阶段文档已落盘，未进入业务实现。
- [x] Checkpoint 2：所有架构级待确认项关闭。
- [x] Checkpoint 3：用户显式确认可进入 Apply。
- [x] Checkpoint 4：新增文档与 Drive 写入 tool 通过自动化测试和运行时校验。
- [ ] Checkpoint 5：真实飞书测试空间完成最小文档写入、文件夹创建和文件移动 smoke 验证（等待测试空间与授权）。
