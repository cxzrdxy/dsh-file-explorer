/**
 * Session-scope view activator for the file tree. Registered as a
 * `conversation.input.overlay` entry (always mounted while a session has a
 * composer), it watches the shared preview-file store and, whenever a file
 * opens from the tree, switches the conversation view to the preview/edit tab
 * through the standard `viewActions` face (ui-conversation's provide channel
 * binds it to the session's chat store). The entry renders null: it has no
 * visual presence.
 *
 * Why it lives here and not in FilePreviewView: the preview view is only
 * mounted while its tab is ACTIVE (`renderSlot(..., { only: active.id })`),
 * so it can never bring itself forward. This component is mounted in every
 * session regardless of the active tab, which is what makes the switch
 * actually possible.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only import activates ui-conversation's SlotMap merge so
// 'conversation.input.overlay' and its standard props (useInput,
// inputActions, viewActions) resolve.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { filePreviewStore } from './filePreviewStore.ts'

type ActivatorProps = PropsRuntime<'conversation.input.overlay'>

/** Entry id of the preview/edit tab registered by this plugin's index.ts. */
const PREVIEW_VIEW_ID = 'file-preview'

export function FileViewActivator({ viewActions }: ActivatorProps) {
  const file = useSyncExternalStore(filePreviewStore.subscribe, filePreviewStore.get)

  useEffect(() => {
    if (file === null) return
    // Fire on every open (single- or double-click from the tree). setView is
    // idempotent: no-op when the preview/edit tab is already active.
    viewActions?.setView(PREVIEW_VIEW_ID)
  }, [file, viewActions])

  return null
}