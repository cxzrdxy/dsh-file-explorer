# dsh-file-explorer 安全机制和边界处理设计

## 1. 安全架构概述

### 1.1 安全原则
1. **最小权限原则**：只授予必要的最小权限
2. **纵深防御原则**：多层安全防护
3. **安全默认原则**：默认配置应该是安全的
4. **职责分离原则**：分离不同安全职责

### 1.2 安全层次
```
┌─────────────────────────────────────────────────────┐
│                    应用层安全                        │
│  输入验证 │ 输出编码 │ 权限控制 │ 会话管理           │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│                    传输层安全                        │
│  HTTPS │ WSS │ CSP │ CORS                           │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│                    系统层安全                        │
│  文件系统权限 │ 进程隔离 │ 内存保护                  │
└─────────────────────────────────────────────────────┘
```

## 2. 输入验证

### 2.1 文件路径验证
```typescript
// 路径安全验证
function validatePath(path: string): { valid: boolean; error?: string } {
  // 1. 检查路径长度
  if (path.length > 4096) {
    return { valid: false, error: '路径过长' }
  }
  
  // 2. 检查路径字符
  if (/[<>:"|?*\x00-\x1f]/.test(path)) {
    return { valid: false, error: '路径包含非法字符' }
  }
  
  // 3. 检查路径遍历攻击
  const normalized = normalize(path)
  if (normalized.includes('..')) {
    return { valid: false, error: '路径包含路径遍历' }
  }
  
  // 4. 检查是否为绝对路径
  if (!isAbsolute(normalized)) {
    return { valid: false, error: '路径必须为绝对路径' }
  }
  
  // 5. 检查文件系统根路径
  const root = parse(normalized).root
  if (normalized === root) {
    return { valid: false, error: '不能操作文件系统根路径' }
  }
  
  return { valid: true }
}

// 路径规范化
function sanitizePath(path: string): string {
  // 1. 去除首尾空白
  let sanitized = path.trim()
  
  // 2. 规范化路径分隔符
  sanitized = sanitized.replace(/[\\/]/g, sep)
  
  // 3. 解析相对路径
  if (!isAbsolute(sanitized)) {
    sanitized = resolve(sanitized)
  }
  
  // 4. 规范化路径
  sanitized = normalize(sanitized)
  
  return sanitized
}
```

### 2.2 文件内容验证
```typescript
// 内容安全验证
function validateContent(
  content: string, 
  fileType: string, 
  maxSize: number
): { valid: boolean; error?: string } {
  // 1. 检查内容大小
  if (content.length > maxSize) {
    return { valid: false, error: '内容过大' }
  }
  
  // 2. 检查文件类型
  if (!isAllowedFileType(fileType)) {
    return { valid: false, error: '不支持的文件类型' }
  }
  
  // 3. 检查危险内容
  if (containsDangerousContent(content)) {
    return { valid: false, error: '内容包含危险字符' }
  }
  
  // 4. 检查编码
  if (!isValidEncoding(content)) {
    return { valid: false, error: '内容编码无效' }
  }
  
  return { valid: true }
}

// 检查危险内容
function containsDangerousContent(content: string): boolean {
  // 1. 检查控制字符
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content)) {
    return true
  }
  
  // 2. 检查XSS攻击模式
  if (/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(content)) {
    return true
  }
  
  // 3. 检查路径遍历
  if (/\.\.[\\/]/.test(content)) {
    return true
  }
  
  return false
}

// 允许的文件类型
const ALLOWED_FILE_TYPES = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx',
  '.css', '.html', '.htm', '.yml', '.yaml', '.xml',
  '.csv', '.log', '.py', '.c', '.cpp', '.h', '.cs',
  '.java', '.go', '.rs', '.sh', '.ps1', '.sql',
  '.ini', '.cfg', '.toml', '.bat', '.cmd'
])

function isAllowedFileType(fileType: string): boolean {
  return ALLOWED_FILE_TYPES.has(fileType.toLowerCase())
}
```

