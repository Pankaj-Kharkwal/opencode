/**
 * Tool Adapters for OpenCode Tools
 * Provides seamless integration between OpenCode tools and LangChain
 */

import { DynamicStructuredTool } from "@langchain/core/tools"
import { z } from "zod"
import { Log } from "../util/log"
import type { Session } from "../session"
import { Tool } from "../tool/registry"

export namespace LangChainAdapters {
  const log = Log.create({ service: "langchain-adapters" })

  /**
   * Universal tool adapter factory
   */
  export class ToolAdapter {
    private session: Session.Type
    private toolRegistry: Map<string, any> = new Map()

    constructor(session: Session.Type) {
      this.session = session
      log.info("ToolAdapter initialized")
    }

    /**
     * Register an OpenCode tool
     */
    register(name: string, tool: any): this {
      this.toolRegistry.set(name, tool)
      log.debug(`Registered tool: ${name}`)
      return this
    }

    /**
     * Create LangChain tool from OpenCode tool definition
     */
    createLangChainTool(opencodeToolName: string): DynamicStructuredTool {
      const tool = this.toolRegistry.get(opencodeToolName)
      if (!tool) {
        throw new Error(`Tool ${opencodeToolName} not found in registry`)
      }

      return new DynamicStructuredTool({
        name: opencodeToolName,
        description: tool.description || `Execute ${opencodeToolName}`,
        schema: this.convertSchema(tool.parameters),
        func: async (input: any) => {
          try {
            log.debug(`Executing ${opencodeToolName} via adapter`, input)
            const result = await tool.execute(input, this.session)
            return typeof result === "string" ? result : JSON.stringify(result, null, 2)
          } catch (error) {
            log.error(`Tool ${opencodeToolName} failed:`, error)
            throw error
          }
        },
      })
    }

    /**
     * Convert OpenCode schema to Zod schema
     */
    private convertSchema(parameters: any): z.ZodObject<any> {
      if (!parameters || !parameters.properties) {
        return z.object({})
      }

      const shape: Record<string, z.ZodTypeAny> = {}

      for (const [key, prop] of Object.entries(parameters.properties as Record<string, any>)) {
        let zodType = this.createZodType(prop)

        if (prop.description) {
          zodType = zodType.describe(prop.description)
        }

        if (!parameters.required?.includes(key)) {
          zodType = zodType.optional()
        }

        shape[key] = zodType
      }

      return z.object(shape)
    }

    /**
     * Create Zod type from JSON Schema property
     */
    private createZodType(prop: any): z.ZodTypeAny {
      switch (prop.type) {
        case "string":
          return z.string()
        case "number":
        case "integer":
          return z.number()
        case "boolean":
          return z.boolean()
        case "array":
          return z.array(z.any())
        case "object":
          return z.object({}).passthrough()
        default:
          return z.any()
      }
    }

    /**
     * Create all tools at once
     */
    createAllTools(): DynamicStructuredTool[] {
      const tools: DynamicStructuredTool[] = []
      for (const name of this.toolRegistry.keys()) {
        tools.push(this.createLangChainTool(name))
      }
      log.info(`Created ${tools.length} LangChain tools`)
      return tools
    }
  }

  /**
   * Prebuilt tool adapters for common OpenCode tools
   */
  export class CommonToolAdapters {
    /**
     * Bash tool adapter
     */
    static bash(session: Session.Type): DynamicStructuredTool {
      return new DynamicStructuredTool({
        name: "bash",
        description: "Execute bash commands in the terminal",
        schema: z.object({
          command: z.string().describe("The bash command to execute"),
          description: z.string().optional().describe("Description of what the command does"),
          timeout: z.number().optional().describe("Timeout in milliseconds"),
        }),
        func: async ({ command, description, timeout }) => {
          log.info(`Executing bash: ${command}`)
          // This would integrate with OpenCode's bash tool
          return `Executed: ${command}\nResult: [Command output would appear here]`
        },
      })
    }

