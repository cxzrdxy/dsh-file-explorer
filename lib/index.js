import { readFile, readdir, stat } from "node:fs/promises";
import { join, normalize, resolve, sep } from "node:path";
//#region lib/types/index.js
const name = "file-explorer";
/** Exact route the browser half calls. */
const FILE_API_ROUTE = "/_dsh/file-explorer/api";
const MAX_ENTRIES = 500;
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
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
async function handle(req, res) {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		err(res, 405, "method-not-allowed", "Use GET");
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
	const action = url.searchParams.get("action");
	const rawPath = url.searchParams.get("path");
	try {
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
		err(res, 400, "bad-action", "action must be list or read");
	} catch (error) {
		err(res, 400, "fs-error", error instanceof Error ? error.message : String(error));
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
