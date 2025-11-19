#!/usr/bin/env bun
/**
 * LangChain Integration Smoke Tests for Azure OpenAI
 * Tests all major features with your Azure configuration
 */

import { LangChainProvider, LangChainMemory, LangChainAdapters, WorkflowTemplates, ResumableWorkflow } from "./src/langchain"
import { Log } from "./src/util/log"

const log = Log.create({ service: "test-azure" })

// Configuration from environment
const AZURE_CONFIG = {
  provider: "azure-openai",
  model: process.env.AZURE_OPENAI_DEPLOYMENT_CHAT || "gpt-5-mini",
  temperature: 0.7,
  maxTokens: 1000,
}

// Mock session for testing
const mockSession = {
  id: "test-session-" + Date.now(),
  directory: process.cwd(),
  worktree: process.cwd(),
} as any

// Test results tracking
const results: Array<{ test: string; passed: boolean; duration: number; error?: string }> = []

async function runTest(name: string, fn: () => Promise<void>): Promise<boolean> {
  const start = Date.now()
  try {
    log.info(`\n🧪 TEST: ${name}`)
    await fn()
    const duration = Date.now() - start
    log.info(`✅ PASSED (${duration}ms)`)
    results.push({ test: name, passed: true, duration })
    return true
  } catch (error) {
    const duration = Date.now() - start
    const errorMsg = error instanceof Error ? error.message : String(error)
    log.error(`❌ FAILED: ${errorMsg}`)
    results.push({ test: name, passed: false, duration, error: errorMsg })
    return false
  }
}

// Test 1: Provider Creation
async function testProviderCreation() {
  log.info("Creating Azure OpenAI model...")
  const model = await LangChainProvider.createChatModel(AZURE_CONFIG)
  if (!model) throw new Error("Model creation returned null")
  log.info("Model created successfully:", model.constructor.name)
}

// Test 2: Connection Test
async function testConnection() {
  log.info("Testing Azure OpenAI connection...")
  const model = await LangChainProvider.createChatModel(AZURE_CONFIG, { maxTokens: 50 })

  const response = await model.invoke([
    { role: "user", content: "Say 'test successful' if you can read this." } as any,
  ])

  const content = String(response.content)
  log.info("Response received:", content.substring(0, 100))

  if (!content) throw new Error("No response content")
}

// Test 3: Message Conversion
async function testMessageConversion() {
  log.info("Testing message format conversion...")

  const messages = [
    { role: "system", content: "You are a helpful assistant" },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" },
  ]

  const converted = LangChainProvider.convertToLangChainMessages(messages)
  if (converted.length !== 3) throw new Error(`Expected 3 messages, got ${converted.length}`)

  const backConverted = LangChainProvider.convertFromLangChainMessages(converted)
  if (backConverted.length !== 3) throw new Error("Conversion mismatch")

  log.info("Message conversion working correctly")
}

// Test 4: Memory Manager
async function testMemoryManager() {
  log.info("Testing memory manager...")

  const memoryManager = new LangChainMemory.SessionMemoryManager(50)
  const memory = await memoryManager.getMemory("test-session-memory")

  // Add messages
  await memoryManager.saveMessages("test-session-memory", [
    { role: "user", content: "Test message 1", _getType: () => "human" } as any,
    { role: "assistant", content: "Test response 1", _getType: () => "ai" } as any,
  ])

  const history = await memoryManager.getHistory("test-session-memory")
  if (history.length !== 2) throw new Error(`Expected 2 messages in history, got ${history.length}`)

  log.info(`Memory manager working, stored ${history.length} messages`)
}

// Test 5: RAG System
async function testRAGSystem() {
  log.info("Testing RAG system...")

  const rag = new LangChainMemory.RAGSystem()
  const vectorManager = rag.getVectorManager()

  // Index test documents
  await vectorManager.indexDocuments("test-rag-context", [
    {
      content: "Azure OpenAI provides enterprise-grade AI capabilities with Microsoft Azure infrastructure",
      metadata: { topic: "azure", source: "docs" }
    },
    {
      content: "LangChain is a framework for developing applications powered by language models",
      metadata: { topic: "langchain", source: "docs" }
    },
    {
      content: "TypeScript is a strongly typed programming language that builds on JavaScript",
      metadata: { topic: "typescript", source: "docs" }
    },
  ])

  log.info("✅ Documents indexed successfully")

  // Test search
  const results = await vectorManager.similaritySearch("test-rag-context", "What is Azure OpenAI?", 2)
  log.info(`✅ Search returned ${results.length} results`)

  if (results.length === 0) throw new Error("No search results returned")
}

// Test 6: Tool Adapters
async function testToolAdapters() {
  log.info("Testing tool adapters...")

  // Test common tools
  const tools = LangChainAdapters.CommonToolAdapters.getAll(mockSession)
  if (tools.length === 0) throw new Error("No tools created")

  log.info(`✅ Created ${tools.length} common tools:`)
  tools.forEach(tool => log.info(`   - ${tool.name}: ${tool.description}`))

  // Test tool suite
  const suite = LangChainAdapters.createToolSuite(mockSession, {
    includeCommonTools: true,
    toolFilter: (name) => !name.startsWith("_"),
  })

  log.info(`✅ Tool suite created with ${suite.length} tools`)
}

// Test 7: Workflow Templates
async function testWorkflowTemplates() {
  log.info("Testing workflow templates...")

  const workflows = WorkflowTemplates.listWorkflows()
  if (workflows.length === 0) throw new Error("No workflows found")

  log.info(`✅ Found ${workflows.length} workflow templates:`)
  workflows.forEach(w => log.info(`   - ${w.name}: ${w.description}`))

  // Test creating a workflow
  const qualityWorkflow = WorkflowTemplates.createCodeQualityWorkflow(mockSession)
  if (!qualityWorkflow) throw new Error("Failed to create workflow")

  log.info(`✅ Successfully created code quality workflow`)
}

