# 08. 突破孤岛：Main World 注入技术

## 📚 学习目标

- 理解 Content Script 的隔离机制
- 掌握 Main World 注入技术
- 学习 `userScripts` API 的使用
- 实现安全的页面变量访问

## 🎯 核心知识点

### 1. Content Script 隔离机制回顾

Content Script 运行在**隔离世界（Isolated World）**中：

- ❌ 无法直接访问页面的 JavaScript 变量
- ❌ 无法访问页面的全局对象（如 `window.vue`, `window.__INITIAL_STATE__`）
- ✅ 可以访问和修改 DOM
- ✅ 可以注入脚本到页面上下文

### 2. 传统的脚本注入方法

#### 方法一：script 标签注入（基础版）

```typescript
// src/content/inject/scriptInject.ts
export function injectScript(scriptContent: string): void {
  const script = document.createElement('script');
  script.textContent = scriptContent;
  (document.head || document.documentElement).appendChild(script);
  script.remove(); // 执行后立即移除
}

// 使用示例
injectScript(`
  window.__PLUGIN_ACCESS__ = true;
  console.log('Injected into main world');
`);
```

#### 方法二：script 标签注入（高级版，支持返回值）

```typescript
// src/content/inject/advancedScriptInject.ts
export function injectScriptWithReturn<T>(
  scriptContent: string,
  callback?: (result: T) => void
): void {
  const scriptId = `__plugin_inject_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      try {
        ${scriptContent}
      } catch (e) {
        window['${scriptId}'] = { error: e.message };
      }
    })();
  `;
  
  // 监听结果
  const checkResult = setInterval(() => {
    const result = (window as any)[scriptId];
    if (result !== undefined) {
      clearInterval(checkResult);
      delete (window as any)[scriptId];
      
      if (callback) {
        callback(result.error ? null as any : result);
      }
    }
  }, 10);
  
  (document.head || document.documentElement).appendChild(script);
  script.remove();
  
  // 超时清理
  setTimeout(() => {
    clearInterval(checkResult);
    delete (window as any)[scriptId];
  }, 5000);
}

// 使用示例：获取页面变量
injectScriptWithReturn<any>(`
  window['${scriptId}'] = window.__INITIAL_STATE__;
`, (result) => {
  console.log('Got page state:', result);
});
```

#### 方法三：函数执行注入

```typescript
// src/content/inject/functionInject.ts
export function injectFunction<T>(
  fn: () => T,
  args: any[] = []
): Promise<T> {
  return new Promise((resolve, reject) => {
    const scriptId = `__fn_${Date.now()}`;
    
    // 将函数转为字符串
    const fnString = fn.toString();
    const argsString = JSON.stringify(args);
    
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          const fn = ${fnString};
          const args = ${argsString};
          const result = fn.apply(null, args);
          window['${scriptId}'] = { success: true, data: result };
        } catch (e) {
          window['${scriptId}'] = { success: false, error: e.message };
        }
      })();
    `;
    
    const checkResult = setInterval(() => {
      const result = (window as any)[scriptId];
      if (result) {
        clearInterval(checkResult);
        delete (window as any)[scriptId];
        script.remove();
        
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.error));
        }
      }
    }, 10);
    
    (document.head || document.documentElement).appendChild(script);
    
    setTimeout(() => {
      clearInterval(checkResult);
      delete (window as any)[scriptId];
      reject(new Error('Timeout'));
    }, 5000);
  });
}

// 使用示例
const pageState = await injectFunction(() => {
  return window.__INITIAL_STATE__;
});
```

### 3. userScripts API（推荐方法）

`userScripts` API 是 Manifest V3 中推荐的 Main World 注入方式：

#### manifest.json 配置

```json
{
  "manifest_version": 3,
  "permissions": [
    "userScripts"
  ],
  "host_permissions": [
    "https://*/*",
    "http://*/*"
  ],
  "user_scripts": {
    "api_script": "injected.js"
  }
}
```

#### 创建 API Script（injected.js）

```typescript
// src/injected/index.ts
// 这个文件运行在 Main World，可以访问页面变量

// 暴露插件 API 到页面
(window as any).__PLUGIN_API__ = {
  version: '1.0.0',
  
  // 获取页面数据
  getPageData: () => {
    return {
      vue: (window as any).__VUE__,
      initialState: (window as any).__INITIAL_STATE__,
      redux: (window as any).__REDUX_STATE__,
    };
  },
  
  // 调用页面函数
  callPageFunction: (fnName: string, ...args: any[]) => {
    const fn = (window as any)[fnName];
    if (typeof fn === 'function') {
      return fn(...args);
    }
    throw new Error(`Function ${fnName} not found`);
  },
  
  // 监听页面事件
  onPageEvent: (eventName: string, callback: Function) => {
    window.addEventListener(eventName, callback as EventListener);
  },
};

