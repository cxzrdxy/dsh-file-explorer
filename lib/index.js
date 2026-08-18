import { readFile, readdir, rm, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
//#region lib/types/index.js
const name = "file-explorer";
/** Exact route the browser half calls. */
const FILE_API_ROUTE = "/_dsh/file-explorer/api";
const MAX_ENTRIES = 500;
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BODY_BYTES = 1024 * 1024;
const TEXT_EXTS = new Set([
	"",
	".txt",
	".md",
	".markdown",
	".json",
	".js",
	".ts",
	".tsx",
	".jsx",
	".css",
	".html",
	".htm",
	".yml",
	".yaml",
	".xml",
	".csv",
	".log",
	".py",
	".c",
	".cpp",
	".h",
	".cs",
	".java",
	".go",
	".rs",
	".sh",
	".ps1",
	".sql",
	".ini",
	".cfg",
	".toml",
	".bat",
	".cmd"
]);
const IMAGE_EXTS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".bmp",
	".svg",
	".ico"
]);
function extOf(name) {
	const i = name.lastIndexOf(".");
	return i < 0 ? "" : name.slice(i).toLowerCase();
}
function isText(name) {
	return TEXT_EXTS.has(extOf(name));
}
function isImage(name) {
	return IMAGE_EXTS.has(extOf(name));
}
function json(res, status, body) {
	const bytes = Buffer.from(JSON.stringify(body));
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader("Content-Length", String(bytes.length));
	res.setHeader("Cache-Control", "no-store");
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.writeHead(status);
	res.end(bytes);
}
function err(res, status, code, message) {
	json(res, status, {
		ok: false,
		error: {
			code,
			message
		}
	});
}
function sameOrigin(req) {
	const site = req.headers["sec-fetch-site"];
	if (site === "cross-site") return false;
	const origin = req.headers.origin;
	if (origin === void 0) return site === "same-origin" || site === "same-site" || site === "none";
	const host = req.headers.host;
	if (host === void 0) return false;
	try {
		const u = new URL(origin);
		return (u.protocol === "http:" || u.protocol === "https:") && u.host === host;
	} catch {
		return false;
	}
}
function cleanPath(raw) {
	const trimmed = (raw ?? "").trim();
	if (trimmed.length === 0) throw new Error("empty path");
	if (!resolve(trimmed).startsWith(sep) && !/^[A-Za-z]:/.test(resolve(trimmed))) throw new Error("path is not absolute");
	return normalize(trimmed);
}
async function listDirectory(path) {
	const entries = await readdir(path, { withFileTypes: true });
	const rows = [];
	let truncated = false;
	for (const e of entries) {
		if (rows.length >= MAX_ENTRIES) {
			truncated = true;
			break;
		}
		const full = join(path, e.name);
		let kind = "file";
		let size = 0;
		try {
			const st = await stat(full);
			if (st.isDirectory()) kind = "dir";
			else size = st.size;
		} catch {}
		const p = isText(e.name) ? "text" : isImage(e.name) ? "image" : "none";
		rows.push({
			name: e.name,
			path: full,
			kind,
			size,
			preview: kind === "dir" ? "none" : p
		});
	}
	rows.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1);
	return {
		path,
		entries: rows,
		truncated
	};
}
async function readTarget(path) {
	const st = await stat(path);
	if (st.isDirectory()) return {
		path,
		kind: "dir"
	};
	const name = path.split(/[\\/]/).pop() ?? path;
	if (isImage(name)) {
		if (st.size > MAX_IMAGE_BYTES) return {
			path,
			kind: "too-large",
			size: st.size
		};
		const b64 = (await readFile(path)).toString("base64");
		const mime = extOf(name) === ".svg" ? "image/svg+xml" : `image/${extOf(name).slice(1)}`;
		return {
			path,
			kind: "image",
			mime,
			dataUrl: `data:${mime};base64,${b64}`,
			size: st.size
		};
	}
	if (isText(name)) {
		if (st.size > MAX_TEXT_BYTES) return {
			path,
			kind: "too-large",
			size: st.size
		};
		return {
			path,
			kind: "text",
			text: (await readFile(path)).toString("utf8"),
			size: st.size
		};
	}
	return {
		path,
		kind: "binary",
		size: st.size
	};
}
/**
* A new file name must survive Windows and POSIX semantics: no path
* separators, no reserved characters, no control bytes, no trailing dot or
* space (Windows trims them), and no '.' / '..'.
*/
function validName(name) {
	if (name.length === 0 || name === "." || name === "..") return false;
	if (/[\\/]/.test(name)) return false;
	if (/[<>:"|?*\u0000-\u001f]/.test(name)) return false;
	if (/[. ]$/.test(name)) return false;
	return true;
}
function codeError(message, code) {
	return Object.assign(new Error(message), { code });
}
/** Create a new file inside `parent`; `flag: 'wx'` refuses to overwrite. */
async function createFile(parent, name, content) {
	if (!validName(name)) throw codeError("invalid file name", "EINVAL");
	const target = join(parent, name);
	await writeFile(target, content, { flag: "wx" });
	return {
		path: target,
		name
	};
}
/**
* Delete a file, or a directory. `recursive` allows non-empty directories
* (full subtree removal); without it only empty directories are accepted.
* Filesystem roots are always refused.
*/
async function deleteTarget(path, recursive) {
	const resolved = resolve(path);
	if (dirname(resolved) === resolved) throw codeError("refusing to delete a filesystem root", "EROOT");
	if ((await stat(resolved)).isDirectory()) if (recursive) await rm(resolved, { recursive: true });
	else {
		const kids = await readdir(resolved);
		if (kids.length > 0) throw codeError(`directory not empty (${kids.length} entries)`, "ENOTEMPTY");
		await rmdir(resolved);
	}
	else await unlink(resolved);
	return {
		path: resolved,
		parent: dirname(resolved)
	};
}
/**
* Update an existing file with new content. Supports optimistic concurrency
* control via expectedSize and expectedMtime parameters.
*/
async function updateFile(path, content, expectedSize, expectedMtime) {
	const resolved = resolve(path);
	let st;
	try {
		st = await stat(resolved);
	} catch (error) {
		if (error.code === "ENOENT") throw codeError("鏂囦欢涓嶅瓨鍦?, "ENOENT");
		throw error;
	}
	if (st.isDirectory()) throw codeError("涓嶈兘缂栬緫鐩綍", "EISDIR");
	if (expectedSize !== void 0 && st.size !== expectedSize) throw codeError("鏂囦欢宸茶鍏朵粬杩涚▼淇敼锛堝ぇ灏忓彉鍖栵級", "CONFLICT");
	if (expectedMtime !== void 0) {
		if (st.mtime.toISOString() !== expectedMtime) throw codeError("鏂囦欢宸茶鍏朵粬杩涚▼淇敼锛堟椂闂村彉鍖栵級", "CONFLICT");
	}
	if (content.length > MAX_TEXT_BYTES) throw codeError("鏂囦欢鍐呭杩囧ぇ", "ETOOBIG");
	await writeFile(resolved, content, { encoding: "utf8" });
	const newSt = await stat(resolved);
	return {
		path: resolved,
		size: newSt.size,
		mtime: newSt.mtime.toISOString()
	};
}
function readBody(req) {
	return new Promise((fulfil, reject) => {
		let size = 0;
		const chunks = [];
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(codeError("request body too large", "ETOOBIG"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => fulfil(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}
async function handle(req, res) {
	if (req.method !== "GET" && req.method !== "POST") {
		res.setHeader("Allow", "GET, POST");
		err(res, 405, "method-not-allowed", "Use GET or POST");
		return;
	}
	if (!sameOrigin(req)) {
		err(res, 403, "origin-rejected", "Request must originate from this DSH Web application");
		return;
	}
	let url;
	try {
		url = new URL(req.url ?? "/", "http://localhost");
	} catch {
		err(res, 400, "bad-url", "Malformed request URL");
		return;
	}
	try {
		if (req.method === "GET") {
			const action = url.searchParams.get("action");
			const rawPath = url.searchParams.get("path");
			if (action === "workspace") {
				json(res, 200, {
					ok: true,
					value: { path: process.cwd() }
				});
				return;
			}
			const path = rawPath === null || rawPath === void 0 ? "" : cleanPath(rawPath);
			if (action === "list") {
				json(res, 200, {
					ok: true,
					value: await listDirectory(path)
				});
				return;
			}
			if (action === "read") {
				json(res, 200, {
					ok: true,
					value: await readTarget(path)
				});
				return;
			}
			err(res, 400, "bad-action", "GET action must be list or read");
			return;
		}
		let body;
		try {
			body = JSON.parse(await readBody(req));
		} catch (error) {
			if (error.code === "ETOOBIG") {
				err(res, 413, "body-too-large", "Request body too large");
				return;
			}
			err(res, 400, "bad-json", "Request body must be valid JSON");
			return;
		}
		const payload = body ?? {};
		const action = typeof payload.action === "string" ? payload.action : "";
		if (action === "create") {
			json(res, 200, {
				ok: true,
				value: await createFile(typeof payload.parent === "string" ? cleanPath(payload.parent) : "", typeof payload.name === "string" ? payload.name.trim() : "", typeof payload.content === "string" ? payload.content : "")
			});
			return;
		}
		if (action === "delete") {
			json(res, 200, {
				ok: true,
				value: await deleteTarget(typeof payload.path === "string" ? cleanPath(payload.path) : "", payload.recursive === true || payload.recursive === "true")
			});
			return;
		}
		if (action === "update") {
			json(res, 200, {
				ok: true,
				value: await updateFile(typeof payload.path === "string" ? cleanPath(payload.path) : "", typeof payload.content === "string" ? payload.content : "", typeof payload.expectedSize === "number" ? payload.expectedSize : void 0, typeof payload.expectedMtime === "string" ? payload.expectedMtime : void 0)
			});
			return;
		}
		err(res, 400, "bad-action", "POST action must be create, delete, or update");
	} catch (error) {
		const e = error;
		const message = e.message || String(error);
		if (e.code === "EEXIST") {
			err(res, 409, "exists", message);
			return;
		}
		if (e.code === "ENOENT") {
			err(res, 404, "not-found", message);
			return;
		}
		if (e.code === "EINVAL" || e.code === "EROOT" || e.code === "ENOTEMPTY" || e.code === "EISDIR" || e.code === "EPERM" || e.code === "EACCES") {
			err(res, 400, String(e.code).toLowerCase(), message);
			return;
		}
		err(res, 400, "fs-error", message);
	}
}
/** Host plugin body: attach the file API route when a webServer exists. */
function apply(ctx) {
	ctx.inject(["webServer"], (webCtx) => {
		webCtx.effect(() => {
			const dispose = webCtx.webServer.register({
				kind: "exact",
				path: FILE_API_ROUTE,
				handler: (req, res) => handle(req, res)
			});
			return () => {
				dispose();
			};
		}, "file-explorer: file API route");
	});
}
//#endregion
export { FILE_API_ROUTE, apply, name };