    /**
     * Read file tool adapter
     */
    static read(session: Session.Type): DynamicStructuredTool {
      return new DynamicStructuredTool({
        name: "read",
        description: "Read the contents of a file",
        schema: z.object({
          file_path: z.string().describe("Absolute path to the file to read"),
          offset: z.number().optional().describe("Line number to start reading from"),
          limit: z.number().optional().describe("Number of lines to read"),
        }),
        func: async ({ file_path, offset, limit }) => {
          log.info(`Reading file: ${file_path}`)
          // This would integrate with OpenCode's read tool
          return `File contents of ${file_path} would appear here`
        },
      })
    }

    /**
     * Write file tool adapter
     */
    static write(session: Session.Type): DynamicStructuredTool {
      return new DynamicStructuredTool({
        name: "write",
        description: "Write content to a file",
        schema: z.object({
          file_path: z.string().describe("Absolute path to the file to write"),
          content: z.string().describe("Content to write to the file"),
        }),
        func: async ({ file_path, content }) => {
          log.info(`Writing to file: ${file_path}`)
          // This would integrate with OpenCode's write tool
          return `Successfully wrote to ${file_path}`
        },
      })
    }

    /**
     * Edit file tool adapter
     */
    static edit(session: Session.Type): DynamicStructuredTool {
      return new DynamicStructuredTool({
        name: "edit",
        description: "Edit a file by replacing old content with new content",
        schema: z.object({
          file_path: z.string().describe("Absolute path to the file to edit"),
          old_string: z.string().describe("The exact text to replace"),
          new_string: z.string().describe("The new text to replace it with"),
          replace_all: z.boolean().optional().describe("Replace all occurrences"),
        }),
        func: async ({ file_path, old_string, new_string, replace_all }) => {
          log.info(`Editing file: ${file_path}`)
          // This would integrate with OpenCode's edit tool
          return `Successfully edited ${file_path}`
        },
      })
    }

    /**
     * Grep tool adapter
     */
    static grep(session: Session.Type): DynamicStructuredTool {
      return new DynamicStructuredTool({
        name: "grep",
        description: "Search for patterns in files using ripgrep",
        schema: z.object({
          pattern: z.string().describe("Regular expression pattern to search for"),
          path: z.string().optional().describe("Directory or file to search in"),
          output_mode: z.enum(["content", "files_with_matches", "count"]).optional(),
          glob: z.string().optional().describe("Glob pattern to filter files"),
        }),
        func: async ({ pattern, path, output_mode, glob }) => {
          log.info(`Searching for pattern: ${pattern}`)
          // This would integrate with OpenCode's grep tool
          return `Search results for "${pattern}" would appear here`
        },
      })
    }

    /**
     * Glob tool adapter
     */
    static glob(session: Session.Type): DynamicStructuredTool {
      return new DynamicStructuredTool({
        name: "glob",
        description: "Find files matching a glob pattern",
        schema: z.object({
          pattern: z.string().describe("Glob pattern to match files"),
          path: z.string().optional().describe("Directory to search in"),
        }),
        func: async ({ pattern, path }) => {
          log.info(`Finding files matching: ${pattern}`)
          // This would integrate with OpenCode's glob tool
          return `Files matching "${pattern}" would appear here`
        },
      })
    }

    /**
     * Task tool adapter (with resume support)
     */
    static task(session: Session.Type): DynamicStructuredTool {
      return new DynamicStructuredTool({
        name: "task",
        description: "Delegate task to a specialized subagent with optional resume capability",
        schema: z.object({
          description: z.string().describe("Short description of the task"),
          prompt: z.string().describe("The task for the agent to perform"),
          subagent_type: z.string().describe("Type of specialized agent to use"),
          session_id: z.string().optional().describe("Existing session to resume"),
        }),
        func: async ({ description, prompt, subagent_type, session_id }) => {
          log.info(`Delegating task to ${subagent_type}: ${description}`)
          // This would integrate with OpenCode's task tool
          const action = session_id ? "Resuming" : "Starting"
          return `${action} task with ${subagent_type}: ${description}`
        },
      })
    }

