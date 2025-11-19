/**
 * LangChain/LangGraph Integration Examples for OpenCode
 * Demonstrates how to use the various integrations
 */

import { LangChainProvider } from "./provider"
import { LangChainTools } from "./tools"
import { LangGraph } from "./graph"
import { MCPLangChainBridge } from "./mcp-bridge"
import { ToolChannel } from "./channel"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { z } from "zod"
import type { Session } from "../session"

export namespace LangChainExamples {
  /**
   * Example 1: Basic LangChain provider usage
   */
  export async function basicProviderExample() {
    // Create a chat model from OpenCode configuration
    const modelConfig = await LangChainProvider.getCurrentModelConfig()
    const chatModel = await LangChainProvider.createChatModel(modelConfig)

    // Test the connection
    const isConnected = await LangChainProvider.testConnection(modelConfig)
    console.log("Connection test:", isConnected ? "SUCCESS" : "FAILED")

    // Use the model
    const response = await chatModel.invoke([{ role: "user", content: "Explain LangChain in one sentence." }])
    console.log("Response:", response.content)

    return response
  }

  /**
   * Example 2: Converting OpenCode tools to LangChain
   */
  export async function toolConversionExample(session: Session.Type) {
    // Mock OpenCode tool
    const mockTool = {
      name: "search_code",
      description: "Search for code in the repository",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          filePattern: { type: "string", description: "File pattern to search in" },
        },
        required: ["query"],
      },
      execute: async (input: any) => {
        return `Searching for: ${input.query} in ${input.filePattern || "all files"}`
      },
    }

    // Convert to LangChain tool
    const langchainTool = LangChainTools.convertToLangChainTool(mockTool as any, session)

    // Use the tool
    const result = await langchainTool.invoke({
      query: "function calculateTotal",
      filePattern: "**/*.ts",
    })

    console.log("Tool result:", result)
    return result
  }

  /**
   * Example 3: Tool orchestration with dependencies
   */
  export async function toolOrchestrationExample() {
    // Create a tool orchestrator
    const orchestrator = new LangChainTools.ToolOrchestrator({
      parallelExecution: false,
      retryOnFailure: true,
      maxRetries: 3,
      timeout: 30000,
      dependencies: {
        analyze_code: [],
        fix_issues: [{ toolName: "analyze_code" }],
        run_tests: [{ toolName: "fix_issues" }],
      },
    })

    // Create mock tools
    const tools = new Map<string, DynamicStructuredTool>([
      [
        "analyze_code",
        new DynamicStructuredTool({
          name: "analyze_code",
          description: "Analyze code for issues",
          schema: z.object({ file: z.string() }),
          func: async ({ file }) => `Analyzed ${file}: found 3 issues`,
        }),
      ],
      [
        "fix_issues",
        new DynamicStructuredTool({
          name: "fix_issues",
          description: "Fix code issues",
          schema: z.object({ file: z.string() }),
          func: async ({ file }) => `Fixed issues in ${file}`,
        }),
      ],
      [
        "run_tests",
        new DynamicStructuredTool({
          name: "run_tests",
          description: "Run tests",
          schema: z.object({ file: z.string() }),
          func: async ({ file }) => `Tests passed for ${file}`,
        }),
      ],
    ])

    const inputs = new Map([
      ["analyze_code", { file: "src/index.ts" }],
      ["fix_issues", { file: "src/index.ts" }],
      ["run_tests", { file: "src/index.ts" }],
    ])

    // Execute with dependencies
    const results = await orchestrator.executeWithDependencies(tools, inputs)

    console.log("Orchestration results:", Object.fromEntries(results))
    return results
  }

  /**
   * Example 4: LangGraph agent workflow
   */
  export async function agentWorkflowExample(session: Session.Type) {
    const modelConfig = await LangChainProvider.getCurrentModelConfig()
    const chatModel = await LangChainProvider.createChatModel(modelConfig)

    // Create mock tools
    const tools = [
      new DynamicStructuredTool({
        name: "read_file",
        description: "Read a file",
        schema: z.object({ path: z.string() }),
        func: async ({ path }) => `Content of ${path}`,
      }),
      new DynamicStructuredTool({
        name: "write_file",
        description: "Write to a file",
        schema: z.object({ path: z.string(), content: z.string() }),
        func: async ({ path, content }) => `Written to ${path}: ${content}`,
      }),
    ]

    // Create agent workflow
    const workflow = new LangGraph.AgentWorkflow(chatModel, tools, session)

    // Execute the workflow
    const result = await workflow.execute("Add error handling to the authentication module", {
      projectContext: "Node.js API server",
    })

    console.log("Workflow result:", result.context.finalResponse)
    return result
  }

  /**
   * Example 5: MCP-LangChain bridge
   */
  export async function mcpBridgeExample() {
    const mcpManager = new MCPLangChainBridge.MCPServerManager()

    // Mock MCP client (in real usage, this would come from OpenCode's MCP module)
    const mockClient = {
      listTools: async () => ({
        tools: [
          {
            name: "filesystem_read",
            description: "Read a file from the filesystem",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "File path" },
              },
              required: ["path"],
            },
          },
        ],
      }),
      callTool: async ({ name, arguments: args }: any) => ({
        content: [{ type: "text", text: `Mock result for ${name} with args ${JSON.stringify(args)}` }],
        isError: false,
      }),
    } as any

    // Register MCP server
    await mcpManager.registerServer("filesystem", mockClient)

    // Get all tools
    const allTools = mcpManager.getAllTools()
    console.log("MCP tools available:", allTools.length)

    // Use an MCP tool through LangChain
    const tool = allTools[0]
    const result = await tool.invoke({ path: "/home/user/config.json" })
    console.log("MCP tool result:", result)

    return { tools: allTools, result }
  }

  /**
   * Example 6: Tool pipeline
   */
  export async function toolPipelineExample() {
    const pipeline = new ToolChannel.Pipeline("code_quality_pipeline", [
      {
        tool: new DynamicStructuredTool({
          name: "lint",
          description: "Lint code",
          schema: z.object({ code: z.string() }),
          func: async ({ code }) => ({ code, lintErrors: 2 }),
        }),
        validate: (output) => output.lintErrors === 0,
        onError: (error) => ({ code: "original", lintErrors: 0, fixed: true }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "format",
          description: "Format code",
          schema: z.object({ code: z.string() }),
          func: async ({ code }) => ({ code: code.trim(), formatted: true }),
        }),
        transform: (input, previous) => ({
          code: previous[0]?.code || input.code,
        }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "verify",
          description: "Verify code quality",
          schema: z.object({ code: z.string() }),
          func: async ({ code }) => ({ code, quality: "excellent" }),
        }),
        transform: (input, previous) => ({
          code: previous[1]?.code || input.code,
        }),
      },
    ])

    const result = await pipeline.execute({ code: "function test() { return 42; }" })
    console.log("Pipeline result:", result)
    return result
  }

  /**
   * Example 7: Tool router
   */
  export async function toolRouterExample() {
    const router = new ToolChannel.Router({
      name: "task_router",
      routes: [
        {
          condition: (input) => input.type === "code",
          channel: "code_channel",
          priority: 10,
        },
        {
          condition: (input) => input.type === "documentation",
          channel: "docs_channel",
          priority: 5,
        },
      ],
      defaultChannel: "general_channel",
    })

    // Create channels
    const codeChannel = new ToolChannel.Channel({
      name: "code_channel",
      description: "Channel for code-related tasks",
      inputSchema: z.object({ type: z.string(), content: z.string() }),
      outputSchema: z.object({ processed: z.boolean(), result: z.string() }),
      transformation: (input) => ({ processed: true, result: `Processed code: ${input.content}` }),
    })

    const docsChannel = new ToolChannel.Channel({
      name: "docs_channel",
      description: "Channel for documentation tasks",
      inputSchema: z.object({ type: z.string(), content: z.string() }),
      outputSchema: z.object({ processed: z.boolean(), result: z.string() }),
      transformation: (input) => ({ processed: true, result: `Processed docs: ${input.content}` }),
    })

    const generalChannel = new ToolChannel.Channel({
      name: "general_channel",
      description: "General purpose channel",
      inputSchema: z.any(),
      outputSchema: z.any(),
      transformation: (input) => ({ processed: true, result: `General processing: ${JSON.stringify(input)}` }),
    })

    router.register("code_channel", codeChannel)
    router.register("docs_channel", docsChannel)
    router.register("general_channel", generalChannel)

    // Route different inputs
    const codeResult = await router.route({ type: "code", content: "function hello() {}" })
    const docsResult = await router.route({ type: "documentation", content: "# API Reference" })
    const generalResult = await router.route({ type: "unknown", content: "some data" })

    console.log("Routing results:", { codeResult, docsResult, generalResult })
    return { codeResult, docsResult, generalResult }
  }

  /**
   * Example 8: Tool composer
   */
  export async function toolComposerExample() {
    const composer = new ToolChannel.Composer()

    // Register individual tools
    composer
      .registerTool(
        new DynamicStructuredTool({
          name: "fetch_data",
          description: "Fetch data from API",
          schema: z.object({ endpoint: z.string() }),
          func: async ({ endpoint }) => ({ data: `Data from ${endpoint}`, status: 200 }),
        }),
      )
      .registerTool(
        new DynamicStructuredTool({
          name: "transform_data",
          description: "Transform data",
          schema: z.object({ data: z.any() }),
          func: async ({ data }) => ({ transformed: `Transformed: ${JSON.stringify(data)}` }),
        }),
      )
      .registerTool(
        new DynamicStructuredTool({
          name: "save_data",
          description: "Save data",
          schema: z.object({ data: z.any(), path: z.string() }),
          func: async ({ data, path }) => ({ saved: true, path }),
        }),
      )

    // Compose a workflow tool
    const etlTool = composer.compose({
      name: "etl_pipeline",
      description: "Complete ETL pipeline",
      inputSchema: z.object({ endpoint: z.string(), outputPath: z.string() }),
      strategy: "sequential",
      tools: [
        {
          name: "fetch_data",
          inputTransform: (input) => ({ endpoint: input.endpoint }),
        },
        {
          name: "transform_data",
          inputTransform: (_, results) => ({ data: results.fetch_data }),
        },
        {
          name: "save_data",
          inputTransform: (input, results) => ({
            data: results.transform_data,
            path: input.outputPath,
          }),
        },
      ],
      outputTransform: (results) => ({
        success: true,
        steps: Object.keys(results),
        finalOutput: results.save_data,
      }),
    })

    // Execute the composed tool
    const result = await etlTool.invoke({
      endpoint: "/api/users",
      outputPath: "/data/users.json",
    })

    console.log("Composed tool result:", result)
    return result
  }

  /**
   * Example 9: Code review workflow
   */
  export async function codeReviewWorkflowExample() {
    const modelConfig = await LangChainProvider.getCurrentModelConfig()
    const chatModel = await LangChainProvider.createChatModel(modelConfig)

    const workflow = new LangGraph.CodeReviewWorkflow(chatModel)

    const code = `
function processPayment(amount, card) {
  const sql = "SELECT * FROM users WHERE id = " + card.userId;
  // Direct SQL injection vulnerability
  const user = db.query(sql);

  // No input validation
  const total = amount * 1.1;

  return total;
}
`

    const result = await workflow.execute(code)

    console.log("Code review report:", result.context.report)
    return result
  }

  /**
   * Example 10: Fan-out/Fan-in pattern
   */
  export async function fanOutFanInExample() {
    const tools = [
      new DynamicStructuredTool({
        name: "check_eslint",
        description: "Run ESLint",
        schema: z.object({ file: z.string() }),
        func: async ({ file }) => ({ tool: "eslint", file, issues: 2 }),
      }),
      new DynamicStructuredTool({
        name: "check_typescript",
        description: "Run TypeScript compiler",
        schema: z.object({ file: z.string() }),
        func: async ({ file }) => ({ tool: "typescript", file, errors: 0 }),
      }),
      new DynamicStructuredTool({
        name: "check_tests",
        description: "Run tests",
        schema: z.object({ file: z.string() }),
        func: async ({ file }) => ({ tool: "tests", file, passed: true }),
      }),
    ]

    const aggregator = (results: any[]) => {
      const totalIssues = results.reduce((sum, r) => sum + (r.issues || 0) + (r.errors || 0), 0)
      const allPassed = results.every((r) => r.passed !== false && (r.issues || 0) === 0 && (r.errors || 0) === 0)

      return {
        summary: allPassed ? "All checks passed" : `Found ${totalIssues} issues`,
        details: results,
        status: allPassed ? "success" : "failed",
      }
    }

    const qualityCheck = ToolChannel.createFanOutFanIn("quality_check", tools, aggregator)

    const result = await qualityCheck.invoke({ input: { file: "src/index.ts" } })

    console.log("Quality check result:", result)
    return result
  }
}
