/**
 * Advanced Tool Channeling System for OpenCode
 * Provides intelligent routing, transformation, and composition of tools
 */

import { DynamicStructuredTool } from "@langchain/core/tools"
import { Log } from "../util/log"
import { z } from "zod"

export namespace ToolChannel {
  const log = Log.create({ service: "tool-channel" })

  /**
   * Tool channel configuration
   */
  export interface ChannelConfig {
    name: string
    description: string
    inputSchema: z.ZodTypeAny
    outputSchema: z.ZodTypeAny
    transformation?: (input: any) => any
    validation?: (output: any) => boolean
  }

  /**
   * Tool pipeline step
   */
  export interface PipelineStep {
    tool: DynamicStructuredTool
    transform?: (input: any, previousResults: any[]) => any
    validate?: (output: any) => boolean
    onError?: (error: Error) => any
    retry?: {
      maxAttempts: number
      delay: number
      backoff?: "linear" | "exponential"
    }
  }

  /**
   * Channel router configuration
   */
  export interface RouterConfig {
    name: string
    routes: {
      condition: (input: any) => boolean
      channel: string
      priority: number
    }[]
    defaultChannel?: string
  }

  /**
   * Tool Channel - connects and transforms data between tools
   */
  export class Channel {
    private config: ChannelConfig
    private middleware: Array<(data: any) => any> = []
    private validators: Array<(data: any) => boolean> = []

    constructor(config: ChannelConfig) {
      this.config = config
      log.info(`Channel created: ${config.name}`)
    }

    /**
     * Adds middleware for data transformation
     */
    use(middleware: (data: any) => any): this {
      this.middleware.push(middleware)
      return this
    }

    /**
     * Adds validator
     */
    validate(validator: (data: any) => boolean): this {
      this.validators.push(validator)
      return this
    }

    /**
     * Processes data through the channel
     */
    async process(data: any): Promise<any> {
      let result = data

      // Apply input schema validation
      try {
        result = this.config.inputSchema.parse(result)
      } catch (error) {
        log.error(`Input validation failed for channel ${this.config.name}:`, error)
        throw new Error(`Invalid input for channel ${this.config.name}`)
      }

      // Apply transformation if configured
      if (this.config.transformation) {
        result = this.config.transformation(result)
      }

      // Apply middleware transformations
      for (const mw of this.middleware) {
        result = await Promise.resolve(mw(result))
      }

      // Apply validators
      for (const validator of this.validators) {
        if (!validator(result)) {
          throw new Error(`Validation failed for channel ${this.config.name}`)
        }
      }

      // Apply custom validation if configured
      if (this.config.validation && !this.config.validation(result)) {
        throw new Error(`Custom validation failed for channel ${this.config.name}`)
      }

      // Apply output schema validation
      try {
        result = this.config.outputSchema.parse(result)
      } catch (error) {
        log.error(`Output validation failed for channel ${this.config.name}:`, error)
        throw new Error(`Invalid output for channel ${this.config.name}`)
      }

      return result
    }

    getName(): string {
      return this.config.name
    }
  }

  /**
   * Tool Pipeline - executes tools in sequence with transformations
   */
  export class Pipeline {
    private name: string
    private steps: PipelineStep[]
    private channels: Map<string, Channel> = new Map()

    constructor(name: string, steps: PipelineStep[]) {
      this.name = name
      this.steps = steps
      log.info(`Pipeline created: ${name} with ${steps.length} steps`)
    }

    /**
     * Adds a channel for data transformation between steps
     */
    addChannel(channel: Channel): this {
      this.channels.set(channel.getName(), channel)
      return this
    }

