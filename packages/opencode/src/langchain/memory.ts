/**
 * Memory and RAG Capabilities for LangChain Integration
 * Provides conversation history, vector stores, and retrieval-augmented generation
 */

import { BufferMemory, BufferWindowMemory } from "langchain/memory"
import { ChatMessageHistory } from "langchain/stores/message/in_memory"
import { MemoryVectorStore } from "langchain/vectorstores/memory"
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages"
import { Document } from "@langchain/core/documents"
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import { Log } from "../util/log"
import { LangChainProvider } from "./provider"
import type { Session } from "../session"
import { MessageV2 } from "../session/message-v2"

export namespace LangChainMemory {
  const log = Log.create({ service: "langchain-memory" })

  /**
   * Session-aware memory manager
   */
  export class SessionMemoryManager {
    private memories: Map<string, BufferMemory> = new Map()
    private vectorStores: Map<string, MemoryVectorStore> = new Map()

    constructor(private maxMessages: number = 100) {
      log.info("SessionMemoryManager initialized", { maxMessages })
    }

    /**
     * Get or create memory for a session
     */
    async getMemory(sessionID: string): Promise<BufferMemory> {
      if (!this.memories.has(sessionID)) {
        const memory = new BufferWindowMemory({
          k: this.maxMessages,
          returnMessages: true,
          memoryKey: "history",
        })
        this.memories.set(sessionID, memory)
        log.debug(`Created new memory for session ${sessionID}`)
      }
      return this.memories.get(sessionID)!
    }

    /**
     * Load OpenCode session messages into LangChain memory
     */
    async loadSessionMessages(sessionID: string): Promise<void> {
      log.info(`Loading messages for session ${sessionID}`)

      try {
        const messages = await MessageV2.list({ sessionID })
        const memory = await this.getMemory(sessionID)
        const history = new ChatMessageHistory()

        for (const msg of messages) {
          if (msg.info.role === "user") {
            const content = this.extractMessageContent(msg)
            await history.addMessage(new HumanMessage(content))
          } else if (msg.info.role === "assistant") {
            const content = this.extractMessageContent(msg)
            await history.addMessage(new AIMessage(content))
          } else if (msg.info.role === "system") {
            const content = this.extractMessageContent(msg)
            await history.addMessage(new SystemMessage(content))
          }
        }

        // Replace memory's chat history
        ;(memory as any).chatHistory = history

        log.info(`Loaded ${messages.length} messages into memory`)
      } catch (error) {
        log.error("Failed to load session messages:", error)
        throw error
      }
    }

    /**
     * Extract text content from OpenCode message
     */
    private extractMessageContent(msg: MessageV2.Info): string {
      const parts = msg.parts || []
      return parts
        .filter((p) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n")
    }

    /**
     * Save messages to memory
     */
    async saveMessages(sessionID: string, messages: BaseMessage[]): Promise<void> {
      const memory = await this.getMemory(sessionID)

      for (const message of messages) {
        await memory.chatHistory.addMessage(message)
      }

      log.debug(`Saved ${messages.length} messages to session ${sessionID}`)
    }

    /**
     * Get conversation history
     */
    async getHistory(sessionID: string): Promise<BaseMessage[]> {
      const memory = await this.getMemory(sessionID)
      const messages = await memory.chatHistory.getMessages()
      return messages
    }

    /**
     * Clear session memory
     */
    async clearMemory(sessionID: string): Promise<void> {
      const memory = await this.getMemory(sessionID)
      await memory.chatHistory.clear()
      log.info(`Cleared memory for session ${sessionID}`)
    }

    /**
     * Get memory variables for LangChain chains
     */
    async getMemoryVariables(sessionID: string): Promise<Record<string, any>> {
      const memory = await this.getMemory(sessionID)
      return await memory.loadMemoryVariables({})
    }
  }

  /**
   * Vector store manager for RAG
   */
  export class VectorStoreManager {
    private stores: Map<string, MemoryVectorStore> = new Map()
    private textSplitter: RecursiveCharacterTextSplitter

    constructor(
      private chunkSize: number = 1000,
      private chunkOverlap: number = 200,
    ) {
      this.textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
      })
      log.info("VectorStoreManager initialized", { chunkSize, chunkOverlap })
    }

    /**
     * Create or get vector store for a context
     */
    async getStore(contextID: string): Promise<MemoryVectorStore> {
      if (!this.stores.has(contextID)) {
        // Create empty vector store (would need embeddings in real use)
        const store = new MemoryVectorStore(undefined as any)
        this.stores.set(contextID, store)
        log.debug(`Created new vector store for context ${contextID}`)
      }
      return this.stores.get(contextID)!
    }

    /**
     * Index documents into vector store
     */
    async indexDocuments(
      contextID: string,
      documents: { content: string; metadata?: Record<string, any> }[],
    ): Promise<void> {
      log.info(`Indexing ${documents.length} documents into ${contextID}`)

      const store = await this.getStore(contextID)
      const docs: Document[] = []

      for (const doc of documents) {
        const chunks = await this.textSplitter.splitText(doc.content)
        for (let i = 0; i < chunks.length; i++) {
          docs.push(
            new Document({
              pageContent: chunks[i],
              metadata: {
                ...doc.metadata,
                chunk: i,
                totalChunks: chunks.length,
              },
            }),
          )
        }
      }

      await store.addDocuments(docs)
      log.info(`Indexed ${docs.length} chunks`)
    }

    /**
     * Index code files
     */
    async indexCodeFiles(
      contextID: string,
      files: { path: string; content: string; language?: string }[],
    ): Promise<void> {
      log.info(`Indexing ${files.length} code files`)

      const documents = files.map((file) => ({
        content: file.content,
        metadata: {
          type: "code",
          path: file.path,
          language: file.language,
        },
      }))

      await this.indexDocuments(contextID, documents)
    }

