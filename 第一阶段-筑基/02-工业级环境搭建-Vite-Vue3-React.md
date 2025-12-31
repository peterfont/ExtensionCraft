# 02. 工业级环境搭建：Vite + Vue3/React

## 📚 学习目标

- 掌握使用 Vite 构建浏览器插件的完整流程
- 配置 TypeScript 强类型支持
- 集成 TailwindCSS 实现原子化样式
- 实现 HMR 热更新开发体验

## 🎯 核心知识点

### 1. 为什么选择 Vite？

**传统 Webpack 的问题：**
- 启动慢（冷启动需要几十秒）
- HMR 更新慢（需要重新编译整个模块图）
- 配置复杂（需要理解 Loader、Plugin）

**Vite 的优势：**
- 极速启动（利用 ES 模块，按需编译）
- 毫秒级 HMR（只更新变更的模块）
- 开箱即用（零配置即可使用）

### 2. 使用 CRXJS 插件

CRXJS 是专门为浏览器插件开发的 Vite 插件，支持：
- Manifest V3 自动处理
- Content Script HMR
- Background Service Worker 热更新

#### 安装与配置

```bash
# 创建项目
npm create vite@latest my-extension -- --template vue-ts

# 安装 CRXJS
npm install @crxjs/vite-plugin -D
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    vue(),
    crx({ manifest })
  ],
  build: {
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        sidepanel: 'src/sidepanel/index.html',
        background: 'src/background/index.ts',
        content: 'src/content/index.ts'
      }
    }
  }
})
```

### 3. TypeScript 配置

#### tsconfig.json 配置

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vite/client", "chrome"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"],
  "exclude": ["node_modules"]
}
```

#### Chrome API 类型定义

```bash
npm install @types/chrome -D
```

```typescript
// src/types/chrome.d.ts
/// <reference types="chrome" />

// 扩展类型定义
interface ChromeMessage {
  type: string;
  payload?: any;
}

type MessageHandler = (
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) => boolean | void;
```

### 4. TailwindCSS 集成

#### 安装

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

#### 配置 tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'extension-primary': '#3b82f6',
        'extension-secondary': '#8b5cf6',
      }
    },
  },
  plugins: [],
}
```

#### 在 CSS 中引入

```css
/* src/styles/main.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .btn-primary {
    @apply px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600;
  }
}
```

### 5. 项目结构设计

```
my-extension/
├── manifest.json
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── public/
│   ├── icons/
│   └── assets/
└── src/
    ├── background/
    │   ├── index.ts
    │   └── router.ts
    ├── content/
    │   ├── index.ts
    │   └── inject.ts
    ├── popup/
    │   ├── index.html
    │   ├── main.ts
    │   └── App.vue
    ├── sidepanel/
    │   ├── index.html
    │   ├── main.ts
    │   └── App.vue
    ├── shared/
    │   ├── types/
    │   ├── utils/
    │   └── constants/
    └── styles/
        └── main.css
```

### 6. HMR 配置优化

#### Content Script HMR

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    crx({ manifest }),
    // 自定义 HMR 处理
    {
      name: 'content-script-hmr',
      handleHotUpdate({ file, server }) {
        if (file.endsWith('.vue') || file.endsWith('.ts')) {
          server.ws.send({
            type: 'full-reload',
            path: '*'
          });
        }
      }
    }
  ]
})
```

#### Background Service Worker HMR

```typescript
// src/background/index.ts
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', () => {
    // 清理资源
    chrome.storage.local.clear();
  });
}
```

## 🛠️ 实战练习

### 练习 1：创建完整的项目脚手架

创建一个包含以下功能的脚手架：

1. **多入口支持**：Popup、SidePanel、Background、Content
2. **TypeScript 完整类型**：Chrome API、消息类型、存储类型
3. **TailwindCSS 预设**：常用组件样式
4. **开发脚本**：`dev`、`build`、`preview`

```json
// package.json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "pack": "vite build && web-ext build"
  }
}
```

### 练习 2：配置路径别名

```typescript
// vite.config.ts
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@popup': path.resolve(__dirname, './src/popup'),
      '@content': path.resolve(__dirname, './src/content'),
    }
  }
})
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@shared/*": ["./src/shared/*"]
    }
  }
}
```

### 练习 3：环境变量管理

```typescript
// vite.config.ts
export default defineConfig({
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
    __VERSION__: JSON.stringify(process.env.npm_package_version),
  }
})
```

```typescript
// src/shared/constants/env.ts
export const IS_DEV = __DEV__;
export const VERSION = __VERSION__;
```

## 📝 总结

- Vite + CRXJS 提供极速开发体验
- TypeScript 确保类型安全，减少运行时错误
- TailwindCSS 提升开发效率，统一设计规范
- 合理的项目结构是大型插件的基础

## 🔗 扩展阅读

- [CRXJS 官方文档](https://crxjs.dev/)
- [Vite 插件开发指南](https://vitejs.dev/guide/api-plugin.html)
- [TailwindCSS 最佳实践](https://tailwindcss.com/docs)

