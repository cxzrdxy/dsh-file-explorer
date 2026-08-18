/**
 * The file-editor view tab (conversation.view entry, session scope). Extends
 * the file preview with editing capabilities for text files.
 *
 * Features:
 * - Toggle between preview and edit modes
 * - Save files with Ctrl+S
 * - Undo/Redo with Ctrl+Z/Ctrl+Y
 * - Auto-save drafts
 * - Line numbers and word wrap settings
 * - Keyboard shortcuts
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { filePreviewStore } from './filePreviewStore.ts'

const API = '/_dsh/file-explorer/api'

type ReadResult =
  | { path: string; kind: 'dir' }
  | { path: string; kind: 'text'; text: string; size: number }
  | { path: string; kind: 'image'; mime: string; dataUrl: string; size: number }
  | { path: string; kind: 'binary'; size: number }
  | { path: string; kind: 'too-large'; size: number }

async function api<T>(action: string, path: string): Promise<T> {
  const res = await fetch(`${API}?action=${encodeURIComponent(action)}&path=${encodeURIComponent(path)}`, { credentials: 'same-origin' })
  const body = await res.json() as { ok: true; value: T } | { ok: false; error: { code: string; message: string } }
  if (!res.ok || !body.ok) {
    const f = body as { ok: false; error: { code: string; message: string } }
    throw new Error(f.error?.message ?? `file API failed with HTTP ${res.status}`)
  }
  return (body as { ok: true; value: T }).value
}

function fmt(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

// Editor Header Component
function EditorHeader({
  file,
  isEditing,
  isDirty,
  isSaving,
  onToggleMode,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}: {
  file: { path: string; name: string }
  isEditing: boolean
  isDirty: boolean
  isSaving: boolean
  onToggleMode: () => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}) {
  return (
    <div className="fex-editor-head">
      <div className="fex-editor-info">
        <span className="fex-editor-name">{file.name}</span>
        <span className="fex-editor-path">{file.path}</span>
        {isDirty && <span className="fex-editor-dirty">●</span>}
      </div>
      <div className="fex-editor-actions">
        {isEditing && (
          <>
            <button
              className="fex-btn"
              onClick={onUndo}
              disabled={!canUndo}
              title="撤销 (Ctrl+Z)"
            >
              ↩
            </button>
            <button
              className="fex-btn"
              onClick={onRedo}
              disabled={!canRedo}
              title="重做 (Ctrl+Y)"
            >
              ↪
            </button>
            <button
              className="fex-btn fex-btn-ok"
              onClick={onSave}
              disabled={!isDirty || isSaving}
              title="保存 (Ctrl+S)"
            >
              {isSaving ? '...' : '💾 保存'}
            </button>
          </>
        )}
        <button
          className={`fex-btn ${isEditing ? '' : 'fex-btn-ok'}`}
          onClick={onToggleMode}
        >
          {isEditing ? '👁 预览' : '✏️ 编辑'}
        </button>
      </div>
    </div>
  )
}

// Editor Content Component
function EditorContent({
  content,
  isEditing,
  settings,
  cursor,
  onChange,
  onCursorChange
}: {
  content: string
  isEditing: boolean
  settings: {
    fontSize: number
    tabSize: number
    wordWrap: boolean
    lineNumbers: boolean
  }
  cursor: { line: number; column: number }
  onChange: (content: string) => void
  onCursorChange: (cursor: { line: number; column: number }) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Handle content change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }, [onChange])

  // Handle cursor change
  const handleSelect = useCallback(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current
      const text = textarea.value.substring(0, textarea.selectionStart)
      const lines = text.split('\n')
      const line = lines.length
      const column = lines[lines.length - 1].length + 1
      onCursorChange({ line, column })
    }
  }, [onCursorChange])

  // Handle Tab key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = textarea.value.substring(0, start) +
          ' '.repeat(settings.tabSize) +
          textarea.value.substring(end)
        onChange(newValue)
        // Restore cursor position
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + settings.tabSize
        }, 0)
      }
    }
  }, [onChange, settings.tabSize])

  return (
    <div className="fex-editor-content">
      {settings.lineNumbers && (
        <div className="fex-editor-line-numbers">
          {content.split('\n').map((_, i) => (
            <div key={i} className={`fex-editor-line-number ${i + 1 === cursor.line ? 'active' : ''}`}>
              {i + 1}
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        className="fex-editor-textarea"
        value={content}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        readOnly={!isEditing}
        spellCheck={false}
        style={{
          fontSize: settings.fontSize,
          tabSize: settings.tabSize,
          whiteSpace: settings.wordWrap ? 'pre-wrap' : 'pre'
        }}
      />
    </div>
  )
}

// Editor Status Bar Component
function EditorStatusBar({
  cursor,
  stats,
  lineEnding,
  isDirty,
  isSaving,
  status
}: {
  cursor: { line: number; column: number }
  stats: { lines: number; characters: number; words: number }
  lineEnding: 'lf' | 'crlf' | 'auto'
  isDirty: boolean
  isSaving: boolean
  status: string
}) {
  return (
    <div className="fex-editor-status">
      <span className="fex-editor-status-left">
        {isSaving ? '💾 保存中...' : isDirty ? '● 未保存' : '✓ 已保存'}
      </span>
      <span className="fex-editor-status-right">
        行 {cursor.line}, 列 {cursor.column} | {stats.characters} 字符 | {stats.lines} 行 | UTF-8 | {lineEnding.toUpperCase()}
      </span>
    </div>
  )
}

// Editor Settings Panel Component
function EditorSettingsPanel({
  settings,
  onSettingsChange
}: {
  settings: {
    fontSize: number
    tabSize: number
    wordWrap: boolean
    lineNumbers: boolean
  }
  onSettingsChange: (settings: Partial<typeof settings>) => void
}) {
  return (
    <div className="fex-editor-settings">
      <div className="fex-editor-setting">
        <label>字体大小:</label>
        <select
          value={settings.fontSize}
          onChange={(e) => onSettingsChange({ fontSize: Number(e.target.value) })}
        >
          <option value={12}>12px</option>
          <option value={14}>14px</option>
          <option value={16}>16px</option>
          <option value={18}>18px</option>
          <option value={20}>20px</option>
        </select>
      </div>
      <div className="fex-editor-setting">
        <label>Tab大小:</label>
        <select
          value={settings.tabSize}
          onChange={(e) => onSettingsChange({ tabSize: Number(e.target.value) })}
        >
          <option value={2}>2空格</option>
          <option value={4}>4空格</option>
          <option value={8}>8空格</option>
        </select>
      </div>
      <div className="fex-editor-setting">
        <label>
          <input
            type="checkbox"
            checked={settings.wordWrap}
            onChange={(e) => onSettingsChange({ wordWrap: e.target.checked })}
          />
          自动换行
        </label>
      </div>
      <div className="fex-editor-setting">
        <label>
          <input
            type="checkbox"
            checked={settings.lineNumbers}
            onChange={(e) => onSettingsChange({ lineNumbers: e.target.checked })}
          />
          行号
        </label>
      </div>
    </div>
  )
}

// Main File Editor View Component
export function FileEditorView(_props: ConvViewProps) {
  const file = useSyncExternalStore(filePreviewStore.subscribe, filePreviewStore.get)
  const editorState = useSyncExternalStore(
    filePreviewStore.subscribe,
    () => filePreviewStore.getEditorState()
  )
  const [result, setResult] = useState<ReadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  // Load file content
  const load = useCallback(async (path: string): Promise<void> => {
    setError(null)
    filePreviewStore.setEditorState({ status: 'loading' })
    try {
      const readResult = await api<ReadResult>('read', path)
      setResult(readResult)

      if (readResult.kind === 'text') {
        filePreviewStore.setEditorState({
          content: readResult.text,
          originalContent: readResult.text,
          metadata: {
            size: readResult.size,
            lastModified: new Date(),
            encoding: 'utf-8',
            lineEnding: filePreviewStore.getLineEnding()
          },
          status: 'loaded',
          isDirty: false,
          history: { past: [], future: [], maxHistorySize: 50 }
        })

        // Try to load draft
        const hasDraft = filePreviewStore.loadDraft()
        if (hasDraft) {
          console.log('Loaded draft for', file?.name)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      filePreviewStore.setEditorState({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }, [file])

  // Load file when file changes
  useEffect(() => {
    if (file === null) return
    void load(file.path)
  }, [file, load])

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      await filePreviewStore.save()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // Handle toggle mode
  const handleToggleMode = useCallback(() => {
    if (editorState.isEditing) {
      // Switching to preview mode
      if (editorState.isDirty) {
        if (confirm('有未保存的修改，确定要退出编辑模式吗？')) {
          filePreviewStore.stopEditing()
          // Reload original content
          if (file) {
            void load(file.path)
          }
        }
      } else {
        filePreviewStore.stopEditing()
      }
    } else {
      // Switching to edit mode
      filePreviewStore.startEditing()
    }
  }, [editorState.isEditing, editorState.isDirty, file, load])

  // Handle undo
  const handleUndo = useCallback(() => {
    filePreviewStore.undo()
  }, [])

  // Handle redo
  const handleRedo = useCallback(() => {
    filePreviewStore.redo()
  }, [])

  // Handle content change
  const handleContentChange = useCallback((content: string) => {
    filePreviewStore.setContent(content)
    // Auto-save draft
    filePreviewStore.saveDraft()
  }, [])

  // Handle cursor change
  const handleCursorChange = useCallback((cursor: { line: number; column: number }) => {
    filePreviewStore.setCursor(cursor.line, cursor.column, 0)
  }, [])

  // Handle settings change
  const handleSettingsChange = useCallback((settings: Partial<typeof editorState.settings>) => {
    filePreviewStore.updateSettings(settings)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S: Save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        void handleSave()
      }

      // Ctrl+Z: Undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }

      // Ctrl+Y or Ctrl+Shift+Z: Redo
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault()
        handleRedo()
      }

      // Ctrl+E: Toggle edit mode
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault()
        handleToggleMode()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, handleUndo, handleRedo, handleToggleMode])

  // Auto-save timer
  useEffect(() => {
    if (!editorState.isEditing || !editorState.settings.autoSave) return

    const timer = setInterval(() => {
      if (editorState.isDirty) {
        void handleSave()
      }
    }, editorState.settings.autoSaveInterval)

    return () => clearInterval(timer)
  }, [editorState.isEditing, editorState.settings.autoSave, editorState.settings.autoSaveInterval, editorState.isDirty, handleSave])

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (editorState.isDirty) {
        e.preventDefault()
        e.returnValue = '有未保存的修改，确定要离开吗？'
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [editorState.isDirty])

  if (file === null) {
    return (
      <div className="fex-view fex-view-empty">
        <p>在文件树中点击一个文件，这里会显示预览。</p>
      </div>
    )
  }

  return (
    <div className="fex-view">
      <EditorHeader
        file={file}
        isEditing={editorState.isEditing}
        isDirty={editorState.isDirty}
        isSaving={editorState.status === 'saving'}
        onToggleMode={handleToggleMode}
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={filePreviewStore.canUndo()}
        canRedo={filePreviewStore.canRedo()}
      />

      <div className="fex-editor-toolbar">
        <button
          className="fex-btn"
          onClick={() => setShowSettings(!showSettings)}
          title="设置"
        >
          ⚙️
        </button>
        {showSettings && (
          <EditorSettingsPanel
            settings={editorState.settings}
            onSettingsChange={handleSettingsChange}
          />
        )}
      </div>

      {error ? <div className="fex-view-error">{error}</div> : null}

      <div className="fex-view-body">
        {result === null ? (
          <div className="fex-view-empty">加载中…</div>
        ) : result.kind === 'text' ? (
          <EditorContent
            content={editorState.content}
            isEditing={editorState.isEditing}
            settings={editorState.settings}
            cursor={editorState.cursor}
            onChange={handleContentChange}
            onCursorChange={handleCursorChange}
          />
        ) : result.kind === 'image' ? (
          <img className="fex-view-img" src={result.dataUrl} alt={file.name} />
        ) : result.kind === 'binary' ? (
          <div className="fex-view-empty">二进制文件（{fmt(result.size)}）</div>
        ) : result.kind === 'too-large' ? (
          <div className="fex-view-empty">文件过大（{fmt(result.size)}）</div>
        ) : (
          <div className="fex-view-empty">目录</div>
        )}
      </div>

      <EditorStatusBar
        cursor={editorState.cursor}
        stats={filePreviewStore.getStats()}
        lineEnding={editorState.metadata.lineEnding}
        isDirty={editorState.isDirty}
        isSaving={editorState.status === 'saving'}
        status={editorState.status}
      />
    </div>
  )
}