    /**
     * Executes the pipeline
     */
    async execute(initialInput: any): Promise<any> {
      log.info(`Executing pipeline: ${this.name}`)
      const results: any[] = []
      let currentInput = initialInput

      for (let i = 0; i < this.steps.length; i++) {
        const step = this.steps[i]
        log.debug(`Pipeline step ${i + 1}/${this.steps.length}: ${step.tool.name}`)

        try {
          // Transform input if transformer is provided
          if (step.transform) {
            currentInput = step.transform(currentInput, results)
          }

          // Execute tool with retry logic
          const result = await this.executeWithRetry(step.tool, currentInput, step.retry)

          // Validate result if validator is provided
          if (step.validate && !step.validate(result)) {
            throw new Error(`Validation failed for step ${step.tool.name}`)
          }

          results.push(result)
          currentInput = result
        } catch (error) {
          log.error(`Pipeline step failed: ${step.tool.name}`, error)

          // Handle error with custom handler if provided
          if (step.onError) {
            const errorResult = step.onError(error as Error)
            results.push(errorResult)
            currentInput = errorResult
          } else {
            throw error
          }
        }
      }

      log.info(`Pipeline ${this.name} completed successfully`)
      return {
        finalResult: currentInput,
        intermediateResults: results,
      }
    }

    /**
     * Executes a tool with retry logic
     */
    private async executeWithRetry(
      tool: DynamicStructuredTool,
      input: any,
      retryConfig?: PipelineStep["retry"],
    ): Promise<any> {
      const maxAttempts = retryConfig?.maxAttempts || 1
      const delay = retryConfig?.delay || 1000
      const backoff = retryConfig?.backoff || "exponential"

      let lastError: Error | undefined

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          return await tool.invoke(input)
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          log.warn(`Tool execution attempt ${attempt + 1}/${maxAttempts} failed: ${tool.name}`)

          if (attempt < maxAttempts - 1) {
            const waitTime = backoff === "exponential" ? delay * Math.pow(2, attempt) : delay * (attempt + 1)
            log.debug(`Waiting ${waitTime}ms before retry...`)
            await new Promise((resolve) => setTimeout(resolve, waitTime))
          }
        }
      }