### 2.3 用户输入验证
```typescript
// 用户输入清理
function sanitizeInput(input: string): string {
  // 1. 去除首尾空白
  let sanitized = input.trim()
  
  // 2. 转义HTML特殊字符
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
  
  // 3. 限制长度
  if (sanitized.length > 1000) {
    sanitized = sanitized.substring(0, 1000)
  }
  
  return sanitized
}

// 验证文件名
function validateFileName(name: string): { valid: boolean; error?: string } {
  // 1. 检查长度
  if (name.length === 0) {
    return { valid: false, error: '文件名不能为空' }
  }
  
  if (name.length > 255) {
    return { valid: false, error: '文件名过长' }
  }
  
  // 2. 检查非法字符
  if (/[<>:"|?*\x00-\x1f]/.test(name)) {
    return { valid: false, error: '文件名包含非法字符' }
  }
  
  // 3. 检查保留名称
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']
  if (reservedNames.includes(name.toUpperCase())) {
    return { valid: false, error: '文件名是保留名称' }
  }
  
  // 4. 检查特殊名称
  if (name === '.' || name === '..') {
    return { valid: false, error: '文件名无效' }
  }
  
  return { valid: true }
}
```

## 3. 权限控制

### 3.1 文件权限检查
```typescript
// 文件权限检查
async function checkFilePermissions(
  filePath: string, 
  operation: 'read' | 'write' | 'delete'
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const stats = await stat(filePath)
    
    // 1. 检查文件是否存在
    if (!stats.exists) {
      return { allowed: false, reason: '文件不存在' }
    }
    
    // 2. 检查文件类型
    if (stats.isDirectory() && operation === 'write') {
      return { allowed: false, reason: '不能直接编辑目录' }
    }
    
    // 3. 检查读取权限
    if (operation === 'read' && !stats readable) {
      return { allowed: false, reason: '没有读取权限' }
    }
    
    // 4. 检查写入权限
    if (operation === 'write' && !stats.writable) {
      return { allowed: false, reason: '没有写入权限' }
    }
    
    // 5. 检查删除权限
    if (operation === 'delete') {
      // 检查父目录权限
      const parentDir = dirname(filePath)
      const parentStats = await stat(parentDir)
      if (!parentStats.writable) {
        return { allowed: false, reason: '没有父目录写入权限' }
      }
      
      // 检查是否为系统文件
      if (isSystemFile(filePath)) {
        return { allowed: false, reason: '不能删除系统文件' }
      }
    }
    
    return { allowed: true }
    
  } catch (error) {
    return { allowed: false, reason: '权限检查失败' }
  }
}

// 检查系统文件
function isSystemFile(filePath: string): boolean {
  const systemPaths = [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/sudoers',
    'C:\\Windows\\System32',
    'C:\\Windows\\SysWOW64'
  ]
  
  return systemPaths.some(sp => filePath.startsWith(sp))
}
```

