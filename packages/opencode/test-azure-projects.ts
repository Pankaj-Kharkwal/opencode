#!/usr/bin/env bun
/**
 * Azure AI Projects Integration Test
 * Tests LangChain integration with Azure AI Projects using gpt-4o
 */

console.log("=".repeat(70))
console.log("🚀 AZURE AI PROJECTS - LANGCHAIN INTEGRATION TEST")
console.log("=".repeat(70))

// Check environment variables
console.log("\n📋 Checking Azure AI Projects Configuration...")
const requiredEnvVars = ["AZURE_AI_PROJECT_ENDPOINT"]

const optionalEnvVars = ["AZURE_AI_DEPLOYMENT", "AZURE_AI_API_VERSION"]

let configOk = true
for (const envVar of requiredEnvVars) {
  const value = process.env[envVar]
  if (value) {
    console.log(`✅ ${envVar}: ${value}`)
  } else {
    console.log(`❌ ${envVar}: NOT SET`)
    configOk = false
  }
}

for (const envVar of optionalEnvVars) {
  const value = process.env[envVar]
  if (value) {
    console.log(`✅ ${envVar}: ${value}`)
  } else {
    console.log(`⚠️  ${envVar}: NOT SET (using default)`)
  }
}

if (!configOk) {
  console.error("\n❌ Missing required environment variables!")
  console.error("\nRequired configuration:")
  console.error("  AZURE_AI_PROJECT_ENDPOINT - Your Azure AI Projects endpoint")
  console.error(
    "    Example: https://ai-pkharkwal1994-2750.services.ai.azure.com/api/projects/ai-pkharkwal1994-2750-project",
  )
  console.error("\nOptional configuration:")
  console.error("  AZURE_AI_DEPLOYMENT - Model deployment name (default: gpt-4o)")
  console.error("  AZURE_AI_API_VERSION - API version (default: 2024-08-01-preview)")
  console.error("\nAuthentication:")
  console.error("  Uses DefaultAzureCredential - ensure you are logged in with:")
  console.error("  az login")
  process.exit(1)
}

console.log("\n✅ All required configuration variables are set!")

// Test 1: Check Azure authentication
console.log("\n🧪 TEST 1: Checking Azure authentication...")
try {
  const { DefaultAzureCredential } = await import("@azure/identity")
  const credential = new DefaultAzureCredential()

  console.log("✅ DefaultAzureCredential created")

  // Try to get a token
  const tokenResponse = await credential.getToken("https://cognitiveservices.azure.com/.default")

  if (tokenResponse?.token) {
    console.log("✅ Successfully obtained Azure access token")
    console.log(`   Token expires at: ${new Date(tokenResponse.expiresOnTimestamp)}`)
  } else {
    throw new Error("No token received")
  }
} catch (error) {
  console.error("❌ Azure authentication failed:", error)
  console.error("\nPlease ensure you are logged in to Azure:")
  console.error("  az login")
  process.exit(1)
}

// Test 2: Import LangChain provider
console.log("\n🧪 TEST 2: Importing LangChain provider...")
try {
  const { LangChainProvider } = await import("./src/langchain/provider")
  console.log("✅ LangChain provider imported successfully")
} catch (error) {
  console.error("❌ Failed to import LangChain provider:", error)
  process.exit(1)
}

// Test 3: Create Azure AI Projects model
console.log("\n🧪 TEST 3: Creating Azure AI Projects model...")
try {
  const { LangChainProvider } = await import("./src/langchain/provider")

  const model = await LangChainProvider.createChatModel({
    provider: "azure-ai-projects",
    model: process.env.AZURE_AI_DEPLOYMENT || "gpt-4o",
    temperature: 0.7,
  })

  console.log("✅ Azure AI Projects model created successfully")
  console.log(`   Model type: ${model.constructor.name}`)
} catch (error) {
  console.error("❌ Model creation failed:", error)
  process.exit(1)
}

// Test 4: Test simple completion
console.log("\n🧪 TEST 4: Testing simple completion with gpt-4o...")
try {
  const { LangChainProvider } = await import("./src/langchain/provider")

  const model = await LangChainProvider.createChatModel({
    provider: "azure-ai-projects",
    model: process.env.AZURE_AI_DEPLOYMENT || "gpt-4o",
    temperature: 0.7,
    maxTokens: 100,
  })

  const response = await model.invoke([
    { role: "user", content: "Say 'Azure AI Projects integration successful!' if you can read this." } as any,
  ])

  const content = String(response.content)
  console.log("✅ Completion successful!")
  console.log(`   Response: ${content}`)
} catch (error) {
  console.error("❌ Completion failed:", error)
  process.exit(1)
}