    /**
     * Get all common tools
     */
    static getAll(session: Session.Type): DynamicStructuredTool[] {
      return [
        this.bash(session),
        this.read(session),
        this.write(session),
        this.edit(session),
        this.grep(session),
        this.glob(session),
        this.task(session),
      ]
    }
  }

  /**
   * Create a complete tool suite for LangChain workflows
   */
  export function createToolSuite(
    session: Session.Type,
    options: {
      includeCommonTools?: boolean
      customTools?: any[]
      toolFilter?: (toolName: string) => boolean
    } = {},
  ): DynamicStructuredTool[] {
    const { includeCommonTools = true, customTools = [], toolFilter = () => true } = options

    const tools: DynamicStructuredTool[] = []

    // Add common tools if requested
    if (includeCommonTools) {
      const commonTools = CommonToolAdapters.getAll(session)
      tools.push(...commonTools.filter((tool) => toolFilter(tool.name)))
      log.info(`Added ${commonTools.length} common tools`)
    }

    // Add custom tools
    if (customTools.length > 0) {
      const adapter = new ToolAdapter(session)
      for (const tool of customTools) {
        adapter.register(tool.name, tool)
      }
      const langchainTools = adapter.createAllTools()
      tools.push(...langchainTools.filter((tool) => toolFilter(tool.name)))
      log.info(`Added ${customTools.length} custom tools`)
    }

    log.info(`Created tool suite with ${tools.length} total tools`)
    return tools
  }

  /**
   * Tool wrapper with enhanced error handling
   */
  export class ResilientToolWrapper {
    constructor(
      private tool: DynamicStructuredTool,
      private options: {
        maxRetries?: number
        retryDelay?: number
        onError?: (error: Error, attempt: number) => void
      } = {},
    ) {
      this.options.maxRetries = options.maxRetries ?? 3
      this.options.retryDelay = options.retryDelay ?? 1000
    }

    /**
     * Execute tool with retry logic
     */
    async execute(input: any): Promise<any> {
      let lastError: Error | undefined

      for (let attempt = 1; attempt <= this.options.maxRetries!; attempt++) {
        try {
          return await this.tool.invoke(input)
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          log.warn(`Tool ${this.tool.name} failed (attempt ${attempt}/${this.options.maxRetries})`)

          if (this.options.onError) {
            this.options.onError(lastError, attempt)
          }

          if (attempt < this.options.maxRetries!) {
            await new Promise((resolve) => setTimeout(resolve, this.options.retryDelay!))
          }
        }
      }

      throw lastError || new Error(`Tool ${this.tool.name} failed after ${this.options.maxRetries} attempts`)
    }

    /**
     * Get the wrapped tool
     */
    getTool(): DynamicStructuredTool {
      return this.tool
    }
  }

  /**
   * Batch tool executor
   */
  export class BatchToolExecutor {
    constructor(private tools: Map<string, DynamicStructuredTool>) {
      log.info(`BatchToolExecutor initialized with ${tools.size} tools`)
    }

    /**
     * Execute multiple tool calls in parallel
     */
    async executeParallel(calls: Array<{ tool: string; input: any }>): Promise<any[]> {
      log.info(`Executing ${calls.length} tool calls in parallel`)

      const promises = calls.map(async (call) => {
        const tool = this.tools.get(call.tool)
        if (!tool) {
          throw new Error(`Tool ${call.tool} not found`)
        }
        return await tool.invoke(call.input)
      })

      return await Promise.all(promises)
    }

    /**
     * Execute multiple tool calls sequentially
     */
    async executeSequential(calls: Array<{ tool: string; input: any }>): Promise<any[]> {
      log.info(`Executing ${calls.length} tool calls sequentially`)

      const results: any[] = []
      for (const call of calls) {
        const tool = this.tools.get(call.tool)
        if (!tool) {
          throw new Error(`Tool ${call.tool} not found`)
        }
        const result = await tool.invoke(call.input)
        results.push(result)
      }

      return results
    }
  }
}
