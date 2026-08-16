/**
 * File tree + preview panel, mounted by index.ts into the shell.overlay layer.
 *
 * v0.3 adds mutations: the header "+" opens an inline new-file form (POST
 * create into the tree root) and every file row exposes a hover delete
 * button (POST delete with a confirm dialog). Both refresh the affected
 * directory listing in place.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { filePreviewStore } from './filePreviewStore.ts'
import { FILE_PATH_MIME } from './FileDropZone.tsx'

const API = '/_dsh/file-explorer/api'

type Entry = { name: string; path: string; kind: 'dir' | 'file'; size: number; preview: 'text' | 'image' | 'none' }
type Listing = { path: string; entries: Entry[]; truncated: boolean }
type ApiBody<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

async function api<T>(action: string, path: string): Promise<T> {
  const res = await fetch(`${API}?action=${encodeURIComponent(action)}&path=${encodeURIComponent(path)}`, { credentials: 'same-origin' })
  const body = await res.json() as ApiBody<T>
  if (!res.ok || !body.ok) {
    const f = body as { ok: false; error: { code: string; message: string } }
    throw new Error(f.error?.message ?? `file API failed with HTTP ${res.status}`)
  }
  return (body as { ok: true; value: T }).value
}

async function apiMut<T>(action: string, payload: Record<string, string>): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  const body = await res.json() as ApiBody<T>
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

function base(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

interface NodeState {
  root: string
  children: Map<string, Entry[]>
  expanded: Set<string>
}

type PanelProps = PropsRuntime<'shell.overlay'>

export function FileExplorerPanel({ useWorkspaces, useSessions }: PanelProps) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<NodeState>({ root: '', children: new Map(), expanded: new Set() })
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | null>(null)
  // New-file form: 'creating' shows the inline row, 'newName' its input.
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  // Deletion in flight: the row's button shows "…" and is disabled.
  const [deleting, setDeleting] = useState<string | null>(null)

  const showNotice = useCallback((text: string): void => {
    setNotice(text)
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => { setNotice(null) }, 4000)
  }, [])

  // The tree root follows the CURRENT session's cwd so switching workspaces
  // re-points the tree immediately. Fall back to the workspace registry's
  // most-recent path, then to the backend process cwd.
  const sessionCwd = useSessions(s => {
    const id = s.current
    return id === undefined ? undefined : s.byId[id]?.cwd
  })
  const workspaceSnapshot = useWorkspaces(s => s)
  const workspacePath = workspaceSnapshot.recentWorkspaceId !== undefined
    ? workspaceSnapshot.items.find(w => w.workspaceId === workspaceSnapshot.recentWorkspaceId)?.path
    : workspaceSnapshot.items[0]?.path
  const root = sessionCwd ?? workspacePath

  useEffect(() => {
    let alive = true
    // Set the tree root and eagerly load its children so the panel opens with
    // files already listed (no empty expanded root to click twice).
    const rootFrom = (root: string): void => {
      setState({ root, children: new Map(), expanded: new Set([root]) })
      void api<Listing>('list', root).then((list) => {
        if (!alive) return
        setState(s => ({ ...s, children: new Map(s.children).set(root, list.entries) }))
      }).catch(() => {
        /* listing failure leaves the root expanded but empty */
      })
    }
    if (root !== undefined && root !== '') {
      rootFrom(root)
      return () => { alive = false }
    }
    void api<{ path: string }>('workspace', '').then((res) => {
      if (alive) rootFrom(res.path)
    }).catch(() => {
      /* keep an empty tree; reopening retries */
    })
    return () => { alive = false }
  }, [root])

  const ensure = useCallback(async (path: string): Promise<Entry[]> => {
    const cached = state.children.get(path)
    if (cached !== undefined) return cached
    try {
      const list = await api<Listing>('list', path)
      const kids = list.entries
      setState(s => ({ ...s, children: new Map(s.children).set(path, kids) }))
      return kids
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    }
  }, [state.children])

  // Re-fetch one directory's listing and swap it into the cache. Used after
  // create/delete so the tree reflects the mutation immediately.
  const refresh = useCallback((path: string): void => {
    void api<Listing>('list', path).then((list) => {
      setState(s => ({ ...s, children: new Map(s.children).set(path, list.entries) }))
    }).catch((e) => {
      setError(e instanceof Error ? e.message : String(e))
    })
  }, [])

  const toggle = useCallback((path: string): void => {
    setState(s => {
      if (s.expanded.has(path)) {
        const e = new Set(s.expanded); e.delete(path)
        return { ...s, expanded: e }
      }
      const e = new Set(s.expanded); e.add(path)
      void ensure(path)
      return { ...s, expanded: e }
    })
  }, [ensure])

  const openFile = useCallback((entry: Entry): void => {
    // Publish to the preview view tab (conversation.view); no in-panel preview.
    filePreviewStore.set({ path: entry.path, name: entry.name })
    showNotice(`已打开「${entry.name}」，请点击对话区顶部的「预览」页签查看`)
  }, [showNotice])

  // Create a new file in the tree root through the mutating API.
  const submitCreate = useCallback((): void => {
    const name = newName.trim()
    if (name === '' || state.root === '') return
    setCreateBusy(true)
    void apiMut<{ path: string; name: string }>('create', { parent: state.root, name }).then(() => {
      setCreating(false)
      setNewName('')
      showNotice(`已创建「${name}」`)
      refresh(state.root)
    }).catch((e) => {
      setError(e instanceof Error ? e.message : String(e))
    }).finally(() => {
      setCreateBusy(false)
    })
  }, [newName, state.root, refresh, showNotice])

  // Delete one file through the mutating API (server refuses non-empty
  // directories). Clears the preview tab when it shows the deleted file.
  const removeFile = useCallback((entry: Entry): void => {
    if (!window.confirm(`确定删除「${entry.name}」？此操作不可撤销。`)) return
    setDeleting(entry.path)
    void apiMut<{ path: string; parent: string }>('delete', { path: entry.path }).then((res) => {
      const preview = filePreviewStore.get()
      if (preview !== null && preview.path === entry.path) filePreviewStore.set(null)
      showNotice(`已删除「${entry.name}」`)
      refresh(res.parent)
    }).catch((e) => {
      setError(e instanceof Error ? e.message : String(e))
    }).finally(() => {
      setDeleting(null)
    })
  }, [refresh, showNotice])

  // Drag out of the tree: the absolute path rides a plugin-private MIME plus
  // a text/plain fallback, so FileDropZone (composer drop target) and any
  // future consumer can pick the path up. `copy` effect: dropping never
  // moves or removes anything from the tree.
  const onDragStart = useCallback((e: DragEvent, path: string): void => {
    e.dataTransfer.setData(FILE_PATH_MIME, path)
    e.dataTransfer.setData('text/plain', path)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  const renderDir = (path: string, depth: number): ReactNode => {
    const kids = state.children.get(path)
    const expanded = state.expanded.has(path)
    return (
      <div key={path}>
        <div className="fex-row" style={{ paddingLeft: 8 + depth * 14 }} draggable onClick={() => toggle(path)} onDragStart={(e) => onDragStart(e, path)}>
          <span className="fex-chevron">{expanded ? '▾' : '▸'}</span>
          <span className="fex-name">{base(path)}</span>
        </div>
        {expanded && kids !== undefined
          ? kids.map(k => k.kind === 'dir'
              ? renderDir(k.path, depth + 1)
              : <div key={k.path} className="fex-row fex-file" style={{ paddingLeft: 8 + (depth + 1) * 14 }} draggable onClick={() => openFile(k)} onDragStart={(e) => onDragStart(e, k.path)}>
                  <span className="fex-chevron"> </span>
                  <span className="fex-name">{k.name}</span>
                  <span className="fex-size">{fmt(k.size)}</span>
                  <button
                    className="fex-del"
                    title="删除"
                    aria-label={`删除 ${k.name}`}
                    disabled={deleting === k.path}
                    onClick={(e) => { e.stopPropagation(); removeFile(k) }}
                  >{deleting === k.path ? '…' : '🗑'}</button>
                </div>)
          : null}
      </div>
    )
  }

  if (!open) {
    return (
      <button className="fex-toggle" onClick={() => setOpen(true)} title="文件树" aria-label="文件树">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 3h4l1.5 2H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 0-1z"/></svg>
      </button>
    )
  }
  return (
    <div className="fex-panel">
      <div className="fex-head">
        <span>文件</span>
        <span className="fex-head-actions">
          <button className="fex-btn" onClick={() => { setCreating(v => !v); setNewName('') }} title="新建文件" aria-label="新建文件" disabled={state.root === ''}>＋</button>
          <button className="fex-close" onClick={() => setOpen(false)}>×</button>
        </span>
      </div>
      {creating ? (
        <div className="fex-create">
          <input
            className="fex-create-input"
            autoFocus
            value={newName}
            placeholder="文件名，如 note.txt"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submitCreate() }
              else if (e.key === 'Escape') { setCreating(false); setNewName('') }
            }}
            disabled={createBusy}
          />
          <button className="fex-btn fex-btn-ok" title="创建" onClick={submitCreate} disabled={createBusy || newName.trim() === ''}>✓</button>
          <button className="fex-btn" title="取消" onClick={() => { setCreating(false); setNewName('') }}>✗</button>
        </div>
      ) : null}
      {error ? <div className="fex-error">{error}</div> : null}
      {notice ? <div className="fex-notice">{notice}</div> : null}
      <div className="fex-tree">
        {state.root ? renderDir(state.root, 0) : <div className="fex-empty">无工作区</div>}
      </div>
    </div>
  )
}
