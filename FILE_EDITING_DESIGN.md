# dsh-file-explorer 文件编辑功能详细设计文档

## 1. 概述

### 1.1 设计目标
为dsh-file-explorer插件添加完整的文件编辑功能，支持在预览界面中直接编辑文本文件，提供保存、撤销、语法高亮等编辑器功能。

### 1.2 设计原则
1. **渐进增强**：从基础文本编辑开始，逐步添加高级功能
2. **用户体验优先**：保持与现有UI风格的一致性
3. **安全边界明确**：复用现有的安全机制
4. **性能可扩展**：支持大文件处理和并发编辑

### 1.3 范围
- **第一阶段（MVP）**：基础文本编辑、保存、取消
- **第二阶段（增强）**：编辑状态管理、多文件支持、快捷键
- **第三阶段（专业）**：语法高亮、代码分析、插件扩展

## 2. 后端API扩展设计

### 2.1 现有API结构
```
端点：/_dsh/file-explorer/api
方法：GET（读取）、POST（修改）
```

### 2.2 新增API端点

#### 2.2.1 文件更新API
```typescript
// POST /_dsh/file-explorer/api
// Action: update
{
  "action": "update",
  "path": "文件绝对路径",
  "content": "新文件内容",
  "expectedSize": 1024,  // 可选：用于并发控制
  "expectedMtime": "2024-01-01T00:00:00Z"  // 可选：用于并发控制
}

// 响应成功
{
  "ok": true,
  "value": {
    "path": "文件路径",
    "size": 1024,
    "mtime": "2024-01-01T00:00:00Z"
  }
}

// 响应错误
{
  "ok": false,
  "error": {
    "code": "CONFLICT",
    "message": "文件已被修改，请刷新后重试"
  }
}
```

#### 2.2.2 文件锁定API（可选，用于并发控制）
```typescript
// POST /_dsh/file-explorer/api
// Action: lock
{
  "action": "lock",
  "path": "文件绝对路径",
  "lockId": "unique-lock-id",
  "timeout": 30000  // 锁定超时时间（毫秒）
}

// 响应
{
  "ok": true,
  "value": {
    "lockId": "unique-lock-id",
    "expiresAt": "2024-01-01T00:00:30Z"
  }
}
```

#### 2.2.3 文件解锁API
```typescript
// POST /_dsh/file-explorer/api
// Action: unlock
{
  "action": "unlock",
  "path": "文件绝对路径",
  "lockId": "unique-lock-id"
}
```

### 2.3 后端实现细节

#### 2.3.1 文件更新函数
```typescript
async function updateFile(
  path: string, 
  content: string, 
  expectedSize?: number,
  expectedMtime?: string
): Promise<unknown> {
  const resolved = resolve(path)
  
  // 检查文件是否存在
  let st: Stats
  try {
    st = await stat(resolved)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw codeError('文件不存在', 'ENOENT')
    }
    throw error
  }
  
  // 检查是否为目录
  if (st.isDirectory()) {
    throw codeError('不能编辑目录', 'EISDIR')
  }
  
  // 并发控制：检查文件是否被修改
  if (expectedSize !== undefined && st.size !== expectedSize) {
    throw codeError('文件已被其他进程修改', 'CONFLICT')
  }
  
  if (expectedMtime !== undefined) {
    const currentMtime = st.mtime.toISOString()
    if (currentMtime !== expectedMtime) {
      throw codeError('文件已被其他进程修改', 'CONFLICT')
    }
  }
  
  // 检查文件大小限制（复用现有限制）
  if (content.length > MAX_TEXT_BYTES) {
    throw codeError('文件内容过大', 'ETOOBIG')
  }
  
  // 写入文件
  await writeFile(resolved, content, { encoding: 'utf8' })
  
  // 获取更新后的文件信息
  const newSt = await stat(resolved)
  
  return {
    path: resolved,
    size: newSt.size,
    mtime: newSt.mtime.toISOString()
  }
}
```

