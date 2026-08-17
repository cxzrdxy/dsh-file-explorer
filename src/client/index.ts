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
import { FileEditorView } from './FileEditorView.tsx'
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
  // Editor view tab, peer of the chat and trajectory tabs (conversation.view).
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'file-editor',
    order: 20,
    label: () => '预览/编辑',
    inject: () => ({}),
  }, FileEditorView))
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
.fex-toggle{position:fixed;right:14px;bottom:14px;z-index:100;width:40px;height:40px;border-radius:12px;border:1px solid #dedbd5;background:#fff;color:#444;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12);display:grid;place-items:center;animation:fex-fade-in .2s var(--ds-ease-in-out)}
.fex-panel{position:fixed;right:14px;bottom:64px;z-index:110;width:340px;height:min(520px,70vh);display:flex;flex-direction:column;border:1px solid #dedbd5;border-radius:14px;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.18);overflow:hidden;transform-origin:bottom right;animation:fex-pop-in .22s var(--ds-ease-in-out)}
.fex-panel-closing{animation:fex-pop-out .16s ease forwards;pointer-events:none}
.fex-head{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;font-weight:650;font-size:13px;border-bottom:1px solid #eee;flex:none}
.fex-close{border:0;background:none;font-size:18px;cursor:pointer;color:#999;line-height:1}
.fex-head-actions{display:flex;align-items:center;gap:2px}
.fex-btn{border:0;background:none;cursor:pointer;color:#666;font-size:15px;line-height:1;padding:2px 6px;border-radius:6px;transition:background-color var(--ds-transition-duration-fast) ease,color var(--ds-transition-duration-fast) ease}
.fex-btn:hover{background:#f0ede6;color:#26231f}
.fex-btn:disabled{opacity:.4;cursor:default}
.fex-btn-ok{color:#1a7f37}
.fex-create{display:flex;align-items:center;gap:6px;padding:6px 10px;animation:fex-fade-slide-in .18s var(--ds-ease-in-out)}
.fex-create-input{flex:1;min-width:0;border:1px solid #ddd;border-radius:6px;padding:4px 8px;font-size:12px;outline:none;background:#fff;color:#26231f;transition:border-color var(--ds-transition-duration-fast) ease}
.fex-create-input:focus{border-color:#8ab4f8}
.fex-dir-add{flex:none;border:0;background:none;cursor:pointer;color:#666;font-size:13px;line-height:1;padding:2px 5px;border-radius:5px;opacity:0;transition:opacity var(--ds-transition-duration-fast) ease}
.fex-row:hover .fex-dir-add{opacity:1}
.fex-dir-add:hover{background:#f0ede6;color:#1a7f37}
.fex-dir-add:disabled{opacity:.4;cursor:default}
.fex-dir-del{flex:none;border:0;background:none;cursor:pointer;color:#b3261e;font-size:12px;line-height:1;padding:2px 5px;border-radius:5px;opacity:0;transition:opacity var(--ds-transition-duration-fast) ease}
.fex-row:hover .fex-dir-del{opacity:1}
.fex-dir-del:hover{background:#fdecea}
.fex-dir-del:disabled{opacity:.4;cursor:default}
.fex-del{flex:none;border:0;background:none;cursor:pointer;color:#b3261e;font-size:12px;line-height:1;padding:2px 5px;border-radius:5px;opacity:0;transition:opacity var(--ds-transition-duration-fast) ease}
.fex-row:hover .fex-del{opacity:1}
.fex-del:hover{background:#fdecea}
.fex-del:disabled{opacity:.4;cursor:default}
.fex-confirm-warning{display:flex;align-items:flex-start;gap:10px;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}
.fex-confirm-warning p{margin:0}
.fex-confirm-warning-icon{flex:none;margin-top:2px;color:var(--dsw-alias-state-error-primary)}
.fex-error{padding:8px 12px;background:#fdecea;color:#b3261e;font-size:11px;flex:none;animation:fex-fade-in .2s ease}
.fex-notice{padding:8px 12px;background:#e8f0fe;color:#1a56db;font-size:11px;line-height:1.4;flex:none;animation:fex-fade-in .2s ease}
.fex-tree{flex:1;min-height:0;overflow:auto;padding:4px 0;border-bottom:1px solid #eee;font-size:12px;color:#26231f}
.fex-row{display:flex;align-items:center;gap:5px;padding:3px 8px;cursor:pointer;white-space:nowrap;overflow:hidden;transition:background-color var(--ds-transition-duration) var(--ds-ease-in-out)}
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
.fex-editor-head{flex:none;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #eee;font-size:13px;font-weight:650}
.fex-editor-info{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.fex-editor-name{font-weight:650}
.fex-editor-path{font-size:11px;font-weight:400;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fex-editor-dirty{color:#d97706;font-size:16px;line-height:1}
.fex-editor-actions{display:flex;align-items:center;gap:4px;flex:none}
.fex-editor-toolbar{flex:none;display:flex;align-items:center;gap:8px;padding:6px 14px;border-bottom:1px solid #eee;background:#faf9f7}
.fex-editor-settings{display:flex;flex-wrap:wrap;gap:8px;animation:fex-fade-slide-in .18s var(--ds-ease-in-out)}
.fex-editor-setting{display:flex;align-items:center;gap:4px;font-size:11px;color:#666}
.fex-editor-setting label{display:flex;align-items:center;gap:4px;cursor:pointer}
.fex-editor-setting select{border:1px solid #ddd;border-radius:4px;padding:2px 4px;font-size:11px;background:#fff}
.fex-editor-content{flex:1;display:flex;min-height:0;overflow:hidden;background:#faf9f7}
.fex-editor-line-numbers{flex:none;width:40px;overflow:hidden;background:#f5f5f5;border-right:1px solid #eee;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.6;color:#999;text-align:right;padding:14px 8px 14px 0}
.fex-editor-line-number.active{color:#26231f;font-weight:500}
.fex-editor-textarea{flex:1;border:none;outline:none;resize:none;padding:14px;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.6;color:#26231f;background:transparent}
.fex-editor-textarea:focus{outline:none}
.fex-editor-status{flex:none;display:flex;align-items:center;justify-content:space-between;padding:6px 14px;border-top:1px solid #eee;font-size:11px;color:#666;background:#faf9f7}
.fex-editor-status-left{display:flex;align-items:center;gap:4px}
.fex-editor-status-right{display:flex;align-items:center;gap:8px}
.fex-drop-hint{position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:200;max-width:80vw;padding:8px 16px;border-radius:999px;background:#26231f;color:#fff;font-size:12px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none;animation:fex-hint-in .15s ease}
.fex-modal{animation:fex-scale-in .18s var(--ds-ease-in-out)}
@keyframes fex-pop-in{from{opacity:0;transform:scale(.92) translateY(10px)}to{opacity:1;transform:none}}
@keyframes fex-pop-out{from{opacity:1;transform:none}to{opacity:0;transform:scale(.92) translateY(10px)}}
@keyframes fex-fade-slide-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@keyframes fex-fade-in{from{opacity:0}to{opacity:1}}
@keyframes fex-scale-in{from{opacity:0;transform:scale(.96) translateY(6px)}to{opacity:1;transform:none}}
@keyframes fex-hint-in{from{opacity:0;transform:translate(-50%,4px)}to{opacity:1;transform:translate(-50%,0)}}
@media (prefers-reduced-motion: reduce){
  .fex-toggle,.fex-panel,.fex-panel-closing,.fex-create,.fex-notice,.fex-error,.fex-drop-hint,.fex-modal{animation:none}
  .fex-row,.fex-btn,.fex-create-input,.fex-del,.fex-dir-add,.fex-dir-del{transition:none}
}
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
