/**
 * File explorer backend (host half): a same-origin HTTP route
 * (`/_dsh/file-explorer/api`) serving directory listings and file reads for
 * the browser half. Read-only in this version; editing lands in a later
 * iteration. The route attaches only when a `webServer` service exists.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, normalize, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
// Type-only import activates the optional webServer Context declaration.
import type {} from '@deepseek-ai/dsh-host-webserver'

export const name = 'file-explorer'

/** Exact route the browser half calls. */
export const FILE_API_ROUTE = '/_dsh/file-explorer/api'

const MAX_ENTRIES = 500
const MAX_TEXT_BYTES = 512 * 1024
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const TEXT_EXTS = new Set(['', '.txt', '.md', '.markdown', '.json', '.js', '.ts', '.tsx', '.jsx', '.css', '.html', '.htm', '.yml', '.yaml', '.xml', '.csv', '.log', '.py', '.c', '.cpp', '.h', '.cs', '.java', '.go', '.rs', '.sh', '.ps1', '.sql', '.ini', '.cfg', '.toml', '.bat', '.cmd'])
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico'])

interface JsonSlot { ok: true; value: unknown }
interface JsonErr { ok: false; error: { code: string; message: string } }

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

function isText(name: string): boolean { return TEXT_EXTS.has(extOf(name)) }
function isImage(name: string): boolean { return IMAGE_EXTS.has(extOf(name)) }

function json(res: ServerResponse, status: number, body: JsonSlot | JsonErr): void {
  const bytes = Buffer.from(JSON.stringify(body))
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.writeHead(status)
  res.end(bytes)
}

function err(res: ServerResponse, status: number, code: string, message: string): void {
  json(res, status, { ok: false, error: { code, message } })
}

function sameOrigin(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site']
  if (site === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return site === 'same-origin' || site === 'same-site' || site === 'none'
  const host = req.headers.host
  if (host === undefined) return false
  try {
    const u = new URL(origin)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.host === host
  } catch { return false }
}

function cleanPath(raw: string): string {
  const trimmed = (raw ?? '').trim()
  if (trimmed.length === 0) throw new Error('empty path')
  if (!resolve(trimmed).startsWith(sep) && !/^[A-Za-z]:/.test(resolve(trimmed))) {
    throw new Error('path is not absolute')
  }
  return normalize(trimmed)
}

async function listDirectory(path: string): Promise<unknown> {
  const entries = await readdir(path, { withFileTypes: true })
  const rows: Array<{ name: string; path: string; kind: 'dir' | 'file'; size: number; preview: 'text' | 'image' | 'none' }> = []
  let truncated = false
  for (const e of entries) {
    if (rows.length >= MAX_ENTRIES) { truncated = true; break }
    const full = join(path, e.name)
    let kind: 'dir' | 'file' = 'file'
    let size = 0
    try {
      const st = await stat(full)
      if (st.isDirectory()) kind = 'dir'
      else size = st.size
    } catch { /* unreadable row still listed */ }
    const p = isText(e.name) ? 'text' : isImage(e.name) ? 'image' : 'none'
    rows.push({ name: e.name, path: full, kind, size, preview: kind === 'dir' ? 'none' : p })
  }
  rows.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
  return { path, entries: rows, truncated }
}

async function readTarget(path: string): Promise<unknown> {
  const st = await stat(path)
  if (st.isDirectory()) return { path, kind: 'dir' }
  const name = path.split(/[\\/]/).pop() ?? path
  if (isImage(name)) {
    if (st.size > MAX_IMAGE_BYTES) return { path, kind: 'too-large', size: st.size }
    const buf = await readFile(path)
    const b64 = buf.toString('base64')
    const mime = extOf(name) === '.svg' ? 'image/svg+xml' : `image/${extOf(name).slice(1)}`
    return { path, kind: 'image', mime, dataUrl: `data:${mime};base64,${b64}`, size: st.size }
  }
  if (isText(name)) {
    if (st.size > MAX_TEXT_BYTES) return { path, kind: 'too-large', size: st.size }
    const buf = await readFile(path)
    return { path, kind: 'text', text: buf.toString('utf8'), size: st.size }
  }
  return { path, kind: 'binary', size: st.size }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    err(res, 405, 'method-not-allowed', 'Use GET')
    return
  }
  if (!sameOrigin(req)) {
    err(res, 403, 'origin-rejected', 'Request must originate from this DSH Web application')
    return
  }
  let url: URL
  try {
    url = new URL(req.url ?? '/', 'http://localhost')
  } catch {
    err(res, 400, 'bad-url', 'Malformed request URL')
    return
  }
  const action = url.searchParams.get('action')
  const rawPath = url.searchParams.get('path')
  try {
    // `workspace` takes no path: answer before any path cleanup so an empty
    // or absent `path` query (the browser half always sends `path=`) never
    // trips the "empty path" fence.
    if (action === 'workspace') {
      json(res, 200, { ok: true, value: { path: process.cwd() } })
      return
    }
    const path = rawPath === null || rawPath === undefined ? '' : cleanPath(rawPath)
    if (action === 'list') {
      json(res, 200, { ok: true, value: await listDirectory(path) })
      return
    }
    if (action === 'read') {
      json(res, 200, { ok: true, value: await readTarget(path) })
      return
    }
    err(res, 400, 'bad-action', 'action must be list or read')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    err(res, 400, 'fs-error', message)
  }
}

/** Host plugin body: attach the file API route when a webServer exists. */
export function apply(ctx: Context): void {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const dispose = webCtx.webServer.register({
        kind: 'exact',
        path: FILE_API_ROUTE,
        handler: (req, res) => handle(req, res),
      })
      return () => { dispose() }
    }, 'file-explorer: file API route')
  })
}
