/**
 * LangChain/LangGraph Configuration Schema for OpenCode
 * Extends OpenCode's configuration system with LangChain-specific options
 */

import { z } from "zod"

export namespace LangChainConfig {
  /**
   * LangChain workflow configuration
   */
  export const WorkflowConfig = z.object({
    enabled: z.boolean().default(true).describe("Enable LangChain workflows"),
    defaultStrategy: z.enum(["parallel", "sequential", "conditional"]).default("sequential"),
    retryConfig: z
      .object({
        enabled: z.boolean().default(true),
        maxAttempts: z.number().int().min(1).max(10).default(3),
        delay: z.number().int().min(100).max(10000).default(1000),
        backoff: z.enum(["linear", "exponential"]).default("exponential"),
      })
      .optional(),
    timeout: z.number().int().min(1000).default(30000).describe("Default timeout for workflow execution in ms"),
  })

  export type WorkflowConfig = z.infer<typeof WorkflowConfig>

  /**
   * LangGraph flow configuration
   */
  export const FlowConfig = z.object({
    enabled: z.boolean().default(true).describe("Enable LangGraph flows"),
    flows: z
      .record(
        z.string(),
        z.object({
          description: z.string(),
          type: z.enum(["agent", "code_review", "multi_agent"]),
          model: z.string().optional(),
          tools: z.array(z.string()).optional(),
          config: z.record(z.string(), z.any()).optional(),
        }),
      )
      .default({}),
    visualization: z
      .object({
        enabled: z.boolean().default(false),
        format: z.enum(["mermaid", "graphviz", "ascii"]).default("mermaid"),
      })
      .optional(),
  })

  export type FlowConfig = z.infer<typeof FlowConfig>

  /**
   * MCP-LangChain bridge configuration
   */
  export const MCPBridgeConfig = z.object({
    enabled: z.boolean().default(true).describe("Enable MCP-LangChain bridge"),
    autoRegisterServers: z.boolean().default(true).describe("Automatically register all configured MCP servers"),
    serverPrefixInToolName: z.boolean().default(true).describe("Prefix tool names with MCP server name"),
    refreshInterval: z.number().int().min(0).default(0).describe("Auto-refresh interval in seconds (0 = disabled)"),
    resourceSync: z
      .object({
        enabled: z.boolean().default(false),
        syncToMemory: z.boolean().default(false),
      })
      .optional(),
  })

  export type MCPBridgeConfig = z.infer<typeof MCPBridgeConfig>

  /**
   * Tool channeling configuration
   */
  export const ChannelConfig = z.object({
    enabled: z.boolean().default(true).describe("Enable tool channeling"),
    channels: z
      .record(
        z.string(),
        z.object({
          description: z.string(),
          middleware: z.array(z.string()).optional(),
          validators: z.array(z.string()).optional(),
        }),
      )
      .default({}),
    pipelines: z
      .record(
        z.string(),
        z.object({
          description: z.string(),
          steps: z.array(
            z.object({
              tool: z.string(),
              retry: z
                .object({
                  maxAttempts: z.number().int().min(1).default(3),
                  delay: z.number().int().min(100).default(1000),
                  backoff: z.enum(["linear", "exponential"]).default("exponential"),
                })
                .optional(),
            }),
          ),
        }),
      )
      .default({}),
    routers: z
      .record(
        z.string(),
        z.object({
          description: z.string(),
          routes: z.array(
            z.object({
              channel: z.string(),
              priority: z.number().int().min(0).default(0),
            }),
          ),
          defaultChannel: z.string().optional(),
        }),
      )
      .default({}),
  })

  export type ChannelConfig = z.infer<typeof ChannelConfig>

  /**
   * Main LangChain configuration
   */
  export const Config = z.object({
    langchain: z
      .object({
        workflow: WorkflowConfig.optional(),
        flow: FlowConfig.optional(),
        mcpBridge: MCPBridgeConfig.optional(),
        channel: ChannelConfig.optional(),
        logging: z
          .object({
            enabled: z.boolean().default(true),
            level: z.enum(["debug", "info", "warn", "error"]).default("info"),
            verbose: z.boolean().default(false),
          })
          .optional(),
      })
      .optional(),
  })

  export type Config = z.infer<typeof Config>

  /**
   * Default configuration
   */
  export const defaultConfig: Config = {
    langchain: {
      workflow: {
        enabled: true,
        defaultStrategy: "sequential",
        retryConfig: {
          enabled: true,
          maxAttempts: 3,
          delay: 1000,
          backoff: "exponential",
        },
        timeout: 30000,
      },
      flow: {
        enabled: true,
        flows: {},
        visualization: {
          enabled: false,
          format: "mermaid",
        },
      },
      mcpBridge: {
        enabled: true,
        autoRegisterServers: true,
        serverPrefixInToolName: true,
        refreshInterval: 0,
        resourceSync: {
          enabled: false,
          syncToMemory: false,
        },
      },
      channel: {
        enabled: true,
        channels: {},
        pipelines: {},
        routers: {},
      },
      logging: {
        enabled: true,
        level: "info",
        verbose: false,
      },
    },
  }

  /**
   * Validates and returns LangChain configuration
   */
  export function validate(config: unknown): Config {
    return Config.parse(config)
  }

  /**
   * Merges user config with defaults
   */
  export function merge(userConfig: Partial<Config>): Config {
    return {
      langchain: {
        ...defaultConfig.langchain,
        ...userConfig.langchain,
        workflow: {
          ...defaultConfig.langchain!.workflow,
          ...userConfig.langchain?.workflow,
        },
        flow: {
          ...defaultConfig.langchain!.flow,
          ...userConfig.langchain?.flow,
        },
        mcpBridge: {
          ...defaultConfig.langchain!.mcpBridge,
          ...userConfig.langchain?.mcpBridge,
        },
        channel: {
          ...defaultConfig.langchain!.channel,
          ...userConfig.langchain?.channel,
        },
        logging: {
          ...defaultConfig.langchain!.logging,
          ...userConfig.langchain?.logging,
        },
      },
    }
  }
}
