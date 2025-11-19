/**
 * Resumable Workflow Integration for Task Tool
 * Enables LangChain workflows to be paused and resumed via OpenCode's task tool
 */

import { LangGraph } from "./graph"
import { LangChainProvider } from "./provider"
import { LangChainAdapters } from "./adapters"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { Log } from "../util/log"
import type { Session } from "../session"

export namespace ResumableWorkflow {
  const log = Log.create({ service: "resumable-workflow" })

  /**
   * Workflow state that can be serialized and resumed
   */
  export interface WorkflowState {
    workflowType: "agent" | "code_review" | "multi_agent"
    currentStep: number
    totalSteps: number
    completed: string[]
    pending: string[]
    context: Record<string, any>
    results: any[]
    task: string
    timestamp: number
  }

  /**
   * State manager for resumable workflows
   */
  export class StateManager {
    private states: Map<string, WorkflowState> = new Map()

    /**
     * Save workflow state
     */
    save(sessionID: string, state: WorkflowState): void {
      this.states.set(sessionID, {
        ...state,
        timestamp: Date.now(),
      })
      log.info(`Saved workflow state for session ${sessionID} (step ${state.currentStep}/${state.totalSteps})`)
    }

    /**
     * Load workflow state
     */
    load(sessionID: string): WorkflowState | undefined {
      const state = this.states.get(sessionID)
      if (state) {
        log.info(`Loaded workflow state for session ${sessionID} (step ${state.currentStep}/${state.totalSteps})`)
      }
      return state
    }

    /**
     * Check if session has saved state
     */
    has(sessionID: string): boolean {
      return this.states.has(sessionID)
    }

    /**
     * Delete workflow state
     */
    delete(sessionID: string): boolean {
      const deleted = this.states.delete(sessionID)
      if (deleted) {
        log.info(`Deleted workflow state for session ${sessionID}`)
      }
      return deleted
    }

    /**
     * Get all session IDs with saved states
     */
    getSessions(): string[] {
      return Array.from(this.states.keys())
    }

    /**
     * Serialize state to JSON
     */
    serialize(sessionID: string): string | undefined {
      const state = this.states.get(sessionID)
      if (state) {
        return JSON.stringify(state, null, 2)
      }
      return undefined
    }

    /**
     * Deserialize state from JSON
     */
    deserialize(sessionID: string, json: string): void {
      try {
        const state = JSON.parse(json) as WorkflowState
        this.states.set(sessionID, state)
        log.info(`Deserialized workflow state for session ${sessionID}`)
      } catch (error) {
        log.error(`Failed to deserialize state for ${sessionID}:`, error)
        throw new Error("Invalid workflow state JSON")
      }
    }
  }

  /**
   * Global state manager instance
   */
  const globalStateManager = new StateManager()

  /**
   * Get global state manager
   */
  export function getStateManager(): StateManager {
    return globalStateManager
  }

  /**
   * Create a resumable workflow
   */
  export async function createResumableWorkflow(input: {
    sessionID: string
    task: string
    workflowType: "agent" | "code_review"
    model?: string
    tools?: DynamicStructuredTool[]
    session: Session.Type
    resumeFromSessionID?: string
  }): Promise<{
    workflow: LangGraph.AgentWorkflow | LangGraph.CodeReviewWorkflow
    execute: () => Promise<any>
    pause: () => void
    getState: () => WorkflowState | undefined
  }> {
    log.info(`Creating resumable workflow for session ${input.sessionID}`)

    // Try to load previous state if resuming
    let previousState: WorkflowState | undefined
    if (input.resumeFromSessionID) {
      previousState = globalStateManager.load(input.resumeFromSessionID)
      if (!previousState) {
        log.warn(`No saved state found for session ${input.resumeFromSessionID}`)
      } else {
        log.info(`Resuming from session ${input.resumeFromSessionID}`)
      }
    }

    // Create model
    const modelConfig = input.model
      ? {
          provider: input.model.split("/")[0],
          model: input.model.split("/")[1],
        }
      : await LangChainProvider.getCurrentModelConfig()

    const chatModel = await LangChainProvider.createChatModel(modelConfig)

    // Create workflow
    let workflow: LangGraph.AgentWorkflow | LangGraph.CodeReviewWorkflow

    if (input.workflowType === "code_review") {
      workflow = new LangGraph.CodeReviewWorkflow(chatModel)
    } else {
      const tools = input.tools || LangChainAdapters.CommonToolAdapters.getAll(input.session)
      workflow = new LangGraph.AgentWorkflow(chatModel, tools, input.session)
    }

    // Track execution state
    let isPaused = false
    let currentState: WorkflowState = previousState || {
      workflowType: input.workflowType,
      currentStep: 0,
      totalSteps: 0,
      completed: [],
      pending: [],
      context: {},
      results: [],
      task: input.task,
      timestamp: Date.now(),
    }

    return {
      workflow,
      execute: async () => {
        log.info(`Executing resumable workflow for: ${input.task}`)

        const initialContext = previousState ? previousState.context : {}
        const result = await workflow.execute(input.task, initialContext)

        // Update state after execution
        currentState = {
          ...currentState,
          currentStep: result.results.length,
          totalSteps: result.results.length,
          completed: result.results.map((_, i) => `step_${i}`),
          pending: [],
          context: result.context,
          results: result.results,
          timestamp: Date.now(),
        }

        // Save final state
        globalStateManager.save(input.sessionID, currentState)

        return result
      },
      pause: () => {
        isPaused = true
        globalStateManager.save(input.sessionID, currentState)
        log.info(`Workflow paused for session ${input.sessionID}`)
      },
      getState: () => currentState,
    }
  }

