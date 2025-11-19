#!/usr/bin/env bun
/**
 * Azure AI Projects Usage Examples
 *
 * This demonstrates how to use the azure-ai-projects provider
 * with LangChain integration in OpenCode
 */

// Example 1: Basic Usage
async function basicExample() {
  console.log("=== Example 1: Basic Azure AI Projects Chat ===\n")

  const { LangChainProvider } = await import("./src/langchain/provider")

  // Create the model
  const model = await LangChainProvider.createChatModel({
    provider: "azure-ai-projects",
    model: "gpt-4o",
    temperature: 0.7,
  })

  // Send a message
  const response = await model.invoke([
    { role: "user", content: "Explain Azure AI Projects in one sentence" }
  ])

  console.log("Response:", response.content)
  console.log()
}

// Example 2: With System Message
async function systemMessageExample() {
  console.log("=== Example 2: With System Message ===\n")

  const { LangChainProvider } = await import("./src/langchain/provider")
  const { SystemMessage, HumanMessage } = await import("@langchain/core/messages")

  const model = await LangChainProvider.createChatModel({
    provider: "azure-ai-projects",
    model: "gpt-4o",
  })

  const messages = [
    new SystemMessage("You are a TypeScript expert who gives concise answers."),
    new HumanMessage("What is a Promise?"),
  ]

  const response = await model.invoke(messages)
  console.log("Response:", response.content)
  console.log()
}

// Example 3: With Memory
async function memoryExample() {
  console.log("=== Example 3: With Conversation Memory ===\n")

  const { LangChainProvider } = await import("./src/langchain/provider")
  const { LangChainMemory } = await import("./src/langchain/memory")

  const model = await LangChainProvider.createChatModel({
    provider: "azure-ai-projects",
    model: "gpt-4o",
  })

  const memory = new LangChainMemory.SessionMemoryManager()
  const sessionId = "example-session"

  // First message
  await memory.saveMessages(sessionId, [
    { role: "user", content: "My name is Alice", _getType: () => "human" }
  ])

  // Get history and add new message
  const history = await memory.getHistory(sessionId)
  history.push({ role: "user", content: "What's my name?" } as any)

  const response = await model.invoke(history)
  console.log("Response:", response.content)
  console.log()
}

// Example 4: With Streaming
async function streamingExample() {
  console.log("=== Example 4: Streaming Response ===\n")

  const { LangChainProvider } = await import("./src/langchain/provider")

  const model = await LangChainProvider.createChatModel({
    provider: "azure-ai-projects",
    model: "gpt-4o",
    streaming: true,
  })

  const stream = await model.stream([
    { role: "user", content: "Count from 1 to 5" }
  ])

  process.stdout.write("Response: ")
  for await (const chunk of stream) {
    process.stdout.write(chunk.content)
  }
  console.log("\n")
}

// Example 5: With Custom Endpoint
async function customEndpointExample() {
  console.log("=== Example 5: Custom Endpoint ===\n")

  const { LangChainProvider } = await import("./src/langchain/provider")

  const model = await LangChainProvider.createChatModel({
    provider: "azure-ai-projects",
    model: "gpt-4o",
    baseURL: "https://ai-pkharkwal1994-2750.services.ai.azure.com/api/projects/ai-pkharkwal1994-2750-project",
    temperature: 0.5,
    maxTokens: 200,
  })

  const response = await model.invoke([
    { role: "user", content: "Hello Azure!" }
  ])

  console.log("Response:", response.content)
  console.log()
}

// Example 6: Integration with LangGraph Workflow
async function workflowExample() {
  console.log("=== Example 6: With LangGraph Workflow ===\n")

  const { LangChainProvider } = await import("./src/langchain/provider")
  const { LangGraph } = await import("./src/langchain/graph")

  const model = await LangChainProvider.createChatModel({
    provider: "azure-ai-projects",
    model: "gpt-4o",
  })

  // Create a simple workflow
  const workflow = new LangGraph.AgentWorkflow(model, [])
  const result = await workflow.execute("Analyze the performance of bubble sort")

  console.log("Workflow completed!")
  console.log("Final result:", result.results?.[0] || "No result")
  console.log()
}

// Main execution
async function main() {
  console.log("╔" + "═".repeat(68) + "╗")
  console.log("║" + " ".repeat(15) + "Azure AI Projects Usage Examples" + " ".repeat(20) + "║")
  console.log("╚" + "═".repeat(68) + "╝")
  console.log()

  console.log("Environment:")
  console.log(`  Endpoint: ${process.env.AZURE_AI_PROJECT_ENDPOINT || 'NOT SET'}`)
  console.log(`  Model: ${process.env.AZURE_AI_DEPLOYMENT || 'gpt-4o (default)'}`)
  console.log(`  Client ID: ${process.env.AZURE_CLIENT_ID ? '✓' : '✗'}`)
  console.log()

  // Check if dependencies are installed
  try {
    await import("@azure/identity")
    console.log("✅ Azure dependencies installed\n")
  } catch (error) {
    console.log("❌ Azure dependencies not installed")
    console.log("   Run: bun install\n")
    return
  }

  try {
    // Run examples one by one
    await basicExample()
    await systemMessageExample()
    await memoryExample()
    // Uncomment to test streaming and workflows
    // await streamingExample()
    // await customEndpointExample()
    // await workflowExample()

    console.log("✅ All examples completed successfully!")
  } catch (error) {
    console.error("❌ Error running examples:", error)
  }
}

// Check if running as main module
if (import.meta.main) {
  main()
}
