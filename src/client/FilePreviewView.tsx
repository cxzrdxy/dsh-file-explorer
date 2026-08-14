/**
 * The file-preview view tab (conversation.view entry, session scope). Reads
 * the shared preview-file store written by the file tree, fetches the file
 * through the same-origin file API, and renders text or image previews.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
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

function fmt(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function FilePreviewView(_props: ConvViewProps) {
  const file = useSyncExternalStore(filePreviewStore.subscribe, filePreviewStore.get)
  const [result, setResult] = useState<ReadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (path: string): Promise<void> => {
    setError(null)
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

  if (file === null) {
    return (
      <div className="fex-view fex-view-empty">
        <p>在文件树中点击一个文件，这里会显示预览。</p>
      </div>
    )
  }

  return (
    <div className="fex-view">
      <div className="fex-view-head">
        <span>{file.name}</span>
        <span className="fex-view-path">{file.path}</span>
      </div>
      {error ? <div className="fex-view-error">{error}</div> : null}
      <div className="fex-view-body">
        {result === null ? <div className="fex-view-empty">加载中…</div>
          : result.kind === 'text' ? <pre className="fex-view-code">{result.text}</pre>
          : result.kind === 'image' ? <img className="fex-view-img" src={result.dataUrl} alt={file.name} />
          : result.kind === 'binary' ? <div className="fex-view-empty">二进制文件（{fmt(result.size)}）</div>
          : result.kind === 'too-large' ? <div className="fex-view-empty">文件过大（{fmt(result.size)}）</div>
          : <div className="fex-view-empty">目录</div>}
      </div>
    </div>
  )
}
