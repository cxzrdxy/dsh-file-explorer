# dsh-file-explorer 前端编辑器详细设计

## 1. 编辑器组件架构

### 1.1 组件层次结构
```
FileEditorView (主组件)
├── EditorHeader (编辑器头部)
│   ├── EditorFileInfo (文件信息)
│   ├── EditorModeToggle (模式切换)
│   └── EditorActions (操作按钮)
├── EditorToolbar (编辑器工具栏)
│   ├── SearchReplace (搜索替换)
│   ├── FontSizeControl (字体大小)
│   ├── WordWrapToggle (换行设置)
│   ├── LineNumbersToggle (行号设置)
│   └── LanguageSelector (语言选择)
├── EditorContent (编辑器内容区)
│   ├── LineNumbers (行号显示)
│   ├── CodeEditor (代码编辑区)
│   └── Minimap (小地图，可选)
├── EditorStatusBar (状态栏)
│   ├── CursorPosition (光标位置)
│   ├── FileInfo (文件信息)
│   └── QuickActions (快捷操作)
└── EditorFooter (底部工具栏)
    ├── SaveStatus (保存状态)
    ├── Statistics (统计信息)
    └── KeyboardShortcuts (快捷键提示)
```

### 1.2 组件接口定义

#### 1.2.1 FileEditorView 主组件
```typescript
interface FileEditorViewProps {
  // 文件信息
  file: PreviewFile | null
  
  // 编辑器配置
  config?: EditorConfig
  
  // 事件回调
  onSave?: (content: string) => Promise<void>
  onDiscard?: () => void
  onError?: (error: Error) => void
}

interface EditorConfig {
  // 基础配置
  readOnly?: boolean
  autoFocus?: boolean
  
  // 编辑器设置
  settings?: Partial<EditorSettings>
  
  // 语言配置
  language?: string
  
  // 主题配置
  theme?: 'light' | 'dark' | 'auto'
}

interface EditorSettings {
  fontSize: number
  tabSize: number
  wordWrap: boolean
  lineNumbers: boolean
  syntaxHighlight: boolean
  autoSave: boolean
  autoSaveInterval: number
  minimap: boolean
}
```

#### 1.2.2 EditorHeader 组件
```typescript
interface EditorHeaderProps {
  // 文件信息
  file: PreviewFile
  fileSize: number
  lastModified: Date
  
  // 编辑状态
  isEditing: boolean
  isDirty: boolean
  isSaving: boolean
  
  // 操作回调
  onToggleMode: () => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  onDiscard: () => void
  
  // 操作状态
  canUndo: boolean
  canRedo: boolean
}
```

#### 1.2.3 EditorContent 组件
```typescript
interface EditorContentProps {
  // 内容
  content: string
  originalContent: string
  
  // 编辑状态
  isEditing: boolean
  cursor: CursorPosition
  selection: Selection | null
  
  // 设置
  settings: EditorSettings
  
  // 事件回调
  onChange: (content: string) => void
  onCursorChange: (cursor: CursorPosition) => void
  onSelectionChange: (selection: Selection) => void
  onKeyDown: (event: KeyboardEvent) => void
}
```

## 2. 交互设计

### 2.1 模式切换

#### 2.1.1 预览模式
- **显示**：只读的文件内容，类似当前的预览视图
- **操作**：仅显示内容，不支持编辑
- **UI**：显示"编辑"按钮，点击切换到编辑模式

#### 2.1.2 编辑模式
- **显示**：可编辑的文本区域，支持语法高亮
- **操作**：支持编辑、保存、撤销、重做等操作
- **UI**：显示完整的编辑器工具栏和状态栏

#### 2.1.3 切换流程
```
预览模式 → 点击"编辑"按钮 → 加载文件内容到编辑器 → 切换到编辑模式
编辑模式 → 点击"预览"按钮 → 检查未保存修改 → 确认对话框 → 切换到预览模式
```

### 2.2 保存流程

#### 2.2.1 手动保存
- **触发**：点击"保存"按钮或按Ctrl+S
- **流程**：
  1. 显示"保存中..."状态
  2. 调用后端API保存文件
  3. 成功后显示"已保存"状态
  4. 更新原始内容（用于撤销比较）
  5. 清理本地草稿

#### 2.2.2 自动保存
- **触发**：编辑内容后30秒（可配置）
- **流程**：
  1. 检测到内容变化
  2. 启动自动保存定时器
  3. 定时器到期后自动保存
  4. 显示"自动保存"状态

#### 2.2.3 草稿保存
- **触发**：编辑内容后立即
- **存储**：localStorage
- **清理**：保存成功后清理

### 2.3 撤销/重做

#### 2.3.1 撤销历史管理
- **记录时机**：每次内容变化后
- **历史限制**：最多50个状态
- **存储格式**：内容字符串数组

