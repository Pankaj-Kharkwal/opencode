/**
 * LangChain Tool Orchestration for OpenCode
 * Converts OpenCode tools to LangChain tools and provides advanced orchestration
 */

import { DynamicStructuredTool } from "@langchain/core/tools"
import { z } from "zod"
import { Log } from "../util/log"
import { Tool as OpenCodeTool } from "../tool/registry"
import type { Session } from "../session"

export namespace LangChainTools {
  const log = Log.create({ service: "langchain-tools" })

  export interface ToolDependency {
    toolName: string
    condition?: (result: any) => boolean
  }

  export interface ToolPipeline {
    name: string
    description: string
    steps: {
      tool: string
      input: (previousResults: any[]) => any
      transform?: (result: any) => any
    }[]
  }

  export interface ToolOrchestrationConfig {
    parallelExecution?: boolean
    retryOnFailure?: boolean
    maxRetries?: number
    timeout?: number
    dependencies?: Record<string, ToolDependency[]>
  }

  /**
   * Converts an OpenCode tool to a LangChain DynamicStructuredTool
   */
  export function convertToLangChainTool(
    tool: OpenCodeTool.Definition<any>,
    session: Session.Type,
  ): DynamicStructuredTool {
    log.debug(`Converting tool to LangChain: ${tool.name}`)

    // Convert the tool's schema to Zod schema
    const schema = tool.parameters ? convertSchemaToZod(tool.parameters) : z.object({})

    return new DynamicStructuredTool({
      name: tool.name,
      description: tool.description || `Execute ${tool.name} tool`,
      schema: schema,
      func: async (input: any) => {
        try {
          log.info(`Executing OpenCode tool via LangChain: ${tool.name}`)
          const result = await tool.execute(input, session as any)
          return typeof result === "string" ? result : JSON.stringify(result)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          log.error(`Tool execution failed: ${tool.name}`, errorMsg)
          throw new Error(`Tool ${tool.name} failed: ${errorMsg}`)
        }
      },
    })
  }

  /**
   * Converts all OpenCode tools to LangChain tools
   */
  export function convertAllTools(tools: OpenCodeTool.Definition<any>[], session: Session.Type): DynamicStructuredTool[] {
    log.info(`Converting ${tools.length} OpenCode tools to LangChain format`)
    return tools.map((tool) => convertToLangChainTool(tool, session))
  }

  /**
   * Creates a tool pipeline for sequential execution
   */
  export function createToolPipeline(pipeline: ToolPipeline, session: Session.Type): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: pipeline.name,
      description: pipeline.description,
      schema: z.object({
        initialInput: z.any().describe("Initial input for the pipeline"),
      }),
      func: async (input: { initialInput: any }) => {
        log.info(`Executing tool pipeline: ${pipeline.name}`)
        const results: any[] = []

        for (const step of pipeline.steps) {
          try {
            const stepInput = step.input(results)
            log.debug(`Pipeline step: ${step.tool}`, stepInput)

            // Execute the tool (this would need actual tool execution)
            const result = await executeToolByName(step.tool, stepInput, session)
            const transformedResult = step.transform ? step.transform(result) : result
            results.push(transformedResult)
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            log.error(`Pipeline step failed: ${step.tool}`, errorMsg)
            throw new Error(`Pipeline failed at step ${step.tool}: ${errorMsg}`)
          }
        }

        return JSON.stringify({
          success: true,
          results: results,
        })
      },
    })
  }

  /**
   * Tool orchestrator with dependency management
   */
  export class ToolOrchestrator {
    private config: ToolOrchestrationConfig
    private executionGraph: Map<string, Set<string>> = new Map()

    constructor(config: ToolOrchestrationConfig = {}) {
      this.config = {
        parallelExecution: false,
        retryOnFailure: false,
        maxRetries: 3,
        timeout: 30000,
        ...config,
      }

      // Build execution graph from dependencies
      if (config.dependencies) {
        for (const [tool, deps] of Object.entries(config.dependencies)) {
          this.executionGraph.set(
            tool,
            new Set(deps.map((d) => d.toolName)),
          )
        }
      }
    }

    /**
     * Executes tools respecting dependencies
     */
    async executeWithDependencies(
      tools: Map<string, DynamicStructuredTool>,
      inputs: Map<string, any>,
    ): Promise<Map<string, any>> {
      const results = new Map<string, any>()
      const executed = new Set<string>()
      const pending = new Set(tools.keys())

      while (pending.size > 0) {
        const executable = Array.from(pending).filter((toolName) => {
          const deps = this.executionGraph.get(toolName) || new Set()
          return Array.from(deps).every((dep) => executed.has(dep))
        })

        if (executable.length === 0 && pending.size > 0) {
          throw new Error("Circular dependency detected in tool execution graph")
        }

        if (this.config.parallelExecution) {
          // Execute all eligible tools in parallel
          await Promise.all(
            executable.map(async (toolName) => {
              const tool = tools.get(toolName)!
              const input = inputs.get(toolName) || {}
              const result = await this.executeWithRetry(tool, input)
              results.set(toolName, result)
              executed.add(toolName)
              pending.delete(toolName)
            }),
          )
        } else {
          // Execute tools sequentially
          for (const toolName of executable) {
            const tool = tools.get(toolName)!
            const input = inputs.get(toolName) || {}
            const result = await this.executeWithRetry(tool, input)
            results.set(toolName, result)
            executed.add(toolName)
            pending.delete(toolName)
          }
        }
      }

      return results
    }

    /**
     * Executes a tool with retry logic
     */
    private async executeWithRetry(tool: DynamicStructuredTool, input: any): Promise<any> {
      let lastError: Error | undefined
      const maxRetries = this.config.retryOnFailure ? this.config.maxRetries! : 1

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          log.debug(`Executing tool: ${tool.name} (attempt ${attempt + 1}/${maxRetries})`)

          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Tool execution timeout")), this.config.timeout)
          })

          const result = await Promise.race([tool.invoke(input), timeoutPromise])
          return result
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          log.warn(`Tool execution attempt ${attempt + 1} failed: ${tool.name}`, lastError.message)

          if (attempt < maxRetries - 1) {
            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
          }
        }
      }

      throw lastError || new Error(`Tool execution failed: ${tool.name}`)
    }

    /**
     * Validates tool dependencies
     */
    validateDependencies(tools: Set<string>): boolean {
      for (const [tool, deps] of this.executionGraph.entries()) {
        for (const dep of deps) {
          if (!tools.has(dep)) {
            log.error(`Tool ${tool} has missing dependency: ${dep}`)
            return false
          }
        }
      }
      return true
    }
  }

  /**
   * Helper to convert JSON Schema to Zod schema
   */
  function convertSchemaToZod(schema: any): z.ZodObject<any> {
    const shape: Record<string, z.ZodTypeAny> = {}

    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
        let zodType: z.ZodTypeAny

        switch (prop.type) {
          case "string":
            zodType = z.string()
            break
          case "number":
            zodType = z.number()
            break
          case "boolean":
            zodType = z.boolean()
            break
          case "array":
            zodType = z.array(z.any())
            break
          case "object":
            zodType = z.object({})
            break
          default:
            zodType = z.any()
        }

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
   * Helper to execute a tool by name (placeholder)
   */
  async function executeToolByName(toolName: string, input: any, session: Session.Type): Promise<any> {
    // This would integrate with OpenCode's actual tool registry
    log.debug(`Executing tool by name: ${toolName}`)
    return { success: true, tool: toolName, input }
  }
}
