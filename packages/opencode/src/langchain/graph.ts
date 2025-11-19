/**
 * LangGraph Workflow System for OpenCode
 * Provides state-based workflow orchestration for complex agent tasks
 */

import { StateGraph, END, START, Annotation } from "@langchain/langgraph"
import { BaseMessage } from "@langchain/core/messages"
import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { Log } from "../util/log"
import type { Session } from "../session"

export namespace LangGraph {
  const log = Log.create({ service: "langgraph" })

  /**
   * Base state for all workflows
   */
  export const WorkflowState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (left, right) => left.concat(right),
      default: () => [],
    }),
    tools: Annotation<DynamicStructuredTool[]>({
      reducer: (left, right) => right ?? left,
      default: () => [],
    }),
    context: Annotation<Record<string, any>>({
      reducer: (left, right) => ({ ...left, ...right }),
      default: () => ({}),
    }),
    currentTask: Annotation<string>({
      reducer: (_, right) => right ?? "",
      default: () => "",
    }),
    results: Annotation<any[]>({
      reducer: (left, right) => left.concat(right),
      default: () => [],
    }),
    error: Annotation<string | null>({
      reducer: (_, right) => right,
      default: () => null,
    }),
  })

  export type WorkflowStateType = typeof WorkflowState.State

  /**
   * Agent workflow for complex multi-step tasks
   */
  export class AgentWorkflow {
    private graph: StateGraph<WorkflowStateType>
    private model: BaseChatModel
    private tools: DynamicStructuredTool[]
    private session: Session.Type

    constructor(model: BaseChatModel, tools: DynamicStructuredTool[], session: Session.Type) {
      this.model = model
      this.tools = tools
      this.session = session
      this.graph = new StateGraph(WorkflowState)

      this.buildGraph()
    }

    /**
     * Builds the workflow graph
     */
    private buildGraph(): void {
      // Add nodes
      this.graph.addNode("analyze", this.analyzeTask.bind(this))
      this.graph.addNode("plan", this.planExecution.bind(this))
      this.graph.addNode("execute", this.executeTools.bind(this))
      this.graph.addNode("validate", this.validateResults.bind(this))
      this.graph.addNode("synthesize", this.synthesizeResponse.bind(this))

      // Add edges
      this.graph.addEdge(START, "analyze")
      this.graph.addEdge("analyze", "plan")
      this.graph.addEdge("plan", "execute")
      this.graph.addEdge("execute", "validate")
      this.graph.addConditionalEdges("validate", this.shouldRetry.bind(this), {
        retry: "execute",
        continue: "synthesize",
      })
      this.graph.addEdge("synthesize", END)

      log.info("Agent workflow graph built successfully")
    }

    /**
     * Analyzes the task to understand requirements
     */
    private async analyzeTask(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
      log.info("Analyzing task...")

      const prompt = `Analyze this task and identify:
1. The main objective
2. Required tools or capabilities
3. Potential challenges
4. Success criteria

Task: ${state.currentTask}

Provide a structured analysis.`

      const response = await this.model.invoke([...state.messages, { role: "user", content: prompt } as any])

      return {
        messages: [response],
        context: {
          ...state.context,
          analysis: response.content,
        },
      }
    }

    /**
     * Plans the execution strategy
     */
    private async planExecution(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
      log.info("Planning execution...")

      const toolNames = this.tools.map((t) => t.name).join(", ")
      const prompt = `Based on the analysis, create a step-by-step execution plan.

Analysis: ${state.context.analysis}

Available tools: ${toolNames}

Provide a numbered list of steps, each specifying which tool to use and what input to provide.`

      const response = await this.model.invoke([...state.messages, { role: "user", content: prompt } as any])

      return {
        messages: [response],
        context: {
          ...state.context,
          plan: response.content,
        },
      }
    }

    /**
     * Executes the planned tools
     */
    private async executeTools(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
      log.info("Executing tools...")

      try {
        // Create a tool-calling agent
        const modelWithTools = this.model.bind({ tools: this.tools })
        const response = await modelWithTools.invoke([
          ...state.messages,
          {
            role: "user",
            content: `Execute the plan: ${state.context.plan}\n\nTask: ${state.currentTask}`,
          } as any,
        ])

        const results = []
        if ((response as any).tool_calls) {
          for (const toolCall of (response as any).tool_calls) {
            const tool = this.tools.find((t) => t.name === toolCall.name)
            if (tool) {
              const result = await tool.invoke(toolCall.args)
              results.push({ tool: toolCall.name, result })
            }
          }
        }

        return {
          messages: [response],
          results: results,
          error: null,
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        log.error("Tool execution failed:", errorMsg)
        return {
          error: errorMsg,
        }
      }
    }

    /**
     * Validates execution results
     */
    private async validateResults(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
      log.info("Validating results...")

      if (state.error) {
        return {
          context: {
            ...state.context,
            validationStatus: "failed",
            retryCount: (state.context.retryCount || 0) + 1,
          },
        }
      }

      const resultsStr = JSON.stringify(state.results, null, 2)
      const prompt = `Validate if these results successfully complete the task:

Task: ${state.currentTask}
Plan: ${state.context.plan}
Results: ${resultsStr}

Respond with:
1. "SUCCESS" if the task is complete
2. "RETRY" if the task should be retried with modifications
3. "FAILED" if the task cannot be completed

Followed by an explanation.`

      const response = await this.model.invoke([...state.messages, { role: "user", content: prompt } as any])
      const content = String(response.content)
      const validationStatus = content.includes("SUCCESS") ? "success" : content.includes("RETRY") ? "retry" : "failed"

      return {
        messages: [response],
        context: {
          ...state.context,
          validationStatus,
          validationReason: content,
        },
      }
    }

    /**
     * Determines if execution should be retried
     */
    private shouldRetry(state: WorkflowStateType): "retry" | "continue" {
      const maxRetries = 3
      const retryCount = state.context.retryCount || 0

      if (state.context.validationStatus === "retry" && retryCount < maxRetries) {
        log.info(`Retrying execution (attempt ${retryCount + 1}/${maxRetries})`)
        return "retry"
      }

      return "continue"
    }

    /**
     * Synthesizes the final response
     */
    private async synthesizeResponse(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
      log.info("Synthesizing final response...")

      const resultsStr = JSON.stringify(state.results, null, 2)
      const prompt = `Synthesize a clear, concise final response for the user.

Original task: ${state.currentTask}
Execution results: ${resultsStr}
Validation: ${state.context.validationReason}

Provide a user-friendly summary of what was accomplished.`

      const response = await this.model.invoke([...state.messages, { role: "user", content: prompt } as any])

      return {
        messages: [response],
        context: {
          ...state.context,
          finalResponse: response.content,
        },
      }
    }

    /**
     * Compiles and returns the executable workflow
     */
    compile() {
      return this.graph.compile()
    }

    /**
     * Executes the workflow with a given task
     */
    async execute(task: string, initialContext: Record<string, any> = {}): Promise<WorkflowStateType> {
      log.info(`Executing workflow for task: ${task}`)

      const compiled = this.compile()
      const initialState: Partial<WorkflowStateType> = {
        currentTask: task,
        context: initialContext,
        tools: this.tools,
      }

      try {
        const result = await compiled.invoke(initialState)
        log.info("Workflow execution completed successfully")
        return result as WorkflowStateType
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        log.error("Workflow execution failed:", errorMsg)
        throw error
      }
    }
  }

  /**
   * Code review workflow
   */
  export class CodeReviewWorkflow {
    private graph: StateGraph<WorkflowStateType>
    private model: BaseChatModel

    constructor(model: BaseChatModel) {
      this.model = model
      this.graph = new StateGraph(WorkflowState)
      this.buildGraph()
    }

    private buildGraph(): void {
      this.graph.addNode("analyze_code", this.analyzeCode.bind(this))
      this.graph.addNode("check_style", this.checkStyle.bind(this))
      this.graph.addNode("check_security", this.checkSecurity.bind(this))
      this.graph.addNode("check_performance", this.checkPerformance.bind(this))
      this.graph.addNode("generate_report", this.generateReport.bind(this))

      this.graph.addEdge(START, "analyze_code")
      this.graph.addEdge("analyze_code", "check_style")
      this.graph.addEdge("analyze_code", "check_security")
      this.graph.addEdge("analyze_code", "check_performance")
      this.graph.addEdge("check_style", "generate_report")
      this.graph.addEdge("check_security", "generate_report")
      this.graph.addEdge("check_performance", "generate_report")
      this.graph.addEdge("generate_report", END)
    }

    private async analyzeCode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
      const code = state.context.code
      const response = await this.model.invoke([
        { role: "user", content: `Analyze this code structure:\n\n${code}` } as any,
      ])
      return { messages: [response], context: { ...state.context, codeAnalysis: response.content } }
    }

    private async checkStyle(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
      const code = state.context.code
      const response = await this.model.invoke([
        { role: "user", content: `Check code style and best practices:\n\n${code}` } as any,
      ])
      return { results: [{ type: "style", findings: response.content }] }
    }

    private async checkSecurity(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
      const code = state.context.code
      const response = await this.model.invoke([
        {
          role: "user",
          content: `Check for security vulnerabilities (SQL injection, XSS, etc.):\n\n${code}`,
        } as any,
      ])
      return { results: [{ type: "security", findings: response.content }] }
    }

    private async checkPerformance(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
      const code = state.context.code
      const response = await this.model.invoke([
        { role: "user", content: `Analyze performance and suggest optimizations:\n\n${code}` } as any,
      ])
      return { results: [{ type: "performance", findings: response.content }] }
    }

    private async generateReport(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
      const findings = state.results
      const response = await this.model.invoke([
        {
          role: "user",
          content: `Generate a comprehensive code review report:\n\n${JSON.stringify(findings, null, 2)}`,
        } as any,
      ])
      return { context: { ...state.context, report: response.content } }
    }

    compile() {
      return this.graph.compile()
    }

    async execute(code: string): Promise<WorkflowStateType> {
      const compiled = this.compile()
      const result = await compiled.invoke({ context: { code } })
      return result as WorkflowStateType
    }
  }

  /**
   * Multi-agent collaboration workflow
   */
  export class MultiAgentWorkflow {
    private graph: StateGraph<WorkflowStateType>
    private agents: Map<string, BaseChatModel>

    constructor(agents: Map<string, BaseChatModel>) {
      this.agents = agents
      this.graph = new StateGraph(WorkflowState)
      this.buildGraph()
    }

    private buildGraph(): void {
      // Add nodes for each agent
      for (const [name, _] of this.agents) {
        this.graph.addNode(name, this.createAgentNode(name).bind(this))
      }

      this.graph.addNode("coordinator", this.coordinate.bind(this))

      // Coordinator decides which agent to route to
      this.graph.addEdge(START, "coordinator")
      this.graph.addConditionalEdges("coordinator", this.routeToAgent.bind(this))

      log.info(`Multi-agent workflow built with ${this.agents.size} agents`)
    }

    private createAgentNode(agentName: string) {
      return async (state: WorkflowStateType): Promise<Partial<WorkflowStateType>> => {
        const agent = this.agents.get(agentName)!
        const response = await agent.invoke(state.messages)
        return {
          messages: [response],
          context: { ...state.context, lastAgent: agentName },
        }
      }
    }

    private async coordinate(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
      const agentNames = Array.from(this.agents.keys()).join(", ")
      const coordinator = this.agents.values().next().value

      const response = await coordinator.invoke([
        ...state.messages,
        {
          role: "user",
          content: `You are a coordinator. Route this task to the most appropriate agent: ${agentNames}\n\nTask: ${state.currentTask}\n\nRespond with just the agent name.`,
        } as any,
      ])

      return {
        context: {
          ...state.context,
          selectedAgent: String(response.content).trim(),
        },
      }
    }

    private routeToAgent(state: WorkflowStateType): string {
      const selected = state.context.selectedAgent
      if (this.agents.has(selected)) {
        return selected
      }
      // Default to first agent
      return this.agents.keys().next().value
    }

    compile() {
      return this.graph.compile()
    }
  }
}
