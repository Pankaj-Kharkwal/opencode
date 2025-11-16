/**
 * LangChain Integration for OpenCode
 * Modern AI agent orchestration with LangChain and LangGraph
 */

export { LangChainProvider } from "./provider"
export { LangChainTools } from "./tools"
export { LangGraph } from "./graph"
export { MCPLangChainBridge } from "./mcp-bridge"
export { ToolChannel } from "./channel"

// Re-export commonly used types
export type {
  LangChainProvider as Provider,
  LangChainTools as Tools,
  LangGraph as Graph,
  MCPLangChainBridge as MCPBridge,
  ToolChannel as Channel,
} from "./provider"
