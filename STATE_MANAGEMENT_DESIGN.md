# dsh-file-explorer 状态管理和数据流设计

## 1. 状态管理架构

### 1.1 整体架构
```
┌─────────────────────────────────────────────────────┐
│                    应用层                            │
│  FileEditorView / FileExplorerPanel / FilePreviewView│
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│                  状态管理层                          │
│              filePreviewStore                        │
│  ┌─────────────────────────────────────────────┐    │
│  │  文件状态  │  编辑状态  │  设置状态  │  历史状态 │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│                  数据层                             │
│  API服务 │ 本地存储 │ 浏览器存储                     │
└─────────────────────────────────────────────────────┘
```

### 1.2 状态分类

#### 1.2.1 文件状态（File State）
```typescript
interface FileState {
  // 当前文件信息
  currentFile: PreviewFile | null
  
  // 文件内容
  content: string
  originalContent: string
  
  // 文件元数据
  metadata: {
    size: number
    lastModified: Date
    encoding: string
    lineEnding: 'lf' | 'crlf' | 'auto'
  }
  
  // 文件状态
  status: 'loading' | 'loaded' | 'saving' | 'saved' | 'error'
  error: string | null
}
```

#### 1.2.2 编辑状态（Editor State）
```typescript
interface EditorState {
  // 编辑模式
  mode: 'preview' | 'edit'
  
  // 修改状态
  isDirty: boolean
  
  // 光标位置
  cursor: {
    line: number
    column: number
    offset: number
  }
  
  // 选择状态
  selection: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  } | null
  
  // 搜索状态
  search: {
    query: string
    replace: string
    caseSensitive: boolean
    wholeWord: boolean
    regex: boolean
    direction: 'up' | 'down'
    matches: number
    currentMatch: number
  }
}
```

#### 1.2.3 设置状态（Settings State）
```typescript
interface SettingsState {
  // 编辑器设置
  editor: {
    fontSize: number
    tabSize: number
    wordWrap: boolean
    lineNumbers: boolean
    minimap: boolean
    autoSave: boolean
    autoSaveInterval: number
    formatOnSave: boolean
    trimTrailingWhitespace: boolean
    insertFinalNewline: boolean
  }
  
  // 主题设置
  theme: 'light' | 'dark' | 'auto'
  
  // 语言设置
  language: string
  
  // 键盘设置
  keybindings: 'default' | 'vim' | 'emacs'
}
```

#### 1.2.4 历史状态（History State）
```typescript
interface HistoryState {
  // 撤销历史
  past: Array<{
    content: string
    cursor: { line: number; column: number }
    timestamp: number
  }>
  
  // 重做历史
  future: Array<{
    content: string
    cursor: { line: number; column: number }
    timestamp: number
  }>
  
  // 历史限制
  maxHistorySize: number
}
```

## 2. 状态管理实现

### 2.1 扩展现有Store

