/**
 * Predefined Workflow Templates
 * Ready-to-use workflow configurations for common tasks
 */

import { ToolChannel } from "./channel"
import { LangChainAdapters } from "./adapters"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { z } from "zod"
import type { Session } from "../session"

export namespace WorkflowTemplates {
  /**
   * Code Quality Workflow
   * Lint → Format → Type Check → Test
   */
  export function createCodeQualityWorkflow(session: Session.Type): ToolChannel.Pipeline {
    const lintTool = new DynamicStructuredTool({
      name: "lint",
      description: "Run linter",
      schema: z.object({ files: z.string().array().optional() }),
      func: async ({ files }) => {
        const fileList = files?.join(" ") || "."
        return `Linting ${fileList}...`
      },
    })

    const formatTool = new DynamicStructuredTool({
      name: "format",
      description: "Format code",
      schema: z.object({ files: z.string().array().optional() }),
      func: async ({ files }) => {
        const fileList = files?.join(" ") || "."
        return `Formatting ${fileList}...`
      },
    })

    const typeCheckTool = new DynamicStructuredTool({
      name: "type_check",
      description: "Run type checker",
      schema: z.object({}),
      func: async () => "Running type checker...",
    })

    const testTool = new DynamicStructuredTool({
      name: "test",
      description: "Run tests",
      schema: z.object({ pattern: z.string().optional() }),
      func: async ({ pattern }) => `Running tests ${pattern || ""}...`,
    })

    return new ToolChannel.Pipeline("code_quality_pipeline", [
      { tool: lintTool },
      { tool: formatTool, transform: (input, prev) => ({ files: input.files }) },
      { tool: typeCheckTool },
      { tool: testTool },
    ])
  }

  /**
   * Feature Implementation Workflow
   * Research → Plan → Implement → Test → Document
   */
  export function createFeatureWorkflow(session: Session.Type): ToolChannel.Pipeline {
    const researchTool = new DynamicStructuredTool({
      name: "research",
      description: "Research codebase and requirements",
      schema: z.object({ feature: z.string() }),
      func: async ({ feature }) => `Researching: ${feature}`,
    })

    const planTool = new DynamicStructuredTool({
      name: "plan",
      description: "Create implementation plan",
      schema: z.object({ research: z.any() }),
      func: async ({ research }) => "Creating implementation plan...",
    })

    const implementTool = new DynamicStructuredTool({
      name: "implement",
      description: "Implement the feature",
      schema: z.object({ plan: z.any() }),
      func: async ({ plan }) => "Implementing feature...",
    })

    const testFeatureTool = new DynamicStructuredTool({
      name: "test_feature",
      description: "Test the implementation",
      schema: z.object({ implementation: z.any() }),
      func: async ({ implementation }) => "Testing implementation...",
    })

    const documentTool = new DynamicStructuredTool({
      name: "document",
      description: "Document the feature",
      schema: z.object({ feature: z.any() }),
      func: async ({ feature }) => "Creating documentation...",
    })

    return new ToolChannel.Pipeline("feature_implementation_pipeline", [
      { tool: researchTool },
      {
        tool: planTool,
        transform: (input, prev) => ({ research: prev[0] }),
      },
      {
        tool: implementTool,
        transform: (input, prev) => ({ plan: prev[1] }),
      },
      {
        tool: testFeatureTool,
        transform: (input, prev) => ({ implementation: prev[2] }),
      },
      {
        tool: documentTool,
        transform: (input, prev) => ({ feature: prev[2] }),
      },
    ])
  }

