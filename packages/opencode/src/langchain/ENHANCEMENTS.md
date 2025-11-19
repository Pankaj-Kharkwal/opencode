# LangChain/LangGraph Enhancements

## New Features Added

### 1. Session Processor Integration (`processor.ts`)

Seamless integration with OpenCode's session processor for streaming LangChain responses:

```typescript
import { LangChainProcessor } from "@/langchain"

// Stream workflow execution
for await (const event of LangChainProcessor.streamWorkflowExecution(workflow, task)) {
  console.log(event.type, event.content)
}

// Batch process tasks
const results = await LangChainProcessor.batchProcess(workflow, tasks, {
  parallel: true,
  maxConcurrency: 3,
})

// Checkpoint management
const checkpoint = new LangChainProcessor.WorkflowCheckpoint(sessionID)
checkpoint.save("step1", state)
await checkpoint.resume(workflow, "step1", task)
```

### 2. Memory & RAG Capabilities (`memory.ts`)

Complete memory management and retrieval-augmented generation:

```typescript
import { LangChainMemory } from "@/langchain"

// Session memory
const memoryManager = new LangChainMemory.SessionMemoryManager()
await memoryManager.loadSessionMessages(sessionID)
const history = await memoryManager.getHistory(sessionID)

// Vector store for RAG
const vectorManager = new LangChainMemory.VectorStoreManager()
await vectorManager.indexCodeFiles(contextID, codeFiles)
const results = await vectorManager.similaritySearch(contextID, query)

// Complete RAG system
const rag = new LangChainMemory.RAGSystem()
const context = await rag.retrieveContext(contextID, query)
const prompt = await rag.buildRAGPrompt(contextID, query, systemPrompt)

// RAG-enhanced session
const { rag, query, getHistory } = await LangChainMemory.createRAGSession({
  sessionID,
  documents: [...],
  codeFiles: [...],
})
```

### 3. Tool Adapters (`adapters.ts`)

Universal adapters for all OpenCode tools:

```typescript
import { LangChainAdapters } from "@/langchain"

// Universal adapter
const adapter = new LangChainAdapters.ToolAdapter(session)
adapter.register("bash", bashTool)
adapter.register("read", readTool)
const langchainTools = adapter.createAllTools()

// Prebuilt common tools
const tools = LangChainAdapters.CommonToolAdapters.getAll(session)

// Complete tool suite
const suite = LangChainAdapters.createToolSuite(session, {
  includeCommonTools: true,
  customTools: [...],
  toolFilter: (name) => !name.startsWith("_"),
})

// Resilient execution
const wrapper = new LangChainAdapters.ResilientToolWrapper(tool, {
  maxRetries: 3,
  retryDelay: 1000,
})
await wrapper.execute(input)

// Batch execution
const executor = new LangChainAdapters.BatchToolExecutor(toolsMap)
await executor.executeParallel(calls)
await executor.executeSequential(calls)
```

### 4. Resumable Workflows (`resumable.ts`)

Pause and resume LangChain workflows via task tool:

```typescript
import { ResumableWorkflow } from "@/langchain"

// Create resumable workflow
const { workflow, execute, pause, getState } = await ResumableWorkflow.createResumableWorkflow({
  sessionID,
  task,
  workflowType: "agent",
  session,
  resumeFromSessionID: "previous_session_id", // Optional
})

// Execute
const result = await execute()

// Or pause
pause()

// Resume later
const result = await ResumableWorkflow.resumeWorkflow(sessionID, session)

// List all resumable workflows
const workflows = ResumableWorkflow.listResumableWorkflows()

// Checkpoint-based execution
const checkpointWorkflow = new ResumableWorkflow.CheckpointWorkflow(workflow, sessionID)
await checkpointWorkflow.execute(task, ["analyze", "plan", "execute"])
await checkpointWorkflow.resumeFrom("plan", task, ["execute", "validate"])

// Integration with task tool
const tool = ResumableWorkflow.createResumableTaskTool(session)
```

### 5. Predefined Workflow Templates (`workflows.ts`)

Ready-to-use workflows for common development tasks:

```typescript
import { WorkflowTemplates } from "@/langchain"

// Code Quality: Lint → Format → Type Check → Test
const qualityPipeline = WorkflowTemplates.createCodeQualityWorkflow(session)
await qualityPipeline.execute({ files: ["src/**/*.ts"] })

// Feature Implementation: Research → Plan → Implement → Test → Document
const featurePipeline = WorkflowTemplates.createFeatureWorkflow(session)

// Bug Fix: Reproduce → Debug → Fix → Verify → Prevent
const bugFixPipeline = WorkflowTemplates.createBugFixWorkflow(session)

// Refactoring: Analyze → Extract → Simplify → Optimize → Validate
const refactorPipeline = WorkflowTemplates.createRefactoringWorkflow(session)

// API Development: Design → Implement → Document → Test
const apiPipeline = WorkflowTemplates.createAPIWorkflow(session)

// Database Migration: Backup → Migrate → Verify → Rollback
const migrationPipeline = WorkflowTemplates.createMigrationWorkflow(session)

// Get workflow by name
const workflow = WorkflowTemplates.getWorkflow("code_quality", session)

// List all workflows
const available = WorkflowTemplates.listWorkflows()
```

### 6. Agent Definitions

Three new LangChain-powered agents in `.opencode/agent/`:

#### `langchain-workflow.md`
Multi-step planning and execution with dependency management, retry logic, and state management.