  /**
   * Resume a workflow from a session ID
   */
  export async function resumeWorkflow(sessionID: string, session: Session.Type): Promise<any> {
    log.info(`Attempting to resume workflow for session ${sessionID}`)

    const state = globalStateManager.load(sessionID)
    if (!state) {
      throw new Error(`No saved workflow state found for session ${sessionID}`)
    }

    // Create the resumable workflow
    const { execute } = await createResumableWorkflow({
      sessionID: `${sessionID}_resumed`,
      task: state.task,
      workflowType: state.workflowType,
      session,
      resumeFromSessionID: sessionID,
    })

    // Execute from saved state
    return await execute()
  }

  /**
   * List all resumable workflows
   */
  export function listResumableWorkflows(): Array<{
    sessionID: string
    state: WorkflowState
  }> {
    const sessions = globalStateManager.getSessions()
    return sessions.map((sessionID) => ({
      sessionID,
      state: globalStateManager.load(sessionID)!,
    }))
  }

  /**
   * Create a task tool integration for resumable workflows
   */
  export function createResumableTaskTool(session: Session.Type): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: "resumable_langchain_workflow",
      description: "Start or resume a LangChain workflow with automatic state management",
      schema: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "The task to execute",
          },
          workflow_type: {
            type: "string",
            enum: ["agent", "code_review"],
            description: "Type of workflow to execute",
          },
          resume_session_id: {
            type: "string",
            description: "Session ID to resume from (optional)",
          },
        },
        required: ["task", "workflow_type"],
      } as any,
      func: async ({ task, workflow_type, resume_session_id }) => {
        const sessionID = `workflow_${Date.now()}`

        const { execute } = await createResumableWorkflow({
          sessionID,
          task,
          workflowType: workflow_type,
          session,
          resumeFromSessionID: resume_session_id,
        })

        const result = await execute()

        return JSON.stringify(
          {
            sessionID,
            status: "completed",
            result: result.context.finalResponse,
            canResume: true,
          },
          null,
          2,
        )
      },
    })
  }

  /**
   * Checkpoint-based workflow executor
   */
  export class CheckpointWorkflow {
    private checkpoints: Map<string, any> = new Map()
    private currentCheckpoint: string | null = null

    constructor(
      private workflow: LangGraph.AgentWorkflow,
      private sessionID: string,
    ) {
      log.info(`CheckpointWorkflow initialized for session ${sessionID}`)
    }

    /**
     * Execute workflow with checkpoints
     */
    async execute(task: string, checkpointNames: string[], context?: Record<string, any>): Promise<any> {
      log.info(`Executing workflow with ${checkpointNames.length} checkpoints`)

      let currentContext = context || {}

      for (let i = 0; i < checkpointNames.length; i++) {
        const checkpointName = checkpointNames[i]
        this.currentCheckpoint = checkpointName

        log.info(`Executing checkpoint: ${checkpointName} (${i + 1}/${checkpointNames.length})`)

        // Execute workflow
        const result = await this.workflow.execute(task, currentContext)

        // Save checkpoint
        this.checkpoints.set(checkpointName, {
          context: result.context,
          results: result.results,
          timestamp: Date.now(),
        })

        // Update context for next checkpoint
        currentContext = result.context

        log.info(`Checkpoint ${checkpointName} completed`)
      }

      return {
        checkpoints: Array.from(this.checkpoints.keys()),
        finalContext: currentContext,
      }
    }

    /**
     * Resume from a specific checkpoint
     */
    async resumeFrom(checkpointName: string, task: string, remainingCheckpoints: string[]): Promise<any> {
      const checkpoint = this.checkpoints.get(checkpointName)
      if (!checkpoint) {
        throw new Error(`Checkpoint ${checkpointName} not found`)
      }

      log.info(`Resuming from checkpoint: ${checkpointName}`)

      // Continue execution from this checkpoint
      return await this.execute(task, remainingCheckpoints, checkpoint.context)
    }

    /**
     * Get checkpoint data
     */
    getCheckpoint(name: string): any | undefined {
      return this.checkpoints.get(name)
    }

    /**
     * List all checkpoints
     */
    listCheckpoints(): string[] {
      return Array.from(this.checkpoints.keys())
    }
  }
}
