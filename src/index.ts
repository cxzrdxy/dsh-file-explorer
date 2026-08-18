/**
 * File explorer browser-plugin node half. Pure UI plugin: the empty apply
 * exists so the plugin appears in the host cordis.yml / Loader; the browser
 * half ships via exports["./client"]. The file-listing backend lives in
 * `@deepseek-ai/dsh-host-file-explorer`.
 */
export function apply(): void {}
