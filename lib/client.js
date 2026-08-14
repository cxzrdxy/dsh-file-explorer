window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-file-explorer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/filePreviewStore.ts
		let current = null;
		const listeners = /* @__PURE__ */ new Set();
		const filePreviewStore = {
			get() {
				return current;
			},
			set(file) {
				current = file;
				for (const listener of listeners) listener();
			},
			subscribe(listener) {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			}
		};
		//#endregion
		//#region src/client/FileExplorerPanel.tsx
		/**
		* File tree + preview panel, mounted by index.ts into the shell.overlay layer.
		*/
		const API$1 = "/_dsh/file-explorer/api";
		async function api$1(action, path) {
			const res = await fetch(`${API$1}?action=${encodeURIComponent(action)}&path=${encodeURIComponent(path)}`, { credentials: "same-origin" });
			const body = await res.json();
			if (!res.ok || !body.ok) throw new Error(body.error?.message ?? `file API failed with HTTP ${res.status}`);
			return body.value;
		}
		function fmt$1(size) {
			if (size < 1024) return `${size} B`;
			if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
			return `${(size / (1024 * 1024)).toFixed(1)} MB`;
		}
		function base(path) {
			const parts = path.split(/[\\/]/).filter(Boolean);
			return parts[parts.length - 1] ?? path;
		}
		function FileExplorerPanel({ useWorkspaces, useSessions }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [state, setState] = (0, react.useState)({
				root: "",
				children: /* @__PURE__ */ new Map(),
				expanded: /* @__PURE__ */ new Set()
			});
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const noticeTimer = (0, react.useRef)(null);
			const sessionCwd = useSessions((s) => {
				const id = s.current;
				return id === void 0 ? void 0 : s.byId[id]?.cwd;
			});
			const workspaceSnapshot = useWorkspaces((s) => s);
			const workspacePath = workspaceSnapshot.recentWorkspaceId !== void 0 ? workspaceSnapshot.items.find((w) => w.workspaceId === workspaceSnapshot.recentWorkspaceId)?.path : workspaceSnapshot.items[0]?.path;
			const root = sessionCwd ?? workspacePath;
			(0, react.useEffect)(() => {
				let alive = true;
				const rootFrom = (root) => {
					setState({
						root,
						children: /* @__PURE__ */ new Map(),
						expanded: new Set([root])
					});
					api$1("list", root).then((list) => {
						if (!alive) return;
						setState((s) => ({
							...s,
							children: new Map(s.children).set(root, list.entries)
						}));
					}).catch(() => {});
				};
				if (root !== void 0 && root !== "") {
					rootFrom(root);
					return () => {
						alive = false;
					};
				}
				api$1("workspace", "").then((res) => {
					if (alive) rootFrom(res.path);
				}).catch(() => {});
				return () => {
					alive = false;
				};
			}, [root]);
			const ensure = (0, react.useCallback)(async (path) => {
				const cached = state.children.get(path);
				if (cached !== void 0) return cached;
				try {
					const kids = (await api$1("list", path)).entries;
					setState((s) => ({
						...s,
						children: new Map(s.children).set(path, kids)
					}));
					return kids;
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
					throw e;
				}
			}, [state.children]);
			const toggle = (0, react.useCallback)((path) => {
				setState((s) => {
					if (s.expanded.has(path)) {
						const e = new Set(s.expanded);
						e.delete(path);
						return {
							...s,
							expanded: e
						};
					}
					const e = new Set(s.expanded);
					e.add(path);
					ensure(path);
					return {
						...s,
						expanded: e
					};
				});
			}, [ensure]);
			const openFile = (0, react.useCallback)((entry) => {
				filePreviewStore.set({
					path: entry.path,
					name: entry.name
				});
				setNotice(`已打开「${entry.name}」，请点击对话区顶部的「预览」页签查看`);
				if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
				noticeTimer.current = window.setTimeout(() => {
					setNotice(null);
				}, 5e3);
			}, []);
			const renderDir = (path, depth) => {
				const kids = state.children.get(path);
				const expanded = state.expanded.has(path);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "fex-row",
					style: { paddingLeft: 8 + depth * 14 },
					onClick: () => toggle(path),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "fex-chevron",
						children: expanded ? "▾" : "▸"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "fex-name",
						children: base(path)
					})]
				}), expanded && kids !== void 0 ? kids.map((k) => k.kind === "dir" ? renderDir(k.path, depth + 1) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "fex-row fex-file",
					style: { paddingLeft: 8 + (depth + 1) * 14 },
					onClick: () => openFile(k),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "fex-chevron",
							children: " "
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "fex-name",
							children: k.name
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "fex-size",
							children: fmt$1(k.size)
						})
					]
				}, k.path)) : null] }, path);
			};
			if (!open) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				className: "fex-toggle",
				onClick: () => setOpen(true),
				title: "文件树",
				"aria-label": "文件树",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
					viewBox: "0 0 16 16",
					width: "16",
					height: "16",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "1.4",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2 3h4l1.5 2H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 0-1z" })
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "fex-panel",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "fex-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "文件" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "fex-close",
							onClick: () => setOpen(false),
							children: "×"
						})]
					}),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "fex-error",
						children: error
					}) : null,
					notice ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "fex-notice",
						children: notice
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "fex-tree",
						children: state.root ? renderDir(state.root, 0) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "fex-empty",
							children: "无工作区"
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/FilePreviewView.tsx
		/**
		* The file-preview view tab (conversation.view entry, session scope). Reads
		* the shared preview-file store written by the file tree, fetches the file
		* through the same-origin file API, and renders text or image previews.
		*/
		const API = "/_dsh/file-explorer/api";
		async function api(action, path) {
			const res = await fetch(`${API}?action=${encodeURIComponent(action)}&path=${encodeURIComponent(path)}`, { credentials: "same-origin" });
			const body = await res.json();
			if (!res.ok || !body.ok) throw new Error(body.error?.message ?? `file API failed with HTTP ${res.status}`);
			return body.value;
		}
		function fmt(size) {
			if (size < 1024) return `${size} B`;
			if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
			return `${(size / (1024 * 1024)).toFixed(1)} MB`;
		}
		function FilePreviewView(_props) {
			const file = (0, react.useSyncExternalStore)(filePreviewStore.subscribe, filePreviewStore.get);
			const [result, setResult] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const load = (0, react.useCallback)(async (path) => {
				setError(null);
				try {
					setResult(await api("read", path));
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, []);
			(0, react.useEffect)(() => {
				if (file === null) return;
				load(file.path);
			}, [file, load]);
			if (file === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "fex-view fex-view-empty",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "在文件树中点击一个文件，这里会显示预览。" })
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "fex-view",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "fex-view-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: file.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "fex-view-path",
							children: file.path
						})]
					}),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "fex-view-error",
						children: error
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "fex-view-body",
						children: result === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "fex-view-empty",
							children: "加载中…"
						}) : result.kind === "text" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
							className: "fex-view-code",
							children: result.text
						}) : result.kind === "image" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
							className: "fex-view-img",
							src: result.dataUrl,
							alt: file.name
						}) : result.kind === "binary" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "fex-view-empty",
							children: [
								"二进制文件（",
								fmt(result.size),
								"）"
							]
						}) : result.kind === "too-large" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "fex-view-empty",
							children: [
								"文件过大（",
								fmt(result.size),
								"）"
							]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "fex-view-empty",
							children: "目录"
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots"];
		function apply(ctx) {
			ctx.effect(installStyles, "ui-file-explorer: styles");
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "file-explorer",
				inject: () => ({})
			}, FileExplorerPanel));
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "file-preview",
				order: 20,
				label: () => "预览",
				inject: () => ({})
			}, FilePreviewView));
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
`;
		function installStyles() {
			const id = "@deepseek-ai/dsh-client-ui-file-explorer/client";
			if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return () => {};
			const style = document.createElement("style");
			style.dataset.plugin = "@deepseek-ai/dsh-client-ui-file-explorer";
			style.dataset.pluginCss = id;
			style.textContent = CSS;
			document.head.appendChild(style);
			return () => {
				style.remove();
			};
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map