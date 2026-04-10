# Agent Bridge 项目概述

## 项目定位

Agent Bridge 是一个智能化的代码生成与执行系统，旨在实现从自然语言指令到代码生成、应用和反馈的完整流程。该项目基于多种大语言模型（LLM），通过智能任务分解、代码生成、Git 版本控制和语义验证，提供了一个端到端的代码自动化解决方案。

## 核心功能

### 1. 多模型适配
- **Ollama**：本地运行的开源模型，如 qwen-2.5-coder:14b
- **OpenAI**：通过 API 调用的商业模型，如 qwen3.5-flash
- **Claude**：通过 CLI 接口集成的 Claude 模型，用于高复杂度任务

### 2. 智能任务管理
- **任务分解**：将复杂任务自动分解为可执行的子任务 DAG（有向无环图）
- **难度评估**：基于指令内容、文件数量和代码复杂度自动评估任务难度
- **上下文优化**：根据任务难度动态调整上下文内容，优化 token 使用

### 3. 代码生成与应用
- **结构化输出**：使用 ```sr```（内容编辑）和 ```op```（文件操作）代码块
- **安全路径验证**：确保所有文件操作都在工作区范围内
- **Git 集成**：自动创建 checkpoint、应用变更、提交和回滚

### 4. 验证与反馈
- **语法验证**：使用 node --check 验证 JavaScript 文件
- **语义验证**：使用 Claude 进行深度语义审查
- **错误处理**：自动捕获和处理执行过程中的错误，提供详细的反馈信息

## 技术架构

### 目录结构

```
├── .claude/               # Claude 配置
│   └── settings.local.json
├── bridge/                # 核心功能模块
│   └── memory.json        # 任务记忆
├── docs/                  # 文档目录
│   ├── working/           # 工作文档
│   │   ├── ANALYSIS.md
│   │   ├── CODE_ORGANIZATION_REVIEW.md
│   │   ├── IMPROVEMENT_PLAN_v1.md
│   │   ├── IMPROVEMENT_PLAN_v2.md
│   │   ├── QUERY_LOOP_PLAN.md
│   │   ├── TASK_FAILURE_ANALYSIS.md
│   │   └── TOOL_GOVERNANCE_PLAN.md
│   ├── adapter-module.md
│   ├── fs-tools-module.md
│   ├── git-manager-module.md
│   ├── main-module.md
│   ├── planner-module.md
│   └── verifier-module.md
├── src/                   # 源代码目录
│   ├── core/              # 核心模块
│   │   ├── adapter/       # 模型适配器
│   │   │   ├── providers/ # 模型提供商
│   │   │   │   ├── claude_cli.js
│   │   │   │   ├── ollama.js
│   │   │   │   └── openai.js
│   │   │   ├── hooks.js
│   │   │   ├── index.js
│   │   │   ├── parser.js
│   │   │   ├── schema.js
│   │   │   ├── tool_factory.js
│   │   │   └── validator.js
│   │   ├── adapter.js
│   │   ├── claude.log
│   │   ├── git_manager.js
│   │   ├── index.js
│   │   ├── main.js
│   │   ├── main_debug.js
│   │   ├── main_index.js
│   │   ├── main_index_debug.js
│   │   ├── planner.js
│   │   ├── polling.js
│   │   ├── query_loop.js
│   │   ├── risk_classifier.js
│   │   ├── synthetic_results.js
│   │   ├── verifier.js
│   │   └── workflow.js
│   ├── prompt/            # 提示模板
│   │   ├── feedback.js
│   │   ├── identity.js
│   │   ├── index.js
│   │   ├── operation_guidelines.js
│   │   ├── output_discipline.js
│   │   ├── plan.js
│   │   └── system_rules.js
│   ├── shared/            # 共享工具
│   │   ├── path.js
│   │   └── time.js
│   └── utils/             # 实用工具
│       ├── fs_tools.js
│       ├── simulation.js
│       └── snippet_feedback.js
├── tasks/                 # 任务目录
│   ├── raw/               # 原始任务文件
│   ├── .gitkeep
│   ├── result.json        # 任务结果
│   └── task.json          # 任务定义
├── test/                  # 测试目录
│   ├── scripts/           # 测试脚本
│   │   ├── debug_correction.js
│   │   └── test_claude_connectivity.js
│   ├── adapter.test.js
│   ├── e2e.test.js
│   ├── git_manager.test.js
│   ├── planner.test.js
│   ├── snippet_feedback.test.js
│   ├── test_openai_connectivity.js
│   └── verifier.test.js
├── workspace/             # 工作区目录
│   ├── app.js
│   └── package.json
├── .agent.md
├── .env                   # 环境变量
├── .gitignore
├── CLAUDE.md
├── DifficultTask.txt
├── EXECUTION_TRACE_GUIDE.md
├── PROJECT_OVERVIEW.md    # 项目概述
├── bridge.log             # 桥接日志
├── claude.log             # Claude 日志
├── config.json            # 配置文件
├── ollama.log             # Ollama 日志
└── package.json           # 项目配置
```

