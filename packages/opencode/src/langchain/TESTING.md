# Testing LangChain/LangGraph Integration Locally

## Prerequisites

1. **Install dependencies**:
   ```bash
   cd /home/user/opencode
   bun install
   ```

2. **Set up API keys** (in `.env` or environment):
   ```bash
   export ANTHROPIC_API_KEY="your-key-here"
   export OPENAI_API_KEY="your-key-here"  # Optional
   ```

3. **Build the project**:
   ```bash
   cd packages/opencode
   bun run build
   ```

## Testing Methods

### Method 1: Unit Tests (Recommended First)

Create test files to verify individual components:

```bash
# Create test file
touch packages/opencode/test/langchain/provider.test.ts
```

**Example Test**:
```typescript
import { describe, test, expect } from "bun:test"
import { LangChainProvider } from "@/langchain"

describe("LangChain Provider", () => {
  test("should create chat model", async () => {
    const model = await LangChainProvider.createChatModel({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
    })

    expect(model).toBeDefined()
  })

  test("should convert messages", () => {
    const messages = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ]

    const converted = LangChainProvider.convertToLangChainMessages(messages)
    expect(converted).toHaveLength(2)
  })
})
```

**Run tests**:
```bash
cd packages/opencode
bun test test/langchain/
```

### Method 2: Interactive REPL Testing

```bash
cd packages/opencode
bun repl
```

Then in the REPL:

```typescript
// Import modules
const { LangChainProvider, LangGraph, LangChainMemory } = await import("./src/langchain/index.ts")

// Test 1: Provider
const model = await LangChainProvider.createChatModel({
  provider: "anthropic",
  model: "claude-sonnet-4-5",
})
console.log("Model created:", model)

// Test 2: Test connection
const connected = await LangChainProvider.testConnection({
  provider: "anthropic",
  model: "claude-sonnet-4-5",
})
console.log("Connection test:", connected)

// Test 3: Memory manager
const memory = new LangChainMemory.SessionMemoryManager(100)
console.log("Memory manager created")

// Test 4: RAG system
const rag = new LangChainMemory.RAGSystem()
console.log("RAG system initialized")
```

### Method 3: Integration Testing via OpenCode CLI

1. **Configure OpenCode** (create/edit `.opencode/opencode.jsonc`):
   ```jsonc
   {
     "langchain": {
       "workflow": {
         "enabled": true,
         "defaultStrategy": "sequential",
         "retryConfig": {
           "enabled": true,
           "maxAttempts": 3
         }
       },
       "flow": {
         "enabled": true
       },
       "mcpBridge": {
         "enabled": true,
         "autoRegisterServers": true
       },
       "logging": {
         "enabled": true,
         "level": "debug",
         "verbose": true
       }
     }
   }
   ```

2. **Test via OpenCode session**:
   ```bash
   cd /home/user/opencode
   packages/opencode/bin/opencode
   ```

   In OpenCode, try:
   ```
   > Use the langchain-workflow agent to analyze the README.md file
   ```

3. **Test specific agents**:
   ```
   > Use the code-reviewer agent to review src/langchain/provider.ts

   > Use the rag-assistant to find all imports in this project
   ```

### Method 4: Programmatic Testing

Create a test script:

```bash
touch packages/opencode/test-langchain.ts
```

**Content**:
```typescript
import { LangChainProvider, LangGraph, LangChainMemory, WorkflowTemplates } from "./src/langchain"
import { Log } from "./src/util/log"

const log = Log.create({ service: "test-langchain" })

async function testProvider() {
  log.info("Testing LangChain Provider...")

  try {
    const model = await LangChainProvider.createChatModel({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
    })

    log.info("✅ Model created successfully")

    const response = await model.invoke([
      { role: "user", content: "Say 'test successful' if you can read this" },
    ])

    log.info("✅ Model response:", response.content)
    return true
  } catch (error) {
    log.error("❌ Provider test failed:", error)
    return false
  }
}

async function testMemory() {
  log.info("Testing Memory Manager...")

  try {
    const memoryManager = new LangChainMemory.SessionMemoryManager(50)
    const memory = await memoryManager.getMemory("test-session")

    log.info("✅ Memory manager working")

    await memory.chatHistory.addMessage({
      content: "Test message",
      _getType: () => "human",
    } as any)

    const history = await memoryManager.getHistory("test-session")
    log.info("✅ Memory history:", history.length, "messages")
    return true
  } catch (error) {
    log.error("❌ Memory test failed:", error)
    return false
  }
}

async function testRAG() {
  log.info("Testing RAG System...")

  try {
    const rag = new LangChainMemory.RAGSystem()
    const vectorManager = rag.getVectorManager()

    // Index some test documents
    await vectorManager.indexDocuments("test-context", [
      { content: "LangChain is a framework for building LLM applications", metadata: { topic: "langchain" } },
      { content: "OpenCode is an AI coding agent", metadata: { topic: "opencode" } },
      { content: "TypeScript is a typed superset of JavaScript", metadata: { topic: "typescript" } },
    ])

    log.info("✅ Documents indexed")

    // Search
    const results = await vectorManager.similaritySearch("test-context", "What is LangChain?", 2)
    log.info("✅ Search results:", results.length)

    return true
  } catch (error) {
    log.error("❌ RAG test failed:", error)
    return false
  }
}

async function testWorkflows() {
  log.info("Testing Workflow Templates...")

  try {
    const workflows = WorkflowTemplates.listWorkflows()
    log.info("✅ Available workflows:", workflows.length)

    workflows.forEach(w => {
      log.info(`  - ${w.name}: ${w.description}`)
    })

    return true
  } catch (error) {
    log.error("❌ Workflow test failed:", error)
    return false
  }
}

async function runAllTests() {
  log.info("=== Starting LangChain Integration Tests ===\n")

  const tests = [
    { name: "Provider", fn: testProvider },
    { name: "Memory", fn: testMemory },
    { name: "RAG", fn: testRAG },
    { name: "Workflows", fn: testWorkflows },
  ]

  const results: Record<string, boolean> = {}

  for (const test of tests) {
    log.info(`\n--- Testing ${test.name} ---`)
    results[test.name] = await test.fn()
  }

  log.info("\n=== Test Results ===")
  for (const [name, passed] of Object.entries(results)) {
    log.info(`${passed ? "✅" : "❌"} ${name}`)
  }

  const allPassed = Object.values(results).every(r => r)
  log.info(`\n${allPassed ? "✅ All tests passed!" : "❌ Some tests failed"}`)

  process.exit(allPassed ? 0 : 1)
}

runAllTests()
```