#### 2.1.1 filePreviewStore扩展
```typescript
// filePreviewStore.ts 扩展实现
type Listener = () => void

export interface PreviewFile {
  path: string
  name: string
}

// 新增：编辑器状态接口
export interface EditorState {
  // 文件状态
  file: PreviewFile | null
  content: string
  originalContent: string
  metadata: {
    size: number
    lastModified: Date
    encoding: string
    lineEnding: 'lf' | 'crlf' | 'auto'
  }
  
  // 编辑状态
  isEditing: boolean
  isDirty: boolean
  cursor: { line: number; column: number; offset: number }
  selection: { start: { line: number; column: number }; end: { line: number; column: number } } | null
  
  // 设置状态
  settings: {
    fontSize: number
    tabSize: number
    wordWrap: boolean
    lineNumbers: boolean
    syntaxHighlight: boolean
    autoSave: boolean
    autoSaveInterval: number
  }
  
  // 历史状态
  history: {
    past: Array<{ content: string; cursor: { line: number; column: number }; timestamp: number }>
    future: Array<{ content: string; cursor: { line: number; column: number }; timestamp: number }>
    maxHistorySize: number
  }
  
  // 搜索状态
  search: {
    query: string
    replace: string
    caseSensitive: boolean
    wholeWord: boolean
    regex: boolean
    direction: 'up' | 'down'
    matches: number
    currentMatch: number
  }
}

// 初始状态
const initialState: EditorState = {
  file: null,
  content: '',
  originalContent: '',
  metadata: {
    size: 0,
    lastModified: new Date(),
    encoding: 'utf-8',
    lineEnding: 'auto'
  },
  isEditing: false,
  isDirty: false,
  cursor: { line: 1, column: 1, offset: 0 },
  selection: null,
  settings: {
    fontSize: 14,
    tabSize: 2,
    wordWrap: true,
    lineNumbers: true,
    syntaxHighlight: true,
    autoSave: true,
    autoSaveInterval: 30000
  },
  history: {
    past: [],
    future: [],
    maxHistorySize: 50
  },
  search: {
    query: '',
    replace: '',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    direction: 'down',
    matches: 0,
    currentMatch: 0
  }
}

let state: EditorState = { ...initialState }
const listeners = new Set<Listener>()

// 辅助函数：深拷贝状态
function cloneState(s: EditorState): EditorState {
  return JSON.parse(JSON.stringify(s))
}

// 辅助函数：更新状态
function updateState(partial: Partial<EditorState>): void {
  state = { ...state, ...partial }
  notifyListeners()
}

// 辅助函数：通知监听器
function notifyListeners(): void {
  for (const listener of listeners) listener()
}

export const filePreviewStore = {
  // 现有方法
  get(): PreviewFile | null {
    return state.file
  },
  
  set(file: PreviewFile | null): void {
    updateState({ file })
  },
  
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  
  // 新增：获取完整编辑器状态
  getEditorState(): EditorState {
    return cloneState(state)
  },
  
  // 新增：更新编辑器状态
  setEditorState(partial: Partial<EditorState>): void {
    updateState(partial)
  },
  
  // 新增：开始编辑
  startEditing(): void {
    updateState({ isEditing: true })
  },
  
  // 新增：停止编辑
  stopEditing(): void {
    updateState({ isEditing: false })
  },
  
  // 新增：设置内容
  setContent(content: string): void {
    const { content: oldContent, history } = state
    
    // 记录到撤销历史
    const newPast = [...history.past, {
      content: oldContent,
      cursor: { ...state.cursor },
      timestamp: Date.now()
    }]
    
    // 限制历史大小
    if (newPast.length > history.maxHistorySize) {
      newPast.shift()
    }
    
    updateState({
      content,
      isDirty: content !== state.originalContent,
      history: {
        ...history,
        past: newPast,
        future: [] // 新编辑清空重做历史
      }
    })
  },
  
  // 新增：保存文件
  async save(): Promise<void> {
    if (!state.file || !state.isDirty) return
    
    updateState({ status: 'saving' })
    
    try {
      const response = await fetch('/_dsh/file-explorer/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          path: state.file.path,
          content: state.content,
          expectedSize: state.metadata.size,
          expectedMtime: state.metadata.lastModified.toISOString()
        })
      })
      
      const result = await response.json()
      
      if (!result.ok) {
        throw new Error(result.error.message)
      }
      
      // 更新状态
      updateState({
        originalContent: state.content,
        isDirty: false,
        metadata: {
          ...state.metadata,
          size: result.value.size,
          lastModified: new Date(result.value.mtime)
        },
        status: 'saved'
      })
      
      // 清理本地草稿
      this.clearDraft()
      
    } catch (error) {
      updateState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  },
  
  // 新增：撤销
  undo(): void {
    const { history, content, cursor } = state
    
    if (history.past.length === 0) return
    
    const previous = history.past[history.past.length - 1]
    const newPast = history.past.slice(0, -1)
    
    // 将当前状态添加到重做历史
    const newFuture = [...history.future, {
      content,
      cursor: { ...cursor },
      timestamp: Date.now()
    }]
    
    updateState({
      content: previous.content,
      cursor: previous.cursor,
      isDirty: previous.content !== state.originalContent,
      history: {
        ...history,
        past: newPast,
        future: newFuture
      }
    })
  },
  
  // 新增：重做
  redo(): void {
    const { history, content, cursor } = state
    
    if (history.future.length === 0) return
    
    const next = history.future[history.future.length - 1]
    const newFuture = history.future.slice(0, -1)
    
    // 将当前状态添加到撤销历史
    const newPast = [...history.past, {
      content,
      cursor: { ...cursor },
      timestamp: Date.now()
    }]
    
    updateState({
      content: next.content,
      cursor: next.cursor,
      isDirty: next.content !== state.originalContent,
      history: {
        ...history,
        past: newPast,
        future: newFuture
      }
    })
  },
  
  // 新增：更新设置
  updateSettings(settings: Partial<EditorState['settings']>): void {
    updateState({
      settings: {
        ...state.settings,
        ...settings
      }
    })
  },
  
  // 新增：更新光标位置
  setCursor(line: number, column: number, offset: number): void {
    updateState({
      cursor: { line, column, offset }
    })
  },
  
  // 新增：设置选择
  setSelection(selection: EditorState['selection']): void {
    updateState({ selection })
  },
  
  // 新增：更新搜索状态
  setSearch(search: Partial<EditorState['search']>): void {
    updateState({
      search: {
        ...state.search,
        ...search
      }
    })
  },
  
  // 新增：保存草稿到本地存储
  saveDraft(): void {
    if (!state.file) return
    
    const draftKey = `file-explorer-draft-${state.file.path}`
    const draft = {
      content: state.content,
      timestamp: Date.now(),
      cursor: state.cursor
    }
    
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft))
    } catch (error) {
      console.warn('Failed to save draft:', error)
    }
  },
  
  // 新增：加载草稿从本地存储
  loadDraft(): boolean {
    if (!state.file) return false
    
    const draftKey = `file-explorer-draft-${state.file.path}`
    
    try {
      const draftStr = localStorage.getItem(draftKey)
      if (!draftStr) return false
      
      const draft = JSON.parse(draftStr)
      
      // 检查草稿是否比当前内容新
      if (draft.timestamp > state.metadata.lastModified.getTime()) {
        updateState({
          content: draft.content,
          cursor: draft.cursor,
          isDirty: true
        })
        return true
      }
      
      return false
    } catch (error) {
      console.warn('Failed to load draft:', error)
      return false
    }
  },
  
  // 新增：清除草稿
  clearDraft(): void {
    if (!state.file) return
    
    const draftKey = `file-explorer-draft-${state.file.path}`
    
    try {
      localStorage.removeItem(draftKey)
    } catch (error) {
      console.warn('Failed to clear draft:', error)
    }
  },
  
  // 新增：重置状态
  reset(): void {
    state = { ...initialState }
    notifyListeners()
  }
}
```

