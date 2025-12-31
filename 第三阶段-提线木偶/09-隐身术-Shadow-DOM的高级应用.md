# 09. 隐身术：Shadow DOM 的高级应用

## 📚 学习目标

- 理解 Shadow DOM 的样式隔离机制
- 掌握在插件中使用 Shadow DOM 的最佳实践
- 构建样式隔离的 UI 组件
- 使用 Web Components 封装插件 UI

## 🎯 核心知识点

### 1. Shadow DOM 简介

Shadow DOM 是 Web Components 标准的一部分，它提供了一个**样式和行为隔离**的 DOM 树：

- **样式隔离**：Shadow DOM 内的样式不会泄漏到外部，外部样式也不会影响 Shadow DOM
- **DOM 隔离**：外部 JavaScript 无法直接访问 Shadow DOM 内部的元素
- **完美隐藏**：防止被页面 CSS 污染或 JavaScript 检测

### 2. 基础 Shadow DOM 使用

#### 创建 Shadow DOM

```typescript
// src/content/utils/shadowDOM.ts
export function createShadowRoot(host: HTMLElement, mode: 'open' | 'closed' = 'open'): ShadowRoot {
  return host.attachShadow({ mode });
}

// 使用示例
const container = document.createElement('div');
const shadowRoot = createShadowRoot(container);
shadowRoot.innerHTML = `
  <style>
    .panel {
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-radius: 8px;
      padding: 16px;
      z-index: 10000;
    }
  </style>
  <div class="panel">
    <h2>插件面板</h2>
    <p>这个样式不会被页面 CSS 影响</p>
  </div>
`;

document.body.appendChild(container);
```

### 3. 样式隔离组件

#### 基础样式隔离组件

```typescript
// src/content/components/IsolatedPanel.ts
export class IsolatedPanel {
  private host: HTMLElement;
  private shadowRoot: ShadowRoot;
  
  constructor(container: HTMLElement | null = null) {
    this.host = container || document.createElement('div');
    this.shadowRoot = this.host.attachShadow({ mode: 'open' });
    this.injectStyles();
  }
  
  private injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647; /* 最大 z-index */
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      
      .panel {
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        padding: 20px;
        min-width: 300px;
        max-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
      }
      
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e0e0e0;
      }
      
      .title {
        font-size: 18px;
        font-weight: 600;
        margin: 0;
      }
      
      .close-btn {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #999;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .close-btn:hover {
        color: #333;
      }
      
      .content {
        /* 内容样式 */
      }
    `;
    this.shadowRoot.appendChild(style);
  }
  
  render(html: string) {
    const template = document.createElement('template');
    template.innerHTML = html;
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }
  
  append(element: HTMLElement) {
    this.shadowRoot.appendChild(element);
  }
  
  show() {
    if (!document.body.contains(this.host)) {
      document.body.appendChild(this.host);
    }
    this.host.style.display = 'block';
  }
  
  hide() {
    this.host.style.display = 'none';
  }
  
  remove() {
    if (this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
  }
  
  getShadowRoot(): ShadowRoot {
    return this.shadowRoot;
  }
}
```

### 4. Web Components 封装

使用 Web Components 标准来封装插件 UI：

#### 基础 Web Component

```typescript
// src/content/components/PluginPanel.ts
export class PluginPanel extends HTMLElement {
  private shadowRoot: ShadowRoot;
  
  static get observedAttributes() {
    return ['title', 'visible'];
  }
  
  constructor() {
    super();
    this.shadowRoot = this.attachShadow({ mode: 'open' });
    this.render();
  }
  
  connectedCallback() {
    this.setupEventListeners();
  }
  
  disconnectedCallback() {
    this.removeEventListeners();
  }
  
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue !== newValue) {
      this.update();
    }
  }
  
  private render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 2147483647;
        }
        
        :host([hidden]) {
          display: none;
        }
        
        .panel {
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          padding: 20px;
          min-width: 300px;
          max-width: 500px;
        }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        
        .title {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }
        
        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #999;
        }
        
        .content {
          /* 内容区域 */
        }
      </style>
      <div class="panel">
        <div class="header">
          <h2 class="title">${this.getAttribute('title') || '插件面板'}</h2>
          <button class="close-btn" id="closeBtn">×</button>
        </div>
        <div class="content" id="content">
          <slot></slot>
        </div>
      </div>
    `;
  }
  
  private setupEventListeners() {
    const closeBtn = this.shadowRoot.getElementById('closeBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('close'));
        this.hide();
      });
    }
  }
  
  private removeEventListeners() {
    // 清理事件监听器
  }
  
  private update() {
    const title = this.shadowRoot.querySelector('.title');
    if (title) {
      title.textContent = this.getAttribute('title') || '插件面板';
    }
    
    if (this.hasAttribute('visible')) {
      this.style.display = 'block';
    } else {
      this.style.display = 'none';
    }
  }
  
  show() {
    this.setAttribute('visible', '');
  }
  
  hide() {
    this.removeAttribute('visible');
  }
  
  setContent(html: string) {
    const content = this.shadowRoot.getElementById('content');
    if (content) {
      content.innerHTML = html;
    }
  }
}

// 注册自定义元素
customElements.define('plugin-panel', PluginPanel);
```

