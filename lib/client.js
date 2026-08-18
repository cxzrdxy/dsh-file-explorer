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
		const initialState = {
			file: null,
			content: "",
			originalContent: "",
			metadata: {
				size: 0,
				lastModified: /* @__PURE__ */ new Date(),
				encoding: "utf-8",
				lineEnding: "auto"
			},
			isEditing: false,
			isDirty: false,
			cursor: {
				line: 1,
				column: 1,
				offset: 0
			},
			selection: null,
			settings: {
				fontSize: 14,
				tabSize: 2,
				wordWrap: true,
				lineNumbers: true,
				syntaxHighlight: true,
				autoSave: true,
				autoSaveInterval: 3e4
			},
			history: {
				past: [],
				future: [],
				maxHistorySize: 50
			},
			search: {
				query: "",
				replace: "",
				caseSensitive: false,
				wholeWord: false,
				regex: false,
				direction: "down",
				matches: 0,
				currentMatch: 0
			},
			status: "idle",
			error: null
		};
		let state = { ...initialState };
		const listeners = /* @__PURE__ */ new Set();
		let pendingEdit = false;
		function cloneState(s) {
			return JSON.parse(JSON.stringify(s));
		}
		function updateState(partial) {
			state = {
				...state,
				...partial
			};
			notifyListeners();
		}
		function notifyListeners() {
			for (const listener of listeners) listener();
		}
		function detectLineEnding(text) {
			const crlfCount = (text.match(/\r\n/g) || []).length;
			const lfCount = (text.match(/\n/g) || []).length - crlfCount;
			if (crlfCount > lfCount) return "crlf";
			if (lfCount > 0) return "lf";
			return "auto";
		}
		const filePreviewStore = {
			get() {
				return state.file;
			},
			set(file) {
				pendingEdit = false;
				updateState({ file });
			},
			/**
			* Open a file, optionally requesting the preview view to jump straight into
			* edit mode (the tree's double-click gesture). `edit` is one-shot: it is
			* cleared by {@link consumeEdit} once the view acts on it, or by any later
			* `set`/`open` call.
			*/
			open(file, edit = false) {
				pendingEdit = edit;
				updateState({ file });
			},
			/** One-shot read of the edit intent; clears it so a later reload won't re-enter. */
			consumeEdit() {
				const v = pendingEdit;
				pendingEdit = false;
				return v;
			},
			subscribe(listener) {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
			getEditorState() {
				return cloneState(state);
			},
			setEditorState(partial) {
				updateState(partial);
			},
			startEditing() {
				updateState({ isEditing: true });
			},
			stopEditing() {
				updateState({ isEditing: false });
			},
			setContent(content) {
				const { content: oldContent, history } = state;
				const newPast = [...history.past, {
					content: oldContent,
					cursor: { ...state.cursor },
					timestamp: Date.now()
				}];
				if (newPast.length > history.maxHistorySize) newPast.shift();
				updateState({
					content,
					isDirty: content !== state.originalContent,
					history: {
						...history,
						past: newPast,
						future: []
					}
				});
			},
			async save() {
				if (!state.file || !state.isDirty) return;
				updateState({
					status: "saving",
					error: null
				});
				try {
					const result = await (await fetch("/_dsh/file-explorer/api", {
						method: "POST",
						credentials: "same-origin",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							action: "update",
							path: state.file.path,
							content: state.content,
							expectedSize: state.metadata.size,
							expectedMtime: state.metadata.lastModified.toISOString()
						})
					})).json();
					if (!result.ok) throw new Error(result.error.message);
					updateState({
						originalContent: state.content,
						isDirty: false,
						metadata: {
							...state.metadata,
							size: result.value.size,
							lastModified: new Date(result.value.mtime)
						},
						status: "saved"
					});
					this.clearDraft();
				} catch (error) {
					updateState({
						status: "error",
						error: error instanceof Error ? error.message : String(error)
					});
					throw error;
				}
			},
			undo() {
				const { history, content, cursor } = state;
				if (history.past.length === 0) return;
				const previous = history.past[history.past.length - 1];
				const newPast = history.past.slice(0, -1);
				const newFuture = [...history.future, {
					content,
					cursor: { ...cursor },
					timestamp: Date.now()
				}];
				updateState({
					content: previous.content,
					cursor: previous.cursor,
					isDirty: previous.content !== state.originalContent,
					history: {
						...history,
						past: newPast,
						future: newFuture
					}
				});
			},
			redo() {
				const { history, content, cursor } = state;
				if (history.future.length === 0) return;
				const next = history.future[history.future.length - 1];
				const newFuture = history.future.slice(0, -1);
				const newPast = [...history.past, {
					content,
					cursor: { ...cursor },
					timestamp: Date.now()
				}];
				updateState({
					content: next.content,
					cursor: next.cursor,
					isDirty: next.content !== state.originalContent,
					history: {
						...history,
						past: newPast,
						future: newFuture
					}
				});
			},
			updateSettings(settings) {
				updateState({ settings: {
					...state.settings,
					...settings
				} });
			},
			setCursor(line, column, offset) {
				updateState({ cursor: {
					line,
					column,
					offset
				} });
			},
			setSelection(selection) {
				updateState({ selection });
			},
			setSearch(search) {
				updateState({ search: {
					...state.search,
					...search
				} });
			},
			saveDraft() {
				if (!state.file) return;
				const draftKey = `file-explorer-draft-${state.file.path}`;
				const draft = {
					content: state.content,
					timestamp: Date.now(),
					cursor: state.cursor
				};
				try {
					localStorage.setItem(draftKey, JSON.stringify(draft));
				} catch (error) {
					console.warn("Failed to save draft:", error);
				}
			},
			loadDraft() {
				if (!state.file) return false;
				const draftKey = `file-explorer-draft-${state.file.path}`;
				try {
					const draftStr = localStorage.getItem(draftKey);
					if (!draftStr) return false;
					const draft = JSON.parse(draftStr);
					if (draft.timestamp > state.metadata.lastModified.getTime()) {
						updateState({
							content: draft.content,
							cursor: draft.cursor,
							isDirty: true
						});
						return true;
					}
					return false;
				} catch (error) {
					console.warn("Failed to load draft:", error);
					return false;
				}
			},
			clearDraft() {
				if (!state.file) return;
				const draftKey = `file-explorer-draft-${state.file.path}`;
				try {
					localStorage.removeItem(draftKey);
				} catch (error) {
					console.warn("Failed to clear draft:", error);
				}
			},
			reset() {
				state = { ...initialState };
				notifyListeners();
			},
			canUndo() {
				return state.history.past.length > 0;
			},
			canRedo() {
				return state.history.future.length > 0;
			},
			hasChanges() {
				return state.content !== state.originalContent;
			},
			getLineEnding() {
				return detectLineEnding(state.content);
			},
			getStats() {
				return {
					lines: state.content.split("\n").length,
					characters: state.content.length,
					words: state.content.split(/\s+/).filter((w) => w.length > 0).length
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
		async function apiMut$1(action, payload) {
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
			const [closing, setClosing] = (0, react.useState)(false);
			const closeTimer = (0, react.useRef)(null);
			const [state, setState] = (0, react.useState)({
				root: "",
				children: /* @__PURE__ */ new Map(),
				expanded: /* @__PURE__ */ new Set()
			});
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const noticeTimer = (0, react.useRef)(null);
			const [createIn, setCreateIn] = (0, react.useState)(null);
			const [newName, setNewName] = (0, react.useState)("");
			const [createBusy, setCreateBusy] = (0, react.useState)(false);
			const [deleting, setDeleting] = (0, react.useState)(null);
			const [confirmTarget, setConfirmTarget] = (0, react.useState)(null);
			const [confirmDir, setConfirmDir] = (0, react.useState)(null);
			const [dirAck, setDirAck] = (0, react.useState)(false);
			const showNotice = (0, react.useCallback)((text) => {
				setNotice(text);
				if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
				noticeTimer.current = window.setTimeout(() => {
					setNotice(null);
				}, 4e3);
			}, []);
			const closePanel = (0, react.useCallback)(() => {
				if (closing) return;
				setClosing(true);
				if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
				closeTimer.current = window.setTimeout(() => {
					setOpen(false);
					setClosing(false);
				}, 160);
			}, [closing]);
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
						if (createIn === path) setCreateIn(null);
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
			}, [ensure, createIn]);
			const openFile = (0, react.useCallback)((entry, edit = false) => {
				filePreviewStore.open({
					path: entry.path,
					name: entry.name
				}, edit);
			}, []);
			const toggleRootCreate = (0, react.useCallback)(() => {
				setCreateIn((v) => v === state.root ? null : state.root);
				setNewName("");
			}, [state.root]);
			const addInDir = (0, react.useCallback)((path) => {
				setCreateIn(path);
				setNewName("");
				setState((s) => {
					const e = new Set(s.expanded);
					e.add(path);
					return {
						...s,
						expanded: e
					};
				});
				ensure(path);
			}, [ensure]);
			const cancelCreate = (0, react.useCallback)(() => {
				setCreateIn(null);
				setNewName("");
			}, []);
			const submitCreate = (0, react.useCallback)(() => {
				const name = newName.trim();
				const parent = createIn;
				if (name === "" || parent === null) return;
				setCreateBusy(true);
				apiMut$1("create", {
					parent,
					name
				}).then(() => {
					setCreateIn(null);
					setNewName("");
					showNotice(`已创建「${name}」`);
					refresh(parent);
				}).catch((e) => {
					setError(e instanceof Error ? e.message : String(e));
				}).finally(() => {
					setCreateBusy(false);
				});
			}, [
				newName,
				createIn,
				refresh,
				showNotice
			]);
			const askDelete = (0, react.useCallback)((entry) => {
				setConfirmTarget(entry);
			}, []);
			const cancelDelete = (0, react.useCallback)(() => {
				setConfirmTarget(null);
			}, []);
			const askDeleteDir = (0, react.useCallback)((path, name) => {
				setConfirmDir({
					path,
					name,
					kind: "dir",
					size: 0,
					preview: "none"
				});
				setDirAck(false);
			}, []);
			const cancelDeleteDir = (0, react.useCallback)(() => {
				setConfirmDir(null);
				setDirAck(false);
			}, []);
			const confirmDeleteDir = (0, react.useCallback)(() => {
				const entry = confirmDir;
				if (entry === null) return;
				setConfirmDir(null);
				setDirAck(false);
				setDeleting(entry.path);
				apiMut$1("delete", {
					path: entry.path,
					recursive: true
				}).then((res) => {
					const preview = filePreviewStore.get();
					if (preview !== null && (preview.path === entry.path || preview.path.startsWith(entry.path + "\\") || preview.path.startsWith(entry.path + "/"))) filePreviewStore.set(null);
					showNotice(`已删除「${entry.name}」`);
					refresh(res.parent);
				}).catch((e) => {
					setError(e instanceof Error ? e.message : String(e));
				}).finally(() => {
					setDeleting(null);
				});
			}, [
				confirmDir,
				refresh,
				showNotice
			]);
			const confirmDelete = (0, react.useCallback)(() => {
				const entry = confirmTarget;
				if (entry === null) return;
				setConfirmTarget(null);
				setDeleting(entry.path);
				apiMut$1("delete", { path: entry.path }).then((res) => {
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
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "fex-chevron",
							children: expanded ? "▾" : "▸"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "fex-name",
							children: base(path)
						}),
						path !== state.root ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "fex-dir-del",
							title: "删除文件夹",
							"aria-label": `删除文件夹 ${base(path)}`,
							disabled: deleting === path,
							onClick: (e) => {
								e.stopPropagation();
								askDeleteDir(path, base(path));
							},
							children: deleting === path ? "…" : "🗑"
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "fex-dir-add",
							title: "新建文件",
							"aria-label": `在 ${base(path)} 新建文件`,
							onClick: (e) => {
								e.stopPropagation();
								addInDir(path);
							},
							children: "＋"
						})
					]
				}), expanded && kids !== void 0 ? [createIn === path ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "fex-create",
					style: { paddingLeft: 8 + (depth + 1) * 14 },
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
								} else if (e.key === "Escape") cancelCreate();
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
							onClick: cancelCreate,
							children: "✗"
						})
					]
				}, "fex-create") : null, ...kids.map((k) => k.kind === "dir" ? renderDir(k.path, depth + 1) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "fex-row fex-file",
					style: { paddingLeft: 8 + (depth + 1) * 14 },
					draggable: true,
					onClick: () => openFile(k),
					onDoubleClick: (e) => {
						e.stopPropagation();
						openFile(k, true);
					},
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
				}, k.path))] : null] }, path);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				!open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
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
					className: `fex-panel${closing ? " fex-panel-closing" : ""}`,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "fex-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "文件" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "fex-head-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "fex-btn",
									onClick: toggleRootCreate,
									title: "新建文件",
									"aria-label": "新建文件",
									disabled: state.root === "",
									children: "＋"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "fex-close",
									onClick: closePanel,
									children: "×"
								})]
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
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
					open: confirmTarget !== null,
					title: "删除文件",
					description: confirmTarget !== null ? confirmTarget.path : "",
					closeLabel: "关闭",
					className: "fex-modal",
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
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.RiskConfirmation, {
					open: confirmDir !== null,
					title: "删除文件夹",
					description: confirmDir !== null ? `确定删除文件夹「${confirmDir.name}」？该文件夹及其全部内容将被永久删除，不可恢复。${confirmDir.path}` : "",
					acknowledgeLabel: "我了解此操作不可撤销",
					cancelLabel: "取消",
					confirmLabel: "删除文件夹",
					acknowledged: dirAck,
					onAcknowledgedChange: setDirAck,
					onCancel: cancelDeleteDir,
					onConfirm: confirmDeleteDir
				})
			] });
		}
		//#endregion
		//#region src/client/FilePreviewView.tsx
		/**
		* The file-preview/editor view tab (conversation.view entry, session scope).
		* Reads the shared preview-file store written by the file tree, fetches the
		* file through the same-origin file API, and renders text/image previews.
		* Now with editing support for text files.
		*/
		const API = "/_dsh/file-explorer/api";
		async function api(action, path) {
			const res = await fetch(`${API}?action=${encodeURIComponent(action)}&path=${encodeURIComponent(path)}`, { credentials: "same-origin" });
			const body = await res.json();
			if (!res.ok || !body.ok) throw new Error(body.error?.message ?? `file API failed with HTTP ${res.status}`);
			return body.value;
		}
		async function apiMut(action, payload) {
			const res = await fetch(API, {
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
		function fmt(size) {
			if (size < 1024) return `${size} B`;
			if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
			return `${(size / (1024 * 1024)).toFixed(1)} MB`;
		}
		function FilePreviewView(_props) {
			const file = (0, react.useSyncExternalStore)(filePreviewStore.subscribe, filePreviewStore.get);
			const [result, setResult] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [isEditing, setIsEditing] = (0, react.useState)(false);
			const [editContent, setEditContent] = (0, react.useState)("");
			const [originalContent, setOriginalContent] = (0, react.useState)("");
			const [isSaving, setIsSaving] = (0, react.useState)(false);
			const [isDirty, setIsDirty] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(null);
			const textareaRef = (0, react.useRef)(null);
			const noticeTimer = (0, react.useRef)(null);
			const showNotice = (0, react.useCallback)((text) => {
				setNotice(text);
				if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
				noticeTimer.current = window.setTimeout(() => {
					setNotice(null);
				}, 3e3);
			}, []);
			const load = (0, react.useCallback)(async (path) => {
				setError(null);
				setIsEditing(false);
				setEditContent("");
				setOriginalContent("");
				setIsDirty(false);
				try {
					const res = await api("read", path);
					setResult(res);
					if (res.kind === "text" && filePreviewStore.consumeEdit()) {
						setEditContent(res.text);
						setOriginalContent(res.text);
						setIsEditing(true);
						setIsDirty(false);
					}
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			}, []);
			(0, react.useEffect)(() => {
				if (file === null) return;
				load(file.path);
			}, [file, load]);
			(0, react.useEffect)(() => {
				const handleBeforeUnload = (e) => {
					if (isDirty) {
						e.preventDefault();
						e.returnValue = "有未保存的修改，确定要离开吗？";
					}
				};
				window.addEventListener("beforeunload", handleBeforeUnload);
				return () => window.removeEventListener("beforeunload", handleBeforeUnload);
			}, [isDirty]);
			const enterEditMode = (0, react.useCallback)(() => {
				if (result && result.kind === "text") {
					setEditContent(result.text);
					setOriginalContent(result.text);
					setIsEditing(true);
					setIsDirty(false);
				}
			}, [result]);
			const exitEditMode = (0, react.useCallback)(() => {
				if (isDirty) {
					if (!confirm("有未保存的修改，确定要退出编辑模式吗？")) return;
				}
				setIsEditing(false);
				setEditContent("");
				setIsDirty(false);
				if (file) load(file.path);
			}, [
				isDirty,
				file,
				load
			]);
			const handleContentChange = (0, react.useCallback)((e) => {
				const newContent = e.target.value;
				setEditContent(newContent);
				setIsDirty(newContent !== originalContent);
			}, [originalContent]);
			const handleSave = (0, react.useCallback)(async () => {
				if (!file || !isDirty) return;
				setIsSaving(true);
				try {
					const expectedSize = result !== null && result.kind === "text" ? result.size : void 0;
					await apiMut("update", {
						path: file.path,
						content: editContent,
						expectedSize
					});
					setOriginalContent(editContent);
					setIsDirty(false);
					showNotice("已保存");
					setResult({
						path: file.path,
						kind: "text",
						text: editContent,
						size: editContent.length
					});
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setIsSaving(false);
				}
			}, [
				file,
				isDirty,
				editContent,
				showNotice
			]);
			(0, react.useEffect)(() => {
				if (!isEditing) return;
				const handleKeyDown = (e) => {
					if (e.ctrlKey && e.key === "s") {
						e.preventDefault();
						handleSave();
					}
				};
				window.addEventListener("keydown", handleKeyDown);
				return () => window.removeEventListener("keydown", handleKeyDown);
			}, [isEditing, handleSave]);
			if (file === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "fex-view fex-view-empty",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "在文件树中点击一个文件，这里会显示预览。" })
			});
			const canEdit = result !== null && result.kind === "text";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "fex-view",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "fex-editor-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "fex-editor-info",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "fex-editor-name",
									children: file.name
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "fex-editor-path",
									children: file.path
								}),
								isDirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "fex-editor-dirty",
									children: "●"
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "fex-editor-actions",
							children: [isEditing && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "fex-btn fex-btn-primary",
								onClick: () => void handleSave(),
								disabled: !isDirty || isSaving,
								title: "保存 (Ctrl+S)",
								children: isSaving ? "保存中..." : "保存"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "fex-btn fex-btn-ghost",
								onClick: exitEditMode,
								title: "退出编辑",
								children: "取消"
							})] }), !isEditing && canEdit && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "fex-btn fex-btn-primary",
								onClick: enterEditMode,
								title: "编辑文件",
								children: "编辑"
							})]
						})]
					}),
					notice && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "fex-notice",
						children: notice
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
						}) : isEditing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							ref: textareaRef,
							className: "fex-editor-textarea",
							value: editContent,
							onChange: handleContentChange,
							spellCheck: false
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
		//#region src/client/FileViewActivator.tsx
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
		/** Entry id of the preview/edit tab registered by this plugin's index.ts. */
		const PREVIEW_VIEW_ID = "file-preview";
		function FileViewActivator({ viewActions }) {
			const file = (0, react.useSyncExternalStore)(filePreviewStore.subscribe, filePreviewStore.get);
			(0, react.useEffect)(() => {
				if (file === null) return;
				viewActions?.setView(PREVIEW_VIEW_ID);
			}, [file, viewActions]);
			return null;
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
				label: () => "预览/编辑",
				inject: () => ({})
			}, FilePreviewView));
			ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
				name: "conversation.input.overlay",
				id: "file-drop",
				order: 100,
				inject: () => ({})
			}, FileDropZone));
			ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
				name: "conversation.input.overlay",
				id: "file-view-activator",
				order: 90,
				inject: () => ({})
			}, FileViewActivator));
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
.fex-editor-head{flex:none;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2, #eee);font-size:13px;font-weight:650}
.fex-editor-info{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.fex-editor-name{font-weight:650;color:var(--dsw-alias-label-primary, #26231f)}
.fex-editor-path{font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary, #999);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fex-editor-dirty{color:var(--dsw-alias-state-warning-primary, #d97706);font-size:16px;line-height:1}
.fex-editor-actions{display:flex;align-items:center;gap:6px;flex:none}
.fex-editor-actions .fex-btn{height:28px;padding:0 12px;border-radius:14px;font-size:12px;font-weight:500}
.fex-editor-actions .fex-btn-primary{background:var(--dsw-alias-button-primary-fill, #1a7f37);color:var(--dsw-alias-label-primary-foreground, #fff)}
.fex-editor-actions .fex-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover, #156d2e)}
.fex-editor-actions .fex-btn-ghost{background:transparent;color:var(--dsw-alias-label-secondary, #666)}
.fex-editor-actions .fex-btn-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover, #f3f1ec)}
.fex-editor-actions .fex-btn:disabled{opacity:0.4;cursor:not-allowed}
.fex-editor-toolbar{flex:none;display:flex;align-items:center;gap:8px;padding:6px 14px;border-bottom:1px solid #eee;background:#faf9f7}
.fex-editor-settings{display:flex;flex-wrap:wrap;gap:8px;animation:fex-fade-slide-in .18s var(--ds-ease-in-out)}
.fex-editor-setting{display:flex;align-items:center;gap:4px;font-size:11px;color:#666}
.fex-editor-setting label{display:flex;align-items:center;gap:4px;cursor:pointer}
.fex-editor-setting select{border:1px solid #ddd;border-radius:4px;padding:2px 4px;font-size:11px;background:#fff}
.fex-editor-content{flex:1;display:flex;min-height:0;overflow:hidden;background:#faf9f7}
.fex-editor-line-numbers{flex:none;width:40px;overflow:hidden;background:#f5f5f5;border-right:1px solid #eee;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.6;color:#999;text-align:right;padding:14px 8px 14px 0}
.fex-editor-line-number.active{color:#26231f;font-weight:500}
.fex-editor-textarea{flex:1 1 auto;width:100%;height:100%;min-height:0;box-sizing:border-box;border:none;outline:none;resize:none;padding:14px;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.6;color:#26231f;background:transparent}
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