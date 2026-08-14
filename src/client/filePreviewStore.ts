/**
 * Module-level shared state bridging the file tree (shell.overlay, root scope)
 * and the preview view tab (conversation.view, session scope). Both halves live
 * in the same client bundle, so a plain singleton is the simplest carrier.
 */
type Listener = () => void

export interface PreviewFile {
  path: string
  name: string
}

let current: PreviewFile | null = null
const listeners = new Set<Listener>()

export const filePreviewStore = {
  get(): PreviewFile | null {
    return current
  },
  set(file: PreviewFile | null): void {
    current = file
    for (const listener of listeners) listener()
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}