### 核心模块说明

#### 1. 主流程（src/core/main.js）
- **环境初始化**：加载配置、创建目录结构、初始化 Git 仓库
- **任务轮询**：通过 polling.js 定期检查任务状态，执行队列中的任务
- **工作流执行**：协调各模块完成任务的整个生命周期
- **错误处理**：捕获和记录执行过程中的错误
- **查询循环**：通过 query_loop.js 处理复杂的多轮查询任务

#### 2. 模型适配器（src/core/adapter/）
- **多模型支持**：实现 Ollama、OpenAI 和 Claude 的统一接口
- **操作类型检测**：自动识别任务所需的操作类型（内容编辑或文件操作）
- **响应解析**：通过 parser.js 解析模型输出的代码块，转换为可执行的操作
- **模式验证**：通过 validator.js 确保模型输出符合指定的操作模式
- **工具工厂**：通过 tool_factory.js 动态生成工具调用

#### 3. 任务规划器（src/core/planner.js）
- **难度评估**：基于指令和上下文评估任务复杂度
- **任务分解**：将高复杂度任务分解为可管理的子任务
- **计划执行**：按依赖关系执行子任务
- **失败重规划**：当子任务失败时，重新规划剩余工作
- **风险分类**：通过 risk_classifier.js 评估任务风险级别

#### 4. 验证器（src/core/verifier.js）
- **语法验证**：检查 JavaScript 和 JSON 文件的语法正确性
- **语义验证**：使用 Claude 进行深度语义审查
- **变更安全**：验证文件删除、重命名等操作的安全性

#### 5. Git 管理器（src/core/git_manager.js）
- **仓库管理**：初始化和配置 Git 仓库
- **变更应用**：安全应用代码变更
- **版本控制**：创建 checkpoint、提交和回滚
- **变更验证**：验证变更的安全性和完整性

#### 6. 文件系统工具（src/utils/fs_tools.js）
- **路径安全**：确保所有文件操作都在工作区范围内
- **上下文收集**：收集项目文件和结构作为模型输入
- **导入图提取**：分析文件间的依赖关系
- **相关文件扩展**：基于依赖关系扩展相关文件集

#### 7. 提示系统（src/prompt/）
- **系统规则**：定义系统行为和约束
- **操作指南**：提供操作类型和格式的指导
- **输出规范**：确保模型输出符合预期格式
- **计划模板**：用于任务分解和规划的提示模板
- **反馈模板**：生成任务执行反馈的模板

#### 8. 工作流管理（src/core/workflow.js）
- **任务生命周期管理**：处理任务从创建到完成的整个过程
- **状态管理**：跟踪任务执行状态和进度
- **异常处理**：处理执行过程中的异常情况
- **结果生成**：生成任务执行结果和报告

## 工作流程

1. **任务初始化**：用户创建任务定义文件（task.json），设置任务 ID 和指令
2. **环境准备**：系统加载配置，初始化工作区和 Git 仓库
3. **任务评估**：系统评估任务难度和风险级别，确定使用的模型和策略
4. **任务分解**：对于高复杂度任务，分解为子任务 DAG（有向无环图）
5. **上下文收集**：收集相关文件和依赖关系作为模型输入
6. **代码生成**：根据子任务指令和上下文生成代码
7. **变更应用**：安全应用代码变更到工作区
8. **验证**：执行语法和语义验证，确保代码正确性
9. **提交**：创建 Git 提交，记录变更
10. **反馈**：生成任务执行结果和详细反馈
11. **查询循环**：对于复杂任务，进入多轮查询循环，逐步完善解决方案