### 3.2 操作权限控制
```typescript
// 操作权限控制
interface OperationPermission {
  operation: string
  allowed: boolean
  reason?: string
  requiresConfirmation: boolean
  confirmationMessage?: string
}

function checkOperationPermission(
  operation: string, 
  context: {
    filePath: string
    fileType: string
    fileSize: number
    userRole: 'admin' | 'user' | 'guest'
  }
): OperationPermission {
  // 1. 基础权限检查
  if (!isAllowedOperation(operation)) {
    return {
      operation,
      allowed: false,
      reason: '不支持的操作',
      requiresConfirmation: false
    }
  }
  
  // 2. 文件类型检查
  if (!isAllowedFileTypeForOperation(context.fileType, operation)) {
    return {
      operation,
      allowed: false,
      reason: '不支持的文件类型',
      requiresConfirmation: false
    }
  }
  
  // 3. 文件大小检查
  if (!isAllowedSizeForOperation(context.fileSize, operation)) {
    return {
      operation,
      allowed: false,
      reason: '文件过大',
      requiresConfirmation: false
    }
  }
  
  // 4. 用户角色检查
  if (!isAllowedForRole(context.userRole, operation)) {
    return {
      operation,
      allowed: false,
      reason: '权限不足',
      requiresConfirmation: false
    }
  }
  
  // 5. 危险操作确认
  if (isDangerousOperation(operation)) {
    return {
      operation,
      allowed: true,
      requiresConfirmation: true,
      confirmationMessage: getConfirmationMessage(operation, context)
    }
  }
  
  return {
    operation,
    allowed: true,
    requiresConfirmation: false
  }
}

// 危险操作检查
function isDangerousOperation(operation: string): boolean {
  const dangerousOps = ['delete', 'overwrite', 'rename']
  return dangerousOps.includes(operation)
}

// 确认消息
function getConfirmationMessage(
  operation: string, 
  context: { filePath: string; fileType: string }
): string {
  switch (operation) {
    case 'delete':
      return `确定要删除文件 "${basename(context.filePath)}" 吗？此操作不可撤销。`
    case 'overwrite':
      return `确定要覆盖文件 "${basename(context.filePath)}" 吗？原始内容将丢失。`
    case 'rename':
      return `确定要重命名文件 "${basename(context.filePath)}" 吗？`
    default:
      return '确定要执行此操作吗？'
  }
}
```

### 3.3 并发控制
```typescript
// 文件锁定机制
interface FileLock {
  lockId: string
  filePath: string
  userId: string
  expiresAt: number
  operation: string
}

class LockManager {
  private locks = new Map<string, FileLock>()
  
  // 获取锁
  async acquireLock(
    filePath: string, 
    userId: string, 
    operation: string,
    timeout: number = 30000
  ): Promise<{ acquired: boolean; lockId?: string; error?: string }> {
    const lockKey = this.getLockKey(filePath)
    
    // 检查是否已有锁
    const existingLock = this.locks.get(lockKey)
    if (existingLock && Date.now() < existingLock.expiresAt) {
      if (existingLock.userId !== userId) {
        return {
          acquired: false,
          error: `文件已被用户 ${existingLock.userId} 锁定`
        }
      }
      
      // 同一用户，更新锁
      existingLock.expiresAt = Date.now() + timeout
      return {
        acquired: true,
        lockId: existingLock.lockId
      }
    }
    
    // 创建新锁
    const lockId = this.generateLockId()
    const newLock: FileLock = {
      lockId,
      filePath,
      userId,
      expiresAt: Date.now() + timeout,
      operation
    }
    
    this.locks.set(lockKey, newLock)
    
    // 设置锁过期清理
    setTimeout(() => {
      this.releaseLock(lockId)
    }, timeout)
    
    return {
      acquired: true,
      lockId
    }
  }
  
  // 释放锁
  releaseLock(lockId: string): boolean {
    for (const [key, lock] of this.locks.entries()) {
      if (lock.lockId === lockId) {
        this.locks.delete(key)
        return true
      }
    }
    return false
  }
  
  // 检查锁
  checkLock(filePath: string, userId: string): { locked: boolean; lock?: FileLock } {
    const lockKey = this.getLockKey(filePath)
    const lock = this.locks.get(lockKey)
    
    if (lock && Date.now() < lock.expiresAt) {
      return {
        locked: true,
        lock
      }
    }
    
    return { locked: false }
  }
  
  // 生成锁键
  private getLockKey(filePath: string): string {
    return normalize(filePath).toLowerCase()
  }
  
  // 生成锁ID
  private generateLockId(): string {
    return `lock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// 全局锁管理器实例
export const lockManager = new LockManager()
```

## 4. 输出安全

### 4.1 输出编码
```typescript
// HTML编码
function encodeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// JavaScript编码
function encodeJavaScript(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

// URL编码
function encodeUrl(text: string): string {
  return encodeURIComponent(text)
}

// CSS编码
function encodeCss(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\a')
    .replace(/\r/g, '\\d')
}
```

### 4.2 内容安全策略
```typescript
// CSP配置
const CSP_CONFIG = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:'],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  frameSrc: ["'none'"],
  objectSrc: ["'none'"]
}