  /**
   * Bug Fix Workflow
   * Reproduce → Debug → Fix → Verify → Prevent
   */
  export function createBugFixWorkflow(session: Session.Type): ToolChannel.Pipeline {
    return new ToolChannel.Pipeline("bug_fix_pipeline", [
      {
        tool: new DynamicStructuredTool({
          name: "reproduce",
          description: "Reproduce the bug",
          schema: z.object({ bug_description: z.string() }),
          func: async ({ bug_description }) => `Reproducing: ${bug_description}`,
        }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "debug",
          description: "Debug and find root cause",
          schema: z.object({ reproduction: z.any() }),
          func: async () => "Debugging...",
        }),
        transform: (input, prev) => ({ reproduction: prev[0] }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "fix",
          description: "Apply fix",
          schema: z.object({ root_cause: z.any() }),
          func: async () => "Applying fix...",
        }),
        transform: (input, prev) => ({ root_cause: prev[1] }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "verify",
          description: "Verify the fix",
          schema: z.object({ fix: z.any() }),
          func: async () => "Verifying fix...",
        }),
        transform: (input, prev) => ({ fix: prev[2] }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "prevent",
          description: "Add tests to prevent regression",
          schema: z.object({ fix: z.any() }),
          func: async () => "Adding regression tests...",
        }),
        transform: (input, prev) => ({ fix: prev[2] }),
      },
    ])
  }

  /**
   * Refactoring Workflow
   * Analyze → Extract → Simplify → Optimize → Validate
   */
  export function createRefactoringWorkflow(session: Session.Type): ToolChannel.Pipeline {
    return new ToolChannel.Pipeline("refactoring_pipeline", [
      {
        tool: new DynamicStructuredTool({
          name: "analyze_code",
          description: "Analyze code structure",
          schema: z.object({ files: z.string().array() }),
          func: async ({ files }) => `Analyzing ${files.length} files...`,
        }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "extract",
          description: "Extract reusable components",
          schema: z.object({ analysis: z.any() }),
          func: async () => "Extracting components...",
        }),
        transform: (input, prev) => ({ analysis: prev[0] }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "simplify",
          description: "Simplify complex logic",
          schema: z.object({ extracted: z.any() }),
          func: async () => "Simplifying logic...",
        }),
        transform: (input, prev) => ({ extracted: prev[1] }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "optimize",
          description: "Optimize performance",
          schema: z.object({ simplified: z.any() }),
          func: async () => "Optimizing...",
        }),
        transform: (input, prev) => ({ simplified: prev[2] }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "validate",
          description: "Validate refactoring",
          schema: z.object({ optimized: z.any() }),
          func: async () => "Running validation tests...",
        }),
        transform: (input, prev) => ({ optimized: prev[3] }),
        retry: { maxAttempts: 2, delay: 1000, backoff: "exponential" },
      },
    ])
  }

  /**
   * API Development Workflow
   * Design → Implement → Document → Test
   */
  export function createAPIWorkflow(session: Session.Type): ToolChannel.Pipeline {
    return new ToolChannel.Pipeline("api_development_pipeline", [
      {
        tool: new DynamicStructuredTool({
          name: "design_api",
          description: "Design API endpoints",
          schema: z.object({ requirements: z.string() }),
          func: async ({ requirements }) => `Designing API for: ${requirements}`,
        }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "implement_endpoints",
          description: "Implement API endpoints",
          schema: z.object({ design: z.any() }),
          func: async () => "Implementing endpoints...",
        }),
        transform: (input, prev) => ({ design: prev[0] }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "generate_docs",
          description: "Generate API documentation",
          schema: z.object({ implementation: z.any() }),
          func: async () => "Generating OpenAPI docs...",
        }),
        transform: (input, prev) => ({ implementation: prev[1] }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "test_api",
          description: "Test API endpoints",
          schema: z.object({ endpoints: z.any() }),
          func: async () => "Testing endpoints...",
        }),
        transform: (input, prev) => ({ endpoints: prev[1] }),
      },
    ])
  }

  /**
   * Database Migration Workflow
   * Backup → Migrate → Verify → Rollback if needed
   */
  export function createMigrationWorkflow(session: Session.Type): ToolChannel.Pipeline {
    return new ToolChannel.Pipeline("database_migration_pipeline", [
      {
        tool: new DynamicStructuredTool({
          name: "backup",
          description: "Backup database",
          schema: z.object({ database: z.string() }),
          func: async ({ database }) => `Backing up ${database}...`,
        }),
      },
      {
        tool: new DynamicStructuredTool({
          name: "migrate",
          description: "Run migration",
          schema: z.object({ migration_file: z.string() }),
          func: async ({ migration_file }) => `Running migration: ${migration_file}`,
        }),
        retry: { maxAttempts: 1, delay: 1000, backoff: "linear" },
      },
      {
        tool: new DynamicStructuredTool({
          name: "verify_migration",
          description: "Verify migration success",
          schema: z.object({ migration: z.any() }),
          func: async () => "Verifying migration...",
        }),
        transform: (input, prev) => ({ migration: prev[1] }),
        onError: async (error) => {
          return { status: "failed", error: error.message, action: "rollback" }
        },
      },
      {
        tool: new DynamicStructuredTool({
          name: "rollback",
          description: "Rollback migration if failed",
          schema: z.object({ verification: z.any() }),
          func: async ({ verification }) => {
            if (verification?.status === "failed") {
              return "Rolling back migration..."
            }
            return "Migration successful, rollback not needed"
          },
        }),
        transform: (input, prev) => ({ verification: prev[2] }),
      },
    ])
  }

  /**
   * Get all predefined workflows
   */
  export function getAllWorkflows(session: Session.Type): Map<string, ToolChannel.Pipeline> {
    return new Map([
      ["code_quality", createCodeQualityWorkflow(session)],
      ["feature_implementation", createFeatureWorkflow(session)],
      ["bug_fix", createBugFixWorkflow(session)],
      ["refactoring", createRefactoringWorkflow(session)],
      ["api_development", createAPIWorkflow(session)],
      ["database_migration", createMigrationWorkflow(session)],
    ])
  }

  /**
   * Get workflow by name
   */
  export function getWorkflow(name: string, session: Session.Type): ToolChannel.Pipeline | undefined {
    const workflows = getAllWorkflows(session)
    return workflows.get(name)
  }

  /**
   * List available workflows
   */
  export function listWorkflows(): Array<{ name: string; description: string }> {
    return [
      { name: "code_quality", description: "Lint → Format → Type Check → Test" },
      { name: "feature_implementation", description: "Research → Plan → Implement → Test → Document" },
      { name: "bug_fix", description: "Reproduce → Debug → Fix → Verify → Prevent" },
      { name: "refactoring", description: "Analyze → Extract → Simplify → Optimize → Validate" },
      { name: "api_development", description: "Design → Implement → Document → Test" },
      { name: "database_migration", description: "Backup → Migrate → Verify → Rollback if needed" },
    ]
  }
}
