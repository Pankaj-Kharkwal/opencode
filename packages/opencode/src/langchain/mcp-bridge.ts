/**
 * MCP-LangChain Bridge for OpenCode
 * Enables seamless integration between Model Context Protocol and LangChain
 */

import { DynamicStructuredTool } from "@langchain/core/tools"
import { z } from "zod"
import { Log } from "../util/log"
import { MCP } from "../mcp"
import type { Client } from "@modelcontextprotocol/sdk/client/index.js"
import type { Tool as MCPTool, CallToolResult, ListToolsResult } from "@modelcontextprotocol/sdk/types.js"

export namespace MCPLangChainBridge {
  const log = Log.create({ service: "mcp-langchain-bridge" })

  /**
   * Converts an MCP tool to a LangChain DynamicStructuredTool
   */
  export function convertMCPToolToLangChain(
    mcpTool: MCPTool,
    client: Client,
    serverName: string,
  ): DynamicStructuredTool {
    log.debug(`Converting MCP tool to LangChain: ${mcpTool.name} from ${serverName}`)

    // Convert MCP input schema to Zod schema
    const schema = mcpTool.inputSchema ? convertMCPSchemaToZod(mcpTool.inputSchema) : z.object({})

    return new DynamicStructuredTool({
      name: `mcp_${serverName}_${mcpTool.name}`,
      description: mcpTool.description || `MCP tool: ${mcpTool.name} from ${serverName}`,
      schema: schema,
      func: async (input: any) => {
        try {
          log.info(`Executing MCP tool via LangChain: ${mcpTool.name}`)

          const result = await client.callTool({
            name: mcpTool.name,
            arguments: input,
          })

          return formatMCPResult(result)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          log.error(`MCP tool execution failed: ${mcpTool.name}`, errorMsg)
          throw new Error(`MCP tool ${mcpTool.name} failed: ${errorMsg}`)
        }
      },
    })
  }

  /**
   * Converts all MCP tools from a server to LangChain tools
   */
  export async function convertAllMCPTools(client: Client, serverName: string): Promise<DynamicStructuredTool[]> {
    try {
      log.info(`Fetching MCP tools from ${serverName}`)

      const toolsResult: ListToolsResult = await client.listTools()
      const mcpTools = toolsResult.tools

      log.info(`Converting ${mcpTools.length} MCP tools from ${serverName}`)

      return mcpTools.map((tool) => convertMCPToolToLangChain(tool, client, serverName))
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      log.error(`Failed to fetch MCP tools from ${serverName}:`, errorMsg)
      return []
    }
  }