    /**
     * Search similar documents
     */
    async similaritySearch(
      contextID: string,
      query: string,
      k: number = 5,
    ): Promise<Document[]> {
      const store = await this.getStore(contextID)
      const results = await store.similaritySearch(query, k)
      log.debug(`Found ${results.length} similar documents for query`)
      return results
    }

    /**
     * Search with score threshold
     */
    async similaritySearchWithScore(
      contextID: string,
      query: string,
      k: number = 5,
      scoreThreshold: number = 0.7,
    ): Promise<[Document, number][]> {
      const store = await this.getStore(contextID)
      const results = await store.similaritySearchWithScore(query, k)
      return results.filter(([_, score]) => score >= scoreThreshold)
    }

    /**
     * Delete vector store
     */
    deleteStore(contextID: string): void {
      this.stores.delete(contextID)
      log.info(`Deleted vector store: ${contextID}`)
    }
  }

  /**
   * RAG (Retrieval-Augmented Generation) system
   */
  export class RAGSystem {
    private vectorManager: VectorStoreManager
    private memoryManager: SessionMemoryManager

    constructor() {
      this.vectorManager = new VectorStoreManager()
      this.memoryManager = new SessionMemoryManager()
      log.info("RAG System initialized")
    }

    /**
     * Retrieve relevant context for a query
     */
    async retrieveContext(
      contextID: string,
      query: string,
      options: {
        maxResults?: number
        scoreThreshold?: number
        includeMetadata?: boolean
      } = {},
    ): Promise<string> {
      const { maxResults = 5, scoreThreshold = 0.7, includeMetadata = true } = options

      log.info(`Retrieving context for query in ${contextID}`)

      const results = await this.vectorManager.similaritySearchWithScore(
        contextID,
        query,
        maxResults,
        scoreThreshold,
      )

      if (results.length === 0) {
        log.warn("No relevant context found")
        return ""
      }

      const context = results
        .map(([doc, score], idx) => {
          let text = `[Context ${idx + 1}] (relevance: ${score.toFixed(2)})\n${doc.pageContent}`
          if (includeMetadata && doc.metadata) {
            text += `\nMetadata: ${JSON.stringify(doc.metadata)}`
          }
          return text
        })
        .join("\n\n")

      return context
    }

    /**
     * Build RAG prompt with retrieved context
     */
    async buildRAGPrompt(
      contextID: string,
      query: string,
      systemPrompt?: string,
    ): Promise<string> {
      const context = await this.retrieveContext(contextID, query)

      const prompt = `${systemPrompt || "You are a helpful AI assistant."}\n\n` +
        `Context Information:\n${context}\n\n` +
        `User Query: ${query}\n\n` +
        `Please answer the query using the provided context. If the context doesn't contain ` +
        `relevant information, acknowledge this and provide the best answer you can.`

      return prompt
    }

    /**
     * Index session messages for retrieval
     */
    async indexSessionForRAG(sessionID: string): Promise<void> {
      log.info(`Indexing session ${sessionID} for RAG`)

      const messages = await MessageV2.list({ sessionID })
      const documents = messages.map((msg) => ({
        content: this.extractMessageContent(msg),
        metadata: {
          messageID: msg.id,
          role: msg.info.role,
          timestamp: msg.time?.start,
        },
      }))

      await this.vectorManager.indexDocuments(sessionID, documents)
    }

    private extractMessageContent(msg: MessageV2.Info): string {
      const parts = msg.parts || []
      return parts
        .filter((p) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n")
    }

    /**
     * Hybrid search: vector + keyword
     */
    async hybridSearch(
      contextID: string,
      query: string,
      keywords: string[],
      k: number = 10,
    ): Promise<Document[]> {
      // Get vector search results
      const vectorResults = await this.vectorManager.similaritySearch(contextID, query, k)

      // Filter by keywords
      const filtered = vectorResults.filter((doc) => {
        const content = doc.pageContent.toLowerCase()
        return keywords.some((keyword) => content.includes(keyword.toLowerCase()))
      })

      log.info(`Hybrid search found ${filtered.length}/${vectorResults.length} results`)
      return filtered.slice(0, k)
    }

    /**
     * Get memory manager
     */
    getMemoryManager(): SessionMemoryManager {
      return this.memoryManager
    }

    /**
     * Get vector manager
     */
    getVectorManager(): VectorStoreManager {
      return this.vectorManager
    }
  }

  /**
   * Create a RAG-enhanced chat session
   */
  export async function createRAGSession(input: {
    sessionID: string
    contextID?: string
    documents?: { content: string; metadata?: Record<string, any> }[]
    codeFiles?: { path: string; content: string; language?: string }[]
  }) {
    const rag = new RAGSystem()
    const contextID = input.contextID || input.sessionID

    // Index documents if provided
    if (input.documents) {
      await rag.getVectorManager().indexDocuments(contextID, input.documents)
    }

    // Index code files if provided
    if (input.codeFiles) {
      await rag.getVectorManager().indexCodeFiles(contextID, input.codeFiles)
    }

    // Load session messages into memory
    await rag.getMemoryManager().loadSessionMessages(input.sessionID)

    return {
      rag,
      query: async (query: string, systemPrompt?: string) => {
        return await rag.buildRAGPrompt(contextID, query, systemPrompt)
      },
      retrieveContext: async (query: string, maxResults = 5) => {
        return await rag.retrieveContext(contextID, query, { maxResults })
      },
      getHistory: async () => {
        return await rag.getMemoryManager().getHistory(input.sessionID)
      },
    }
  }
}