// 监听来自 Content Script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get-page-data') {
    const data = (window as any).__PLUGIN_API__.getPageData();
    sendResponse({ success: true, data });
  }
  
  if (message.type === 'call-page-function') {
    try {
      const result = (window as any).__PLUGIN_API__.callPageFunction(
        message.fnName,
        ...message.args
      );
      sendResponse({ success: true, data: result });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  }
  
  return true; // 保持通道开放
});
```

#### Content Script 中调用

```typescript
// src/content/mainWorldBridge.ts
export class MainWorldBridge {
  // 通过 userScripts API 发送消息
  async getPageData(): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'get-page-data',
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      });
    });
  }
  
  async callPageFunction(fnName: string, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'call-page-function',
        fnName,
        args,
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      });
    });
  }
}

// 使用示例
const bridge = new MainWorldBridge();
const pageData = await bridge.getPageData();
console.log('Page Vue instance:', pageData.vue);
```

### 4. 动态 userScripts 注册

Manifest V3 还支持动态注册 userScripts：

```typescript
// src/background/userScriptsManager.ts
export class UserScriptsManager {
  async registerUserScript(
    scriptContent: string,
    matches: string[],
    scriptId: string
  ): Promise<void> {
    await chrome.userScripts.register([{
      id: scriptId,
      matches,
      js: [{ code: scriptContent }],
      world: 'MAIN', // 注入到 Main World
      runAt: 'document_end',
    }]);
  }
  
  async unregisterUserScript(scriptId: string): Promise<void> {
    await chrome.userScripts.unregister({ ids: [scriptId] });
  }
  
  async updateUserScript(
    scriptContent: string,
    matches: string[],
    scriptId: string
  ): Promise<void> {
    // 先注销再注册
    await this.unregisterUserScript(scriptId);
    await this.registerUserScript(scriptContent, matches, scriptId);
  }
  
  async getRegisteredScripts(): Promise<chrome.userScripts.RegisteredUserScript[]> {
    return await chrome.userScripts.getScripts();
  }
}

// 使用示例
const manager = new UserScriptsManager();
await manager.registerUserScript(
  `
    window.__MY_PLUGIN__ = {
      getData: () => window.__INITIAL_STATE__
    };
  `,
  ['https://example.com/*'],
  'my-script-1'
);
```

### 5. 安全的数据桥接

创建一个安全的数据桥接，避免直接暴露页面变量：

```typescript
// src/injected/bridge.ts
// 运行在 Main World

interface BridgeConfig {
  allowedFunctions?: string[];
  allowedProperties?: string[];
  maxDepth?: number;
}

class SecureBridge {
  private config: BridgeConfig;
  
  constructor(config: BridgeConfig = {}) {
    this.config = {
      allowedFunctions: config.allowedFunctions || [],
      allowedProperties: config.allowedProperties || ['__INITIAL_STATE__', '__VUE__'],
      maxDepth: config.maxDepth || 5,
    };
  }
  
  // 安全获取属性
  getProperty(path: string): any {
    const parts = path.split('.');
    let current: any = window;
    
    for (const part of parts) {
      // 检查是否允许访问
      if (!this.isAllowed(part)) {
        throw new Error(`Access to "${part}" is not allowed`);
      }
      
      if (current === null || current === undefined) {
        return undefined;
      }
      
      current = current[part];
    }
    
    // 深拷贝并限制深度
    return this.sanitize(current, 0);
  }
  
  // 安全调用函数
  callFunction(path: string, args: any[] = []): any {
    const parts = path.split('.');
    const fnName = parts.pop()!;
    let current: any = window;
    
    for (const part of parts) {
      if (!this.isAllowed(part)) {
        throw new Error(`Access to "${part}" is not allowed`);
      }
      current = current[part];
    }
    
    const fn = current[fnName];
    if (typeof fn !== 'function') {
      throw new Error(`"${path}" is not a function`);
    }
    
    if (this.config.allowedFunctions && !this.config.allowedFunctions.includes(path)) {
      throw new Error(`Function "${path}" is not allowed`);
    }
    
    try {
      const result = fn.apply(current, args);
      return this.sanitize(result, 0);
    } catch (e) {
      throw new Error(`Function call failed: ${e.message}`);
    }
  }
  
  private isAllowed(property: string): boolean {
    if (this.config.allowedProperties) {
      return this.config.allowedProperties.includes(property);
    }
    return true;
  }
  
  private sanitize(obj: any, depth: number): any {
    if (depth >= (this.config.maxDepth || 5)) {
      return '[Max Depth Reached]';
    }
    
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    // 避免循环引用
    const visited = new WeakSet();
    
    const sanitizeValue = (value: any, currentDepth: number): any => {
      if (currentDepth >= (this.config.maxDepth || 5)) {
        return '[Max Depth]';
      }
      
      if (visited.has(value)) {
        return '[Circular Reference]';
      }
      
      if (typeof value === 'function') {
        return '[Function]';
      }
      
      if (value instanceof HTMLElement) {
        return `[HTMLElement: ${value.tagName}]`;
      }
      
      if (Array.isArray(value)) {
        visited.add(value);
        return value.map(item => sanitizeValue(item, currentDepth + 1));
      }
      
      if (typeof value === 'object') {
        visited.add(value);
        const result: any = {};
        for (const key in value) {
          if (value.hasOwnProperty(key)) {
            result[key] = sanitizeValue(value[key], currentDepth + 1);
          }
        }
        return result;
      }
      
      return value;
    };
    
    return sanitizeValue(obj, depth);
  }
}

