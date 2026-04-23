# Changelog

## 0.3.0

- 新增飞书原子读 MCP tools：`list_folder_files`、`get_docx_blocks`、`get_file_meta`
- 新增 `feishu-read-tools.js`，统一封装文件夹分页读取、docx block 读取、raw content 读取与文件元数据查询
- 让现有飞书同步链路复用可复用读服务，减少同步逻辑与 MCP tool 的重复实现
- 为写入工具增加 `dry_run` 预览、`diff` 返回、`document_revision_id` 透传、`expected_old_text` 断言与 `verify_after_write` 校验
- 为创建文件夹和移动文件补充 dry-run 预览能力
- 扩展无凭证自动化测试与运行时校验，MCP tools 数量从 9 个增加到 12 个
- 更新插件 README、知识检索 skill、写入 skill，以及 `feishu-safe-atomic-toolbox` 的 spec/tasks/log 文档

## 0.2.0

- 将第一版边界收敛为飞书知识检索闭环，不再把任务文档管理纳入当前版本承诺
- 新增本地 `stdio` MCP server，提供项目文档列表、关键词检索、摘要、最近更新和文档差异比较 5 个 tools
- 新增样本文档同步脚本、最小结构化索引与 Codex 元数据自动推断逻辑
- 新增插件技能定义、运行时验证命令和 Node.js 测试用例

## 0.1.0

- 初始化 Codex marketplace 仓库结构
- 创建 `codex-lark-plugin` 插件骨架
- 补齐可发布的基础 marketplace 与 plugin manifest
- 添加安装与版本发布说明