// 生成CSP头
function generateCSPHeader(): string {
  const directives = Object.entries(CSP_CONFIG)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ')
  
  return directives
}

// 应用CSP
function applyCSP(response: ServerResponse): void {
  const csp = generateCSPHeader()
  response.setHeader('Content-Security-Policy', csp)
}
```

### 4.3 错误信息安全
```typescript
// 安全的错误信息
function sanitizeError(error: Error): string {
  // 1. 移除敏感信息
  let message = error.message
  
  // 移除文件路径
  message = message.replace(/[A-Z]:\\[^\s]+/g, '[PATH]')
  message = message.replace(/\/[^\s]+/g, '[PATH]')
  
  // 移除用户名
  message = message.replace(/用户\s*\w+/g, '用户 [USER]')
  
  // 移除IP地址
  message = message.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[IP]')
  
  // 2. 限制错误信息长度
  if (message.length > 200) {
    message = message.substring(0, 200) + '...'
  }
  
  return message
}

// 记录安全日志
function logSecurityEvent(
  event: string, 
  context: {
    userId?: string
    filePath?: string
    operation?: string
    ip?: string
    userAgent?: string
    error?: Error
  }
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    ...context,
    // 移除敏感信息
    ip: context.ip ? '[REDACTED]' : undefined,
    userAgent: context.userAgent ? context.userAgent.substring(0, 100) : undefined
  }
  
  console.log('[SECURITY]', JSON.stringify(logEntry))
}
```

## 5. 边界情况处理

### 5.1 文件异常处理
```typescript
// 文件不存在
async function handleFileNotFound(filePath: string): Promise<void> {
  logSecurityEvent('FILE_NOT_FOUND', { filePath })
  
  // 1. 检查文件是否被删除
  const exists = await fileExists(filePath)
  if (!exists) {
    throw new Error('文件不存在或已被删除')
  }
  
  // 2. 检查权限
  const permissions = await checkFilePermissions(filePath, 'read')
  if (!permissions.allowed) {
    throw new Error(permissions.reason || '没有读取权限')
  }
  
  // 3. 其他错误
  throw new Error('无法访问文件')
}

// 文件被修改
async function handleFileModified(
  filePath: string, 
  expectedSize: number, 
  expectedMtime: string
): Promise<void> {
  logSecurityEvent('FILE_MODIFIED', { filePath })
  
  const stats = await stat(filePath)
  
  // 1. 检查文件大小
  if (stats.size !== expectedSize) {
    throw new Error('文件已被其他进程修改（大小变化）')
  }
  
  // 2. 检查修改时间
  if (stats.mtime.toISOString() !== expectedMtime) {
    throw new Error('文件已被其他进程修改（时间变化）')
  }
  
  // 3. 提示用户重新加载
  throw new Error('文件已被修改，请重新加载')
}

// 文件被锁定
async function handleFileLocked(filePath: string, userId: string): Promise<void> {
  const lockCheck = lockManager.checkLock(filePath, userId)
  
  if (lockCheck.locked && lockCheck.lock) {
    logSecurityEvent('FILE_LOCKED', { 
      filePath, 
      userId: lockCheck.lock.userId 
    })
    
    throw new Error(`文件已被用户 ${lockCheck.lock.userId} 锁定`)
  }
}
```

### 5.2 网络异常处理
```typescript
// 网络超时
async function handleNetworkTimeout(operation: string): Promise<void> {
  logSecurityEvent('NETWORK_TIMEOUT', { operation })
  
  throw new Error('网络请求超时，请检查网络连接')
}

// 网络断开
async function handleNetworkOffline(): Promise<void> {
  logSecurityEvent('NETWORK_OFFLINE', {})
  
  // 1. 保存草稿到本地
  filePreviewStore.saveDraft()
  
  // 2. 显示离线提示
  showNotification('网络已断开，修改已保存到本地', 'warning')
  
  // 3. 监听网络恢复
  window.addEventListener('online', () => {
    showNotification('网络已恢复', 'success')
    syncOfflineChanges()
  }, { once: true })
}

