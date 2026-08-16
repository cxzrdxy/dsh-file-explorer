/**
 * File explorer browser half, entry. Registers the floating file-tree panel
 * into the shell.overlay layer known by ui-layout's SlotMap.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only import activates ui-layout's SlotMap merge (the `shell.overlay` hole).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only import activates ui-conversation's SlotMap merge (the `conversation.view` ring).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { FileExplorerPanel } from './FileExplorerPanel.tsx'
import { FilePreviewView } from './FilePreviewView.tsx'
import { FileDropZone } from './FileDropZone.tsx'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.effect(installStyles, 'ui-file-explorer: styles')
  // Floating file tree (shell.overlay, root scope).
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'file-explorer',
    inject: () => ({}),
  }, FileExplorerPanel))
  // Preview view tab, peer of the chat and trajectory tabs (conversation.view).
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'file-preview',
    order: 20,
    label: () => '预览',
    inject: () => ({}),
  }, FilePreviewView))
  // Composer drop target: drag a file-tree node over the message box to
  // insert its path into the draft (conversation.input.overlay, session scope).
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'file-drop',
    order: 100,
    inject: () => ({}),
  }, FileDropZone))
}

const CSS = `
.fex-toggle{position:fixed;right:14px;bottom:14px;z-index:100;width:40px;height:40px;border-radius:12px;border:1px solid #dedbd5;background:#fff;color:#444;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12);display:grid;place-items:center}
.fex-panel{position:fixed;right:14px;bottom:64px;z-index:110;width:340px;height:min(520px,70vh);display:flex;flex-direction:column;border:1px solid #dedbd5;border-radius:14px;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.18);overflow:hidden}
.fex-head{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;font-weight:650;font-size:13px;border-bottom:1px solid #eee;flex:none}
.fex-close{border:0;background:none;font-size:18px;cursor:pointer;color:#999;line-height:1}
.fex-error{padding:8px 12px;background:#fdecea;color:#b3261e;font-size:11px;flex:none}
.fex-notice{padding:8px 12px;background:#e8f0fe;color:#1a56db;font-size:11px;line-height:1.4;flex:none}
.fex-tree{flex:1;min-height:0;overflow:auto;padding:4px 0;border-bottom:1px solid #eee;font-size:12px;color:#26231f}
.fex-row{display:flex;align-items:center;gap:5px;padding:3px 8px;cursor:pointer;white-space:nowrap;overflow:hidden}
.fex-row:hover{background:#f3f1ec}
.fex-chevron{width:12px;color:#999;flex:none}
.fex-name{overflow:hidden;text-overflow:ellipsis}
.fex-size{margin-left:auto;color:#aaa;font-size:10px}
.fex-empty{padding:16px;text-align:center;color:#aaa;font-size:11px}
.fex-view{display:flex;flex-direction:column;height:100%;color:#26231f}
.fex-view-head{flex:none;display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #eee;font-size:13px;font-weight:650}
.fex-view-path{font-size:11px;font-weight:400;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fex-view-error{flex:none;padding:8px 14px;background:#fdecea;color:#b3261e;font-size:11px}
.fex-view-body{flex:1;min-height:0;overflow:auto;background:#faf9f7}
.fex-view-code{margin:0;padding:14px;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-all}
.fex-view-img{display:block;max-width:100%;margin:0 auto}
.fex-view-empty{padding:32px;text-align:center;color:#aaa;font-size:13px}
.fex-drop-hint{position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:200;max-width:80vw;padding:8px 16px;border-radius:999px;background:#26231f;color:#fff;font-size:12px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none}
`

function installStyles(): () => void {
  const id = '@deepseek-ai/dsh-client-ui-file-explorer/client'
  if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = '@deepseek-ai/dsh-client-ui-file-explorer'
  style.dataset.pluginCss = id
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