// 创建全局桥接实例
(window as any).__PLUGIN_BRIDGE__ = new SecureBridge({
  allowedProperties: ['__INITIAL_STATE__', '__VUE__', '__REDUX_STATE__'],
  allowedFunctions: ['getData', 'getUserInfo'],
  maxDepth: 10,
});

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const bridge = (window as any).__PLUGIN_BRIDGE__;
  
  if (message.type === 'bridge-get') {
    try {
      const value = bridge.getProperty(message.path);
      sendResponse({ success: true, data: value });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  }
  
  if (message.type === 'bridge-call') {
    try {
      const result = bridge.callFunction(message.path, message.args);
      sendResponse({ success: true, data: result });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  }
  
  return true;
});
```

### 6. 实际应用场景

#### 场景一：获取 Vue 实例数据

```typescript
// src/content/vueDataExtractor.ts
export class VueDataExtractor {
  async getVueInstance(): Promise<any> {
    return injectFunction(() => {
      // 查找 Vue 实例（多种方法）
      const app = document.querySelector('#app');
      if (app && (app as any).__vue__) {
        return (app as any).__vue__;
      }
      
      // 尝试全局 Vue
      if ((window as any).Vue) {
        return (window as any).Vue;
      }
      
      // 尝试 Vue 3
      if ((window as any).__VUE__) {
        return (window as any).__VUE__;
      }
      
      return null;
    });
  }
  
  async getComponentData(selector: string): Promise<any> {
    return injectFunction(() => {
      const element = document.querySelector(selector);
      if (element && (element as any).__vue__) {
        const instance = (element as any).__vue__;
        return {
          data: instance.$data,
          props: instance.$props,
          computed: instance.$options.computed,
        };
      }
      return null;
    });
  }
}
```

#### 场景二：获取 React 状态

```typescript
// src/content/reactDataExtractor.ts
export class ReactDataExtractor {
  async getReactRoot(): Promise<any> {
    return injectFunction(() => {
      const root = document.querySelector('#root');
      if (root && (root as any)._reactRootContainer) {
        return (root as any)._reactRootContainer;
      }
      return null;
    });
  }
  
  async getReactFiber(element: HTMLElement): Promise<any> {
    return injectFunction(() => {
      const key = Object.keys(element).find(key => 
        key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );
      
      if (key) {
        return (element as any)[key];
      }
      return null;
    });
  }
}
```

## 🛠️ 实战练习

### 练习 1：通用页面数据提取器

创建一个通用的提取器，自动检测页面框架并提取数据：

```typescript
// src/content/universalDataExtractor.ts
export class UniversalDataExtractor {
  async detectFramework(): Promise<'vue' | 'react' | 'angular' | 'unknown'> {
    return injectFunction(() => {
      if ((window as any).Vue || (window as any).__VUE__) return 'vue';
      if ((window as any).React || (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) return 'react';
      if ((window as any).ng) return 'angular';
      return 'unknown';
    });
  }
  
  async extractData(): Promise<any> {
    const framework = await this.detectFramework();
    
    switch (framework) {
      case 'vue':
        return this.extractVueData();
      case 'react':
        return this.extractReactData();
      default:
        return this.extractGenericData();
    }
  }
  
  private async extractVueData(): Promise<any> {
    // Vue 数据提取逻辑
    return {};
  }
  
  private async extractReactData(): Promise<any> {
    // React 数据提取逻辑
    return {};
  }
  
  private async extractGenericData(): Promise<any> {
    // 通用数据提取（如 __INITIAL_STATE__）
    return injectFunction(() => {
      return {
        initialState: (window as any).__INITIAL_STATE__,
        reduxState: (window as any).__REDUX_STATE__,
        preloadedState: (window as any).__PRELOADED_STATE__,
      };
    });
  }
}
```

## 📝 总结

- Content Script 运行在隔离世界，无法直接访问页面变量
- 使用 script 标签注入是传统方法，但不够优雅
- `userScripts` API 是 Manifest V3 推荐的方式
- 动态注册 userScripts 可以实现灵活的脚本管理
- 安全桥接可以控制页面变量的访问权限

## 🔗 扩展阅读

- [Content Scripts 隔离机制](https://developer.chrome.com/docs/extensions/mv3/content_scripts/#isolated_world)
- [userScripts API](https://developer.chrome.com/docs/extensions/reference/userScripts/)
- [脚本注入最佳实践](https://developer.chrome.com/docs/extensions/mv3/content_scripts/#programmatic)

