# dsh-file-explorer

DeepSeek Harness 插件：在 Web 界面提供一个**工作区文件树**和一个与「对话」「轨迹」平级的**文件预览页签**。

纯文本模型也能浏览工作区目录、预览文本和图片文件。

## 功能

- **文件树**（右下角浮层）：浏览当前工作区目录，展开子目录
- **预览页签**（`conversation.view`）：点击文件后，在对话区顶部的页签栏（与「对话」「轨迹」平级）预览文本/图片
- **同源文件 API**：后端只读文件 API（列目录、读文件），带同源校验、条目/字节上限、路径规范化

## 安装

需要 DeepSeek Harness 的 Web profile，且 `pnpm` 可用：

```sh
dsh plugin --profile web add @cxzrdxy/dsh-file-explorer
```

重启 Web profile 后生效。包内已提交编译好的 `lib/`，从 checkout 安装不需要消费端构建。

## 使用

1. 点右下角文件夹按钮打开文件树
2. 点某个文件 → 弹出提示「已打开「文件名」，请点击对话区顶部的「预览」页签查看」
3. 点对话区顶部页签栏的「预览」→ 显示文件内容

## 架构

单一 bundle 包，node half + browser half 同包（参照 `@dsh-external/dsh-vision-toolkit` 的组织方式）：

| 半 | 文件 | 作用 |
|---|---|---|
| node half | `lib/index.js` / `src/index.ts` | 同源文件 API（`list`/`read`/`workspace`）+ HTTP 路由 `/_dsh/file-explorer/api` |
| browser half | `lib/client.js` / `src/client/*` | 文件树（`shell.overlay`）+ 预览页签（`conversation.view`） |

文件树与预览页签通过 `src/client/filePreviewStore.ts` 模块级单例共享「当前预览文件」。

## 二次开发

源码已随包提交，但 **client bundle 的编译依赖 DSH 源码树**（`packages/client/tsdown.client.ts` 的 `clientBundle()` 预设，以及 `@deepseek-ai/dsh-client-*` 的 workspace 类型）。要重新构建：

1. 把 `src/` 放回一个 DeepSeek Harness checkout 的 `packages/client/ui-file-explorer/`（node half 放 `packages/host/file-explorer/`，或按你的单包构建配置调整）
2. 在该 checkout 内运行 `pnpm install` + `tsc -b` + `tsdown bundle`
3. 把 `lib/client.js` 覆盖回本包

## 已知限制

- 预览页签需**手动切换**（点文件后点「预览」页签）。自动跳转需要访问 `ui-conversation` 内部的 view store，当前 DSH 架构未对外暴露该能力。
- 文件树根路径跟随**当前会话的 cwd**（通过 `useSessions`），切换工作区会实时跟随。
- 只读（无编辑保存）。

## License

MIT