### 5. 高级 Shadow DOM 组件

#### 支持 Vue/React 的 Shadow DOM 容器

```typescript
// src/content/components/ShadowContainer.ts
import { createApp, App } from 'vue';

export class ShadowContainer {
  private host: HTMLElement;
  private shadowRoot: ShadowRoot;
  private vueApp: App | null = null;
  
  constructor() {
    this.host = document.createElement('div');
    this.shadowRoot = this.host.attachShadow({ mode: 'open' });
  }
  
  // 挂载 Vue 组件
  mountVueComponent(component: any, props?: Record<string, any>) {
    const container = document.createElement('div');
    this.shadowRoot.appendChild(container);
    
    // 添加基础样式
    this.injectBaseStyles();
    
    // 创建 Vue 应用
    this.vueApp = createApp(component, props);
    this.vueApp.mount(container);
    
    return this.vueApp;
  }
  
  // 注入基础样式（Vue 组件可能需要）
  private injectBaseStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        display: block;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      
      /* 重置样式 */
      * {
        box-sizing: border-box;
      }
      
      /* 基础样式 */
      button {
        font-family: inherit;
        cursor: pointer;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        background: #007bff;
        color: white;
      }
      
      input, textarea, select {
        font-family: inherit;
        border: 1px solid #ddd;
        padding: 8px;
        border-radius: 4px;
      }
    `;
    this.shadowRoot.insertBefore(style, this.shadowRoot.firstChild);
  }
  
  // 注入外部 CSS（如 Tailwind CSS）
  injectCSS(cssText: string) {
    const style = document.createElement('style');
    style.textContent = cssText;
    this.shadowRoot.appendChild(style);
  }
  
  // 注入外部 CSS 文件
  async injectCSSFile(url: string) {
    try {
      const response = await fetch(url);
      const cssText = await response.text();
      this.injectCSS(cssText);
    } catch (error) {
      console.error('Failed to inject CSS file:', error);
    }
  }
  
  show() {
    if (!document.body.contains(this.host)) {
      document.body.appendChild(this.host);
    }
  }
  
  hide() {
    if (this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
  }
  
  destroy() {
    if (this.vueApp) {
      this.vueApp.unmount();
      this.vueApp = null;
    }
    this.hide();
  }
  
  getShadowRoot(): ShadowRoot {
    return this.shadowRoot;
  }
}
```

### 6. 防检测技术

#### 隐藏 Shadow DOM 特征

```typescript
// src/content/utils/stealthMode.ts
export class StealthMode {
  // 隐藏 Shadow DOM 的痕迹
  static hideShadowDOM(host: HTMLElement) {
    // 移除可能的识别特征
    Object.defineProperty(host, 'attachShadow', {
      value: () => {},
      writable: false,
    });
  }
  
