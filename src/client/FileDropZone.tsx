/**
 * Drop target for file-tree drags over the composer. Registered as a
 * `conversation.input.overlay` entry (session scope): while mounted it
 * listens at document level for drags carrying the file-tree path MIME,
 * shows a floating hint while such a drag hovers the composer card, and on
 * drop appends the dragged path to the draft through the standard
 * `inputActions` face (setDraft). The entry renders null in the steady
 * state, so it never intercepts pointer events; the hint layer itself is
 * pointer-inert and purely visual — the actual hit testing runs on the
 * document listeners.
 */
import { useEffect, useRef, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only import activates ui-conversation's SlotMap merge so
// 'conversation.input.overlay' and its standard props (useInput,
// inputActions) resolve.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** DataTransfer MIME the file tree writes on drag start. */
export const FILE_PATH_MIME = 'application/x-dsh-file-path'

/** The composer capsule (InputBar card) hit-test target. */
const CARD_SELECTOR = '[data-composer-card]'

type DropZoneProps = PropsRuntime<'conversation.input.overlay'>

export function FileDropZone({ inputActions, useInput }: DropZoneProps) {
  // 'armed' = a file-tree drag is hovering the composer card; 'inserted' =
  // a path was just dropped (transient confirmation, 4s).
  const [armed, setArmed] = useState(false)
  const [inserted, setInserted] = useState<string | null>(null)
  const actionsRef = useRef(inputActions)
  actionsRef.current = inputActions
  // Draft mirror: document-level handlers run outside React's render cycle,
  // so the drop handler reads the latest draft through this ref.
  const draftRef = useRef('')
  const draft = useInput(s => s.draft)
  draftRef.current = draft
  const insertedTimer = useRef<number | null>(null)

  useEffect(() => {
    const hasPaths = (e: globalThis.DragEvent): boolean =>
      e.dataTransfer !== null && e.dataTransfer.types.includes(FILE_PATH_MIME)
    const overCard = (e: globalThis.DragEvent): boolean =>
      e.target instanceof Element && e.target.closest(CARD_SELECTOR) !== null
    const arm = (e: globalThis.DragEvent): void => {
      if (!hasPaths(e) || !overCard(e)) return
      e.preventDefault()
      if (e.dataTransfer !== null) e.dataTransfer.dropEffect = 'copy'
      setArmed(true)
    }
    const onDragEnter = arm
    const onDragOver = arm
    const onDragLeave = (e: globalThis.DragEvent): void => {
      if (!hasPaths(e)) return
      // dragleave fires per child element; only de-arm when the pointer has
      // actually left the card (elementFromPoint sees through the
      // pointer-inert hint layer, so this stays accurate while armed).
      const at = document.elementFromPoint(e.clientX, e.clientY)
      if (at === null || at.closest(CARD_SELECTOR) === null) setArmed(false)
    }
    const onDrop = (e: globalThis.DragEvent): void => {
      if (!hasPaths(e)) return
      e.preventDefault()
      setArmed(false)
      const path = e.dataTransfer?.getData(FILE_PATH_MIME) ?? ''
      if (path === '') return
      const actions = actionsRef.current
      if (actions === undefined) return
      const current = draftRef.current
      const sep = current === '' || /[\s\n]$/.test(current) ? '' : ' '
      actions.setDraft(current + sep + path)
      const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path
      setInserted(name)
      if (insertedTimer.current !== null) window.clearTimeout(insertedTimer.current)
      insertedTimer.current = window.setTimeout(() => { setInserted(null) }, 4000)
    }
    const onDragEnd = (e: globalThis.DragEvent): void => {
      if (hasPaths(e)) setArmed(false)
    }
    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    window.addEventListener('dragend', onDragEnd)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', onDragEnd)
      if (insertedTimer.current !== null) window.clearTimeout(insertedTimer.current)
    }
  }, [])

  const message = armed
    ? '松开以将文件路径插入消息框'
    : inserted !== null
      ? `已插入「${inserted}」的路径`
      : null
  if (message === null) return null
  return (
    <div className="fex-drop-hint" role="status">
      {message}
    </div>
  )
}
