# 项目当前状态

## 迭代进度

| 迭代 | 状态 | 完成任务 |
|------|------|----------|
| 1-8 | 完成 | 重构与 bug 修复（详见 full-log.md） |
| 9 | 完成 | 正则表达式修复 + 操作指南更新 |
| 10 | 完成 | 正则表达式最终修复：使用 `\n>>>(?=\n|$)` 前瞻断言 |
| 11 | 完成 | JSON Schema 验证支持：parseJsonToolCalls + JSON-first 解析 + JSON 格式 prompt |
| 12 | 完成 | 空 SEARCH 块正则匹配修复：两阶段检测法处理 `<<<\n>>>\nREPLACE:` 模式 |
| 13 | 完成 | workspace/ 前缀自动剥离 + useFunctionCalling: true 启用 JSON Schema 模式 |
| 14 | 完成 | memory.json 去重逻辑修复 + squashAndCommit 工作目录同步修复 |

## 已完成的高优先级优化

- Pre-Hooks 修复
- 并发竞争条件修复
- AppliedChanges 修复
- 语义验证绕过修复
- Import 正则补充
- 双向 import 图扩展
- JSON Schema 输出与解析支持
- `>>>` 独占一行正则修复
- 空 SEARCH 块解析修复
- useFunctionCalling: true 启用 JSON Schema 模式（替代 sr/op 文本块）
- memory.json 去重逻辑修复（允许重跑失败/跳过任务）
- squashAndCommit 工作目录同步修复

## 待处理问题（低优先级）

- Squash 失败后 staged changes 清理
- Rollback SHA 验证
- Timeout 竞争处理
- Replan 计数器修正
- 隐藏文件支持
- REPLACE 块空内容检测（如需）
- MKDIR 路径解析问题
- git reset --hard 后工作目录验证

## 测试覆盖

- npm test: 408 tests passing