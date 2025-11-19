#!/usr/bin/env bun
/**
 * Simple Azure OpenAI LangChain Test
 * Tests basic functionality without complex dependencies
 */

console.log("=".repeat(70))
console.log("🚀 LANGCHAIN AZURE OPENAI - SIMPLE SMOKE TEST")
console.log("=".repeat(70))

// Check environment variables
console.log("\n📋 Checking Azure Configuration...")
const requiredEnvVars = [
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_VERSION",
  "AZURE_OPENAI_DEPLOYMENT_CHAT",
]

let configOk = true
for (const envVar of requiredEnvVars) {
  const value = process.env[envVar]
  if (value) {
    console.log(`✅ ${envVar}: ${value.substring(0, 30)}...`)
  } else {
    console.log(`❌ ${envVar}: NOT SET`)
    configOk = false
  }
}

if (!configOk) {
  console.error("\n❌ Missing required environment variables!")
  process.exit(1)
}

console.log("\n✅ All Azure configuration variables are set!")

// Test 1: Import LangChain packages directly
console.log("\n🧪 TEST 1: Importing LangChain packages...")
try {
  const { ChatOpenAI } = await import("@langchain/openai")
  console.log("✅ @langchain/openai imported successfully")
} catch (error) {
  console.error("❌ Failed to import @langchain/openai:", error)
  process.exit(1)
}

// Test 2: Create Azure OpenAI model
console.log("\n🧪 TEST 2: Creating Azure OpenAI model...")
try {
  const { ChatOpenAI } = await import("@langchain/openai")

  const model = new ChatOpenAI({
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY!,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_CHAT!,
    azureOpenAIApiInstanceName: "",
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION!,
    temperature: 0.7,
    maxTokens: 100,
    configuration: {
      baseURL: process.env.AZURE_OPENAI_ENDPOINT!,
    },
  })

  console.log("✅ Azure OpenAI model created successfully")
  console.log(`   Model type: ${model.constructor.name}`)

  // Test 3: Test connection
  console.log("\n🧪 TEST 3: Testing Azure OpenAI connection...")
  const response = await model.invoke([{ role: "user", content: "Say 'test successful' if you can read this." } as any])

  console.log("✅ Connection successful!")
  console.log(`   Response: ${String(response.content).substring(0, 100)}`)
} catch (error) {
  console.error("❌ Azure OpenAI test failed:", error)
  process.exit(1)
}

// Test 4: Test with messages
console.log("\n🧪 TEST 4: Testing conversation...")
try {
  const { ChatOpenAI } = await import("@langchain/openai")
  const { HumanMessage, SystemMessage } = await import("@langchain/core/messages")

  const model = new ChatOpenAI({
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY!,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_CHAT!,
    azureOpenAIApiInstanceName: "",
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION!,
    temperature: 0.7,
    maxTokens: 150,
    configuration: {
      baseURL: process.env.AZURE_OPENAI_ENDPOINT!,
    },
  })

  const messages = [
    new SystemMessage("You are a helpful coding assistant."),
    new HumanMessage("What are the benefits of TypeScript? Answer in one sentence."),
  ]

  const response = await model.invoke(messages)
  console.log("✅ Conversation test successful!")
  console.log(`   Response: ${String(response.content)}`)
} catch (error) {
  console.error("❌ Conversation test failed:", error)
  process.exit(1)
}

// Test 5: Test memory/vector store packages
console.log("\n🧪 TEST 5: Testing LangChain memory packages...")
try {
  const { BufferMemory } = await import("langchain/memory")
  const memory = new BufferMemory()
  console.log("✅ Memory package imported successfully")
} catch (error) {
  console.error("❌ Memory package test failed:", error)
  process.exit(1)
}

// Test 6: Test text splitter
console.log("\n🧪 TEST 6: Testing text splitter...")
try {
  const { RecursiveCharacterTextSplitter } = await import("langchain/text_splitter")
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 100,
    chunkOverlap: 20,
  })

  const text = "This is a test document. ".repeat(10)
  const chunks = await splitter.splitText(text)

  console.log("✅ Text splitter working")
  console.log(`   Split into ${chunks.length} chunks`)
} catch (error) {
  console.error("❌ Text splitter test failed:", error)
  process.exit(1)
}

// Summary
console.log("\n" + "=".repeat(70))
console.log("📊 TEST SUMMARY")
console.log("=".repeat(70))
console.log("✅ All 6 tests passed!")
console.log("   1. LangChain packages import")
console.log("   2. Azure OpenAI model creation")
console.log("   3. Azure OpenAI connection")
console.log("   4. Conversation with messages")
console.log("   5. Memory package")
console.log("   6. Text splitter")
console.log("=".repeat(70))
console.log("\n🎉 LangChain is ready to use with Azure OpenAI!")
console.log("\nNext steps:")
console.log("  1. Test the custom provider: bun repl")
console.log("  2. Try the new agents in OpenCode")
console.log("  3. Test workflow templates")
console.log("=".repeat(70))
