# 迭代 5 分析：难度评估与上下文管理

## 问题 1：难度评估的隐患

### 当前实现

难度评估由两个函数组成：
- `analyzeDifficulty(instruction)` — 基于关键词的快速分类（low/medium/high）
- `evaluateComplexity(instruction, contextStat, thresholds)` — 多因子评分（0-100 分）

评分因子：
1. `likelyPathCount` — 从指令文本提取的路径数量（权重最高可达 45 分）
2. `keywordHits` — 硬编码关键词命中（high 类 15 分/个，medium 类 8 分/个）
3. `existingLikelyFilesLineSum` — 已有文件的总行数
4. `text.length > 240` — 指令长度（5 分）

### 隐患分析

#### 隐患 1：关键词列表可被轻易绕过

```js
// 当前 highKeywords
["refactor", "migrate", "migration", "architecture", "module", "tests", "test", "ci", "pipeline"]
```

一条指令 `"rewrite the authentication logic"` 不含任何 highKeywords，会被判为 `low`。但认证逻辑重构通常涉及 middleware、routes、可能还有 schema 变更，真实难度是 high。

反过来，`"add tests for login"` 命中 `test` 被判 high，但仅加一个测试用例实际是 low。

#### 隐患 2：likelyPathCount 提取不验证文件存在性

```js
function extractLikelyPaths(instruction) {
  // 从文本中用正则提取路径片段
  // 完全没有验证这些文件是否在 workspace 中存在
}
```

如果用户说 "update backend/routes/admin.js"，但该文件不存在，分数仍然会被加进去。

#### 隐患 3：import graph 解析对现代 JS 语法脆弱

```js
const importRe = /\bimport\s+[^;]*?\s+from\s+["']([^"']+)["']/g;
const requireRe = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
```

- 动态 import：`import(\`./${module}\`)` 不匹配
- 路径别名：`import from '@/utils/helper'` 不解析
- 重新导出：`export { foo } from './bar'` 不匹配
- TS 类型导入：`import type { Foo } from './bar'` 可能误匹配

导致 `expandRelatedFiles` 扩展不完整，上下文遗漏相关文件。

#### 隐患 4：instruction length 分数无意义

`text.length > 240 ? +5 : 0` 这条规则完全反映不了复杂度，长指令可能是简洁的需求描述，短指令可能是复杂的多文件重构。

#### 隐患 5：replan 时依赖静态分数

replan 逻辑中使用的是原始 difficulty score，没有根据实际执行失败情况动态调整。

### 改进方向

**方案 A（轻量）：提示词校准**
在 `decomposeTask` 调用时，让 LLM 先输出一段简短的难度判断（作为 JSON schema 的一部分），用模型自己的语义理解替代静态规则。

**方案 B（中等）：任务前置扫描**
在任务开始前快速扫描 workspace：
1. 验证 likelyPaths 中的文件是否真实存在
2. 计算实际需要修改的代码规模（而非全文行数）
3. 用扫描结果校准分数

**方案 C（重量）：引入 embedding**
见问题 2。

---

## 问题 2：上下文管理的机械性

### 当前实现

`expandRelatedFiles` 基于**反向 import 图**扩展：

```js
function expandRelatedFiles({ seedFiles, reverseEdges, depth = 1, maxFiles = 20 }) {
  // reverseEdges[file] = 所有依赖了 file 的文件列表
  // 只沿 reverseEdges 扩展（找依赖方/父模块）
}
```

关键问题：**单向扩展 + 深度受限**。

### 隐患分析

#### 隐患 1：只扩展"父模块"，不扩展"子模块/工具"

如果 seed 是业务逻辑文件（如 `backend/routes/auth.js`），`reverseEdges` 能找到"谁用了 auth.js"（父模块），但找不到 auth.js **依赖的**工具模块（如 `backend/middleware/auth.js`）。

工具模块往往包含关键逻辑，遗漏会导致上下文不完整。

#### 隐患 2：depth=1 只覆盖直接父模块

```
seed: auth.js
depth=1 → 只找到直接依赖 auth.js 的文件
depth=0 → 只返回 seed 本身
```

如果依赖链是 `auth.js → middleware/auth.js → utils/jwt.js → utils/logger.js`，depth=1 只能到 middleware，远端工具模块被遗漏。

#### 隐患 3：greedy token 填充没有语义排序

```js
// optimizeContext 中
for (const f of likely) { if (!tryAdd(f.block)) break; }
for (const f of other) { if (!tryAdd(f.block)) break; }
```

优先放 likely files，超量后按顺序截断（不是语义重要性排序）。如果 likely files 都很大，可能把所有 low-priority 文件填满 token budget。

#### 隐患 4：import graph 解析覆盖率低

（同问题 1 中的隐患 3）

### 向量嵌入方案评估

#### 优点

1. **语义相关性**：能找到"功能相关但无 import 关系"的文件（如 `auth.js` 和 `jwt.js` 无直接 import 但语义强相关）
2. **语义排序**：按相似度排序，比 greedy fill 更合理
3. **跨语言/跨框架**：不受 import 语法限制

#### 缺点

1. **计算开销**：每次任务需对整个代码库 embedding（除非做增量索引）
2. **延迟**：Ollama 的 embedding 模型（如 nomic-embed-text）延迟不低
3. **基础设施**：需要维护向量数据库（如 Qdrant、Chroma）或至少一个持久化的 index 文件
4. **workspace 大小**：当前 workspace 约 30+ 文件，中小规模项目 import graph 已经能覆盖 80%+ 的情况，embedding 边际收益有限

#### 折中方案（推荐先行）

在引入 embedding 之前，先做两个低成本的改进：

1. **双向 import 图扩展**：同时使用 `edges`（正向）和 `reverseEdges`（反向），既找父模块也找子模块
2. **import graph 解析改进**：增加对动态 import、export from、TS 语法的支持

这两项改进无需引入新依赖，覆盖率可显著提升。

---

## 优先级建议

| 改进 | 成本 | 收益 | 推荐度 |
|------|------|------|--------|
| 双向 import 图扩展 | 低 | 高 | ★★★★★ |
| import graph 解析改进 | 低 | 高 | ★★★★★ |
| likelyPaths 文件存在性校验 | 低 | 中 | ★★★★ |
| LLM 难度校准（方案 A） | 低 | 高 | ★★★★ |
| 向量嵌入（需评估 workspace 规模后决定） | 高 | 高 | ★★★ |
