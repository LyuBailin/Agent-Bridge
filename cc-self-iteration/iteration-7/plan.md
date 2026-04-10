# 迭代 7 修复计划（已完成）

## DAG 结构（实际执行）

```
[task-1: Pre-Hooks 旁路修复] --> [task-6: 测试验证]
[task-3: AppliedChanges 日志修复] --> [task-6]
[task-4: 语义验证绕过修复] --> [task-6]
[task-5: Import 正则补充] --> [task-6]
```

注：task-2（并发竞争条件）未纳入本次迭代，待后续处理。

## 任务列表

| ID | 描述 | 目标文件 | 状态 |
|----|------|----------|------|
| 1 | Pre-Hooks 旁路修复：parseToolCalls 中调用 executePreHooks | `src/core/adapter/parser.js` | ✅ 完成 |
| 3 | AppliedChanges 日志修复：使用 appliedFiles 构造 appliedChanges | `src/core/workflow.js` | ✅ 完成 |
| 4 | 语义验证绕过修复：issues 非空时设置 ok=false | `src/core/verifier.js` | ✅ 完成 |
| 5 | Import 正则补充：增加 side-effect/namespace/export default 正则 | `src/utils/fs_tools.js` | ✅ 完成 |
| 6 | 语法检查 + npm test 验证 | - | ✅ 完成 |

## 依赖关系

- task-1 到 task-5 相互独立，可并行
- task-6 依赖所有其他任务

## 风险评估

| 任务 | 风险 | 说明 |
|------|------|------|
| task-1 | 低 | 改为 async 函数，所有调用点已兼容 |
| task-3 | 低 | 仅修改变量映射 |
| task-4 | 低 | 仅调整条件逻辑 |
| task-5 | 低 | 正则补充不影响现有匹配 |
| task-6 | 低 | 纯验证 |

## 未纳入任务（待后续迭代）

- task-2: 并发竞争条件修复（High - 涉及状态管理）
- task-7: Squash 失败后 staged changes 清理
- task-8: Rollback SHA 验证
- task-9: Timeout 竞争处理
- task-10: Replan 计数器修正
- task-11: 隐藏文件支持