  // 使用 MutationObserver 检测页面是否在查找 Shadow DOM
  static detectShadowDOMDetection(callback: () => void) {
    const observer = new MutationObserver((mutations) => {
      // 检测可疑的 DOM 查询
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              // 检查是否是检测脚本
              const scripts = node.querySelectorAll?.('script');
              scripts?.forEach((script) => {
                const content = script.textContent || '';
                if (content.includes('shadowRoot') || content.includes('attachShadow')) {
                  callback();
                }
              });
            }
          });
        }
      });
    });
    
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    
    return observer;
  }
  
  // 混淆类名和 ID
  static obfuscateSelectors(shadowRoot: ShadowRoot) {
    const elements = shadowRoot.querySelectorAll('[class], [id]');
    elements.forEach((el) => {
      if (el instanceof HTMLElement) {
        // 随机化类名
        if (el.className) {
          const originalClasses = el.className;
          const randomClasses = originalClasses.split(' ').map(() => 
            `_${Math.random().toString(36).substr(2, 9)}`
          ).join(' ');
          el.className = randomClasses;
          
          // 更新样式表
          this.updateStylesheet(shadowRoot, originalClasses, randomClasses);
        }
        
        // 随机化 ID
        if (el.id) {
          const randomId = `_${Math.random().toString(36).substr(2, 9)}`;
          el.id = randomId;
        }
      }
    });
  }
  
  private static updateStylesheet(
    shadowRoot: ShadowRoot,
    oldSelector: string,
    newSelector: string
  ) {
    const stylesheets = shadowRoot.querySelectorAll('style');
    stylesheets.forEach((style) => {
      style.textContent = style.textContent?.replace(
        new RegExp(`\\.${oldSelector}`, 'g'),
        `.${newSelector}`
      ) || '';
    });
  }
}
```

### 7. 完整示例：悬浮工具栏

```typescript
// src/content/components/FloatingToolbar.ts
export class FloatingToolbar {
  private container: ShadowContainer;
  private isVisible = false;
  
  constructor() {
    this.container = new ShadowContainer();
    this.init();
  }
  
  private init() {
    const shadowRoot = this.container.getShadowRoot();
    
    // 创建工具栏 HTML
    const toolbar = document.createElement('div');
    toolbar.innerHTML = `
      <div class="toolbar">
        <button class="toolbar-btn" data-action="capture">截图</button>
        <button class="toolbar-btn" data-action="highlight">高亮</button>
        <button class="toolbar-btn" data-action="note">笔记</button>
        <button class="toolbar-btn" data-action="close">×</button>
      </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      :host {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
      }
      
      .toolbar {
        display: flex;
        gap: 8px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 8px;
      }
      
      .toolbar-btn {
        padding: 8px 16px;
        border: none;
        background: #f0f0f0;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.2s;
      }
      
      .toolbar-btn:hover {
        background: #e0e0e0;
      }
      
      .toolbar-btn[data-action="close"] {
        background: #ff4444;
        color: white;
        padding: 8px 12px;
      }
      
      .toolbar-btn[data-action="close"]:hover {
        background: #cc0000;
      }
    `;
    
    shadowRoot.appendChild(style);
    shadowRoot.appendChild(toolbar);
    
    // 绑定事件
    toolbar.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;
      if (action) {
        this.handleAction(action);
      }
    });
  }
  
  private handleAction(action: string) {
    switch (action) {
      case 'capture':
        this.captureScreen();
        break;
      case 'highlight':
        this.toggleHighlight();
        break;
      case 'note':
        this.showNotePanel();
        break;
      case 'close':
        this.hide();
        break;
    }
  }
  
  private captureScreen() {
    // 截图功能
    chrome.runtime.sendMessage({ type: 'capture-screen' });
  }
  
  private toggleHighlight() {
    // 高亮功能
    document.body.style.outline = document.body.style.outline ? '' : '2px solid yellow';
  }
  
  private showNotePanel() {
    // 显示笔记面板
    chrome.runtime.sendMessage({ type: 'show-note-panel' });
  }
  
  show() {
    this.container.show();
    this.isVisible = true;
  }
  
  hide() {
    this.container.hide();
    this.isVisible = false;
  }
  
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
}

// 使用示例
const toolbar = new FloatingToolbar();
toolbar.show();
```

## 🛠️ 实战练习

### 练习 1：创建通用 Shadow DOM 组件库

创建一个组件库，包含常用的 Shadow DOM 组件：

```typescript
// src/content/components/ShadowComponents.ts
export class ShadowButton extends HTMLElement {
  // 实现按钮组件
}

export class ShadowInput extends HTMLElement {
  // 实现输入框组件
}

export class ShadowModal extends HTMLElement {
  // 实现模态框组件
}

// 注册所有组件
customElements.define('shadow-button', ShadowButton);
customElements.define('shadow-input', ShadowInput);
customElements.define('shadow-modal', ShadowModal);
```

## 📝 总结

- Shadow DOM 提供完美的样式和行为隔离
- 使用 Web Components 标准封装插件 UI
- 可以安全地使用 Vue/React 等框架
- 通过防检测技术可以隐藏 Shadow DOM 的存在
- Shadow DOM 是构建插件 UI 的最佳实践

## 🔗 扩展阅读

- [MDN: Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM)
- [Web Components 标准](https://www.webcomponents.org/)
- [Shadow DOM v1 规范](https://w3c.github.io/webcomponents/spec/shadow/)