#### 2.3.2 锁定管理
```typescript
interface FileLock {
  lockId: string
  path: string
  expiresAt: number
  timer: NodeJS.Timeout
}

const fileLocks = new Map<string, FileLock>()

async function lockFile(
  path: string, 
  lockId: string, 
  timeout: number
): Promise<unknown> {
  const resolved = resolve(path)
  
  // 检查是否已有锁定
  const existingLock = fileLocks.get(resolved)
  if (existingLock && Date.now() < existingLock.expiresAt) {
    throw codeError('文件已被锁定', 'ELOCKED')
  }
  
  // 清除过期锁定
  if (existingLock) {
    clearTimeout(existingLock.timer)
    fileLocks.delete(resolved)
  }
  
  // 创建新锁定
  const expiresAt = Date.now() + timeout
  const timer = setTimeout(() => {
    fileLocks.delete(resolved)
  }, timeout)
  
  fileLocks.set(resolved, {
    lockId,
    path: resolved,
    expiresAt,
    timer
  })
  
  return {
    lockId,
    expiresAt: new Date(expiresAt).toISOString()
  }
}
```

## 3. 前端编辑器UI/UX设计

### 3.1 编辑器架构

#### 3.1.1 组件结构
```
FileEditorView (新组件)
├── EditorHeader (编辑器头部)
│   ├── 文件信息（名称、路径、大小）
│   ├── 模式切换（预览/编辑）
│   └── 操作按钮（保存、撤销、重做）
├── EditorToolbar (编辑器工具栏)
│   ├── 字体大小控制
│   ├── 换行设置
│   ├── 语法高亮选择
│   └── 搜索替换
├── EditorContent (编辑器内容区)
│   ├── 行号显示
│   ├── 代码编辑区
│   └── 状态栏（行列号、编码、换行符）
└── EditorFooter (编辑器底部)
    ├── 保存状态指示
    ├── 字符统计
    └── 快捷键提示
```

#### 3.1.2 状态管理扩展
```typescript
// filePreviewStore.ts 扩展
interface EditorState {
  // 文件信息
  file: PreviewFile | null
  content: string
  originalContent: string
  
  // 编辑状态
  isEditing: boolean
  isDirty: boolean  // 是否有未保存的修改
  isSaving: boolean
  lastSaved: Date | null
  
  // 编辑器设置
  settings: {
    fontSize: number
    tabSize: number
    wordWrap: boolean
    lineNumbers: boolean
    syntaxHighlight: boolean
    language: string
  }
  
  // 光标位置
  cursor: {
    line: number
    column: number
  }
  
  // 撤销/重做历史
  history: {
    past: string[]
    future: string[]
  }
}

// 新增的Store方法
interface FilePreviewStore {
  // 现有方法
  get(): PreviewFile | null
  set(file: PreviewFile | null): void
  subscribe(listener: Listener): () => void
  
  // 新增编辑器方法
  getEditorState(): EditorState
  setEditorState(state: Partial<EditorState>): void
  startEditing(): void
  stopEditing(): void
  setContent(content: string): void
  save(): Promise<void>
  undo(): void
  redo(): void
  updateSettings(settings: Partial<EditorState['settings']>): void
}
```

### 3.2 UI设计细节

#### 3.2.1 编辑器视图布局
```
┌─────────────────────────────────────────────────────┐
│ 📄 文件名.txt  /path/to/file.txt  1.2 KB    [预览] [编辑] │
├─────────────────────────────────────────────────────┤
│ 🔍 搜索  │ 字体: 14  │ 换行: 开  │ 行号: 开  │ 语言: 自动 │
├─────────────────────────────────────────────────────┤
│ 1  │ function hello() {                              │
│ 2  │   console.log("Hello, World!");                 │
│ 3  │ }                                               │
│ 4  │                                                 │
│ 5  │ // 这是一个示例函数                              │
│ 6  │ hello();                                        │
├─────────────────────────────────────────────────────┤
│ 💾 已保存  │ 行 6, 列 1  │ UTF-8  │ LF  │ 6 行, 128 字符 │
└─────────────────────────────────────────────────────┘
```

#### 3.2.2 交互流程设计

