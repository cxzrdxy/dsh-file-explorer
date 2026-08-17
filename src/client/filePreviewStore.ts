/**
 * Module-level shared state bridging the file tree (shell.overlay, root scope)
 * and the preview view tab (conversation.view, session scope). Both halves live
 * in the same client bundle, so a plain singleton is the simplest carrier.
 *
 * Extended with editor state management for file editing functionality.
 */
type Listener = () => void

export interface PreviewFile {
  path: string
  name: string
}

export interface EditorState {
  // File state
  file: PreviewFile | null
  content: string
  originalContent: string
  metadata: {
    size: number
    lastModified: Date
    encoding: string
    lineEnding: 'lf' | 'crlf' | 'auto'
  }

  // Editor state
  isEditing: boolean
  isDirty: boolean
  cursor: { line: number; column: number; offset: number }
  selection: { start: { line: number; column: number }; end: { line: number; column: number } } | null

  // Settings state
  settings: {
    fontSize: number
    tabSize: number
    wordWrap: boolean
    lineNumbers: boolean
    syntaxHighlight: boolean
    autoSave: boolean
    autoSaveInterval: number
  }

  // History state
  history: {
    past: Array<{ content: string; cursor: { line: number; column: number }; timestamp: number }>
    future: Array<{ content: string; cursor: { line: number; column: number }; timestamp: number }>
    maxHistorySize: number
  }

  // Search state
  search: {
    query: string
    replace: string
    caseSensitive: boolean
    wholeWord: boolean
    regex: boolean
    direction: 'up' | 'down'
    matches: number
    currentMatch: number
  }

  // Status state
  status: 'idle' | 'loading' | 'loaded' | 'saving' | 'saved' | 'error'
  error: string | null
}

// Initial state
const initialState: EditorState = {
  file: null,
  content: '',
  originalContent: '',
  metadata: {
    size: 0,
    lastModified: new Date(),
    encoding: 'utf-8',
    lineEnding: 'auto'
  },
  isEditing: false,
  isDirty: false,
  cursor: { line: 1, column: 1, offset: 0 },
  selection: null,
  settings: {
    fontSize: 14,
    tabSize: 2,
    wordWrap: true,
    lineNumbers: true,
    syntaxHighlight: true,
    autoSave: true,
    autoSaveInterval: 30000
  },
  history: {
    past: [],
    future: [],
    maxHistorySize: 50
  },
  search: {
    query: '',
    replace: '',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    direction: 'down',
    matches: 0,
    currentMatch: 0
  },
  status: 'idle',
  error: null
}

let state: EditorState = { ...initialState }
const listeners = new Set<Listener>()

// Helper function: deep clone state
function cloneState(s: EditorState): EditorState {
  return JSON.parse(JSON.stringify(s))
}

// Helper function: update state
function updateState(partial: Partial<EditorState>): void {
  state = { ...state, ...partial }
  notifyListeners()
}

// Helper function: notify listeners
function notifyListeners(): void {
  for (const listener of listeners) listener()
}

// Helper function: detect line ending
function detectLineEnding(text: string): 'lf' | 'crlf' | 'auto' {
  const crlfCount = (text.match(/\r\n/g) || []).length
  const lfCount = (text.match(/\n/g) || []).length - crlfCount

  if (crlfCount > lfCount) return 'crlf'
  if (lfCount > 0) return 'lf'
  return 'auto'
}