  /**
   * Converts MCP JSON Schema to Zod schema
   */
  function convertMCPSchemaToZod(schema: any): z.ZodObject<any> {
    const shape: Record<string, z.ZodTypeAny> = {}

    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
        let zodType: z.ZodTypeAny = createZodTypeFromProperty(prop)

        if (prop.description) {
          zodType = zodType.describe(prop.description)
        }

        if (!schema.required?.includes(key)) {
          zodType = zodType.optional()
        }

        shape[key] = zodType
      }
    }

    return z.object(shape)
  }

  /**
   * Creates a Zod type from a JSON Schema property
   */
  function createZodTypeFromProperty(prop: any): z.ZodTypeAny {
    switch (prop.type) {
      case "string":
        if (prop.enum) {
          return z.enum(prop.enum)
        }
        let stringType = z.string()
        if (prop.minLength) stringType = stringType.min(prop.minLength)
        if (prop.maxLength) stringType = stringType.max(prop.maxLength)
        if (prop.pattern) stringType = stringType.regex(new RegExp(prop.pattern))
        return stringType

      case "number":
      case "integer":
        let numberType = z.number()
        if (prop.type === "integer") numberType = numberType.int()
        if (prop.minimum !== undefined) numberType = numberType.min(prop.minimum)
        if (prop.maximum !== undefined) numberType = numberType.max(prop.maximum)
        return numberType

      case "boolean":
        return z.boolean()

      case "array":
        const itemType = prop.items ? createZodTypeFromProperty(prop.items) : z.any()
        let arrayType = z.array(itemType)
        if (prop.minItems) arrayType = arrayType.min(prop.minItems)
        if (prop.maxItems) arrayType = arrayType.max(prop.maxItems)
        return arrayType

      case "object":
        if (prop.properties) {
          return convertMCPSchemaToZod(prop)
        }
        return z.object({}).passthrough()

      case "null":
        return z.null()

      default:
        return z.any()
    }
  }

  /**
   * Formats MCP call result for LangChain consumption
   */
  function formatMCPResult(result: CallToolResult): string {
    if (result.isError) {
      throw new Error(`MCP tool error: ${JSON.stringify(result.content)}`)
    }

    // Handle different content types
    if (Array.isArray(result.content)) {
      return result.content
        .map((item) => {
          if (item.type === "text") {
            return item.text
          } else if (item.type === "image") {
            return `[Image: ${item.data?.substring(0, 50)}...]`
          } else if (item.type === "resource") {
            return `[Resource: ${(item as any).resource?.uri}]`
          }
          return JSON.stringify(item)
        })
        .join("\n")
    }

    return JSON.stringify(result.content)
  }

  /**
   * MCP Server Manager for LangChain integration
   */
  export class MCPServerManager {
    private servers: Map<string, Client> = new Map()
    private tools: Map<string, DynamicStructuredTool[]> = new Map()

    constructor() {
      log.info("MCP Server Manager initialized")
    }

    /**
     * Registers an MCP server and converts its tools
     */
    async registerServer(serverName: string, client: Client): Promise<void> {
      log.info(`Registering MCP server: ${serverName}`)

      this.servers.set(serverName, client)
      const tools = await convertAllMCPTools(client, serverName)
      this.tools.set(serverName, tools)

      log.info(`Registered ${tools.length} tools from ${serverName}`)
    }

    /**
     * Gets all LangChain tools from all registered MCP servers
     */
    getAllTools(): DynamicStructuredTool[] {
      const allTools: DynamicStructuredTool[] = []

      for (const [serverName, tools] of this.tools.entries()) {
        log.debug(`Adding ${tools.length} tools from ${serverName}`)
        allTools.push(...tools)
      }

      log.info(`Returning ${allTools.length} total MCP tools`)
      return allTools
    }

    /**
     * Gets tools from a specific MCP server
     */
    getToolsFromServer(serverName: string): DynamicStructuredTool[] {
      return this.tools.get(serverName) || []
    }

    /**
     * Gets all registered server names
     */
    getServerNames(): string[] {
      return Array.from(this.servers.keys())
    }

    /**
     * Unregisters an MCP server
     */
    async unregisterServer(serverName: string): Promise<void> {
      log.info(`Unregistering MCP server: ${serverName}`)

      const client = this.servers.get(serverName)
      if (client) {
        // Close the client connection if it has a close method
        if (typeof (client as any).close === "function") {
          await (client as any).close()
        }
      }

      this.servers.delete(serverName)
      this.tools.delete(serverName)
    }

    /**
     * Refreshes tools from a specific server
     */
    async refreshTools(serverName: string): Promise<void> {
      const client = this.servers.get(serverName)
      if (!client) {
        throw new Error(`Server ${serverName} not registered`)
      }

      log.info(`Refreshing tools from ${serverName}`)
      const tools = await convertAllMCPTools(client, serverName)
      this.tools.set(serverName, tools)
      log.info(`Refreshed ${tools.length} tools from ${serverName}`)
    }

    /**
     * Refreshes all tools from all servers
     */
    async refreshAllTools(): Promise<void> {
      log.info("Refreshing all MCP tools")

      for (const serverName of this.servers.keys()) {
        await this.refreshTools(serverName)
      }
    }
  }

  /**
   * Creates an MCP-aware LangChain agent
   */
  export async function createMCPAgent(
    mcpServerManager: MCPServerManager,
    additionalTools: DynamicStructuredTool[] = [],
  ): Promise<{
    tools: DynamicStructuredTool[]
    serverManager: MCPServerManager
  }> {
    log.info("Creating MCP-aware LangChain agent")

    // Get all MCP tools
    const mcpTools = mcpServerManager.getAllTools()

    // Combine with additional tools
    const allTools = [...mcpTools, ...additionalTools]

    log.info(`MCP agent created with ${allTools.length} tools (${mcpTools.length} from MCP)`)

    return {
      tools: allTools,
      serverManager: mcpServerManager,
    }
  }

  /**
   * MCP Resources to LangChain Documents converter
   */
  export class MCPResourceConverter {
    private client: Client
    private serverName: string

    constructor(client: Client, serverName: string) {
      this.client = client
      this.serverName = serverName
    }

    /**
     * Converts MCP resources to LangChain-compatible documents
     */
    async getResources(): Promise<any[]> {
      try {
        const resourcesResult = await this.client.listResources()
        const resources = resourcesResult.resources

        log.info(`Fetched ${resources.length} resources from ${this.serverName}`)

        const documents = []
        for (const resource of resources) {
          try {
            const content = await this.client.readResource({ uri: resource.uri })

            documents.push({
              pageContent: this.formatResourceContent(content),
              metadata: {
                source: resource.uri,
                name: resource.name,
                description: resource.description,
                mimeType: resource.mimeType,
                serverName: this.serverName,
              },
            })
          } catch (error) {
            log.warn(`Failed to read resource ${resource.uri}:`, error)
          }
        }

        return documents
      } catch (error) {
        log.error("Failed to fetch MCP resources:", error)
        return []
      }
    }

    /**
     * Formats resource content for LangChain
     */
    private formatResourceContent(content: any): string {
      if (Array.isArray(content.contents)) {
        return content.contents
          .map((item: any) => {
            if (item.type === "text") {
              return item.text
            } else if (item.type === "blob") {
              return `[Binary data: ${item.mimeType}]`
            }
            return JSON.stringify(item)
          })
          .join("\n\n")
      }
      return JSON.stringify(content)
    }
  }

  /**
   * Bidirectional sync between MCP and LangChain context
   */
  export class MCPLangChainSync {
    private mcpClient: Client
    private langchainContext: Map<string, any> = new Map()

    constructor(mcpClient: Client) {
      this.mcpClient = mcpClient
    }

    /**
     * Syncs MCP prompts to LangChain context
     */
    async syncPromptsToContext(): Promise<void> {
      try {
        const promptsResult = await this.mcpClient.listPrompts()
        const prompts = promptsResult.prompts

        for (const prompt of prompts) {
          this.langchainContext.set(`mcp_prompt_${prompt.name}`, {
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments,
          })
        }

        log.info(`Synced ${prompts.length} MCP prompts to LangChain context`)
      } catch (error) {
        log.error("Failed to sync MCP prompts:", error)
      }
    }

    /**
     * Gets the synced context
     */
    getContext(): Map<string, any> {
      return this.langchainContext
    }

    /**
     * Invokes an MCP prompt and returns the result
     */
    async invokePrompt(promptName: string, args: Record<string, string>): Promise<string> {
      try {
        const result = await this.mcpClient.getPrompt({
          name: promptName,
          arguments: args,
        })

        return result.messages.map((msg) => msg.content).join("\n")
      } catch (error) {
        log.error(`Failed to invoke MCP prompt ${promptName}:`, error)
        throw error
      }
    }
  }
}
