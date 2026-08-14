/**
 * File tree + preview panel, mounted by index.ts into the shell.overlay layer.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { filePreviewStore } from './filePreviewStore.ts'

const API = '/_dsh/file-explorer/api'

type Entry = { name: string; path: string; kind: 'dir' | 'file'; size: number; preview: 'text' | 'image' | 'none' }
type Listing = { path: string; entries: Entry[]; truncated: boolean }

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
    setNotice(`已打开「${entry.name}」，请点击对话区顶部的「预览」页签查看`)
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => { setNotice(null) }, 5000)
  }, [])

  const renderDir = (path: string, depth: number): ReactNode => {
    const kids = state.children.get(path)
    const expanded = state.expanded.has(path)
    return (
      <div key={path}>
        <div className="fex-row" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggle(path)}>
          <span className="fex-chevron">{expanded ? '▾' : '▸'}</span>
          <span className="fex-name">{base(path)}</span>
        </div>
        {expanded && kids !== undefined
          ? kids.map(k => k.kind === 'dir'
              ? renderDir(k.path, depth + 1)
              : <div key={k.path} className="fex-row fex-file" style={{ paddingLeft: 8 + (depth + 1) * 14 }} onClick={() => openFile(k)}>
                  <span className="fex-chevron"> </span>
                  <span className="fex-name">{k.name}</span>
                  <span className="fex-size">{fmt(k.size)}</span>
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
      <div className="fex-head"><span>文件</span><button className="fex-close" onClick={() => setOpen(false)}>×</button></div>
      {error ? <div className="fex-error">{error}</div> : null}
      {notice ? <div className="fex-notice">{notice}</div> : null}
      <div className="fex-tree">
        {state.root ? renderDir(state.root, 0) : <div className="fex-empty">无工作区</div>}
      </div>
    </div>
  )
}
