# 📂 dsh-file-explorer

> 给 **DeepSeek Harness** 的纯文本 Agent 装上一个「文件浏览器」。
> 一个右下角的浮动文件树，加一个与「对话」「轨迹」**平级**的预览页签——浏览工作区目录、预览文本和图片，无需切出对话。

<p align="center">
  <img src="assets/file-explorer.png" alt="dsh-file-explorer 截图" width="80%">
</p>

## ✨ 为什么用它

纯文本模型(如 DeepSeek)没法直接「看」文件。这个插件把文件浏览和预览收进 Harness 界面里：

- 📁 **浮动文件树** — 右下角一个按钮，点开即浏览当前工作区的目录树，可逐层展开
- 🗂️ **平级预览页签** — 点文件后，切到对话区顶部的「预览」页签(与「对话」「轨迹」并排)查看内容，不打断对话流
- 🔄 **实时跟随工作区** — 文件树根路径跟随当前会话的 `cwd`，切换工作区立即刷新
- 🔒 **只读、安全** — 同源校验 + 路径规范化 + 条目/字节上限，不做写操作

## 🚀 快速开始

需要 DeepSeek Harness 的 Web profile 和 `pnpm`：

```sh
# 1. 克隆仓库
git clone https://github.com/cxzrdxy/dsh-file-explorer.git
cd dsh-file-explorer

# 2. 安装到 web profile（本地路径）
dsh plugin --profile web add file:.
```

重启 Web profile 即可。包内已提交编译好的 `lib/`，从 checkout 安装不需要消费端构建。

**使用三步**：

1. 点右下角 📁 按钮 → 打开文件树
2. 点某个文件 → 弹出提示「已打开「文件名」」
3. 点对话区顶部页签栏的「**预览**」→ 查看内容

## 📦 可预览的文件类型

| 类型 | 扩展名 | 大小上限 |
|---|---|---|
| 📄 文本 | `.txt` `.md` `.markdown` `.json` `.js` `.ts` `.tsx` `.jsx` `.css` `.html` `.htm` `.yml` `.yaml` `.xml` `.csv` `.log` `.py` `.c` `.cpp` `.h` `.cs` `.java` `.go` `.rs` `.sh` `.ps1` `.sql` `.ini` `.cfg` `.toml` `.bat` `.cmd` | 512 KB |
| 🖼️ 图片 | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.bmp` `.svg` `.ico` | 8 MB |
| ⚠️ 其他 | 二进制文件 → 显示大小提示，不预览内容 | — |

超出大小上限的文件会显示「文件过大」提示，不会被读取。

## 🏗️ 架构

单一 bundle 包，node half + browser half 同包(参照 `@dsh-external/dsh-vision-toolkit`)：

| 半 | 文件 | 作用 |
|---|---|---|
| node half | `lib/index.js` / `src/index.ts` | 同源文件 API(`list`/`read`/`workspace`)+ HTTP 路由 `/_dsh/file-explorer/api` |
| browser half | `lib/client.js` / `src/client/*` | 文件树(`shell.overlay`)+ 预览页签(`conversation.view`) |

文件树与预览页签通过 `src/client/filePreviewStore.ts` 模块级单例共享「当前预览文件」。

## 🔧 二次开发

源码随包提交，但 **client bundle 的编译依赖 DSH 源码树**(`packages/client/tsdown.client.ts` 的 `clientBundle()` 预设，以及 `@deepseek-ai/dsh-client-*` 的 workspace 类型)。要重新构建：

1. 把 `src/` 放回一个 DeepSeek Harness checkout(host 半放 `packages/host/`、client 半放 `packages/client/ui-file-explorer/`)
2. 在 checkout 内运行 `pnpm install` + `tsc -b` + `tsdown bundle`
3. 把 `lib/client.js`、`lib/index.js` 覆盖回本包

## ⚠️ 已知限制

- 预览页签需**手动切换**(点文件后点「预览」页签)。自动跳转需要访问 `ui-conversation` 内部的 view store，当前 DSH 架构未对外暴露该能力
- 只读(无编辑保存)

## 📄 License

MIT
