window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-file-explorer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
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
		//#region src/client/FileDropZone.tsx
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
		/** DataTransfer MIME the file tree writes on drag start. */
		const FILE_PATH_MIME = "application/x-dsh-file-path";
		/** The composer capsule (InputBar card) hit-test target. */
		const CARD_SELECTOR = "[data-composer-card]";
		function FileDropZone({ inputActions, useInput }) {
			const [armed, setArmed] = (0, react.useState)(false);
			const [inserted, setInserted] = (0, react.useState)(null);
			const actionsRef = (0, react.useRef)(inputActions);
			actionsRef.current = inputActions;
			const draftRef = (0, react.useRef)("");
			draftRef.current = useInput((s) => s.draft);
			const insertedTimer = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const hasPaths = (e) => e.dataTransfer !== null && e.dataTransfer.types.includes("application/x-dsh-file-path");
				const overCard = (e) => e.target instanceof Element && e.target.closest(CARD_SELECTOR) !== null;
				const arm = (e) => {
					if (!hasPaths(e) || !overCard(e)) return;
					e.preventDefault();
					if (e.dataTransfer !== null) e.dataTransfer.dropEffect = "copy";
					setArmed(true);
				};
				const onDragEnter = arm;
				const onDragOver = arm;
				const onDragLeave = (e) => {
					if (!hasPaths(e)) return;
					const at = document.elementFromPoint(e.clientX, e.clientY);
					if (at === null || at.closest(CARD_SELECTOR) === null) setArmed(false);
				};
				const onDrop = (e) => {
					if (!hasPaths(e)) return;
					e.preventDefault();
					setArmed(false);
					const path = e.dataTransfer?.getData("application/x-dsh-file-path") ?? "";
					if (path === "") return;
					const actions = actionsRef.current;
					if (actions === void 0) return;
					const current = draftRef.current;
					const sep = current === "" || /[\s\n]$/.test(current) ? "" : " ";
					actions.setDraft(current + sep + path);
					setInserted(path.split(/[\\/]/).filter(Boolean).pop() ?? path);
					if (insertedTimer.current !== null) window.clearTimeout(insertedTimer.current);
					insertedTimer.current = window.setTimeout(() => {
						setInserted(null);
					}, 4e3);
				};
				const onDragEnd = (e) => {
					if (hasPaths(e)) setArmed(false);
				};
				document.addEventListener("dragenter", onDragEnter);
				document.addEventListener("dragover", onDragOver);
				document.addEventListener("dragleave", onDragLeave);
				document.addEventListener("drop", onDrop);
				window.addEventListener("dragend", onDragEnd);
				return () => {
					document.removeEventListener("dragenter", onDragEnter);
					document.removeEventListener("dragover", onDragOver);
					document.removeEventListener("dragleave", onDragLeave);
					document.removeEventListener("drop", onDrop);
					window.removeEventListener("dragend", onDragEnd);
					if (insertedTimer.current !== null) window.clearTimeout(insertedTimer.current);
				};
			}, []);
			const message = armed ? "松开以将文件路径插入消息框" : inserted !== null ? `已插入「${inserted}」的路径` : null;
			if (message === null) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "fex-drop-hint",
				role: "status",
				children: message
			});
		}
		//#endregion
		//#region src/client/FileExplorerPanel.tsx
		/**
		* File tree + preview panel, mounted by index.ts into the shell.overlay layer.
		*
		* v0.3 adds mutations: the header "+" opens an inline new-file form (POST
		* create into the tree root) and every file row exposes a hover delete
		* button (POST delete with a confirm dialog). Both refresh the affected
		* directory listing in place.
		*/
		const API$1 = "/_dsh/file-explorer/api";
		async function api$1(action, path) {
			const res = await fetch(`${API$1}?action=${encodeURIComponent(action)}&path=${encodeURIComponent(path)}`, { credentials: "same-origin" });
			const body = await res.json();
			if (!res.ok || !body.ok) throw new Error(body.error?.message ?? `file API failed with HTTP ${res.status}`);
			return body.value;
		}
		async function apiMut(action, payload) {
			const res = await fetch(API$1, {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action,
					...payload
				})
			});
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
			const [creating, setCreating] = (0, react.useState)(false);
			const [newName, setNewName] = (0, react.useState)("");
			const [createBusy, setCreateBusy] = (0, react.useState)(false);
			const [deleting, setDeleting] = (0, react.useState)(null);
			const [confirmTarget, setConfirmTarget] = (0, react.useState)(null);
			const showNotice = (0, react.useCallback)((text) => {
				setNotice(text);
				if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
				noticeTimer.current = window.setTimeout(() => {
					setNotice(null);
				}, 4e3);
			}, []);
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
			const refresh = (0, react.useCallback)((path) => {
				api$1("list", path).then((list) => {
					setState((s) => ({
						...s,
						children: new Map(s.children).set(path, list.entries)
					}));
				}).catch((e) => {
					setError(e instanceof Error ? e.message : String(e));
				});
			}, []);
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
				showNotice(`已打开「${entry.name}」，请点击对话区顶部的「预览」页签查看`);
			}, [showNotice]);
			const submitCreate = (0, react.useCallback)(() => {
				const name = newName.trim();
				if (name === "" || state.root === "") return;
				setCreateBusy(true);
				apiMut("create", {
					parent: state.root,
					name
				}).then(() => {
					setCreating(false);
					setNewName("");
					showNotice(`已创建「${name}」`);
					refresh(state.root);
				}).catch((e) => {
					setError(e instanceof Error ? e.message : String(e));
				}).finally(() => {
					setCreateBusy(false);
				});
			}, [
				newName,
				state.root,
				refresh,
				showNotice
			]);
			const askDelete = (0, react.useCallback)((entry) => {
				setConfirmTarget(entry);
			}, []);
			const cancelDelete = (0, react.useCallback)(() => {
				setConfirmTarget(null);
			}, []);
			const confirmDelete = (0, react.useCallback)(() => {
				const entry = confirmTarget;
				if (entry === null) return;
				setConfirmTarget(null);
				setDeleting(entry.path);
				apiMut("delete", { path: entry.path }).then((res) => {
					const preview = filePreviewStore.get();
					if (preview !== null && preview.path === entry.path) filePreviewStore.set(null);
					showNotice(`已删除「${entry.name}」`);
					refresh(res.parent);
				}).catch((e) => {
					setError(e instanceof Error ? e.message : String(e));
				}).finally(() => {
					setDeleting(null);
				});
			}, [
				confirmTarget,
				refresh,
				showNotice
			]);
			const onDragStart = (0, react.useCallback)((e, path) => {
				e.dataTransfer.setData(FILE_PATH_MIME, path);
				e.dataTransfer.setData("text/plain", path);
				e.dataTransfer.effectAllowed = "copy";
			}, []);
			const renderDir = (path, depth) => {
				const kids = state.children.get(path);
				const expanded = state.expanded.has(path);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "fex-row",
					style: { paddingLeft: 8 + depth * 14 },
					draggable: true,
					onClick: () => toggle(path),
					onDragStart: (e) => onDragStart(e, path),
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
					draggable: true,
					onClick: () => openFile(k),
					onDragStart: (e) => onDragStart(e, k.path),
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
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "fex-del",
							title: "删除",
							"aria-label": `删除 ${k.name}`,
							disabled: deleting === k.path,
							onClick: (e) => {
								e.stopPropagation();
								askDelete(k);
							},
							children: deleting === k.path ? "…" : "🗑"
						})
					]
				}, k.path)) : null] }, path);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [!open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
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
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "fex-panel",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "fex-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "文件" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "fex-head-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "fex-btn",
								onClick: () => {
									setCreating((v) => !v);
									setNewName("");
								},
								title: "新建文件",
								"aria-label": "新建文件",
								disabled: state.root === "",
								children: "＋"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "fex-close",
								onClick: () => setOpen(false),
								children: "×"
							})]
						})]
					}),
					creating ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "fex-create",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "fex-create-input",
								autoFocus: true,
								value: newName,
								placeholder: "文件名，如 note.txt",
								onChange: (e) => setNewName(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										submitCreate();
									} else if (e.key === "Escape") {
										setCreating(false);
										setNewName("");
									}
								},
								disabled: createBusy
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "fex-btn fex-btn-ok",
								title: "创建",
								onClick: submitCreate,
								disabled: createBusy || newName.trim() === "",
								children: "✓"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "fex-btn",
								title: "取消",
								onClick: () => {
									setCreating(false);
									setNewName("");
								},
								children: "✗"
							})
						]
					}) : null,
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
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: confirmTarget !== null,
				title: "删除文件",
				description: confirmTarget !== null ? confirmTarget.path : "",
				closeLabel: "关闭",
				onClose: cancelDelete,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					onClick: cancelDelete,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					autoFocus: true,
					onClick: confirmDelete,
					children: "删除"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "fex-confirm-warning",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, {
						size: 18,
						className: "fex-confirm-warning-icon"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
						"确定删除「",
						confirmTarget?.name,
						"」？此操作不可撤销。"
					] })]
				})
			})] });
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
			ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
				name: "conversation.input.overlay",
				id: "file-drop",
				order: 100,
				inject: () => ({})
			}, FileDropZone));
		}
		const CSS = `
.fex-toggle{position:fixed;right:14px;bottom:14px;z-index:100;width:40px;height:40px;border-radius:12px;border:1px solid #dedbd5;background:#fff;color:#444;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12);display:grid;place-items:center}
.fex-panel{position:fixed;right:14px;bottom:64px;z-index:110;width:340px;height:min(520px,70vh);display:flex;flex-direction:column;border:1px solid #dedbd5;border-radius:14px;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.18);overflow:hidden}
.fex-head{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;font-weight:650;font-size:13px;border-bottom:1px solid #eee;flex:none}
.fex-close{border:0;background:none;font-size:18px;cursor:pointer;color:#999;line-height:1}
.fex-head-actions{display:flex;align-items:center;gap:2px}
.fex-btn{border:0;background:none;cursor:pointer;color:#666;font-size:15px;line-height:1;padding:2px 6px;border-radius:6px}
.fex-btn:hover{background:#f0ede6;color:#26231f}
.fex-btn:disabled{opacity:.4;cursor:default}
.fex-btn-ok{color:#1a7f37}
.fex-create{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid #eee;flex:none}
.fex-create-input{flex:1;min-width:0;border:1px solid #ddd;border-radius:6px;padding:4px 8px;font-size:12px;outline:none;background:#fff;color:#26231f}
.fex-create-input:focus{border-color:#8ab4f8}
.fex-del{flex:none;border:0;background:none;cursor:pointer;color:#b3261e;font-size:12px;line-height:1;padding:2px 5px;border-radius:5px;opacity:0;transition:opacity .12s}
.fex-row:hover .fex-del{opacity:1}
.fex-del:hover{background:#fdecea}
.fex-del:disabled{opacity:.4;cursor:default}
.fex-confirm-warning{display:flex;align-items:flex-start;gap:10px;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}
.fex-confirm-warning p{margin:0}
.fex-confirm-warning-icon{flex:none;margin-top:2px;color:var(--dsw-alias-state-error-primary)}
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