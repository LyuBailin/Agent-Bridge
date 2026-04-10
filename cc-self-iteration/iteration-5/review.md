# 迭代 5 审查报告

## 审查背景

本次迭代由人工审查驱动，未经历任务执行失败。用户在代码审查过程中主动识别出两个系统性问题：难度评估逻辑和上下文管理机制。

## 发现的问题

### 高优先级

#### 问题 1：难度评估关键词列表可被轻易绕过
- 文件：`src/core/planner.js:52-83`
- 函数：`analyzeDifficulty`, `keywordHits`
- 问题：硬编码关键词（英文 + 中文），覆盖范围有限。`"rewrite auth"` 这类不含关键词的复杂指令会被误判为 low；`"add tests"` 这种简单指令反而被判为 high
- 根因：基于规则匹配而非语义理解
- 建议：引入 LLM 自判断或前置扫描验证

#### 问题 2：likelyPathCount 不验证文件存在性
- 文件：`src/core/planner.js:11-46`
- 函数：`extractLikelyPaths`
- 问题：只从文本中提取路径片段，完全不验证 workspace 中是否存在
- 根因：提取逻辑与文件系统状态脱节
- 建议：在评分前增加文件存在性校验

#### 问题 3：expandRelatedFiles 只用 reverseEdges，单向扩展
- 文件：`src/utils/fs_tools.js:229-255`
- 函数：`expandRelatedFiles`
- 问题：只沿 `reverseEdges`（依赖方/父模块）扩展，遗漏子模块/工具模块
- 根因：`expandRelatedFiles` 只接收 `reverseEdges`，从未使用 `edges`
- 建议：增加双向扩展选项，同时使用 `edges` 和 `reverseEdges`

### 中优先级

#### 问题 4：import graph 解析对现代 JS 语法脆弱
- 文件：`src/utils/fs_tools.js:168-169`
- 正则：`importRe`, `requireRe`
- 问题：动态 import、export from、路径别名、TS 类型导入均无法正确解析
- 根因：正则表达式无法覆盖 ESM/TS 语法多样性
- 建议：增强正则或引入 babel-parser 进行 AST 解析（成本较高），先用改进的正则覆盖常见场景

#### 问题 5：optimizeContext greedy token 填充无语义排序
- 文件：`src/core/planner.js:205-249`
- 函数：`optimizeContext`
- 问题：优先放 likely files，超量后按顺序截断，不考虑语义重要性
- 根因：缺乏语义相似性度量
- 建议：先改进为按文件依赖链深度排序，再考虑 embedding 方案

#### 问题 6：replan 时难度分数未动态校准
- 文件：`src/core/planner.js:697-797`
- 函数：`replanFromFailure`
- 问题：replan 调用 `decomposeTask` 时传入的是原始静态分数，无视执行失败的实际复杂度
- 根因：难度评估是一次性的，未形成反馈闭环
- 建议：在 replan 时传入失败上下文，让 LLM 重新评估

## 总体评估

| 维度 | 状态 |
|------|------|
| 正确性 | 存在误判风险（关键词绕过、路径不验证） |
| 完整性 | 上下文扩展单向，遗漏子模块 |
| 健壮性 | import 解析覆盖率低 |
| 可维护性 | 规则分散在多个函数中，修改需跨文件 |

## 建议优先级

1. **立即修复**（低风险高收益）：问题 3（双向扩展）、问题 4（import 解析改进）
2. **短期改进**（中风险中收益）：问题 1（LLM 校准）、问题 2（存在性校验）
3. **长期规划**（高风险高收益）：问题 6（动态校准）、问题 5（语义排序）