**流程1：进入编辑模式**
1. 用户点击文件 → 默认进入预览模式
2. 用户点击"编辑"按钮 → 切换到编辑模式
3. 加载文件内容到编辑器
4. 显示编辑器工具栏和状态栏
5. 自动聚焦到编辑区

**流程2：编辑和保存**
1. 用户编辑内容 → 显示"未保存"指示器
2. 自动保存草稿（每30秒）
3. 用户点击"保存"或按Ctrl+S
4. 显示"保存中..."状态
5. 调用后端API保存
6. 显示"已保存"状态
7. 更新原始内容（用于撤销比较）

**流程3：撤销和重做**
1. 用户编辑内容 → 记录到撤销历史
2. 用户点击"撤销"或按Ctrl+Z
3. 从历史中恢复上一个状态
4. 更新编辑器内容
5. 更新光标位置

**流程4：取消编辑**
1. 用户点击"取消"按钮
2. 检查是否有未保存的修改
3. 显示确认对话框："放弃修改？"
4. 用户确认 → 恢复原始内容
5. 退出编辑模式

### 3.3 组件实现

#### 3.3.1 EditorHeader组件
```typescript
interface EditorHeaderProps {
  file: PreviewFile
  isEditing: boolean
  isDirty: boolean
  isSaving: boolean
  onToggleMode: () => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

function EditorHeader({
  file,
  isEditing,
  isDirty,
  isSaving,
  onToggleMode,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}: EditorHeaderProps) {
  return (
    <div className="fex-editor-head">
      <div className="fex-editor-info">
        <span className="fex-editor-name">{file.name}</span>
        <span className="fex-editor-path">{file.path}</span>
        {isDirty && <span className="fex-editor-dirty">●</span>}
      </div>
      <div className="fex-editor-actions">
        {isEditing && (
          <>
            <Button 
              variant="outline" 
              onClick={onUndo} 
              disabled={!canUndo}
              title="撤销 (Ctrl+Z)"
            >
              ↩
            </Button>
            <Button 
              variant="outline" 
              onClick={onRedo} 
              disabled={!canRedo}
              title="重做 (Ctrl+Y)"
            >
              ↪
            </Button>
            <Button 
              variant="primary" 
              onClick={onSave} 
              disabled={!isDirty || isSaving}
              title="保存 (Ctrl+S)"
            >
              {isSaving ? '...' : '💾 保存'}
            </Button>
          </>
        )}
        <Button 
          variant={isEditing ? "outline" : "primary"} 
          onClick={onToggleMode}
        >
          {isEditing ? '👁 预览' : '✏️ 编辑'}
        </Button>
      </div>
    </div>
  )
}
```

#### 3.3.2 EditorContent组件
```typescript
interface EditorContentProps {
  content: string
  isEditing: boolean
  settings: EditorState['settings']
  cursor: EditorState['cursor']
  onChange: (content: string) => void
  onCursorChange: (cursor: { line: number; column: number }) => void
}

function EditorContent({
  content,
  isEditing,
  settings,
  cursor,
  onChange,
  onCursorChange
}: EditorContentProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  // 处理内容变化
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }, [onChange])
  
  // 处理光标变化
  const handleSelect = useCallback(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current
      const text = textarea.value.substring(0, textarea.selectionStart)
      const lines = text.split('\n')
      const line = lines.length
      const column = lines[lines.length - 1].length + 1
      onCursorChange({ line, column })
    }
  }, [onCursorChange])
  
  // 处理Tab键
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = textarea.value.substring(0, start) + 
          ' '.repeat(settings.tabSize) + 
          textarea.value.substring(end)
        onChange(newValue)
        // 恢复光标位置
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + settings.tabSize
        }, 0)
      }
    }
  }, [onChange, settings.tabSize])
  
  return (
    <div className="fex-editor-content">
      {settings.lineNumbers && (
        <div className="fex-editor-line-numbers">
          {content.split('\n').map((_, i) => (
            <div key={i} className={`fex-editor-line-number ${i + 1 === cursor.line ? 'active' : ''}`}>
              {i + 1}
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        className="fex-editor-textarea"
        value={content}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        readOnly={!isEditing}
        spellCheck={false}
        style={{
          fontSize: settings.fontSize,
          tabSize: settings.tabSize,
          whiteSpace: settings.wordWrap ? 'pre-wrap' : 'pre'
        }}
      />
    </div>
  )
}
```

