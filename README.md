# 📂 dsh-file-explorer

> 给 **DeepSeek Harness** 的纯文本 Agent 装上一个「文件浏览器」。
> 一个右下角的浮动文件树，加一个与「对话」「轨迹」**平级**的预览/编辑页签——浏览工作区目录、预览文本和图片，
> **点击文件自动切到预览页签**、**双击文件直接进入编辑**，也能**把文件直接拖进消息框**（自动插入文件路径），
> 并支持**新建文件**与**删除文件**，无需切出对话。

<p align="center">
  <img src="assets/file-explorer.png" alt="dsh-file-explorer 截图" width="80%">
</p>

## ✨ 为什么用它

纯文本模型(如 DeepSeek)没法直接「看」文件。这个插件把文件浏览和预览收进 Harness 界面里：

- 📁 **浮动文件树** — 右下角一个按钮，点开即浏览当前工作区的目录树，可逐层展开
- 🗂️ **预览/编辑页签** — 点文件后**自动切到**对话区顶部的「预览/编辑」页签(与「对话」「轨迹」并排)查看内容，不打断对话流
- ✏️ **文件编辑** — 文本文件可直接在预览页签中编辑(支持保存 Ctrl+S、撤销 Ctrl+Z、重做 Ctrl+Y)；**在文件树里双击文件即直接进入编辑态**，少点一步
- 🎯 **拖拽进消息框** — 把文件树里的文件(或目录)直接拖到消息输入框，松开即插入该文件的绝对路径，
  Agent 收到后可直接用 `read` 等工具读取，不用手动敲路径
- ➕ **新建文件** — 面板头部「＋」在树根(当前工作区)新建;**悬停任意目录行**再点「＋」，直接在该目录内新建
  (自动展开该目录，表单出现在其子项顶部)
- 🗑️ **删除文件/文件夹** — 悬停行出现删除按钮，点击弹出**DSH 原生风格的确认弹窗**(ui-primitives 的 `Modal`/`Button`，
  非浏览器原生 confirm；遮罩/圆角/文案全走 `--dsw-*` 设计 token，明暗主题自适应)。删除**文件夹**走更强的
  `RiskConfirmation`：必须勾选「我了解此操作不可撤销」才能确认，确认后**递归删除**整个目录；
  服务端始终拒绝删除文件系统根路径，未带递归标志时拒绝非空目录，防误删
- 🔄 **实时跟随工作区** — 文件树根路径跟随当前会话的 `cwd`，切换工作区立即刷新
- ✨ **丝滑动效** — 面板开合弹出/收缩、新建表单滑入、弹窗卡片缩放入场、行 hover 渐变，
  全部走 DSH 动效 token(`--ds-ease-in-out` + 0.1/0.2/0.3s 时长档)，并尊重系统「减弱动态效果」设置
- 🔒 **安全** — 同源校验 + 路径规范化 + 条目/字节上限；删除操作拒绝非空目录与文件系统根路径，新建拒绝重名覆盖(409)

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

**使用**：

1. 点右下角 📁 按钮 → 打开文件树
2. 点某个文件 → **自动切到**「**预览/编辑**」页签查看内容(无需再手动点页签)
3. 文本文件点「**编辑**」按钮，或**在文件树里双击**该文件 → 直接进入编辑模式
4. 编辑完成后点「**保存**」或按 Ctrl+S → 保存文件
5. 或直接把文件树里的文件**拖到消息输入框** → 松开后文件路径自动插入消息文本，发送即可让 Agent 读取
6. 点面板头部「**＋**」→ 输入文件名回车 → 在工作区根目录新建文件
7. **悬停某个目录行** → 点该行右侧「＋」→ 在该目录内新建文件(目录自动展开)
8. 悬停某个文件行 → 点「🗑」→ 确认后删除该文件
9. **悬停某个目录行**(树根除外) → 点「🗑」→ 勾选确认后**递归删除**该文件夹

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
| node half | `lib/index.js` / `src/index.ts` | 同源文件 API(`list`/`read`/`workspace` GET，`create`/`delete`/`update` POST)+ HTTP 路由 `/_dsh/file-explorer/api` |
| browser half | `lib/client.js` / `src/client/*` | 文件树(`shell.overlay`，含新建/删除 UI)+ 预览/编辑页签(`conversation.view`)+ 消息框拖放目标(`conversation.input.overlay`) |