#### 2.3.2 撤销流程
```
用户编辑 → 记录到history.past → 清空history.future
用户撤销 → 从history.past取出上一个状态 → 恢复内容 → 记录到history.future
用户重做 → 从history.future取出下一个状态 → 恢复内容 → 记录到history.past
```

### 2.4 搜索替换

#### 2.4.1 搜索功能
- **触发**：按Ctrl+F或点击搜索按钮
- **功能**：
  - 文本搜索（区分大小写/不区分大小写）
  - 正则表达式搜索
  - 全词匹配
  - 向上/向下搜索

#### 2.4.2 替换功能
- **触发**：搜索后按Ctrl+H或点击替换按钮
- **功能**：
  - 单个替换
  - 全部替换
  - 选择性替换

## 3. 键盘快捷键

### 3.1 全局快捷键
| 快捷键 | 功能 | 描述 |
|--------|------|------|
| Ctrl+S | 保存 | 保存当前文件 |
| Ctrl+Z | 撤销 | 撤销上一步操作 |
| Ctrl+Y / Ctrl+Shift+Z | 重做 | 重做上一步操作 |
| Ctrl+F | 搜索 | 打开搜索框 |
| Ctrl+H | 替换 | 打开替换框 |
| Ctrl+G | 跳转到行 | 跳转到指定行号 |
| Escape | 退出 | 退出编辑模式或关闭对话框 |

### 3.2 编辑器快捷键
| 快捷键 | 功能 | 描述 |
|--------|------|------|
| Tab | 插入Tab | 插入制表符（可配置为空格） |
| Shift+Tab | 删除Tab | 删除制表符 |
| Enter | 换行 | 插入换行符 |
| Backspace | 删除 | 删除前一个字符 |
| Delete | 删除 | 删除后一个字符 |
| Ctrl+A | 全选 | 选择所有内容 |
| Ctrl+C | 复制 | 复制选中内容 |
| Ctrl+X | 剪切 | 剪切选中内容 |
| Ctrl+V | 粘贴 | 粘贴剪贴板内容 |
| Ctrl+D | 复制行 | 复制当前行 |
| Ctrl+Shift+K | 删除行 | 删除当前行 |
| Alt+↑ | 上移行 | 上移当前行 |
| Alt+↓ | 下移行 | 下移当前行 |
| Ctrl+/ | 注释 | 注释/取消注释当前行 |

### 3.3 导航快捷键
| 快捷键 | 功能 | 描述 |
|--------|------|------|
| Home | 行首 | 移动到行首 |
| End | 行尾 | 移动到行尾 |
| Ctrl+Home | 文档首 | 移动到文档开头 |
| Ctrl+End | 文档尾 | 移动到文档结尾 |
| Ctrl+↑ | 上滚 | 向上滚动一行 |
| Ctrl+↓ | 下滚 | 向下滚动一行 |
| Page Up | 上翻页 | 向上翻页 |
| Page Down | 下翻页 | 向下翻页 |

## 4. 视觉设计

### 4.1 颜色主题

#### 4.1.1 浅色主题
```css
:root {
  --editor-bg: #ffffff;
  --editor-fg: #26231f;
  --editor-line-bg: #f5f5f5;
  --editor-line-active-bg: #e8f0fe;
  --editor-selection-bg: #cce5ff;
  --editor-cursor: #26231f;
  --editor-line-number: #999999;
  --editor-line-number-active: #26231f;
  --editor-border: #e0e0e0;
  --editor-toolbar-bg: #f8f9fa;
  --editor-status-bg: #f8f9fa;
}
```

#### 4.1.2 深色主题
```css
:root {
  --editor-bg: #1e1e1e;
  --editor-fg: #d4d4d4;
  --editor-line-bg: #252526;
  --editor-line-active-bg: #2a2d2e;
  --editor-selection-bg: #264f78;
  --editor-cursor: #d4d4d4;
  --editor-line-number: #858585;
  --editor-line-number-active: #d4d4d4;
  --editor-border: #3c3c3c;
  --editor-toolbar-bg: #252526;
  --editor-status-bg: #252526;
}
```

### 4.2 布局设计

#### 4.2.1 编辑器尺寸
- **最小宽度**：400px
- **最小高度**：300px
- **默认宽度**：100%
- **默认高度**：100%

#### 4.2.2 间距设计
- **头部高度**：48px
- **工具栏高度**：40px
- **状态栏高度**：28px
- **底部工具栏高度**：32px
- **内边距**：16px

### 4.3 动画设计

#### 4.3.1 过渡动画
- **模式切换**：0.2s ease-in-out
- **工具栏展开**：0.15s ease-in-out
- **状态提示**：0.3s ease-in-out

#### 4.3.2 动效Token
```css
.fex-editor-transition {
  transition: all var(--ds-transition-duration) var(--ds-ease-in-out);
}
```

## 5. 响应式设计

### 5.1 断点设计
- **桌面端**：> 1024px，完整编辑器布局
- **平板端**：768px - 1024px，简化工具栏
- **移动端**：< 768px，最小化工具栏，全屏编辑