## 4. 状态管理和数据流

### 4.1 状态管理架构

#### 4.1.1 全局状态（filePreviewStore）
- **文件信息**：当前编辑的文件路径、名称
- **编辑状态**：是否在编辑模式、是否有未保存的修改
- **编辑器设置**：字体大小、Tab大小、换行设置等
- **光标位置**：当前光标的行号和列号
- **撤销历史**：用于撤销/重做的内容历史

#### 4.1.2 组件状态
- **UI状态**：工具栏显示、状态栏显示
- **临时状态**：搜索替换状态、对话框状态

### 4.2 数据流设计

#### 4.2.1 文件加载流程
```
用户点击文件 → filePreviewStore.set(file) 
→ FileEditorView订阅状态变化 
→ 调用API获取文件内容 
→ 更新editorState.content 
→ 渲染编辑器
```

#### 4.2.2 编辑保存流程
```
用户编辑内容 → editorState.content变化 
→ 标记isDirty=true 
→ 自动保存草稿到localStorage 
→ 用户点击保存 
→ 调用POST action=update API 
→ 成功后更新originalContent 
→ 标记isDirty=false 
→ 显示保存成功提示
```

#### 4.2.3 撤销重做流程
```
用户编辑内容 → 记录到history.past 
→ 用户点击撤销 
→ 从history.past取出上一个状态 
→ 恢复content和cursor 
→ 将当前状态记录到history.future 
→ 用户点击重做 
→ 从history.future取出下一个状态 
→ 恢复content和cursor 
→ 将当前状态记录到history.past
```

### 4.3 性能优化

#### 4.3.1 大文件处理
- **分块加载**：对于超过1MB的文件，分块加载内容
- **虚拟滚动**：对于超长文件，使用虚拟滚动只渲染可见区域
- **懒加载**：语法高亮等耗时操作延迟执行

#### 4.3.2 内存管理
- **历史限制**：撤销历史最多保存50个状态
- **草稿清理**：保存成功后清理localStorage中的草稿
- **组件卸载**：编辑器卸载时清理事件监听和定时器

## 5. 安全机制和边界处理

### 5.1 安全机制

#### 5.1.1 输入验证
- **内容长度**：复用现有的`MAX_TEXT_BYTES`（512KB）
- **文件类型**：只允许编辑文本文件（复用`TEXT_EXTS`）
- **路径安全**：复用现有的路径规范化和验证

#### 5.1.2 并发控制
- **文件锁定**：可选的文件锁定机制，防止多用户同时编辑
- **乐观锁**：使用文件大小和修改时间进行并发控制
- **冲突检测**：保存时检测文件是否被其他进程修改

#### 5.1.3 权限控制
- **读写权限**：基于DSH现有的权限系统
- **文件类型**：二进制文件禁止编辑
- **系统文件**：可配置的禁止编辑文件列表

### 5.2 边界情况处理

#### 5.2.1 网络异常
- **自动重试**：保存失败时自动重试3次
- **离线缓存**：网络中断时将修改保存到localStorage
- **状态恢复**：网络恢复后自动同步离线修改

#### 5.2.2 文件异常
- **文件删除**：编辑中的文件被删除时，提示用户并关闭编辑器
- **文件修改**：文件被外部修改时，提示用户重新加载
- **权限变更**：文件权限变更时，禁用编辑功能并提示

#### 5.2.3 浏览器异常
- **页面刷新**：刷新前提示保存未保存的修改
- **标签页关闭**：关闭标签页前提示保存未保存的修改
- **内存不足**：内存不足时自动保存草稿并关闭编辑器

## 6. 集成和部署方案

### 6.1 集成方案

