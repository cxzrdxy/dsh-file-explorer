/**
 * The file-preview/editor view tab (conversation.view entry, session scope).
 * Reads the shared preview-file store written by the file tree, fetches the
 * file through the same-origin file API, and renders text/image previews.
 * Now with editing support for text files.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
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

async function apiMut<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  })
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

export function FilePreviewView(_props: ConvViewProps) {
  const file = useSyncExternalStore(filePreviewStore.subscribe, filePreviewStore.get)
  const [result, setResult] = useState<ReadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Editor state
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const noticeTimer = useRef<number | null>(null)

  const showNotice = useCallback((text: string): void => {
    setNotice(text)
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => { setNotice(null) }, 3000)
  }, [])

  const load = useCallback(async (path: string): Promise<void> => {
    setError(null)
    setIsEditing(false)
    setEditContent('')
    setOriginalContent('')
    setIsDirty(false)
    try {
      setResult(await api<ReadResult>('read', path))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    if (file === null) return
    void load(file.path)
  }, [file, load])

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = '有未保存的修改，确定要离开吗？'
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // Enter edit mode
  const enterEditMode = useCallback(() => {
    if (result && result.kind === 'text') {
      setEditContent(result.text)
      setOriginalContent(result.text)
      setIsEditing(true)
      setIsDirty(false)
    }
  }, [result])

  // Exit edit mode
  const exitEditMode = useCallback(() => {
    if (isDirty) {
      if (!confirm('有未保存的修改，确定要退出编辑模式吗？')) return
    }
    setIsEditing(false)
    setEditContent('')
    setIsDirty(false)
    // Reload original
    if (file) void load(file.path)
  }, [isDirty, file, load])

  // Handle content change
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setEditContent(newContent)
    setIsDirty(newContent !== originalContent)
  }, [originalContent])

  // Save file. The backend file API accepts `update` (not `write`); pass the
  // read size as expectedSize for optimistic-concurrency checks.
  const handleSave = useCallback(async () => {
    if (!file || !isDirty) return
    setIsSaving(true)
    try {
      const expectedSize = result !== null && result.kind === 'text' ? result.size : undefined
      await apiMut('update', { path: file.path, content: editContent, expectedSize })
      setOriginalContent(editContent)
      setIsDirty(false)
      showNotice('已保存')
      // Update the result display
      setResult({ path: file.path, kind: 'text', text: editContent, size: editContent.length })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsSaving(false)
    }
  }, [file, isDirty, editContent, showNotice])

  // Keyboard shortcuts
  useEffect(() => {
    if (!isEditing) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, handleSave])

  if (file === null) {
    return (
      <div className="fex-view fex-view-empty">
        <p>在文件树中点击一个文件，这里会显示预览。</p>
      </div>
    )
  }

  const canEdit = result !== null && result.kind === 'text'

  return (
    <div className="fex-view">
      <div className="fex-editor-head">
        <div className="fex-editor-info">
          <span className="fex-editor-name">{file.name}</span>
          <span className="fex-editor-path">{file.path}</span>
          {isDirty && <span className="fex-editor-dirty">●</span>}
        </div>
        <div className="fex-editor-actions">
          {isEditing && (
            <>
              <button className="fex-btn fex-btn-primary" onClick={() => void handleSave()} disabled={!isDirty || isSaving} title="保存 (Ctrl+S)">
                {isSaving ? '保存中...' : '保存'}
              </button>
              <button className="fex-btn fex-btn-ghost" onClick={exitEditMode} title="退出编辑">
                取消
              </button>
            </>
          )}
          {!isEditing && canEdit && (
            <button className="fex-btn fex-btn-primary" onClick={enterEditMode} title="编辑文件">
              编辑
            </button>
          )}
        </div>
      </div>
      {notice && <div className="fex-notice">{notice}</div>}
      {error ? <div className="fex-view-error">{error}</div> : null}
      <div className="fex-view-body">
        {result === null ? <div className="fex-view-empty">加载中…</div>
          : isEditing ? (
            <textarea
              ref={textareaRef}
              className="fex-editor-textarea"
              value={editContent}
              onChange={handleContentChange}
              spellCheck={false}
            />
          ) : result.kind === 'text' ? <pre className="fex-view-code">{result.text}</pre>
          : result.kind === 'image' ? <img className="fex-view-img" src={result.dataUrl} alt={file.name} />
          : result.kind === 'binary' ? <div className="fex-view-empty">二进制文件（{fmt(result.size)}）</div>
          : result.kind === 'too-large' ? <div className="fex-view-empty">文件过大（{fmt(result.size)}）</div>
          : <div className="fex-view-empty">目录</div>}
      </div>
    </div>
  )
}