// 同步离线修改
async function syncOfflineChanges(): Promise<void> {
  const { file, content, originalContent } = filePreviewStore.getEditorState()
  
  if (!file || content === originalContent) return
  
  try {
    await filePreviewStore.save()
    showNotification('离线修改已同步', 'success')
  } catch (error) {
    showNotification('同步失败，请手动保存', 'error')
  }
}
```

### 5.3 浏览器异常处理
```typescript
// 页面刷新
function handleBeforeUnload(event: BeforeUnloadEvent): void {
  const { isDirty } = filePreviewStore.getEditorState()
  
  if (isDirty) {
    event.preventDefault()
    event.returnValue = '您有未保存的修改，确定要离开吗？'
    return event.returnValue
  }
}

// 内存不足
function handleMemoryPressure(): void {
  logSecurityEvent('MEMORY_PRESSURE', {})
  
  // 1. 清理不必要的状态
  filePreviewStore.clearDraft()
  
  // 2. 限制历史大小
  const { history } = filePreviewStore.getEditorState()
  if (history.past.length > 20) {
    filePreviewStore.setEditorState({
      history: {
        ...history,
        past: history.past.slice(-20),
        future: []
      }
    })
  }
  
  // 3. 显示警告
  showNotification('内存不足，已清理部分数据', 'warning')
}

// 浏览器兼容性检查
function checkBrowserCompatibility(): { compatible: boolean; issues: string[] } {
  const issues: string[] = []
  
  // 检查ES6+支持
  if (!('Promise' in window)) {
    issues.push('浏览器不支持Promise')
  }
  
  // 检查Fetch API
  if (!('fetch' in window)) {
    issues.push('浏览器不支持Fetch API')
  }
  
  // 检查LocalStorage
  try {
    localStorage.setItem('test', 'test')
    localStorage.removeItem('test')
  } catch (error) {
    issues.push('LocalStorage不可用')
  }
  
  // 检查Web Workers
  if (!('Worker' in window)) {
    issues.push('浏览器不支持Web Workers')
  }
  
  return {
    compatible: issues.length === 0,
    issues
  }
}
```

## 6. 安全审计

### 6.1 审计日志
```typescript
// 审计日志接口
interface AuditLog {
  timestamp: string
  event: string
  userId: string
  filePath: string
  operation: string
  result: 'success' | 'failure'
  details?: Record<string, unknown>
}

// 审计日志记录器
class AuditLogger {
  private logs: AuditLog[] = []
  
  // 记录操作
  log(log: Omit<AuditLog, 'timestamp'>): void {
    this.logs.push({
      ...log,
      timestamp: new Date().toISOString()
    })
    
    // 限制日志大小
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-500)
    }
    
    // 输出到控制台
    console.log('[AUDIT]', JSON.stringify(log))
  }
  
  // 查询日志
  query(filters: {
    startDate?: Date
    endDate?: Date
    userId?: string
    filePath?: string
    event?: string
  }): AuditLog[] {
    return this.logs.filter(log => {
      if (filters.startDate && new Date(log.timestamp) < filters.startDate) return false
      if (filters.endDate && new Date(log.timestamp) > filters.endDate) return false
      if (filters.userId && log.userId !== filters.userId) return false
      if (filters.filePath && log.filePath !== filters.filePath) return false
      if (filters.event && log.event !== filters.event) return false
      return true
    })
  }
  
  // 导出日志
  export(): string {
    return JSON.stringify(this.logs, null, 2)
  }
}

