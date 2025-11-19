#!/usr/bin/env bun
/**
 * Direct Azure OpenAI API Test
 * Tests Azure credentials without LangChain
 */

console.log("🔍 Testing Azure OpenAI API directly...")

const endpoint = process.env.AZURE_OPENAI_ENDPOINT!
const apiKey = process.env.AZURE_OPENAI_API_KEY!
const apiVersion = process.env.AZURE_OPENAI_API_VERSION!
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_CHAT!

// Clean endpoint (remove trailing slash)
const cleanEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint

const url = `${cleanEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`

console.log(`\nEndpoint: ${cleanEndpoint}`)
console.log(`Deployment: ${deployment}`)
console.log(`API Version: ${apiVersion}`)
console.log(`Full URL: ${url}\n`)

try {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: "user", content: "Say 'test successful' if you can read this." }
      ],
      max_tokens: 50,
      temperature: 0.7,
    }),
  })

  console.log(`Status: ${response.status} ${response.statusText}`)

  if (!response.ok) {
    const error = await response.text()
    console.error("❌ API Error:", error)
    process.exit(1)
  }

  const data = await response.json()
  const message = data.choices[0].message.content

  console.log("✅ Success!")
  console.log(`Response: ${message}`)
  console.log("\n✅ Azure OpenAI API is working correctly!")

} catch (error) {
  console.error("❌ Test failed:", error)
  process.exit(1)
}