文件树与预览页签通过 `src/client/filePreviewStore.ts` 模块级单例共享「当前预览文件」；
拖放目标 `src/client/FileDropZone.tsx` 经 ui-conversation 标准套件提供的 `inputActions.setDraft`
把拖入的文件路径写入消息草稿(路径经自定义 DataTransfer MIME `application/x-dsh-file-path` 传递)。
**单击自动切页 / 双击直接编辑**依赖 ui-conversation 标准套件的 `viewActions.setView`：
常驻组件 `src/client/FileViewActivator.tsx`(注册在 `conversation.input.overlay`)监听 filePreviewStore，
文件一变即 `viewActions.setView('file-preview')` 把预览/编辑页签切到前台；双击的 edit 意图
由 `filePreviewStore.open(file, edit)` + `consumeEdit()` 传递给预览视图，取回内容后直接进入编辑态。

## 🔧 二次开发

源码随包提交，但 **client bundle 的编译依赖 DSH 源码树**(`packages/client/tsdown.client.ts` 的 `clientBundle()` 预设，以及 `@deepseek-ai/dsh-client-*` 的 workspace 类型)。要重新构建：

1. 把 `src/` 放回一个 DeepSeek Harness checkout(host 半放 `packages/host/`、client 半放 `packages/client/ui-file-explorer/`)
2. 在 checkout 内运行 `pnpm install` + `tsc -b` + `tsdown bundle`
3. 把 `lib/client.js`、`lib/index.js` 覆盖回本包

## ⚠️ 已知限制

- 拖拽进消息框**仅支持从文件树节点拖出**(浏览器拿不到 OS 文件管理器中文件的绝对路径，`File` 对象不含 path)
- **树根目录(当前工作区)本身不可删除**(行上不显示删除按钮，防清空工作区)

## 📄 License

MIT

## 🐛 更新日志

### 0.5.0 (2026-08-18)

- **单击文件自动切到「预览/编辑」页签**：不再需要点完文件再手动点页签。依靠 ui-conversation 标准套件新增的 `viewActions.setView`(仿照既有 `inputActions.setDraft` 通道) + 常驻组件 `FileViewActivator` 监听文件打开事件完成切换。
- **双击文件直接进入编辑态**：在文件树里双击文本文件(或单击切页后再点「编辑」)，即弹出 textarea 直接编辑，少点一步。双击的 edit 意图经 `filePreviewStore.open(file, edit)` + `consumeEdit()` 一次性传递，单击不会误进编辑。
- **修复双击可能打开上一个文件**：`openFile` 原先的「已打开」提示条会改变树布局，导致双击第二下落到上方一行；已去掉该提示，双击期间树保持稳定。

### 0.3.5 (2026-08-18)

- **修复编辑保存报错 `POST action must be create, delete, or update`**：预览/编辑页签的保存按钮原本向后端发送 `action: "write"`，但后端文件 API 只接受 `create` / `delete` / `update`，导致保存必返回 400。已将前端保存请求统一为 `action: "update"`（并带上 `expectedSize` 做乐观并发校验），与后端对齐。
- **修复编辑框高度塌陷**：编辑态的 `<textarea>` 在 `flex` 列布局里未正确撑开，实际只有约 66×180px，大文件被裁成"只看到标题一行"。已为 `.fex-editor-textarea` 显式设置 `width:100%; height:100%; min-height:0; box-sizing:border-box`，使其完整撑满预览/编辑区，18KB 文档可在框内滚动编辑。

> 注：本仓库早期 `src/` 为纯预览版本（无编辑按钮）。0.3.5 起 `src/` 已与线上运行代码对齐，包含完整的编辑/新建/删除 UI；0.5.0 起加入单击自动切页与双击直进编辑。