### 2.2 状态同步机制

#### 2.2.1 组件订阅
```typescript
// 在组件中订阅状态
function FileEditorView() {
  const [editorState, setEditorState] = useState(filePreviewStore.getEditorState())
  
  useEffect(() => {
    const unsubscribe = filePreviewStore.subscribe(() => {
      setEditorState(filePreviewStore.getEditorState())
    })
    
    return unsubscribe
  }, [])
  
  // 使用editorState渲染UI
  return (
    <div className="fex-editor">
      {/* 组件内容 */}
    </div>
  )
}
```

#### 2.2.2 状态选择器
```typescript
// 优化的状态选择器，避免不必要的重渲染
function useEditorState<T>(selector: (state: EditorState) => T): T {
  const [selectedState, setSelectedState] = useState(() => selector(filePreviewStore.getEditorState()))
  
  useEffect(() => {
    const unsubscribe = filePreviewStore.subscribe(() => {
      const newSelectedState = selector(filePreviewStore.getEditorState())
      setSelectedState(newSelectedState)
    })
    
    return unsubscribe
  }, [selector])
  
  return selectedState
}

// 使用示例
function FileEditorHeader() {
  const isEditing = useEditorState(state => state.isEditing)
  const isDirty = useEditorState(state => state.isDirty)
  const file = useEditorState(state => state.file)
  
  return (
    <div className="fex-editor-header">
      {/* 使用状态渲染UI */}
    </div>
  )
}
```

## 3. 数据流设计

### 3.1 文件加载流程