export const filePreviewStore = {
  // Legacy API (for backward compatibility)
  get(): PreviewFile | null {
    return state.file
  },

  set(file: PreviewFile | null): void {
    updateState({ file })
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },

  // New editor API
  getEditorState(): EditorState {
    return cloneState(state)
  },

  setEditorState(partial: Partial<EditorState>): void {
    updateState(partial)
  },

  startEditing(): void {
    updateState({ isEditing: true })
  },

  stopEditing(): void {
    updateState({ isEditing: false })
  },

  setContent(content: string): void {
    const { content: oldContent, history } = state

    // Record to undo history
    const newPast = [...history.past, {
      content: oldContent,
      cursor: { ...state.cursor },
      timestamp: Date.now()
    }]

    // Limit history size
    if (newPast.length > history.maxHistorySize) {
      newPast.shift()
    }

    updateState({
      content,
      isDirty: content !== state.originalContent,
      history: {
        ...history,
        past: newPast,
        future: [] // New edit clears redo history
      }
    })
  },

  async save(): Promise<void> {
    if (!state.file || !state.isDirty) return

    updateState({ status: 'saving', error: null })

    try {
      const response = await fetch('/_dsh/file-explorer/api', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          path: state.file.path,
          content: state.content,
          expectedSize: state.metadata.size,
          expectedMtime: state.metadata.lastModified.toISOString()
        })
      })

      const result = await response.json()

      if (!result.ok) {
        throw new Error(result.error.message)
      }

      // Update state
      updateState({
        originalContent: state.content,
        isDirty: false,
        metadata: {
          ...state.metadata,
          size: result.value.size,
          lastModified: new Date(result.value.mtime)
        },
        status: 'saved'
      })

      // Clear local draft
      this.clearDraft()

    } catch (error) {
      updateState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  },

  undo(): void {
    const { history, content, cursor } = state

    if (history.past.length === 0) return

    const previous = history.past[history.past.length - 1]
    const newPast = history.past.slice(0, -1)

    // Add current state to redo history
    const newFuture = [...history.future, {
      content,
      cursor: { ...cursor },
      timestamp: Date.now()
    }]

    updateState({
      content: previous.content,
      cursor: previous.cursor,
      isDirty: previous.content !== state.originalContent,
      history: {
        ...history,
        past: newPast,
        future: newFuture
      }
    })
  },

  redo(): void {
    const { history, content, cursor } = state

    if (history.future.length === 0) return

    const next = history.future[history.future.length - 1]
    const newFuture = history.future.slice(0, -1)

    // Add current state to undo history
    const newPast = [...history.past, {
      content,
      cursor: { ...cursor },
      timestamp: Date.now()
    }]

    updateState({
      content: next.content,
      cursor: next.cursor,
      isDirty: next.content !== state.originalContent,
      history: {
        ...history,
        past: newPast,
        future: newFuture
      }
    })
  },

  updateSettings(settings: Partial<EditorState['settings']>): void {
    updateState({
      settings: {
        ...state.settings,
        ...settings
      }
    })
  },

  setCursor(line: number, column: number, offset: number): void {
    updateState({
      cursor: { line, column, offset }
    })
  },

  setSelection(selection: EditorState['selection']): void {
    updateState({ selection })
  },

  setSearch(search: Partial<EditorState['search']>): void {
    updateState({
      search: {
        ...state.search,
        ...search
      }
    })
  },

  // Draft management
  saveDraft(): void {
    if (!state.file) return

    const draftKey = `file-explorer-draft-${state.file.path}`
    const draft = {
      content: state.content,
      timestamp: Date.now(),
      cursor: state.cursor
    }

    try {
      localStorage.setItem(draftKey, JSON.stringify(draft))
    } catch (error) {
      console.warn('Failed to save draft:', error)
    }
  },

  loadDraft(): boolean {
    if (!state.file) return false

    const draftKey = `file-explorer-draft-${state.file.path}`

    try {
      const draftStr = localStorage.getItem(draftKey)
      if (!draftStr) return false

      const draft = JSON.parse(draftStr)

      // Check if draft is newer than current content
      if (draft.timestamp > state.metadata.lastModified.getTime()) {
        updateState({
          content: draft.content,
          cursor: draft.cursor,
          isDirty: true
        })
        return true
      }

      return false
    } catch (error) {
      console.warn('Failed to load draft:', error)
      return false
    }
  },

  clearDraft(): void {
    if (!state.file) return

    const draftKey = `file-explorer-draft-${state.file.path}`

    try {
      localStorage.removeItem(draftKey)
    } catch (error) {
      console.warn('Failed to clear draft:', error)
    }
  },

  reset(): void {
    state = { ...initialState }
    notifyListeners()
  },

  // Helper functions
  canUndo(): boolean {
    return state.history.past.length > 0
  },

  canRedo(): boolean {
    return state.history.future.length > 0
  },

  hasChanges(): boolean {
    return state.content !== state.originalContent
  },

  getLineEnding(): 'lf' | 'crlf' | 'auto' {
    return detectLineEnding(state.content)
  },

  getStats(): { lines: number; characters: number; words: number } {
    const lines = state.content.split('\n').length
    const characters = state.content.length
    const words = state.content.split(/\s+/).filter(w => w.length > 0).length
    return { lines, characters, words }
  }
}
