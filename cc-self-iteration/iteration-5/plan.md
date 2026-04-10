# 迭代 5 优化计划

## DAG 结构

```
[task-1: 双向 import 图扩展] --> [task-4: 更新 expandRelatedFiles 调用]
[task-2: 改进 import graph 解析] --> [task-4]
[task-3: likelyPaths 文件存在性校验] --> [task-5: 校准 evaluateComplexity]
[task-4: 更新 expandRelatedFiles 调用] --> [task-6: 更新 workflow.js 上下文收集]
[task-5: 校准 evaluateComplexity] --> [task-7: 测试验证]
[task-6: 更新 workflow.js 上下文收集] --> [task-7]
[task-7: 测试验证]
```

## 任务列表

| ID | 描述 | 目标文件 | 依赖 | 难度 |
|----|------|----------|------|------|
| 1 | `expandRelatedFiles` 增加 `edges` 正向扩展 | `src/utils/fs_tools.js` | - | 30 |
| 2 | import graph 解析增强（动态 import、export from） | `src/utils/fs_tools.js` | - | 35 |
| 3 | `extractLikelyPaths` 增加文件存在性校验 | `src/utils/fs_tools.js` + `src/core/planner.js` | - | 25 |
| 4 | 更新 `expandRelatedFiles` 调用，传入 `edges` 参数 | `src/utils/fs_tools.js` | 1, 2 | 20 |
| 5 | `evaluateComplexity` 集成存在性校验结果 | `src/core/planner.js` | 3 | 25 |
| 6 | 更新 `workflow.js` 中上下文收集逻辑 | `src/core/workflow.js` | 1, 2 | 20 |
| 7 | 语法检查 + npm test 验证 | - | 4, 5, 6 | 15 |

## 任务详情

### task-1：双向 import 图扩展

**文件**: `src/utils/fs_tools.js`

**修改**:
```js
// expandRelatedFiles 增加 edges 参数，默认使用双向扩展
function expandRelatedFiles({
  seedFiles,
  reverseEdges,
  edges,           // 新增：正向依赖图
  depth = 1,
  maxFiles = 20,
  direction = 'both'  // 'reverse' | 'forward' | 'both'
} = {}) {
  // ...
}
```

**验收标准**: seed 为 `auth.js` 时，能同时返回依赖方和被依赖方文件

### task-2：import graph 解析增强

**文件**: `src/utils/fs_tools.js`

**修改**:
```js
// 增加动态 import 正则
const dynamicImportRe = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
// 增加 export from 正则
const exportFromRe = /export\s+\{[^}]+\}\s+from\s+["']([^"']+)["']/g;
// 改进 requireRe 匹配 .then 等链式调用
```

**验收标准**: 常见动态 import 和 export from 模式能正确解析

### task-3：文件存在性校验

**文件**: `src/utils/fs_tools.js`（新增辅助函数）+ `src/core/planner.js`

**修改**: `extractLikelyPaths` 增加可选参数 `workspaceDir`，验证每个路径是否真实存在后返回

**验收标准**: `extractLikelyPaths("update backend/routes/admin.js")` 对不存在的文件应过滤或标记

### task-4：更新 expandRelatedFiles 调用

**文件**: `src/utils/fs_tools.js`（调用处）、`src/core/workflow.js`

**修改**: 传入 `edges` 和 `direction` 参数

### task-5：校准 evaluateComplexity

**文件**: `src/core/planner.js`

**修改**: `evaluateComplexity` 接收 `contextStat.existingFilesCount` 等信息，过滤不存在路径的计数

### task-6：更新 workflow.js 上下文收集

**文件**: `src/core/workflow.js`

**修改**: `buildSubtaskContext` 调用 `collectContext` 时传入 `edges`，使 `expandRelatedFiles` 能做双向扩展

### task-7：测试验证

**操作**:
```bash
node --check src/utils/fs_tools.js
node --check src/core/planner.js
node --check src/core/workflow.js
npm test
```

## 依赖关系说明

- task-1 和 task-2 可并行（独立修改 `fs_tools.js` 不同区域）
- task-3 独立（仅 planner.js）
- task-4 依赖 1 和 2
- task-5 依赖 3
- task-6 依赖 1 和 2
- task-7 依赖 4、5、6

## 风险评估

| 任务 | 风险 | 说明 |
|------|------|------|
| task-1 | 低 | 纯增加参数，不改现有逻辑 |
| task-2 | 中 | 正则修改可能影响现有解析结果，需测试 |
| task-3 | 低 | 仅过滤无效路径 |
| task-4 | 低 | 参数传递 |
| task-5 | 低 | 分数调整方向不变 |
| task-6 | 低 | 调用参数更新 |
| task-7 | 低 | 纯验证 |