#### 3.1.1 流程图
```
用户点击文件
    │
    ▼
filePreviewStore.set(file)
    │
    ▼
组件订阅状态变化
    │
    ▼
调用API获取文件内容
    │
    ▼
更新editorState.content
    │
    ▼
检查本地草稿
    │
    ▼
渲染编辑器
```

#### 3.1.2 实现代码
```typescript
// 文件加载函数
async function loadFile(file: PreviewFile): Promise<void> {
  // 设置文件信息
  filePreviewStore.set(file)
  filePreviewStore.setEditorState({
    status: 'loading',
    error: null
  })
  
  try {
    // 调用API获取文件内容
    const response = await fetch(
      `/_dsh/file-explorer/api?action=read&path=${encodeURIComponent(file.path)}`
    )
    const result = await response.json()
    
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    
    const fileData = result.value
    
    // 更新编辑器状态
    filePreviewStore.setEditorState({
      content: fileData.text || '',
      originalContent: fileData.text || '',
      metadata: {
        size: fileData.size,
        lastModified: new Date(),
        encoding: 'utf-8',
        lineEnding: detectLineEnding(fileData.text || '')
      },
      status: 'loaded',
      isEditing: false,
      isDirty: false,
      history: {
        past: [],
        future: [],
        maxHistorySize: 50
      }
    })
    
    // 尝试加载本地草稿
    const hasDraft = filePreviewStore.loadDraft()
    if (hasDraft) {
      console.log('Loaded draft for', file.name)
    }
    
  } catch (error) {
    filePreviewStore.setEditorState({
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

// 检测行尾符
function detectLineEnding(text: string): 'lf' | 'crlf' | 'auto' {
  const crlfCount = (text.match(/\r\n/g) || []).length
  const lfCount = (text.match(/\n/g) || []).length - crlfCount
  
  if (crlfCount > lfCount) return 'crlf'
  if (lfCount > 0) return 'lf'
  return 'auto'
}
```

### 3.2 编辑保存流程

#### 3.2.1 流程图
```
用户编辑内容
    │
    ▼
editorState.content变化
    │
    ▼
标记isDirty=true
    │
    ▼
自动保存草稿到localStorage
    │
    ▼
用户点击保存/Ctrl+S
    │
    ▼
显示"保存中..."状态
    │
    ▼
调用POST action=update API
    │
    ├─ 成功 ──▶ 更新originalContent
    │           标记isDirty=false
    │           显示"已保存"状态
    │           清理本地草稿
    │
    └─ 失败 ──▶ 显示错误信息
                保持isDirty=true
                提供重试选项
```

#### 3.2.2 实现代码
```typescript
// 编辑内容处理函数
function handleContentChange(newContent: string): void {
  // 更新内容
  filePreviewStore.setContent(newContent)
  
  // 自动保存草稿
  filePreviewStore.saveDraft()
  
  // 如果启用了自动保存，启动定时器
  const { settings } = filePreviewStore.getEditorState()
  if (settings.autoSave) {
    startAutoSaveTimer()
  }
}

// 保存文件函数
async function handleSave(): Promise<void> {
  try {
    await filePreviewStore.save()
    
    // 显示成功提示
    showNotification('文件已保存', 'success')
    
  } catch (error) {
    // 显示错误提示
    showNotification(
      `保存失败: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    )
    
    // 提供重试选项
    showRetryDialog()
  }
}

// 自动保存定时器
let autoSaveTimer: NodeJS.Timeout | null = null

function startAutoSaveTimer(): void {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
  }
  
  const { settings } = filePreviewStore.getEditorState()
  
  autoSaveTimer = setTimeout(async () => {
    const { isDirty } = filePreviewStore.getEditorState()
    if (isDirty) {
      await handleSave()
    }
    startAutoSaveTimer() // 重新启动定时器
  }, settings.autoSaveInterval)
}

function stopAutoSaveTimer(): void {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
}
```

### 3.3 撤销重做流程

#### 3.3.1 流程图
```
用户编辑内容
    │
    ▼
记录到history.past
    │
    ▼
清空history.future
    │
    ▼
用户点击撤销/Ctrl+Z
    │
    ▼