**Run it**:
```bash
bun run packages/opencode/test-langchain.ts
```

### Method 5: Testing with Mock Session

```typescript
// Create a mock session for testing
const mockSession = {
  id: "test-session-123",
  directory: process.cwd(),
  // ... other session properties
}

// Test tool adapters
import { LangChainAdapters } from "@/langchain"

const adapter = new LangChainAdapters.ToolAdapter(mockSession as any)
const bashTool = LangChainAdapters.CommonToolAdapters.bash(mockSession as any)

console.log("Bash tool:", bashTool.name, bashTool.description)
```

### Method 6: Testing MCP Bridge

If you have MCP servers configured:

```typescript
import { MCPLangChainBridge } from "@/langchain"

const mcpManager = new MCPLangChainBridge.MCPServerManager()

// Register your MCP servers
// await mcpManager.registerServer("myserver", mcpClient)

// Get tools
const tools = mcpManager.getAllTools()
console.log("MCP tools:", tools.length)
```

## Quick Tests Checklist

- [ ] **Provider**: Can create models for Anthropic/OpenAI
- [ ] **Tools**: Can convert OpenCode tools to LangChain
- [ ] **Memory**: Can create and use session memory
- [ ] **RAG**: Can index and search documents
- [ ] **Workflows**: Can list and execute predefined workflows
- [ ] **Agents**: Can use new agent definitions
- [ ] **Resumable**: Can save and restore workflow state
- [ ] **MCP Bridge**: Can convert MCP tools (if MCP servers available)

## Debugging Tips

### Enable Verbose Logging

```jsonc
{
  "langchain": {
    "logging": {
      "enabled": true,
      "level": "debug",
      "verbose": true
    }
  }
}
```

### Check Module Imports

```bash
# Verify all modules can be imported
bun run -e 'import("./packages/opencode/src/langchain/index.ts").then(console.log)'
```

### TypeScript Compilation

```bash
cd packages/opencode
bun run typecheck
```

### Common Issues

1. **API Key Missing**:
   ```
   Error: Anthropic API key not found
   ```
   Solution: Set `ANTHROPIC_API_KEY` environment variable

2. **Module Not Found**:
   ```
   Cannot find module '@/langchain'
   ```
   Solution: Build the project first with `bun run build`

3. **Type Errors**:
   Solution: Run `bun run typecheck` to see TypeScript errors

## Performance Testing

```typescript
async function benchmarkWorkflow() {
  const start = Date.now()

  // Run workflow
  const result = await workflow.execute(task)

  const duration = Date.now() - start
  console.log(`Workflow completed in ${duration}ms`)
  console.log(`Steps: ${result.results.length}`)
  console.log(`Avg per step: ${duration / result.results.length}ms`)
}
```

## Testing in Production-like Environment

1. **Use real session**:
   ```bash
   opencode --session-id test-langchain
   ```

2. **Test with actual code files**:
   ```
   > Use the rag-assistant to index all TypeScript files in src/
   > Use the code-reviewer to review src/langchain/provider.ts
   ```

3. **Test resumable workflows**:
   ```
   > Use the langchain-workflow agent to refactor src/index.ts
   # Interrupt with Ctrl+C
   > Resume the previous workflow (use session_id)
   ```

## CI/CD Testing

Add to your CI pipeline:

```yaml
# .github/workflows/test-langchain.yml
name: Test LangChain Integration

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test test/langchain/
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Manual Verification Checklist

After running tests, manually verify:

- [ ] LangChain models can be created
- [ ] Messages can be converted between formats
- [ ] Tools can be adapted from OpenCode to LangChain
- [ ] Memory manager can store and retrieve history
- [ ] RAG system can index and search documents
- [ ] Workflows execute successfully
- [ ] Agents appear in OpenCode's agent list
- [ ] Resumable workflows can be paused and resumed
- [ ] MCP tools are converted (if MCP servers available)
- [ ] No TypeScript errors
- [ ] No runtime errors in logs

## Next Steps After Testing

1. Create additional test cases for edge cases
2. Add integration tests with real OpenCode sessions
3. Test with different LLM providers
4. Benchmark performance with large codebases
5. Test concurrent workflow execution
6. Validate memory usage with long sessions

## Support

If tests fail:
1. Check the logs in `~/.opencode/logs/`
2. Enable verbose logging
3. Verify API keys are set correctly
4. Ensure dependencies are installed
5. Check TypeScript compilation

For questions or issues, see ENHANCEMENTS.md for detailed documentation.