### 5.2 布局适配

#### 5.2.1 桌面端布局
```
┌─────────────────────────────────────────────────────┐
│ 编辑器头部（文件信息、操作按钮）                        │
├─────────────────────────────────────────────────────┤
│ 编辑器工具栏（搜索、设置等）                            │
├─────────────────────────────────────────────────────┤
│ 行号 │ 代码编辑区                                      │
├─────────────────────────────────────────────────────┤
│ 状态栏（光标位置、文件信息）                            │
└─────────────────────────────────────────────────────┘
```

#### 5.2.2 平板端布局
```
┌─────────────────────────────────────────────────────┐
│ 编辑器头部（文件信息、模式切换）                        │
├─────────────────────────────────────────────────────┤
│ 行号 │ 代码编辑区                                      │
├─────────────────────────────────────────────────────┤
│ 底部工具栏（保存、撤销、重做）                          │
└─────────────────────────────────────────────────────┘
```

#### 5.2.3 移动端布局
```
┌─────────────────────────────────────────────────────┐
│ 文件名 │ 编辑/预览 │ 保存                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│           代码编辑区（全屏）                          │
│                                                     │
├─────────────────────────────────────────────────────┤
│ 行号, 列号 │ 字符数                                   │
└─────────────────────────────────────────────────────┘
```

## 6. 可访问性设计

### 6.1 键盘导航
- **Tab键顺序**：按照逻辑顺序导航
- **焦点管理**：清晰的焦点指示器
- **快捷键**：所有操作都有键盘快捷键

### 6.2 屏幕阅读器
- **ARIA标签**：所有交互元素都有ARIA标签
- **角色定义**：正确使用ARIA角色
- **状态通知**：状态变化有适当的屏幕阅读器通知

### 6.3 高对比度
- **颜色对比**：符合WCAG 2.1 AA标准
- **焦点指示器**：高对比度焦点指示器
- **文本大小**：支持文本大小调整

## 7. 性能优化

### 7.1 渲染优化
- **虚拟滚动**：长文件使用虚拟滚动
- **懒加载**：语法高亮等耗时操作延迟加载
- **批量更新**：使用批量更新减少重渲染

### 7.2 内存优化
- **历史限制**：撤销历史最多50个状态
- **草稿清理**：保存成功后清理草稿
- **组件卸载**：清理事件监听和定时器

### 7.3 网络优化
- **请求合并**：合并多个保存请求
- **缓存策略**：缓存文件内容减少重复请求
- **错误重试**：网络错误自动重试

## 8. 国际化设计

### 8.1 语言支持
- **中文**：默认语言
- **英文**：完整支持
- **其他语言**：可扩展

### 8.2 文本方向
- **从左到右**：默认方向
- **从右到左**：可配置支持

### 8.3 日期时间格式
- **本地化**：使用本地日期时间格式
- **时区**：正确处理时区

## 9. 测试策略

### 9.1 单元测试
- **组件测试**：测试各个组件的功能
- **状态管理测试**：测试状态管理逻辑
- **工具函数测试**：测试工具函数

### 9.2 集成测试
- **用户交互测试**：测试用户交互流程
- **API集成测试**：测试与后端API的集成
- **状态同步测试**：测试状态同步

### 9.3 端到端测试
- **完整流程测试**：测试完整的编辑保存流程
- **性能测试**：测试大文件处理性能
- **兼容性测试**：测试不同浏览器兼容性

## 10. 实施计划

### 10.1 第一阶段：基础组件（1周）
- 实现FileEditorView主组件
- 实现EditorHeader组件
- 实现EditorContent组件
- 实现基本的状态管理

### 10.2 第二阶段：编辑功能（1周）
- 实现编辑模式切换
- 实现保存功能
- 实现撤销/重做功能
- 实现键盘快捷键

### 10.3 第三阶段：增强功能（1周）
- 实现搜索替换功能
- 实现自动保存功能
- 实现响应式设计
- 实现国际化支持

### 10.4 第四阶段：优化完善（1周）
- 性能优化
- 可访问性优化
- 测试完善
- 文档编写

## 11. 总结

本设计文档详细描述了dsh-file-explorer前端编辑器的完整设计方案，包括：

1. **组件架构**：清晰的组件层次结构和接口定义
2. **交互设计**：完整的用户交互流程设计
3. **键盘快捷键**：全面的键盘快捷键支持
4. **视觉设计**：统一的视觉设计和主题系统
5. **响应式设计**：适配不同设备和屏幕尺寸
6. **可访问性设计**：符合无障碍访问标准
7. **性能优化**：优化渲染、内存和网络性能
8. **国际化设计**：支持多语言和本地化
9. **测试策略**：完整的测试策略和计划
10. **实施计划**：分阶段的实施计划

通过本设计方案，可以为dsh-file-explorer插件实现一个功能完整、性能优良、用户体验良好的文件编辑器。