从history.past取出上一个状态
    │
    ▼
恢复content和cursor
    │
    ▼
记录到history.future
    │
    ▼
更新UI显示
```

#### 3.3.2 实现代码
```typescript
// 撤销函数
function handleUndo(): void {
  filePreviewStore.undo()
  
  // 更新光标位置
  const { cursor } = filePreviewStore.getEditorState()
  updateCursorPosition(cursor)
}

// 重做函数
function handleRedo(): void {
  filePreviewStore.redo()
  
  // 更新光标位置
  const { cursor } = filePreviewStore.getEditorState()
  updateCursorPosition(cursor)
}

// 检查是否可以撤销/重做
function canUndo(): boolean {
  const { history } = filePreviewStore.getEditorState()
  return history.past.length > 0
}

function canRedo(): boolean {
  const { history } = filePreviewStore.getEditorState()
  return history.future.length > 0
}

// 监听键盘快捷键
function handleKeyDown(event: KeyboardEvent): void {
  // Ctrl+Z: 撤销
  if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    handleUndo()
  }
  
  // Ctrl+Y 或 Ctrl+Shift+Z: 重做
  if ((event.ctrlKey && event.key === 'y') || 
      (event.ctrlKey && event.shiftKey && event.key === 'z')) {
    event.preventDefault()
    handleRedo()
  }
  
  // Ctrl+S: 保存
  if (event.ctrlKey && event.key === 's') {
    event.preventDefault()
    handleSave()
  }
}
```

## 4. 性能优化

### 4.1 状态更新优化

#### 4.1.1 批量更新
```typescript
// 批量更新状态，减少重渲染
function batchUpdateState(updates: Array<Partial<EditorState>>): void {
  const combinedUpdate = updates.reduce(
    (acc, update) => ({ ...acc, ...update }),
    {} as Partial<EditorState>
  )
  
  updateState(combinedUpdate)
}

// 使用示例
batchUpdateState([
  { content: newContent },
  { isDirty: true },
  { cursor: newCursor }
])
```

#### 4.1.2 选择性订阅
```typescript
// 使用选择性订阅避免不必要的重渲染
const isDirty = useEditorState(state => state.isDirty)
const isEditing = useEditorState(state => state.isEditing)

// 只有当这些值变化时才重渲染
```

### 4.2 内存优化

#### 4.2.1 历史限制
```typescript
// 限制历史大小，避免内存无限增长
function trimHistory(history: HistoryState): HistoryState {
  const { maxHistorySize } = history
  
  return {
    ...history,
    past: history.past.slice(-maxHistorySize),
    future: history.future.slice(-maxHistorySize)
  }
}
```

#### 4.2.2 草稿清理
```typescript
// 定期清理旧草稿
function cleanOldDrafts(): void {
  const now = Date.now()
  const maxAge = 7 * 24 * 60 * 60 * 1000 // 7天
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('file-explorer-draft-')) {
      try {
        const draftStr = localStorage.getItem(key)
        if (draftStr) {
          const draft = JSON.parse(draftStr)
          if (now - draft.timestamp > maxAge) {
            localStorage.removeItem(key)
          }
        }
      } catch (error) {
        // 忽略解析错误
      }
    }
  }
}
```

### 4.3 渲染优化

#### 4.3.1 虚拟滚动
```typescript
// 对于长文件使用虚拟滚动
function VirtualizedEditor({ content, settings }: { content: string; settings: EditorSettings }) {
  const lines = content.split('\n')
  const lineHeight = settings.fontSize * 1.6
  
  // 计算可见区域
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)
  
  const startIndex = Math.floor(scrollTop / lineHeight)
  const endIndex = Math.min(
    startIndex + Math.ceil(containerHeight / lineHeight) + 1,
    lines.length
  )
  
  const visibleLines = lines.slice(startIndex, endIndex)
  
  return (
    <div 
      className="fex-editor-scroll"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      {/* 占位符，保持滚动高度 */}
      <div style={{ height: lines.length * lineHeight }} />
      
      {/* 可见区域的行 */}
      <div style={{ position: 'absolute', top: startIndex * lineHeight }}>
        {visibleLines.map((line, i) => (
          <EditorLine 
            key={startIndex + i} 
            lineNumber={startIndex + i + 1} 
            content={line} 
            settings={settings}
          />
        ))}
      </div>
    </div>
  )
}
```

## 5. 错误处理

### 5.1 错误状态管理
```typescript
interface ErrorState {
  hasError: boolean
  error: string | null
  errorCode: string | null
  timestamp: Date | null
}