      throw lastError || new Error(`Tool execution failed: ${tool.name}`)
    }

    /**
     * Converts pipeline to a single LangChain tool
     */
    toTool(): DynamicStructuredTool {
      return new DynamicStructuredTool({
        name: this.name,
        description: `Pipeline: ${this.name}`,
        schema: z.object({
          input: z.any().describe("Input for the pipeline"),
        }),
        func: async (args: { input: any }) => {
          const result = await this.execute(args.input)
          return JSON.stringify(result)
        },
      })
    }
  }

  /**
   * Tool Router - routes inputs to different channels based on conditions
   */
  export class Router {
    private config: RouterConfig
    private channels: Map<string, Channel | Pipeline> = new Map()

    constructor(config: RouterConfig) {
      this.config = config
      log.info(`Router created: ${config.name}`)
    }

    /**
     * Registers a channel or pipeline
     */
    register(name: string, channelOrPipeline: Channel | Pipeline): this {
      this.channels.set(name, channelOrPipeline)
      log.debug(`Registered channel/pipeline: ${name} in router ${this.config.name}`)
      return this
    }

    /**
     * Routes input to the appropriate channel
     */
    async route(input: any): Promise<any> {
      log.info(`Routing input through ${this.config.name}`)

      // Sort routes by priority (higher priority first)
      const sortedRoutes = [...this.config.routes].sort((a, b) => b.priority - a.priority)

      // Find first matching route
      for (const route of sortedRoutes) {
        if (route.condition(input)) {
          log.info(`Route matched: ${route.channel}`)

          const target = this.channels.get(route.channel)
          if (!target) {
            throw new Error(`Channel ${route.channel} not found`)
          }

          if (target instanceof Channel) {
            return await target.process(input)
          } else if (target instanceof Pipeline) {
            return await target.execute(input)
          }
        }
      }

      // Use default channel if no route matched
      if (this.config.defaultChannel) {
        log.info(`No route matched, using default: ${this.config.defaultChannel}`)

        const defaultTarget = this.channels.get(this.config.defaultChannel)
        if (!defaultTarget) {
          throw new Error(`Default channel ${this.config.defaultChannel} not found`)
        }

        if (defaultTarget instanceof Channel) {
          return await defaultTarget.process(input)
        } else if (defaultTarget instanceof Pipeline) {
          return await defaultTarget.execute(input)
        }
      }

      throw new Error(`No matching route found and no default channel configured`)
    }

    /**
     * Converts router to a LangChain tool
     */
    toTool(): DynamicStructuredTool {
      return new DynamicStructuredTool({
        name: this.config.name,
        description: `Router: ${this.config.name}`,
        schema: z.object({
          input: z.any().describe("Input for routing"),
        }),
        func: async (args: { input: any }) => {
          const result = await this.route(args.input)
          return JSON.stringify(result)
        },
      })
    }
  }

  /**
   * Tool Composer - composes multiple tools into complex workflows
   */
  export class Composer {
    private tools: Map<string, DynamicStructuredTool> = new Map()
    private compositions: Map<string, CompositeToolConfig> = new Map()

    /**
     * Registers a tool
     */
    registerTool(tool: DynamicStructuredTool): this {
      this.tools.set(tool.name, tool)
      log.debug(`Registered tool: ${tool.name}`)
      return this
    }

    /**
     * Creates a composite tool from multiple tools
     */
    compose(config: CompositeToolConfig): DynamicStructuredTool {
      this.compositions.set(config.name, config)

      return new DynamicStructuredTool({
        name: config.name,
        description: config.description,
        schema: config.inputSchema,
        func: async (input: any) => {
          log.info(`Executing composite tool: ${config.name}`)

          const results: Record<string, any> = {}

          // Execute based on execution strategy
          if (config.strategy === "parallel") {
            // Execute all tools in parallel
            const promises = config.tools.map(async (toolConfig) => {
              const tool = this.tools.get(toolConfig.name)
              if (!tool) {
                throw new Error(`Tool ${toolConfig.name} not found`)
              }

              const toolInput = toolConfig.inputTransform ? toolConfig.inputTransform(input, results) : input

              const result = await tool.invoke(toolInput)
              return { name: toolConfig.name, result }
            })

            const toolResults = await Promise.all(promises)
            for (const { name, result } of toolResults) {
              results[name] = result
            }
          } else if (config.strategy === "sequential") {
            // Execute tools sequentially
            for (const toolConfig of config.tools) {
              const tool = this.tools.get(toolConfig.name)
              if (!tool) {
                throw new Error(`Tool ${toolConfig.name} not found`)
              }

              const toolInput = toolConfig.inputTransform ? toolConfig.inputTransform(input, results) : input

              results[toolConfig.name] = await tool.invoke(toolInput)
            }
          } else if (config.strategy === "conditional") {
            // Execute tools based on conditions
            for (const toolConfig of config.tools) {
              if (toolConfig.condition && !toolConfig.condition(input, results)) {
                log.debug(`Skipping tool ${toolConfig.name} - condition not met`)
                continue
              }

              const tool = this.tools.get(toolConfig.name)
              if (!tool) {
                throw new Error(`Tool ${toolConfig.name} not found`)
              }

              const toolInput = toolConfig.inputTransform ? toolConfig.inputTransform(input, results) : input

              results[toolConfig.name] = await tool.invoke(toolInput)
            }
          }

          // Apply output transform if configured
          const finalResult = config.outputTransform ? config.outputTransform(results) : results

          return typeof finalResult === "string" ? finalResult : JSON.stringify(finalResult)
        },
      })
    }
  }

  export interface CompositeToolConfig {
    name: string
    description: string
    inputSchema: z.ZodTypeAny
    strategy: "parallel" | "sequential" | "conditional"
    tools: {
      name: string
      inputTransform?: (originalInput: any, previousResults: Record<string, any>) => any
      condition?: (originalInput: any, previousResults: Record<string, any>) => boolean
    }[]
    outputTransform?: (results: Record<string, any>) => any
  }

  /**
   * Creates a fan-out/fan-in pattern
   */
  export function createFanOutFanIn(
    name: string,
    fanOutTools: DynamicStructuredTool[],
    aggregator: (results: any[]) => any,
  ): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: name,
      description: `Fan-out/Fan-in pattern: ${name}`,
      schema: z.object({
        input: z.any().describe("Input for fan-out"),
      }),
      func: async (args: { input: any }) => {
        log.info(`Executing fan-out/fan-in: ${name}`)

        // Fan-out: execute all tools in parallel
        const results = await Promise.all(fanOutTools.map((tool) => tool.invoke(args.input)))

        // Fan-in: aggregate results
        const aggregated = aggregator(results)

        return typeof aggregated === "string" ? aggregated : JSON.stringify(aggregated)
      },
    })
  }
}
