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
import { Button, IconWarningOutline16, Modal, RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'
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

async function apiMut<T>(action: string, payload: Record<string, string | boolean>): Promise<T> {
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
  // New-file form: 'createIn' is the directory the inline form is attached
  // to (null = closed; the form renders at the top of that dir's children),
  // 'newName' its input.
  const [createIn, setCreateIn] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  // Deletion in flight: the row's button shows "…" and is disabled.
  const [deleting, setDeleting] = useState<string | null>(null)
  // Custom delete confirmation dialog (DSH Modal, replaces window.confirm).
  const [confirmTarget, setConfirmTarget] = useState<Entry | null>(null)
  // Folder deletion (recursive): gated behind RiskConfirmation's explicit
  // acknowledgement checkbox.
  const [confirmDir, setConfirmDir] = useState<Entry | null>(null)
  const [dirAck, setDirAck] = useState(false)

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
        // Collapsing the directory that hosts the create form closes the form.
        if (createIn === path) setCreateIn(null)
        return { ...s, expanded: e }
      }
      const e = new Set(s.expanded); e.add(path)
      void ensure(path)
      return { ...s, expanded: e }
    })
  }, [ensure, createIn])

  const openFile = useCallback((entry: Entry): void => {
    // Publish to the preview view tab (conversation.view); no in-panel preview.
    filePreviewStore.set({ path: entry.path, name: entry.name })
    showNotice(`已打开「${entry.name}」，请点击对话区顶部的「预览」页签查看`)
  }, [showNotice])

  // Header "+" targets the tree root (toggle open/close).
  const toggleRootCreate = useCallback((): void => {
    setCreateIn(v => (v === state.root ? null : state.root))
    setNewName('')
  }, [state.root])

  // A directory row's "+" opens the create form inside that directory: expand
  // it first, then load its children so the form row has a place to render.
  const addInDir = useCallback((path: string): void => {
    setCreateIn(path)
    setNewName('')
    setState(s => {
      const e = new Set(s.expanded); e.add(path)
      return { ...s, expanded: e }
    })
    void ensure(path)
  }, [ensure])

  const cancelCreate = useCallback((): void => {
    setCreateIn(null)
    setNewName('')
  }, [])

  // Create a new file in `createIn` through the mutating API.
  const submitCreate = useCallback((): void => {
    const name = newName.trim()
    const parent = createIn
    if (name === '' || parent === null) return
    setCreateBusy(true)
    void apiMut<{ path: string; name: string }>('create', { parent, name }).then(() => {
      setCreateIn(null)
      setNewName('')
      showNotice(`已创建「${name}」`)
      refresh(parent)
    }).catch((e) => {
      setError(e instanceof Error ? e.message : String(e))
    }).finally(() => {
      setCreateBusy(false)
    })
  }, [newName, createIn, refresh, showNotice])

  // Open the custom confirmation dialog for one file (replaces window.confirm).
  const askDelete = useCallback((entry: Entry): void => {
    setConfirmTarget(entry)
  }, [])

  const cancelDelete = useCallback((): void => {
    setConfirmTarget(null)
  }, [])

  // Open the RiskConfirmation dialog for one folder (recursive delete).
  const askDeleteDir = useCallback((path: string, name: string): void => {
    setConfirmDir({ path, name, kind: 'dir', size: 0, preview: 'none' })
    setDirAck(false)
  }, [])

  const cancelDeleteDir = useCallback((): void => {
    setConfirmDir(null)
    setDirAck(false)
  }, [])

  // Recursively delete the confirmed folder. Clears the preview tab when it
  // shows a file inside the removed subtree.
  const confirmDeleteDir = useCallback((): void => {
    const entry = confirmDir
    if (entry === null) return
    setConfirmDir(null)
    setDirAck(false)
    setDeleting(entry.path)
    void apiMut<{ path: string; parent: string }>('delete', { path: entry.path, recursive: true }).then((res) => {
      const preview = filePreviewStore.get()
      if (preview !== null
        && (preview.path === entry.path
          || preview.path.startsWith(entry.path + '\\')
          || preview.path.startsWith(entry.path + '/'))) {
        filePreviewStore.set(null)
      }
      showNotice(`已删除「${entry.name}」`)
      refresh(res.parent)
    }).catch((e) => {
      setError(e instanceof Error ? e.message : String(e))
    }).finally(() => {
      setDeleting(null)
    })
  }, [confirmDir, refresh, showNotice])

  // Delete the confirmed file through the mutating API (server refuses
  // non-empty directories). Clears the preview tab when it shows the deleted
  // file.
  const confirmDelete = useCallback((): void => {
    const entry = confirmTarget
    if (entry === null) return
    setConfirmTarget(null)
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
  }, [confirmTarget, refresh, showNotice])

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
          {path !== state.root ? (
            <button
              className="fex-dir-del"
              title="删除文件夹"
              aria-label={`删除文件夹 ${base(path)}`}
              disabled={deleting === path}
              onClick={(e) => { e.stopPropagation(); askDeleteDir(path, base(path)) }}
            >{deleting === path ? '…' : '🗑'}</button>
          ) : null}
          <button
            className="fex-dir-add"
            title="新建文件"
            aria-label={`在 ${base(path)} 新建文件`}
            onClick={(e) => { e.stopPropagation(); addInDir(path) }}
          >＋</button>
        </div>
        {expanded && kids !== undefined
          ? [
              createIn === path
                ? (
                  <div className="fex-create" key="fex-create" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
                    <input
                      className="fex-create-input"
                      autoFocus
                      value={newName}
                      placeholder="文件名，如 note.txt"
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); submitCreate() }
                        else if (e.key === 'Escape') { cancelCreate() }
                      }}
                      disabled={createBusy}
                    />
                    <button className="fex-btn fex-btn-ok" title="创建" onClick={submitCreate} disabled={createBusy || newName.trim() === ''}>✓</button>
                    <button className="fex-btn" title="取消" onClick={cancelCreate}>✗</button>
                  </div>
                )
                : null,
              ...kids.map(k => k.kind === 'dir'
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
                      onClick={(e) => { e.stopPropagation(); askDelete(k) }}
                    >{deleting === k.path ? '…' : '🗑'}</button>
                  </div>),
            ]
          : null}
      </div>
    )
  }

  return (
    <>
      {!open ? (
        <button className="fex-toggle" onClick={() => setOpen(true)} title="文件树" aria-label="文件树">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 3h4l1.5 2H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 0-1z"/></svg>
        </button>
      ) : (
        <div className="fex-panel">
          <div className="fex-head">
            <span>文件</span>
            <span className="fex-head-actions">
              <button className="fex-btn" onClick={toggleRootCreate} title="新建文件" aria-label="新建文件" disabled={state.root === ''}>＋</button>
              <button className="fex-close" onClick={() => setOpen(false)}>×</button>
            </span>
          </div>
          {error ? <div className="fex-error">{error}</div> : null}
          {notice ? <div className="fex-notice">{notice}</div> : null}
          <div className="fex-tree">
            {state.root ? renderDir(state.root, 0) : <div className="fex-empty">无工作区</div>}
          </div>
        </div>
      )}
      {/* Delete confirmation: DSH Modal (ui-primitives), Escape/mask close,
          footer Cancel / Delete. Replaces the native window.confirm. */}
      <Modal
        open={confirmTarget !== null}
        title="删除文件"
        description={confirmTarget !== null ? confirmTarget.path : ''}
        closeLabel="关闭"
        onClose={cancelDelete}
        footer={(
          <>
            <Button variant="outline" onClick={cancelDelete}>取消</Button>
            <Button variant="primary" autoFocus onClick={confirmDelete}>删除</Button>
          </>
        )}
      >
        <div className="fex-confirm-warning">
          <IconWarningOutline16 size={18} className="fex-confirm-warning-icon" />
          <p>确定删除「{confirmTarget?.name}」？此操作不可撤销。</p>
        </div>
      </Modal>
      {/* Folder deletion: DSH RiskConfirmation — the confirm action stays
          disabled until the destructive nature is acknowledged. */}
      <RiskConfirmation
        open={confirmDir !== null}
        title="删除文件夹"
        description={confirmDir !== null
          ? `确定删除文件夹「${confirmDir.name}」？该文件夹及其全部内容将被永久删除，不可恢复。${confirmDir.path}`
          : ''}
        acknowledgeLabel="我了解此操作不可撤销"
        cancelLabel="取消"
        confirmLabel="删除文件夹"
        acknowledged={dirAck}
        onAcknowledgedChange={setDirAck}
        onCancel={cancelDeleteDir}
        onConfirm={confirmDeleteDir}
      />
    </>
  )
}