// 全局审计日志实例
export const auditLogger = new AuditLogger()
```

### 6.2 安全检查清单
```typescript
// 安全检查清单
const SECURITY_CHECKLIST = {
  // 输入验证
  'input-validation': [
    '验证所有用户输入',
    '清理文件路径',
    '验证文件内容',
    '检查文件类型',
    '限制文件大小'
  ],
  
  // 权限控制
  'permission-control': [
    '检查文件权限',
    '验证用户角色',
    '实施最小权限原则',
    '记录权限变更'
  ],
  
  // 并发控制
  'concurrency-control': [
    '实施文件锁定',
    '检查文件修改',
    '处理并发冲突',
    '清理过期锁'
  ],
  
  // 输出安全
  'output-security': [
    '编码HTML输出',
    '应用CSP策略',
    '清理错误信息',
    '记录安全日志'
  ],
  
  // 错误处理
  'error-handling': [
    '处理文件异常',
    '处理网络异常',
    '处理浏览器异常',
    '实施错误恢复'
  ],
  
  // 安全审计
  'security-audit': [
    '记录审计日志',
    '监控异常行为',
    '定期安全检查',
    '更新安全策略'
  ]
}

// 执行安全检查
function runSecurityCheck(): { passed: boolean; issues: string[] } {
  const issues: string[] = []
  
  // 检查每个类别
  for (const [category, checks] of Object.entries(SECURITY_CHECKLIST)) {
    for (const check of checks) {
      // 这里可以添加具体的检查逻辑
      // 例如：检查是否实现了某个安全功能
    }
  }
  
  return {
    passed: issues.length === 0,
    issues
  }
}
```

## 7. 安全配置

### 7.1 安全配置管理
```typescript
// 安全配置接口
interface SecurityConfig {
  // 路径安全
  path: {
    maxLength: number
    blockedPatterns: RegExp[]
    allowedRoots: string[]
  }
  
  // 内容安全
  content: {
    maxSize: number
    allowedTypes: string[]
    blockedPatterns: RegExp[]
  }
  
  // 锁定配置
  lock: {
    enabled: boolean
    timeout: number
    maxRetries: number
  }
  
  // 日志配置
  logging: {
    enabled: boolean
    level: 'error' | 'warn' | 'info' | 'debug'
    retentionDays: number
  }
  
  // 安全策略
  security: {
    cspEnabled: boolean
    corsEnabled: boolean
    rateLimiting: {
      enabled: boolean
      maxRequests: number
      windowMs: number
    }
  }
}

// 默认安全配置
const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  path: {
    maxLength: 4096,
    blockedPatterns: [
      /\.\.[\\/]/,
      /[<>:"|?*\x00-\x1f]/
    ],
    allowedRoots: ['/workspace', '/home', 'C:\\Users']
  },
  
  content: {
    maxSize: 512 * 1024, // 512KB
    allowedTypes: ['.txt', '.md', '.json', '.js', '.ts'],
    blockedPatterns: [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi
    ]
  },
  
  lock: {
    enabled: true,
    timeout: 30000, // 30秒
    maxRetries: 3
  },
  
  logging: {
    enabled: true,
    level: 'info',
    retentionDays: 30
  },
  
  security: {
    cspEnabled: true,
    corsEnabled: true,
    rateLimiting: {
      enabled: true,
      maxRequests: 100,
      windowMs: 60000 // 1分钟
    }
  }
}

// 加载安全配置
function loadSecurityConfig(): SecurityConfig {
  // 这里可以从配置文件或环境变量加载配置
  return DEFAULT_SECURITY_CONFIG
}
```

## 8. 总结

本设计文档详细描述了dsh-file-explorer安全机制和边界处理的完整设计方案，包括：

1. **输入验证**：全面的文件路径、内容和用户输入验证
2. **权限控制**：文件权限、操作权限和并发控制
3. **输出安全**：HTML编码、CSP策略和错误信息安全
4. **边界情况处理**：文件异常、网络异常和浏览器异常处理
5. **安全审计**：审计日志和安全检查清单
6. **安全配置**：可配置的安全策略和默认配置

通过本设计方案，可以为dsh-file-explorer插件实现一个安全、可靠、易于维护的安全防护体系，有效防止常见的安全威胁和攻击。