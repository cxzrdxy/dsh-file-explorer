/**
 * File explorer backend (host half): a same-origin HTTP route
 * (`/_dsh/file-explorer/api`) serving directory listings and file reads for
 * the browser half. Read-only GET actions: `workspace`, `list`, `read`.
 * Mutating POST actions (JSON body): `create` (a new file inside a
 * directory, never overwrites) and `delete` (files, or directories — empty
 * by default, full subtree removal when `recursive: true`; filesystem roots
 * are always refused so deletions stay bounded). The route attaches only when a `webServer`
 * service exists.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readdir, readFile, stat, writeFile, unlink, rmdir, rm } from 'node:fs/promises'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
// Type-only import activates the optional webServer Context declaration.
import type {} from '@deepseek-ai/dsh-host-webserver'

export const name = 'host-file-explorer'

/** Exact route the browser half calls. */
export const FILE_API_ROUTE = '/_dsh/file-explorer/api'

const MAX_ENTRIES = 500
const MAX_TEXT_BYTES = 512 * 1024
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_BODY_BYTES = 1024 * 1024

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

/**
 * A new file name must survive Windows and POSIX semantics: no path
 * separators, no reserved characters, no control bytes, no trailing dot or
 * space (Windows trims them), and no '.' / '..'.
 */
function validName(name: string): boolean {
  if (name.length === 0 || name === '.' || name === '..') return false
  if (/[\\/]/.test(name)) return false
  if (/[<>:"|?*\u0000-\u001f]/.test(name)) return false
  if (/[. ]$/.test(name)) return false
  return true
}

function codeError(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

/**
 * Update an existing file with new content. Supports optimistic concurrency
 * control via expectedSize and expectedMtime parameters.
 */
async function updateFile(
  path: string,
  content: string,
  expectedSize?: number,
  expectedMtime?: string
): Promise<unknown> {
  const resolved = resolve(path)

  // Check if file exists
  let st: import('node:fs').Stats
  try {
    st = await stat(resolved)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw codeError('文件不存在', 'ENOENT')
    }
    throw error
  }

  // Check if it's a directory
  if (st.isDirectory()) {
    throw codeError('不能编辑目录', 'EISDIR')
  }

  // Concurrency control: check if file has been modified
  if (expectedSize !== undefined && st.size !== expectedSize) {
    throw codeError('文件已被其他进程修改（大小变化）', 'CONFLICT')
  }

  if (expectedMtime !== undefined) {
    const currentMtime = st.mtime.toISOString()
    if (currentMtime !== expectedMtime) {
      throw codeError('文件已被其他进程修改（时间变化）', 'CONFLICT')
    }
  }

  // Check file size limit
  if (content.length > MAX_TEXT_BYTES) {
    throw codeError('文件内容过大', 'ETOOBIG')
  }

  // Write file
  await writeFile(resolved, content, { encoding: 'utf8' })

  // Get updated file info
  const newSt = await stat(resolved)

  return {
    path: resolved,
    size: newSt.size,
    mtime: newSt.mtime.toISOString()
  }
}

/** Create a new file inside `parent`; `flag: 'wx'` refuses to overwrite. */
async function createFile(parent: string, name: string, content: string): Promise<unknown> {
  if (!validName(name)) throw codeError('invalid file name', 'EINVAL')
  const target = join(parent, name)
  await writeFile(target, content, { flag: 'wx' })
  return { path: target, name }
}

/**
 * Delete a file, or a directory. `recursive` allows non-empty directories
 * (full subtree removal); without it only empty directories are accepted.
 * Filesystem roots are always refused.
 */
async function deleteTarget(path: string, recursive: boolean): Promise<unknown> {
  const resolved = resolve(path)
  // dirname(C:\) === C:\ (and / on POSIX): a root has no parent to remove into.
  if (dirname(resolved) === resolved) throw codeError('refusing to delete a filesystem root', 'EROOT')
  const st = await stat(resolved)
  if (st.isDirectory()) {
    if (recursive) {
      await rm(resolved, { recursive: true })
    } else {
      const kids = await readdir(resolved)
      if (kids.length > 0) throw codeError(`directory not empty (${kids.length} entries)`, 'ENOTEMPTY')
      await rmdir(resolved)
    }
  } else {
    await unlink(resolved)
  }
  return { path: resolved, parent: dirname(resolved) }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((fulfil, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(codeError('request body too large', 'ETOOBIG'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => fulfil(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    err(res, 405, 'method-not-allowed', 'Use GET or POST')
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
  try {
    if (req.method === 'GET') {
      // Read-only actions. `workspace` takes no path: answer before any path
      // cleanup so an empty or absent `path` query (the browser half always
      // sends `path=`) never trips the "empty path" fence.
      const action = url.searchParams.get('action')
      const rawPath = url.searchParams.get('path')
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
      err(res, 400, 'bad-action', 'GET action must be list or read')
      return
    }
    // Mutating actions ride POST with a JSON body: { action, ... }.
    let body: unknown
    try {
      body = JSON.parse(await readBody(req))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ETOOBIG') {
        err(res, 413, 'body-too-large', 'Request body too large')
        return
      }
      err(res, 400, 'bad-json', 'Request body must be valid JSON')
      return
    }
    const payload = (body ?? {}) as Record<string, unknown>
    const action = typeof payload.action === 'string' ? payload.action : ''
    if (action === 'create') {
      const parent = typeof payload.parent === 'string' ? cleanPath(payload.parent) : ''
      const name = typeof payload.name === 'string' ? payload.name.trim() : ''
      const content = typeof payload.content === 'string' ? payload.content : ''
      json(res, 200, { ok: true, value: await createFile(parent, name, content) })
      return
    }
    if (action === 'delete') {
      const path = typeof payload.path === 'string' ? cleanPath(payload.path) : ''
      const recursive = payload.recursive === true || payload.recursive === 'true'
      json(res, 200, { ok: true, value: await deleteTarget(path, recursive) })
      return
    }
    if (action === 'update') {
      const path = typeof payload.path === 'string' ? cleanPath(payload.path) : ''
      const content = typeof payload.content === 'string' ? payload.content : ''
      const expectedSize = typeof payload.expectedSize === 'number' ? payload.expectedSize : undefined
      const expectedMtime = typeof payload.expectedMtime === 'string' ? payload.expectedMtime : undefined
      json(res, 200, { ok: true, value: await updateFile(path, content, expectedSize, expectedMtime) })
      return
    }
    err(res, 400, 'bad-action', 'POST action must be create, delete, or update')
  } catch (error) {
    const e = error as NodeJS.ErrnoException
    const message = e.message || String(error)
    if (e.code === 'EEXIST') { err(res, 409, 'exists', message); return }
    if (e.code === 'ENOENT') { err(res, 404, 'not-found', message); return }
    if (e.code === 'EINVAL' || e.code === 'EROOT' || e.code === 'ENOTEMPTY' || e.code === 'EISDIR' || e.code === 'EPERM' || e.code === 'EACCES') {
      err(res, 400, String(e.code).toLowerCase(), message)
      return
    }
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
    }, 'host-file-explorer: file API route')
  })
}