#### 6.1.1 插件扩展
- **向后兼容**：新功能作为现有插件的扩展
- **渐进增强**：基础功能不依赖高级特性
- **配置化**：通过配置文件控制功能开关

#### 6.1.2 依赖管理
- **核心依赖**：React、DSH UI组件（已存在）
- **可选依赖**：代码编辑器库（如CodeMirror）
- **开发依赖**：TypeScript、构建工具

### 6.2 部署方案

#### 6.2.1 版本策略
- **语义化版本**：遵循SemVer规范
- **功能标记**：使用功能标记控制新功能
- **向后兼容**：保持API向后兼容

#### 6.2.2 发布流程
1. **开发分支**：在feature分支开发
2. **代码审查**：提交PR进行代码审查
3. **测试验证**：自动化测试和手动测试
4. **发布候选**：发布RC版本进行验证
5. **正式发布**：发布稳定版本

### 6.3 测试策略

#### 6.3.1 单元测试
- **API测试**：测试后端API的各个端点
- **组件测试**：测试前端组件的各个功能
- **状态管理测试**：测试状态管理的各个方法

#### 6.3.2 集成测试
- **端到端测试**：测试完整的编辑保存流程
- **并发测试**：测试多用户同时编辑
- **性能测试**：测试大文件处理性能

#### 6.3.3 用户测试
- **可用性测试**：测试用户界面的易用性
- **兼容性测试**：测试不同浏览器和设备
- ** accessibility测试**：测试无障碍访问

## 7. 实施计划

### 7.1 第一阶段：MVP（1-2周）
**目标**：实现基础文本编辑功能

**任务清单**：
1. 后端添加`update` API端点
2. 前端添加编辑模式切换
3. 实现基本的文本编辑和保存
4. 添加编辑状态管理和保存确认
5. 编写单元测试和集成测试

**交付物**：
- 可编辑文本文件的基础功能
- 基本的用户界面
- 单元测试和集成测试报告

### 7.2 第二阶段：增强（2-3周）
**目标**：提升编辑体验

**任务清单**：
1. 添加键盘快捷键支持
2. 实现编辑状态持久化
3. 添加多文件标签页支持
4. 优化大文件处理性能
5. 添加撤销/重做功能

**交付物**：
- 增强的编辑体验
- 多文件支持
- 性能优化报告

### 7.3 第三阶段：专业（4-6周）
**目标**：专业代码编辑体验

**任务清单**：
1. 集成CodeMirror编辑器
2. 添加语法高亮支持
3. 实现代码分析和提示
4. 添加插件扩展机制
5. 编写用户文档和示例

**交付物**：
- 专业代码编辑器
- 语法高亮和代码分析
- 插件扩展机制
- 用户文档和示例

## 8. 风险评估

### 8.1 技术风险
- **大文件性能**：需要优化内存和渲染性能
- **并发编辑**：需要可靠的并发控制机制
- **浏览器兼容性**：需要测试不同浏览器的兼容性

### 8.2 产品风险
- **用户接受度**：需要验证用户对编辑功能的需求
- **安全性**：需要确保编辑功能不会引入安全漏洞
- **维护成本**：需要考虑长期维护和更新成本

### 8.3 缓解措施
- **渐进开发**：从简单功能开始，逐步增加复杂度
- **用户反馈**：定期收集用户反馈，调整开发方向
- **代码质量**：保持高代码质量，减少技术债务

## 9. 总结

本设计文档详细描述了dsh-file-explorer文件编辑功能的完整设计方案，包括：

1. **后端API扩展**：添加文件更新、锁定、解锁等API端点
2. **前端编辑器UI/UX**：设计完整的编辑器界面和交互流程
3. **状态管理和数据流**：设计清晰的状态管理和数据流架构
4. **安全机制和边界处理**：确保功能的安全性和稳定性
5. **集成和部署方案**：提供完整的集成和部署策略
6. **实施计划**：分阶段实施，降低风险

通过本设计方案，可以为dsh-file-explorer插件添加完整的文件编辑功能，提升用户体验，同时保持代码质量和可维护性。