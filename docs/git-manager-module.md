# Git 管理器模块 (src/core/git_manager.js) 技术文档

## 模块概述

Git 管理器模块是 Agent Bridge 系统的核心组件之一，负责 Git 仓库的管理和代码变更的版本控制。该模块提供了完整的 Git 操作功能，包括仓库初始化、变更应用、提交和回滚等，确保代码变更的可追溯性和安全性。

## 核心功能

### 1. 仓库管理

**功能说明**：初始化和配置 Git 仓库，确保仓库的正常运行。

**实现细节**：
- 初始化 Git 仓库
- 配置 Git 用户信息
- 确保仓库有初始提交
- 处理仓库相关的错误

**关键函数**：
- `ensureRepo()`：确保仓库存在并配置正确
- `runGit()`：执行 Git 命令

### 2. 变更应用

**功能说明**：安全应用代码变更，确保变更的正确性和完整性。

**实现细节**：
- 解析和应用内容编辑操作
- 执行文件系统操作（创建目录、移动文件、删除文件）
- 验证操作的安全性
- 处理操作过程中的错误

**关键函数**：
- `safeApplyPatch()`：安全应用变更
- `applySearchReplaceChanges()`：应用搜索替换变更

### 3. 版本控制

**功能说明**：管理代码的版本控制，包括创建检查点、提交和回滚。

**实现细节**：
- 创建检查点标记
- 提交代码变更
- 回滚到指定版本
- 压缩提交历史

**关键函数**：
- `createCheckpointMarker()`：创建检查点标记
- `commitCheckpoint()`：提交检查点
- `rollback()`：回滚到指定版本
- `squashAndCommit()`：压缩并提交

### 4. 变更验证

**功能说明**：验证代码变更的安全性和完整性。

**实现细节**：
- 检查文件路径的安全性
- 验证文件操作的合法性
- 确保变更符合项目规范
- 处理变更验证中的错误

**关键函数**：
- `safeApplyPatch()`：安全应用变更并验证
- `verifyAndCommit()`：验证并提交变更

### 5. 状态管理

**功能说明**：管理 Git 仓库的状态，包括获取当前 HEAD、检查变更等。

**实现细节**：
- 获取当前 HEAD 的 SHA
- 检查仓库状态
- 收集变更信息
- 生成变更摘要

**关键函数**：
- `getHeadSha()`：获取当前 HEAD 的 SHA
- `createSnapshot()`：创建仓库快照
- `runGit()`：执行 Git 命令获取状态信息

## 技术亮点

1. **安全性**：严格的路径验证和安全检查，防止不安全的操作
2. **可靠性**：完善的错误处理和回滚机制，确保操作的可靠性
3. **完整性**：完整的版本控制功能，支持检查点、提交和回滚
4. **灵活性**：支持多种 Git 操作，适应不同的场景需求
5. **性能**：优化的 Git 操作，提高执行效率
6. **自动化**：自动处理 Git 操作，减少人工干预
7. **可追溯性**：完整的变更记录，确保代码变更的可追溯性
8. **一致性**：统一的 Git 操作接口，确保操作的一致性
9. **扩展性**：模块化设计，易于扩展和维护
10. **集成性**：与其他模块紧密集成，提供完整的版本控制解决方案

## 执行流程

1. **仓库初始化**：初始化 Git 仓库并配置用户信息
2. **变更应用**：安全应用代码变更
3. **检查点创建**：创建变更前的检查点
4. **变更验证**：验证变更的安全性和完整性
5. **提交**：提交代码变更
6. **回滚**：如有需要，回滚到之前的版本

## 配置依赖

- **config.json**：包含 Git 相关的配置，如默认分支和用户信息

## 与其他模块的交互

- **src/core/main.js**：主流程模块使用 Git 管理器处理版本控制
- **src/core/planner.js**：任务规划器使用 Git 管理器创建检查点
- **src/core/verifier.js**：验证器使用 Git 管理器收集变更信息
- **src/core/workflow.js**：工作流管理模块使用 Git 管理器执行版本控制操作

## 代码结构

```javascript
// 仓库管理
async function ensureRepo(workspaceDir, gitCfg) {
  // 初始化仓库
  // 配置用户信息
  // 确保初始提交
}

// 变更应用
async function safeApplyPatch(workspaceDir, changes, fsTools) {
  // 解析变更
  // 应用变更
  // 验证变更
}

// 提交和回滚
async function commitCheckpoint(workspaceDir, { taskId, subtaskId, message } = {}) {
  // 检查变更
  // 提交变更
  // 返回提交 SHA
}

async function rollback(workspaceDir, snapshotSha) {
  // 回滚到指定版本
  // 清理工作区
}
```

## 性能优化

1. **批量操作**：批量执行 Git 命令，减少命令调用次数
2. **错误处理**：快速捕获和处理错误，减少不必要的操作
3. **状态缓存**：缓存仓库状态信息，避免重复查询
4. **并行操作**：支持并行的 Git 操作，提高执行效率

## 故障排除

1. **Git 命令失败**：检查 Git 安装和配置
2. **变更应用失败**：检查变更内容和文件权限
3. **提交失败**：检查 Git 用户配置和仓库状态
4. **回滚失败**：检查快照 SHA 的有效性

## 未来改进

1. **分支管理**：支持分支的创建、切换和合并
2. **远程仓库**：支持与远程仓库的交互，包括推送和拉取
3. **冲突处理**：智能处理代码冲突，提供冲突解决建议
4. **提交消息**：自动生成更有意义的提交消息，基于代码变更内容
5. **标签管理**：支持 Git 标签的创建和管理
6. **历史分析**：提供代码变更历史的分析和可视化
7. **钩子集成**：支持 Git 钩子的配置和执行
8. **权限管理**：集成 Git 权限管理，控制代码访问
9. **CI/CD 集成**：与 CI/CD 系统集成，自动触发构建和部署
10. **代码审查**：支持代码审查流程，集成代码审查工具

## 输入输出示例

### 输入：应用变更

```javascript
const changes = [
  {
    "type": "edit",
    "file": "src/utils.js",
    "search": "",
    "replace": "// 工具函数\n\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nmodule.exports = { fibonacci };"
  }
];

const result = await gitManager.safeApplyPatch(workspaceDir, changes, fsTools);
```

### 输出：应用结果

```javascript
{
  "ok": true,
  "appliedFiles": ["src/utils.js"],
  "error": null
}
```

### 输入：提交变更

```javascript
const commitResult = await gitManager.commitCheckpoint(workspaceDir, {
  taskId: "task-001",
  subtaskId: "s1"
});
```

### 输出：提交结果

```javascript
"abc123def4567890"
```

### 输入：回滚变更

```javascript
await gitManager.rollback(workspaceDir, "def456abc123");
```

### 输出：无返回值（成功执行）