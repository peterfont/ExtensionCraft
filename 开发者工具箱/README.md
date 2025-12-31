# 开发者工具箱

## 📦 脚手架模板

### Vue3 + Vite + Manifest V3 模板

完整配置的脚手架，包含：
- ✅ Vite 构建系统
- ✅ Vue3 + TypeScript
- ✅ TailwindCSS
- ✅ Pinia 状态管理
- ✅ 完整的项目结构
- ✅ HMR 热更新

### 快速开始

```bash
# 使用模板创建项目
npm create vite@latest my-extension -- --template vue-ts

# 安装依赖
cd my-extension
npm install

# 安装插件开发依赖
npm install -D @crxjs/vite-plugin @types/chrome

# 开发
npm run dev

# 构建
npm run build
```

## 🔧 常用代码片段

所有代码片段都在 `code-snippets/` 目录中，可以直接复制使用。

### 文件结构

```
开发者工具箱/
├── code-snippets/          # 代码片段
│   ├── snippets.ts        # 工具函数（sleep, waitForElement, debounce等）
│   ├── hooks.ts           # Hook工具（XHR, Fetch, WebSocket拦截）
│   ├── dom.ts             # DOM操作工具（safeClick, getText等）
│   └── index.ts           # 统一导出
├── config-examples/        # 配置文件示例
│   ├── vite.config.ts     # Vite配置
│   ├── manifest.json      # Manifest配置
│   ├── tsconfig.json      # TypeScript配置
│   ├── package.json       # 包配置
│   └── tailwind.config.js # Tailwind配置
└── usage-examples.md      # 使用示例文档
```

### 1. 工具函数 (`snippets.ts`)

包含常用的工具函数：
- `sleep()` - 延迟函数
- `waitForElement()` - 等待元素出现
- `generateId()` - 生成唯一ID
- `debounce()` - 防抖
- `throttle()` - 节流
- `deepClone()` - 深度克隆
- `formatDate()` - 日期格式化
- `parseUrlParams()` - URL参数解析
- 等等...

### 2. Hook 工具 (`hooks.ts`)

用于拦截和监控网络请求：
- `hookXHR()` - 拦截 XMLHttpRequest
- `hookFetch()` - 拦截 Fetch API
- `hookWebSocket()` - 拦截 WebSocket
- `hookAll()` - 组合多个Hook

### 3. DOM 操作工具 (`dom.ts`)

提供安全的DOM操作方法：
- `safeClick()` - 安全点击（等待元素可见）
- `getText()` - 获取元素文本
- `setValue()` - 设置输入值
- `waitForElementDisappear()` - 等待元素消失
- `highlightElement()` - 高亮元素（调试用）
- 等等...

### 快速使用

```typescript
// 导入所有工具
import { sleep, waitForElement, safeClick, hookXHR } from '@/shared/utils';

// 或按需导入
import { sleep } from '@/shared/utils/snippets';
import { hookXHR } from '@/shared/utils/hooks';
import { safeClick } from '@/shared/utils/dom';
```

详细使用示例请查看 [usage-examples.md](./usage-examples.md)

## ⚙️ 配置文件示例

所有配置文件示例都在 `config-examples/` 目录中：

- **vite.config.ts** - Vite构建配置，包含CRXJS插件、路径别名等
- **manifest.json** - Manifest V3配置示例
- **tsconfig.json** - TypeScript配置，包含路径映射
- **package.json** - 依赖配置
- **tailwind.config.js** - TailwindCSS配置

可以直接复制这些配置文件作为项目起点。

## 📚 最佳实践

### 1. 项目结构规范

```
src/
├── background/     # Service Worker
├── content/        # Content Scripts
├── popup/          # Popup 页面
├── sidepanel/      # Side Panel
├── options/        # Options 页面
├── injected/       # 注入到页面的脚本
├── shared/         # 共享代码
│   ├── types/      # TypeScript 类型
│   ├── utils/      # 工具函数（可复制code-snippets中的文件）
│   └── constants/  # 常量
└── styles/         # 全局样式
```

### 2. 命名规范

- **文件**: kebab-case (`my-component.ts`)
- **类/组件**: PascalCase (`MyComponent`)
- **函数/变量**: camelCase (`myFunction`)
- **常量**: UPPER_SNAKE_CASE (`MY_CONSTANT`)

### 3. 代码组织

- 每个功能模块一个文件
- 使用 TypeScript 严格模式
- 添加适当的注释
- 保持函数单一职责
- 将 `code-snippets` 中的工具函数复制到项目的 `src/shared/utils/` 目录

## 🔗 有用链接

- [Chrome Extension 官方文档](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 迁移指南](https://developer.chrome.com/docs/extensions/migrating/)
- [CRXJS Vite 插件](https://crxjs.dev/)
- [Chrome Extension 示例](https://github.com/GoogleChrome/chrome-extensions-samples)