// 错误处理函数
function handleError(error: Error, code?: string): void {
  const errorState: ErrorState = {
    hasError: true,
    error: error.message,
    errorCode: code || null,
    timestamp: new Date()
  }
  
  filePreviewStore.setEditorState({
    status: 'error',
    error: error.message
  })
  
  // 显示错误通知
  showNotification(error.message, 'error')
  
  // 记录错误日志
  console.error('File editor error:', error)
}
```

### 5.2 错误恢复策略
```typescript
// 错误恢复策略
async function recoverFromError(error: Error): Promise<void> {
  const { status } = filePreviewStore.getEditorState()
  
  switch (status) {
    case 'error':
      // 尝试重新加载文件
      const { file } = filePreviewStore.getEditorState()
      if (file) {
        await loadFile(file)
      }
      break
      
    case 'saving':
      // 保存失败，提示用户重试
      showRetryDialog()
      break
      
    default:
      // 其他错误，显示错误信息
      showErrorDialog(error)
  }
}
```

## 6. 测试策略

### 6.1 单元测试
```typescript
// 测试状态管理
describe('filePreviewStore', () => {
  test('should update content and mark as dirty', () => {
    filePreviewStore.setEditorState({
      originalContent: 'test content'
    })
    
    filePreviewStore.setContent('new content')
    
    const state = filePreviewStore.getEditorState()
    expect(state.content).toBe('new content')
    expect(state.isDirty).toBe(true)
  })
  
  test('should undo and redo correctly', () => {
    filePreviewStore.setEditorState({
      content: 'initial',
      originalContent: 'initial'
    })
    
    filePreviewStore.setContent('first edit')
    filePreviewStore.setContent('second edit')
    
    filePreviewStore.undo()
    expect(filePreviewStore.getEditorState().content).toBe('first edit')
    
    filePreviewStore.redo()
    expect(filePreviewStore.getEditorState().content).toBe('second edit')
  })
})
```

### 6.2 集成测试
```typescript
// 测试完整的编辑保存流程
describe('File editing workflow', () => {
  test('should load file and enable editing', async () => {
    const file = { path: '/test/file.txt', name: 'file.txt' }
    
    await loadFile(file)
    
    const state = filePreviewStore.getEditorState()
    expect(state.file).toEqual(file)
    expect(state.status).toBe('loaded')
    expect(state.isEditing).toBe(false)
    
    filePreviewStore.startEditing()
    
    expect(filePreviewStore.getEditorState().isEditing).toBe(true)
  })
  
  test('should save file and update state', async () => {
    // 设置初始状态
    filePreviewStore.setEditorState({
      file: { path: '/test/file.txt', name: 'file.txt' },
      content: 'new content',
      originalContent: 'old content',
      isDirty: true
    })
    
    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({
        ok: true,
        value: { size: 100, mtime: new Date().toISOString() }
      })
    })
    
    await filePreviewStore.save()
    
    const state = filePreviewStore.getEditorState()
    expect(state.isDirty).toBe(false)
    expect(state.originalContent).toBe('new content')
  })
})
```

## 7. 总结

本设计文档详细描述了dsh-file-explorer状态管理和数据流的完整设计方案，包括：

1. **状态管理架构**：清晰的状态分类和接口定义
2. **状态管理实现**：扩展现有Store，实现完整的状态管理功能
3. **数据流设计**：完整的文件加载、编辑保存、撤销重做流程
4. **性能优化**：批量更新、选择性订阅、虚拟滚动等优化策略
5. **错误处理**：完善的错误状态管理和恢复策略
6. **测试策略**：单元测试和集成测试的完整策略

通过本设计方案，可以为dsh-file-explorer插件实现一个高效、可靠、易于维护的状态管理系统。