// Test 5: Test conversation with system message
console.log("\n🧪 TEST 5: Testing conversation with system message...")
try {
  const { LangChainProvider } = await import("./src/langchain/provider")
  const { HumanMessage, SystemMessage } = await import("@langchain/core/messages")

  const model = await LangChainProvider.createChatModel({
    provider: "azure-ai-projects",
    model: process.env.AZURE_AI_DEPLOYMENT || "gpt-4o",
    temperature: 0.7,
    maxTokens: 150,
  })

  const messages = [
    new SystemMessage("You are a helpful coding assistant specialized in TypeScript and AI integrations."),
    new HumanMessage("What is Azure AI Projects? Answer in one sentence."),
  ]

  const response = await model.invoke(messages)
  console.log("✅ Conversation test successful!")
  console.log(`   Response: ${String(response.content)}`)
} catch (error) {
  console.error("❌ Conversation test failed:", error)
  process.exit(1)
}

// Test 6: Test with LangChain message conversion
console.log("\n🧪 TEST 6: Testing message format conversion...")
try {
  const { LangChainProvider } = await import("./src/langchain/provider")

  const messages = [
    { role: "system", content: "You are a helpful assistant" },
    { role: "user", content: "Hello!" },
  ]

  const converted = LangChainProvider.convertToLangChainMessages(messages)
  console.log(`✅ Converted ${messages.length} messages to LangChain format`)

  const model = await LangChainProvider.createChatModel({
    provider: "azure-ai-projects",
    model: process.env.AZURE_AI_DEPLOYMENT || "gpt-4o",
    temperature: 0.7,
    maxTokens: 100,
  })

  const response = await model.invoke(converted)
  const backConverted = LangChainProvider.convertFromLangChainMessages([response])

  console.log("✅ Message conversion working correctly")
  console.log(`   Assistant response: ${backConverted[0].content}`)
} catch (error) {
  console.error("❌ Message conversion test failed:", error)
  process.exit(1)
}

// Test 7: Test integration with memory
console.log("\n🧪 TEST 7: Testing with LangChain memory...")
try {
  const { LangChainProvider } = await import("./src/langchain/provider")
  const { LangChainMemory } = await import("./src/langchain/memory")

  const model = await LangChainProvider.createChatModel({
    provider: "azure-ai-projects",
    model: process.env.AZURE_AI_DEPLOYMENT || "gpt-4o",
    temperature: 0.7,
    maxTokens: 100,
  })

  const memoryManager = new LangChainMemory.SessionMemoryManager()
  console.log("✅ Memory manager created")

  // Save conversation to memory
  await memoryManager.saveMessages("test-azure-projects", [
    { role: "user", content: "Remember this: my favorite color is blue", _getType: () => "human" } as any,
  ])

  const history = await memoryManager.getHistory("test-azure-projects")
  console.log(`✅ Memory test successful (${history.length} messages in history)`)
} catch (error) {
  console.error("❌ Memory test failed:", error)
  process.exit(1)
}

// Summary
console.log("\n" + "=".repeat(70))
console.log("📊 TEST SUMMARY")
console.log("=".repeat(70))
console.log("✅ All 7 tests passed!")
console.log("   1. Azure authentication (DefaultAzureCredential)")
console.log("   2. LangChain provider import")
console.log("   3. Azure AI Projects model creation")
console.log("   4. Simple completion with gpt-4o")
console.log("   5. Conversation with system message")
console.log("   6. Message format conversion")
console.log("   7. Integration with LangChain memory")
console.log("=".repeat(70))
console.log("\n🎉 Azure AI Projects integration is working correctly!")
console.log("\nConfiguration used:")
console.log(`  Provider: azure-ai-projects`)
console.log(`  Endpoint: ${process.env.AZURE_AI_PROJECT_ENDPOINT}`)
console.log(`  Deployment: ${process.env.AZURE_AI_DEPLOYMENT || "gpt-4o"}`)
console.log(`  API Version: ${process.env.AZURE_AI_API_VERSION || "2024-08-01-preview"}`)
console.log("\nNext steps:")
console.log("  1. Use in OpenCode with provider: 'azure-ai-projects'")
console.log("  2. Test with workflow templates")
console.log("  3. Try the new agents with Azure AI Projects backend")
console.log("=".repeat(70))