// Test 8: Resumable Workflow State
async function testResumableWorkflow() {
  log.info("Testing resumable workflow state management...")

  const stateManager = ResumableWorkflow.getStateManager()

  // Save test state
  const testState: ResumableWorkflow.WorkflowState = {
    workflowType: "agent",
    currentStep: 2,
    totalSteps: 5,
    completed: ["step1", "step2"],
    pending: ["step3", "step4", "step5"],
    context: { testData: "test" },
    results: [{ step: 1 }, { step: 2 }],
    task: "Test task",
    timestamp: Date.now(),
  }

  stateManager.save("test-workflow-session", testState)

  // Load state
  const loaded = stateManager.load("test-workflow-session")
  if (!loaded) throw new Error("Failed to load state")
  if (loaded.currentStep !== 2) throw new Error("State mismatch")

  log.info(`✅ State saved and loaded correctly (step ${loaded.currentStep}/${loaded.totalSteps})`)

  // Test serialization
  const serialized = stateManager.serialize("test-workflow-session")
  if (!serialized) throw new Error("Serialization failed")

  stateManager.deserialize("test-workflow-session-2", serialized)
  const deserialized = stateManager.load("test-workflow-session-2")
  if (!deserialized) throw new Error("Deserialization failed")

  log.info(`✅ State serialization/deserialization working`)
}

// Test 9: Azure OpenAI with LangChain Tools
async function testAzureWithTools() {
  log.info("Testing Azure OpenAI with LangChain tools...")

  const model = await LangChainProvider.createChatModel(AZURE_CONFIG, { maxTokens: 100 })
  const tools = LangChainAdapters.CommonToolAdapters.getAll(mockSession).slice(0, 2) // Just use 2 tools for testing

  log.info(`✅ Created model with ${tools.length} tools`)

  // Test model with tools (binding)
  const modelWithTools = model.bind({ tools: tools.map(t => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {},
    },
  })) })

  log.info(`✅ Successfully bound tools to model`)
}

// Test 10: End-to-End Integration
async function testEndToEndIntegration() {
  log.info("Testing end-to-end integration with Azure OpenAI...")

  // 1. Create model
  const model = await LangChainProvider.createChatModel(AZURE_CONFIG, { maxTokens: 150 })

  // 2. Setup memory
  const memoryManager = new LangChainMemory.SessionMemoryManager()
  await memoryManager.saveMessages("e2e-test", [
    { role: "system", content: "You are a helpful coding assistant", _getType: () => "system" } as any,
  ])

  // 3. Get tools
  const tools = LangChainAdapters.CommonToolAdapters.getAll(mockSession)

  // 4. Test simple interaction
  const response = await model.invoke([
    { role: "user", content: "List 3 benefits of using TypeScript" } as any,
  ])

  const content = String(response.content)
  if (!content || content.length < 10) throw new Error("Insufficient response")

  log.info("✅ End-to-end test successful")
  log.info(`Response preview: ${content.substring(0, 100)}...`)
}

// Main test runner
async function runAllTests() {
  log.info("=" .repeat(70))
  log.info("🚀 LANGCHAIN INTEGRATION SMOKE TESTS - AZURE OPENAI")
  log.info("=" .repeat(70))
  log.info(`\nConfiguration:`)
  log.info(`  Provider: ${AZURE_CONFIG.provider}`)
  log.info(`  Deployment: ${AZURE_CONFIG.model}`)
  log.info(`  Endpoint: ${process.env.AZURE_OPENAI_ENDPOINT}`)
  log.info(`  API Version: ${process.env.AZURE_OPENAI_API_VERSION}`)
  log.info("=" .repeat(70))

  // Run all tests
  await runTest("1. Provider Creation", testProviderCreation)
  await runTest("2. Connection Test", testConnection)
  await runTest("3. Message Conversion", testMessageConversion)
  await runTest("4. Memory Manager", testMemoryManager)
  await runTest("5. RAG System", testRAGSystem)
  await runTest("6. Tool Adapters", testToolAdapters)
  await runTest("7. Workflow Templates", testWorkflowTemplates)
  await runTest("8. Resumable Workflow", testResumableWorkflow)
  await runTest("9. Azure with Tools", testAzureWithTools)
  await runTest("10. End-to-End Integration", testEndToEndIntegration)

  // Print results
  log.info("\n" + "=".repeat(70))
  log.info("📊 TEST RESULTS")
  log.info("=".repeat(70))

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

  results.forEach(r => {
    const status = r.passed ? "✅ PASS" : "❌ FAIL"
    const duration = `${r.duration}ms`
    log.info(`${status.padEnd(10)} ${r.test.padEnd(45)} ${duration}`)
    if (r.error) {
      log.info(`           Error: ${r.error}`)
    }
  })

  log.info("=".repeat(70))
  log.info(`Total: ${results.length} tests`)
  log.info(`Passed: ${passed} ✅`)
  log.info(`Failed: ${failed} ❌`)
  log.info(`Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`)
  log.info("=".repeat(70))

  if (failed === 0) {
    log.info("\n🎉 ALL TESTS PASSED!")
    process.exit(0)
  } else {
    log.error(`\n⚠️  ${failed} TEST(S) FAILED`)
    process.exit(1)
  }
}

// Run tests
runAllTests().catch((error) => {
  log.error("Fatal error running tests:", error)
  process.exit(1)
})