## 技术亮点

1. **多模型协同**：根据任务难度和风险级别自动选择合适的模型，实现资源的最优分配
2. **智能任务分解**：将复杂任务分解为可管理的子任务 DAG，提高执行成功率
3. **上下文优化**：根据任务难度和相关文件动态调整上下文，优化模型输入和 token 使用
4. **安全保障**：多重验证机制确保代码变更的安全性和正确性
5. **Git 集成**：完整的版本控制支持，确保变更可追溯和可回滚
6. **错误处理**：详细的错误捕获和反馈机制，提高系统的鲁棒性
7. **提示工程**：结构化的提示模板系统，提高模型输出的一致性和质量
8. **查询循环**：多轮查询机制，逐步完善复杂任务的解决方案
9. **风险评估**：内置风险分类器，评估任务风险级别并采取相应措施
10. **模块化设计**：清晰的模块化架构，便于扩展和维护

## 配置说明

项目通过 `config.json` 文件进行配置，主要配置项包括：

- **路径配置**：工作区、任务和日志的路径
- **模型配置**：Ollama、OpenAI 和 Claude 的参数设置
- **路由策略**：基于难度和风险级别的模型选择阈值
- **上下文限制**：文件大小和数量限制
- **Git 配置**：默认分支和用户信息
- **轮询设置**：任务轮询的间隔和超时设置
- **风险评估**：风险分类的阈值和策略

此外，项目还使用 `.env` 文件存储环境变量，如 API 密钥等敏感信息。

## 使用方法

1. **配置环境**：编辑 `config.json` 文件，设置模型参数和路径；编辑 `.env` 文件，设置 API 密钥等环境变量
2. **创建任务**：在 `tasks/task.json` 文件中定义任务，设置任务 ID 和指令
3. **启动系统**：运行 `npm start` 启动任务轮询
4. **监控执行**：查看日志文件（bridge.log、claude.log、ollama.log）和 Git 提交记录
5. **查看结果**：检查 `tasks/result.json` 文件获取执行结果
6. **调试模式**：运行 `npm run debug` 启动调试模式，获得更详细的执行信息

## 测试

项目包含完整的测试套件，位于 `test/` 目录，包括：

- **单元测试**：测试各个模块的功能，如 adapter.test.js、git_manager.test.js 等
- **集成测试**：测试模块间的交互
- **端到端测试**：测试完整的工作流程，如 e2e.test.js
- **连接性测试**：测试与外部服务的连接，如 test_openai_connectivity.js、test_claude_connectivity.js
- **调试脚本**：用于调试和问题排查的脚本，位于 test/scripts/ 目录

## 未来展望

1. **模型扩展**：支持更多的 LLM 模型和提供商，如 Anthropic Claude 3、Google Gemini 等
2. **功能增强**：添加更多的代码分析和优化功能，如代码质量检查、性能分析等
3. **用户界面**：开发 Web 界面，提高用户体验，支持可视化任务管理和监控
4. **插件系统**：支持自定义插件，扩展系统功能，如特定领域的代码生成和分析
5. **性能优化**：提高系统的执行速度和资源利用效率，如并行处理、缓存机制等
6. **多语言支持**：扩展支持更多编程语言，如 Python、Java、C++ 等
7. **协作功能**：支持多用户协作，如任务分配、代码审查等
8. **知识库集成**：集成企业知识库，提高代码生成的准确性和相关性
9. **自动化部署**：支持自动部署生成的代码到测试和生产环境
10. **安全性增强**：加强代码安全检查，防止恶意代码注入和安全漏洞

## 技术栈

- **Node.js**：运行环境
- **Git**：版本控制
- **LLM API**：Ollama、OpenAI、Claude
- **JavaScript**：主要开发语言
- **JSON**：配置和数据交换格式
- **文件系统**：用于文件操作和管理
- **环境变量**：用于存储敏感信息
- **日志系统**：用于记录执行过程和错误信息

## 总结

Agent Bridge 是一个功能完整、架构清晰的代码自动化系统，通过集成多种 LLM 模型和开发工具，实现了从自然语言指令到代码执行的端到端流程。该项目展示了如何利用 AI 技术提高软件开发效率，为未来的智能开发工具奠定了基础。