```bash
# Usage via task tool
"Use the langchain-workflow subagent to refactor the authentication module"
```

#### `code-reviewer.md`
Comprehensive code review analyzing:
- Code style & best practices
- Security vulnerabilities (OWASP Top 10)
- Performance optimization opportunities
- Functional correctness

```bash
# Usage
"Use the code-reviewer subagent to review src/api/auth.ts"
```

#### `rag-assistant.md`
RAG-powered assistant with semantic search and context retrieval:
- Vector-based similarity search
- Hybrid keyword + semantic search
- Codebase understanding
- Evidence-based answers with citations

```bash
# Usage
"Use the rag-assistant to explain how authentication works in this codebase"
```

## Integration Points

### With Task Tool
```typescript
// Task tool now supports resumable workflows
{
  description: "Implement feature",
  prompt: "Add user authentication",
  subagent_type: "langchain-workflow",
  session_id: "session_123" // Resume from previous session
}
```

### With Session Processor
```typescript
// Stream workflow progress to session
const processor = SessionProcessor.create(...)
const workflowProcessor = await LangChainProcessor.createWorkflowProcessor(workflow, task)
await processor.process(workflowProcessor)
```

### With MCP Servers
```typescript
// Automatically convert all MCP tools to LangChain
const mcpManager = new MCPLangChainBridge.MCPServerManager()
await mcpManager.registerServer("filesystem", fsClient)
const allTools = mcpManager.getAllTools() // Ready for LangChain workflows
```

## Configuration Examples

### Enable Resumable Workflows
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
        "backoff": "exponential"
      }
    }
  }
}
```

### Configure Memory & RAG
```jsonc
{
  "langchain": {
    "memory": {
      "maxMessages": 100,
      "chunkSize": 1000,
      "chunkOverlap": 200
    },
    "rag": {
      "enabled": true,
      "maxResults": 5,
      "scoreThreshold": 0.7
    }
  }
}
```

### Enable MCP Bridge
```jsonc
{
  "langchain": {
    "mcpBridge": {
      "enabled": true,
      "autoRegisterServers": true,
      "serverPrefixInToolName": true
    }
  }
}
```

## Usage Examples

### Complete Feature Implementation
```typescript
import { LangChainProvider, LangGraph, WorkflowTemplates, LangChainMemory } from "@/langchain"

// 1. Create RAG session for context
const { rag } = await LangChainMemory.createRAGSession({
  sessionID,
  codeFiles: await loadCodeFiles(),
})

// 2. Retrieve relevant context
const context = await rag.retrieveContext(sessionID, "authentication patterns")

// 3. Create workflow
const model = await LangChainProvider.createChatModel({ provider: "anthropic", model: "claude-sonnet-4-5" })
const tools = LangChainAdapters.createToolSuite(session)
const workflow = new LangGraph.AgentWorkflow(model, tools, session)

// 4. Execute with context
const result = await workflow.execute("Implement OAuth2 authentication", { context })

// 5. Review the implementation
const reviewer = new LangGraph.CodeReviewWorkflow(model)
const review = await reviewer.execute(result.context.implementedCode)
```

### Resumable Multi-Session Workflow
```typescript
import { ResumableWorkflow } from "@/langchain"

// Start workflow
const { workflow, execute, pause } = await ResumableWorkflow.createResumableWorkflow({
  sessionID: "session_1",
  task: "Refactor entire auth module",
  workflowType: "agent",
  session,
})

// Execute first part
setTimeout(() => pause(), 30000) // Pause after 30s
await execute()

// Resume later (maybe next day)
const result = await ResumableWorkflow.resumeWorkflow("session_1", session)
```

### Batch Code Review
```typescript
import { LangChainProcessor } from "@/langchain"

const filesToReview = ["src/api/*.ts"]
const reviewWorkflow = new LangGraph.CodeReviewWorkflow(model)

const results = await LangChainProcessor.batchProcess(
  reviewWorkflow,
  filesToReview,
  {
    parallel: true,
    maxConcurrency: 5,
    onProgress: (completed, total) => {
      console.log(`Reviewed ${completed}/${total} files`)
    },
  }
)
```

## Testing

All new features include:
- Type safety with TypeScript
- Comprehensive error handling
- Logging for debugging
- Retry logic for resilience
- State management for resumability

## Migration Guide

Existing LangChain integrations continue to work. New features are opt-in:

1. **Update imports**:
   ```typescript
   // Before
   import { LangChainProvider } from "@/langchain"

   // After (add new modules as needed)
   import { LangChainProvider, LangChainMemory, ResumableWorkflow } from "@/langchain"
   ```

2. **Enable in config** (optional):
   Add `langchain` section to `opencode.jsonc`

3. **Use new agents** (optional):
   Reference new subagents: `langchain-workflow`, `code-reviewer`, `rag-assistant`

## Performance Considerations

- **Memory**: Vector stores kept in memory by default (consider persistence for production)
- **Concurrency**: Batch operations support configurable concurrency limits
- **Checkpoints**: Automatic state management with minimal overhead
- **Retries**: Exponential backoff prevents overload during failures

## Future Enhancements

- Persistent vector stores (Redis, Pinecone, etc.)
- Streaming for all workflows
- Multi-agent collaboration graphs
- Custom workflow DSL
- Performance analytics
- Workflow visualization

## Support

For issues or questions:
- Check the main README.md for API reference
- See examples.ts for comprehensive usage examples
- Review agent definitions in `.opencode/agent/`
- Enable verbose logging: `langchain.logging.verbose: true`
