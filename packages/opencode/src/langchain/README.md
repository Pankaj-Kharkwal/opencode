# LangChain & LangGraph Integration for OpenCode

Modern AI agent orchestration with LangChain and LangGraph, providing advanced tool channeling, workflow management, and seamless MCP integration.

## 📚 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Modules](#core-modules)
- [Configuration](#configuration)
- [Examples](#examples)
- [API Reference](#api-reference)

## 🎯 Overview

This integration brings the power of LangChain and LangGraph to OpenCode, enabling:

- **Provider Abstraction**: Unified interface for Anthropic, OpenAI, and other LLM providers
- **Tool Orchestration**: Advanced tool dependency management and execution strategies
- **Workflow Management**: State-based workflows with LangGraph for complex multi-step tasks
- **MCP Bridge**: Seamless integration between Model Context Protocol and LangChain
- **Tool Channeling**: Intelligent routing, transformation, and composition of tools

## ✨ Features

### 1. LangChain Provider Adapter

Convert OpenCode's AI provider system to LangChain's model interfaces:

```typescript
import { LangChainProvider } from "@/langchain"

// Create a chat model from OpenCode configuration
const modelConfig = await LangChainProvider.getCurrentModelConfig()
const chatModel = await LangChainProvider.createChatModel(modelConfig)

// Use with custom options
const model = await LangChainProvider.createChatModel(
  {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
  },
  {
    temperature: 0.7,
    maxTokens: 4096,
    streaming: true,
  },
)
```

### 2. Tool Orchestration

Execute tools with dependencies, retries, and advanced orchestration:

```typescript
import { LangChainTools } from "@/langchain"

const orchestrator = new LangChainTools.ToolOrchestrator({
  parallelExecution: true,
  retryOnFailure: true,
  maxRetries: 3,
  timeout: 30000,
  dependencies: {
    fix_issues: [{ toolName: "analyze_code" }],
    run_tests: [{ toolName: "fix_issues" }],
  },
})

const results = await orchestrator.executeWithDependencies(tools, inputs)
```

### 3. LangGraph Workflows

State-based workflows for complex agent tasks:

```typescript
import { LangGraph } from "@/langchain"

// Agent workflow with automatic planning and execution
const workflow = new LangGraph.AgentWorkflow(chatModel, tools, session)
const result = await workflow.execute("Add error handling to authentication", {
  projectContext: "Node.js API",
})

// Code review workflow
const reviewWorkflow = new LangGraph.CodeReviewWorkflow(chatModel)
const review = await reviewWorkflow.execute(codeToReview)
```

### 4. MCP-LangChain Bridge

Convert MCP tools to LangChain tools automatically:

```typescript
import { MCPLangChainBridge } from "@/langchain"

const mcpManager = new MCPLangChainBridge.MCPServerManager()

// Register MCP servers
await mcpManager.registerServer("filesystem", mcpClient)

// Get all tools from all MCP servers
const allTools = mcpManager.getAllTools()

// Create MCP-aware agent
const { tools } = await MCPLangChainBridge.createMCPAgent(mcpManager, additionalTools)
```

### 5. Tool Channeling

Advanced tool routing, pipelines, and composition:

```typescript
import { ToolChannel } from "@/langchain"

// Create a pipeline
const pipeline = new ToolChannel.Pipeline("quality_pipeline", [
  { tool: lintTool },
  { tool: formatTool, transform: (input, prev) => ({ code: prev[0].code }) },
  { tool: verifyTool },
])

const result = await pipeline.execute({ code: sourceCode })

// Create a router
const router = new ToolChannel.Router({
  name: "task_router",
  routes: [{ condition: (input) => input.type === "code", channel: "code_channel", priority: 10 }],
  defaultChannel: "general_channel",
})

// Compose tools
const composer = new ToolChannel.Composer()
const composedTool = composer.compose({
  name: "etl_pipeline",
  strategy: "sequential",
  tools: [{ name: "fetch" }, { name: "transform" }, { name: "save" }],
})
```

## 📦 Installation

Dependencies are already included in `package.json`:

```json
{
  "@langchain/core": "0.3.29",
  "@langchain/community": "0.3.25",
  "@langchain/anthropic": "0.3.10",
  "@langchain/openai": "0.3.15",
  "langchain": "0.3.9",
  "langgraph": "0.2.31",
  "@langchain/langgraph": "0.2.31"
}
```

Install dependencies:

```bash
bun install
```

## 🚀 Quick Start

### Basic Usage

```typescript
import { LangChainProvider, LangChainTools, LangGraph } from "@/langchain"

// 1. Create a model
const model = await LangChainProvider.createChatModel({
  provider: "anthropic",
  model: "claude-sonnet-4-5",
})

// 2. Convert OpenCode tools to LangChain
const lcTools = LangChainTools.convertAllTools(opencodeTools, session)

// 3. Create and execute a workflow
const workflow = new LangGraph.AgentWorkflow(model, lcTools, session)
const result = await workflow.execute("Refactor the API module")
```

### With MCP Integration

```typescript
import { MCPLangChainBridge } from "@/langchain"

// Initialize MCP manager
const mcpManager = new MCPLangChainBridge.MCPServerManager()

// Register your MCP servers
await mcpManager.registerServer("filesystem", fsClient)
await mcpManager.registerServer("database", dbClient)

// Get all tools (MCP + OpenCode)
const allTools = [...mcpManager.getAllTools(), ...LangChainTools.convertAllTools(opencodeTools, session)]

// Use in workflow
const workflow = new LangGraph.AgentWorkflow(model, allTools, session)
```

## 🏗️ Core Modules

### Provider (`provider.ts`)

Converts OpenCode's multi-provider system to LangChain models.

- `createChatModel()` - Create LangChain chat model
- `getCurrentModelConfig()` - Get config from OpenCode
- `convertToLangChainMessages()` - Message format conversion
- `testConnection()` - Test provider connection

### Tools (`tools.ts`)

Tool conversion and orchestration.

- `convertToLangChainTool()` - Convert single tool
- `convertAllTools()` - Convert all OpenCode tools
- `ToolOrchestrator` - Execute with dependencies
- `createToolPipeline()` - Sequential execution

### Graph (`graph.ts`)

LangGraph workflows and state management.

- `AgentWorkflow` - Multi-step agent tasks
- `CodeReviewWorkflow` - Code review automation
- `MultiAgentWorkflow` - Multi-agent collaboration
- `WorkflowState` - State management

### MCP Bridge (`mcp-bridge.ts`)

MCP-LangChain integration.

- `MCPServerManager` - Manage MCP servers
- `convertMCPToolToLangChain()` - Convert MCP tools
- `MCPResourceConverter` - Convert MCP resources
- `MCPLangChainSync` - Bidirectional sync

### Channel (`channel.ts`)

Tool routing and composition.

- `Channel` - Data transformation channels
- `Pipeline` - Sequential tool execution
- `Router` - Conditional routing
- `Composer` - Tool composition
- `createFanOutFanIn()` - Parallel execution pattern

## ⚙️ Configuration

Create an `opencode.jsonc` file:

```jsonc
{
  "langchain": {
    "workflow": {
      "enabled": true,
      "defaultStrategy": "sequential",
      "retryConfig": {
        "enabled": true,
        "maxAttempts": 3,
        "delay": 1000,
        "backoff": "exponential",
      },
      "timeout": 30000,
    },
    "flow": {
      "enabled": true,
      "flows": {
        "code_review": {
          "description": "Automated code review",
          "type": "code_review",
          "model": "anthropic/claude-sonnet-4-5",
        },
      },
    },
    "mcpBridge": {
      "enabled": true,
      "autoRegisterServers": true,
      "serverPrefixInToolName": true,
      "refreshInterval": 0,
    },
    "channel": {
      "enabled": true,
      "pipelines": {
        "quality": {
          "description": "Code quality pipeline",
          "steps": [{ "tool": "lint" }, { "tool": "format" }, { "tool": "test" }],
        },
      },
    },
    "logging": {
      "enabled": true,
      "level": "info",
      "verbose": false,
    },
  },
}
```

## 📖 Examples

See `examples.ts` for complete examples:

1. **Basic Provider** - Simple LangChain model usage
2. **Tool Conversion** - Convert OpenCode tools
3. **Tool Orchestration** - Dependency management
4. **Agent Workflow** - Complex multi-step tasks
5. **MCP Bridge** - MCP integration
6. **Tool Pipeline** - Sequential execution
7. **Tool Router** - Conditional routing
8. **Tool Composer** - Tool composition
9. **Code Review** - Automated code review
10. **Fan-out/Fan-in** - Parallel execution

Run examples:

```typescript
import { LangChainExamples } from "@/langchain/examples"

await LangChainExamples.basicProviderExample()
await LangChainExamples.toolOrchestrationExample()
await LangChainExamples.agentWorkflowExample(session)
```

## 🔧 API Reference

### LangChainProvider

```typescript
interface ProviderConfig {
  provider: string
  model: string
  temperature?: number
  maxTokens?: number
  streaming?: boolean
  apiKey?: string
  baseURL?: string
}

createChatModel(config: ProviderConfig, options?: ModelOptions): Promise<BaseChatModel>
getCurrentModelConfig(): Promise<ProviderConfig>
convertToLangChainMessages(messages: any[]): BaseMessage[]
convertFromLangChainMessages(messages: BaseMessage[]): any[]
testConnection(config: ProviderConfig): Promise<boolean>
```

### LangChainTools

```typescript
interface ToolOrchestrationConfig {
  parallelExecution?: boolean
  retryOnFailure?: boolean
  maxRetries?: number
  timeout?: number
  dependencies?: Record<string, ToolDependency[]>
}

class ToolOrchestrator {
  constructor(config: ToolOrchestrationConfig)
  executeWithDependencies(tools: Map<string, Tool>, inputs: Map<string, any>): Promise<Map<string, any>>
  validateDependencies(tools: Set<string>): boolean
}
```

### LangGraph

```typescript
class AgentWorkflow {
  constructor(model: BaseChatModel, tools: DynamicStructuredTool[], session: Session.Type)
  execute(task: string, initialContext?: Record<string, any>): Promise<WorkflowStateType>
  compile(): CompiledStateGraph
}

class CodeReviewWorkflow {
  constructor(model: BaseChatModel)
  execute(code: string): Promise<WorkflowStateType>
}

class MultiAgentWorkflow {
  constructor(agents: Map<string, BaseChatModel>)
  compile(): CompiledStateGraph
}
```

### MCPLangChainBridge

```typescript
class MCPServerManager {
  registerServer(serverName: string, client: Client): Promise<void>
  getAllTools(): DynamicStructuredTool[]
  getToolsFromServer(serverName: string): DynamicStructuredTool[]
  unregisterServer(serverName: string): Promise<void>
  refreshTools(serverName: string): Promise<void>
}
```

### ToolChannel

```typescript
class Pipeline {
  constructor(name: string, steps: PipelineStep[])
  execute(initialInput: any): Promise<any>
  toTool(): DynamicStructuredTool
}

class Router {
  constructor(config: RouterConfig)
  register(name: string, channelOrPipeline: Channel | Pipeline): this
  route(input: any): Promise<any>
  toTool(): DynamicStructuredTool
}

class Composer {
  registerTool(tool: DynamicStructuredTool): this
  compose(config: CompositeToolConfig): DynamicStructuredTool
}
```

## 🤝 Integration Points

### With OpenCode Agent System

```typescript
// Use in custom agents
export const agent = {
  name: "langchain-powered",
  async execute(input: string, session: Session.Type) {
    const model = await LangChainProvider.createChatModel(...)
    const workflow = new LangGraph.AgentWorkflow(model, tools, session)
    return await workflow.execute(input)
  }
}
```

### With MCP Servers

```typescript
// Automatically integrate with configured MCP servers
const mcpManager = new MCPLangChainBridge.MCPServerManager()

for (const [name, client] of mcpServers) {
  await mcpManager.registerServer(name, client)
}
```

## 📝 Best Practices

1. **Use workflow orchestration** for complex multi-step tasks
2. **Leverage tool dependencies** to ensure proper execution order
3. **Enable retry logic** for resilient tool execution
4. **Use channels** for data transformation between tools
5. **Compose tools** for reusable workflow patterns
6. **Register MCP servers** to extend capabilities
7. **Configure timeouts** appropriate for your tasks
8. **Monitor logs** with appropriate verbosity

## 🐛 Troubleshooting

### Tools not executing

- Check tool dependencies are registered
- Verify input schema matches
- Enable verbose logging

### MCP tools not available

- Ensure MCP servers are running
- Check `autoRegisterServers` is enabled
- Refresh tools with `refreshTools()`

### Workflow timeouts

- Increase `timeout` in configuration
- Use parallel execution where possible
- Add retry logic to individual steps

## 📄 License

Part of OpenCode - see main project license.

## 🔗 Links

- [LangChain Docs](https://js.langchain.com/)
- [LangGraph Docs](https://langchain-ai.github.io/langgraphjs/)
- [OpenCode Docs](https://opencode.ai/docs)
- [MCP Specification](https://modelcontextprotocol.io/)
