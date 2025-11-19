/**
 * LangChain Session Processor Integration
 * Integrates LangChain workflows with OpenCode's session processor
 */

import { SessionProcessor } from "../session/processor"
import { LangChainProvider } from "./provider"
import { LangGraph } from "./graph"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { Log } from "../util/log"
import type { Session } from "../session"

export namespace LangChainProcessor {
  const log = Log.create({ service: "langchain-processor" })

  /**
   * Wraps a LangChain workflow for use in OpenCode session processing
   */
  export async function createWorkflowProcessor(
    workflow: LangGraph.AgentWorkflow | LangGraph.CodeReviewWorkflow,
    task: string,
    context?: Record<string, any>,
  ) {
    return async () => {
      log.info("Starting LangChain workflow processor")

      try {
        // Execute the workflow
        const result = await workflow.execute(task, context)

        // Convert result to session-compatible format
        return {
          text: typeof result.context.finalResponse === "string"
            ? result.context.finalResponse
            : JSON.stringify(result.context.finalResponse, null, 2),
          metadata: {
            workflowType: workflow instanceof LangGraph.AgentWorkflow ? "agent" : "code_review",
            steps: result.results.length,
            context: result.context,
          },
        }
      } catch (error) {
        log.error("Workflow execution failed:", error)
        throw error
      }
    }
  }

  /**
   * Creates a resumable LangChain workflow session
   */
  export async function createResumableWorkflow(input: {
    sessionID: string
    task: string
    agentType: string
    model: string
    tools: DynamicStructuredTool[]
    session: Session.Type
    previousState?: any
  }) {
    log.info(`Creating resumable workflow for session ${input.sessionID}`)

    // Create the model
    const chatModel = await LangChainProvider.createChatModel({
      provider: input.model.split("/")[0],
      model: input.model.split("/")[1],
    })

    // Create workflow based on type
    let workflow: LangGraph.AgentWorkflow | LangGraph.CodeReviewWorkflow

    if (input.agentType === "code_review") {
      workflow = new LangGraph.CodeReviewWorkflow(chatModel)
    } else {
      workflow = new LangGraph.AgentWorkflow(chatModel, input.tools, input.session)
    }

    // Restore previous state if resuming
    const initialContext = input.previousState || {}

    return {
      workflow,
      execute: async () => {
        return await workflow.execute(input.task, initialContext)
      },
      getState: () => initialContext,
    }
  }

  /**
   * Streams LangChain workflow execution results
   */
  export async function* streamWorkflowExecution(
    workflow: LangGraph.AgentWorkflow,
    task: string,
    context?: Record<string, any>,
  ): AsyncGenerator<{ type: string; content: string; metadata?: any }, void, unknown> {
    log.info("Streaming workflow execution")

    // Yield start event
    yield {
      type: "workflow-start",
      content: `Starting workflow: ${task}`,
      metadata: { task, context },
    }

    try {
      // Execute workflow (in future versions, this could be made truly streaming)
      const result = await workflow.execute(task, context)

      // Yield intermediate results
      for (let i = 0; i < result.results.length; i++) {
        yield {
          type: "workflow-step",
          content: `Step ${i + 1}/${result.results.length} completed`,
          metadata: result.results[i],
        }
      }

      // Yield final result
      yield {
        type: "workflow-complete",
        content: String(result.context.finalResponse),
        metadata: {
          totalSteps: result.results.length,
          context: result.context,
        },
      }
    } catch (error) {
      log.error("Streaming workflow failed:", error)
      yield {
        type: "workflow-error",
        content: error instanceof Error ? error.message : String(error),
        metadata: { error },
      }
      throw error
    }
  }

  /**
   * Converts LangChain workflow to OpenCode tool
   */
  export function workflowToTool(input: {
    name: string
    description: string
    workflow: LangGraph.AgentWorkflow | LangGraph.CodeReviewWorkflow
    taskParameter?: string
  }): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: input.name,
      description: input.description,
      schema: input.taskParameter
        ? { type: "object", properties: { [input.taskParameter]: { type: "string" } } }
        : { type: "object", properties: { task: { type: "string" } } },
      func: async (args: any) => {
        const task = input.taskParameter ? args[input.taskParameter] : args.task
        const result = await input.workflow.execute(task)
        return typeof result.context.finalResponse === "string"
          ? result.context.finalResponse
          : JSON.stringify(result.context.finalResponse)
      },
    } as any)
  }

  /**
   * Batch process multiple tasks through a workflow
   */
  export async function batchProcess(
    workflow: LangGraph.AgentWorkflow,
    tasks: string[],
    options: {
      parallel?: boolean
      maxConcurrency?: number
      onProgress?: (completed: number, total: number) => void
    } = {},
  ): Promise<any[]> {
    const { parallel = false, maxConcurrency = 3, onProgress } = options

    log.info(`Batch processing ${tasks.length} tasks`, { parallel, maxConcurrency })

    if (!parallel) {
      // Sequential processing
      const results = []
      for (let i = 0; i < tasks.length; i++) {
        const result = await workflow.execute(tasks[i])
        results.push(result)
        if (onProgress) onProgress(i + 1, tasks.length)
      }
      return results
    } else {
      // Parallel processing with concurrency limit
      const results: any[] = new Array(tasks.length)
      let completed = 0

      const executeTask = async (index: number) => {
        try {
          results[index] = await workflow.execute(tasks[index])
          completed++
          if (onProgress) onProgress(completed, tasks.length)
        } catch (error) {
          log.error(`Task ${index} failed:`, error)
          results[index] = { error: error instanceof Error ? error.message : String(error) }
          completed++
          if (onProgress) onProgress(completed, tasks.length)
        }
      }

      // Process in batches
      for (let i = 0; i < tasks.length; i += maxConcurrency) {
        const batch = tasks.slice(i, i + maxConcurrency)
        await Promise.all(batch.map((_, idx) => executeTask(i + idx)))
      }

      return results
    }
  }

  /**
   * Checkpoint manager for long-running workflows
   */
  export class WorkflowCheckpoint {
    private checkpoints: Map<string, any> = new Map()

    constructor(private sessionID: string) {
      log.debug(`Checkpoint manager initialized for session ${sessionID}`)
    }

    /**
     * Save checkpoint
     */
    save(step: string, state: any): void {
      this.checkpoints.set(step, {
        timestamp: Date.now(),
        state,
      })
      log.debug(`Checkpoint saved: ${step}`)
    }

    /**
     * Load checkpoint
     */
    load(step: string): any | undefined {
      const checkpoint = this.checkpoints.get(step)
      if (checkpoint) {
        log.debug(`Checkpoint loaded: ${step}`)
        return checkpoint.state
      }
      return undefined
    }

    /**
     * Get all checkpoints
     */
    getAll(): Record<string, any> {
      const result: Record<string, any> = {}
      for (const [step, checkpoint] of this.checkpoints.entries()) {
        result[step] = checkpoint
      }
      return result
    }

    /**
     * Clear checkpoints
     */
    clear(): void {
      this.checkpoints.clear()
      log.debug("All checkpoints cleared")
    }

    /**
     * Resume from checkpoint
     */
    async resume(
      workflow: LangGraph.AgentWorkflow,
      fromStep: string,
      task: string,
    ): Promise<any> {
      const checkpoint = this.load(fromStep)
      if (!checkpoint) {
        throw new Error(`Checkpoint ${fromStep} not found`)
      }

      log.info(`Resuming workflow from checkpoint: ${fromStep}`)
      return await workflow.execute(task, checkpoint)
    }
  }
}
