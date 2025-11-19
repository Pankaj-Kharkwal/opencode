/**
 * LangChain Provider Adapter for OpenCode
 * Bridges OpenCode's AI provider system with LangChain's model interfaces
 */

import { ChatAnthropic } from "@langchain/anthropic"
import { ChatOpenAI } from "@langchain/openai"
import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages"
import { Config } from "../config/config"
import { Log } from "../util/log"
import { Auth } from "../auth"
import type { Provider as AISDKProvider } from "ai"

export namespace LangChainProvider {
  const log = Log.create({ service: "langchain-provider" })

  export interface ProviderConfig {
    provider: string
    model: string
    temperature?: number
    maxTokens?: number
    streaming?: boolean
    apiKey?: string
    baseURL?: string
  }

  export interface ModelOptions {
    temperature?: number
    maxTokens?: number
    topP?: number
    frequencyPenalty?: number
    presencePenalty?: number
    streaming?: boolean
  }

  /**
   * Creates a LangChain chat model from OpenCode provider configuration
   */
  export async function createChatModel(config: ProviderConfig, options?: ModelOptions): Promise<BaseChatModel> {
    const { provider, model, apiKey, baseURL } = config
    const mergedOptions = {
      temperature: options?.temperature ?? config.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? config.maxTokens ?? 4096,
      streaming: options?.streaming ?? config.streaming ?? true,
      topP: options?.topP,
      frequencyPenalty: options?.frequencyPenalty,
      presencePenalty: options?.presencePenalty,
    }

    log.info(`Creating LangChain model for provider: ${provider}, model: ${model}`)

    switch (provider.toLowerCase()) {
      case "anthropic": {
        const authData = await Auth.get("anthropic")
        const key = apiKey || authData?.apiKey || process.env.ANTHROPIC_API_KEY
        if (!key) {
          throw new Error("Anthropic API key not found")
        }

        return new ChatAnthropic({
          anthropicApiKey: key,
          model: model,
          temperature: mergedOptions.temperature,
          maxTokens: mergedOptions.maxTokens,
          streaming: mergedOptions.streaming,
          clientOptions: {
            defaultHeaders: {
              "anthropic-beta":
                "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
            },
          },
        })
      }

      case "openai": {
        const authData = await Auth.get("openai")
        const key = apiKey || authData?.apiKey || process.env.OPENAI_API_KEY
        if (!key) {
          throw new Error("OpenAI API key not found")
        }

        return new ChatOpenAI({
          openAIApiKey: key,
          model: model,
          temperature: mergedOptions.temperature,
          maxTokens: mergedOptions.maxTokens,
          streaming: mergedOptions.streaming,
          topP: mergedOptions.topP,
          frequencyPenalty: mergedOptions.frequencyPenalty,
          presencePenalty: mergedOptions.presencePenalty,
          configuration: baseURL ? { baseURL } : undefined,
        })
      }

      case "openrouter": {
        const authData = await Auth.get("openrouter")
        const key = apiKey || authData?.apiKey || process.env.OPENROUTER_API_KEY
        if (!key) {
          throw new Error("OpenRouter API key not found")
        }

        return new ChatOpenAI({
          openAIApiKey: key,
          model: model,
          temperature: mergedOptions.temperature,
          maxTokens: mergedOptions.maxTokens,
          streaming: mergedOptions.streaming,
          configuration: {
            baseURL: baseURL || "https://openrouter.ai/api/v1",
            defaultHeaders: {
              "HTTP-Referer": "https://opencode.ai/",
              "X-Title": "opencode",
            },
          },
        })
      }

      default:
        throw new Error(`Unsupported provider for LangChain: ${provider}`)
    }
  }

  /**
   * Converts OpenCode messages to LangChain message format
   */
  export function convertToLangChainMessages(messages: any[]): BaseMessage[] {
    return messages.map((msg) => {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)

      switch (msg.role) {
        case "user":
          return new HumanMessage(content)
        case "assistant":
          return new AIMessage(content)
        case "system":
          return new SystemMessage(content)
        default:
          return new HumanMessage(content)
      }
    })
  }

  /**
   * Converts LangChain messages back to OpenCode format
   */
  export function convertFromLangChainMessages(messages: BaseMessage[]): any[] {
    return messages.map((msg) => {
      if (msg._getType() === "human") {
        return { role: "user", content: msg.content }
      } else if (msg._getType() === "ai") {
        return { role: "assistant", content: msg.content }
      } else if (msg._getType() === "system") {
        return { role: "system", content: msg.content }
      }
      return { role: "user", content: msg.content }
    })
  }

  /**
   * Gets the current model configuration from OpenCode config
   */
  export async function getCurrentModelConfig(): Promise<ProviderConfig> {
    const config = await Config.read()
    const defaultProvider = config.provider || "anthropic"
    const defaultModel = config.model || "claude-sonnet-4-5"

    return {
      provider: defaultProvider,
      model: defaultModel,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    }
  }

  /**
   * Tests the LangChain provider connection
   */
  export async function testConnection(config: ProviderConfig): Promise<boolean> {
    try {
      const model = await createChatModel(config, { maxTokens: 100 })
      const response = await model.invoke([new HumanMessage("Say 'test successful' if you can read this.")])
      log.info("Connection test successful:", response.content)
      return true
    } catch (error) {
      log.error("Connection test failed:", error)
      return false
    }
  }
}
