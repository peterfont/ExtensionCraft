# 06. 数据嗅探与 Hook 技术 (黑科技核心)

## 📚 学习目标

- 掌握 XHR/Fetch 劫持技术
- 实现 WebSocket 数据监听
- 理解 JavaScript Hook 原理
- 在数据到达页面前截获数据

## 🎯 核心知识点

### 1. Hook 技术原理

Hook（钩子）技术是一种拦截和修改程序执行流程的技术。在浏览器环境中，我们可以通过重写原生 API 来实现数据拦截。

#### 为什么需要 Hook？

- **数据提前拦截**：在数据到达页面 JavaScript 之前捕获
- **绕过加密**：某些网站会在数据到达后立即加密，Hook 可以获取原始数据
- **监控分析**：实时监控所有网络请求和数据流

### 2. XHR 劫持

#### 基础 XHR Hook

```typescript
// src/content/inject/xhrHook.ts
(function() {
  const OriginalXHR = window.XMLHttpRequest;
  
  function XHRHook() {
    const xhr = new OriginalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    
    let requestData: any = null;
    let requestUrl: string = '';
    let requestMethod: string = '';
    
    // Hook open 方法
    xhr.open = function(method: string, url: string | URL, ...args: any[]) {
      requestMethod = method;
      requestUrl = url.toString();
      return originalOpen.apply(this, [method, url, ...args]);
    };
    
    // Hook send 方法
    xhr.send = function(data?: Document | XMLHttpRequestBodyInit | null) {
      requestData = data;
      
      // 监听响应
      xhr.addEventListener('readystatechange', function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
          try {
            const responseText = xhr.responseText;
            const responseData = JSON.parse(responseText);
            
            // 发送数据到插件
            window.postMessage({
              source: 'xhr-hook',
              type: 'xhr-response',
              data: {
                url: requestUrl,
                method: requestMethod,
                request: requestData,
                response: responseData,
                status: xhr.status,
                headers: xhr.getAllResponseHeaders(),
              }
            }, '*');
          } catch (e) {
            // 非 JSON 响应
            console.log('Non-JSON response:', requestUrl);
          }
        }
      });
      
      return originalSend.apply(this, [data as any]);
    };
    
    return xhr;
  }
  
  // 保留原始 XHR 的属性
  XHRHook.prototype = OriginalXHR.prototype;
  (XHRHook as any).prototype.constructor = XHRHook;
  
  // 替换全局 XHR
  (window as any).XMLHttpRequest = XHRHook as any;
})();
```

#### 高级 XHR Hook（支持请求/响应修改）

```typescript
// src/content/inject/advancedXhrHook.ts
interface XHREvent {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: any;
  responseHeaders: Record<string, string>;
  responseBody: any;
  status: number;
  timestamp: number;
}

export class AdvancedXHRHook {
  private events: XHREvent[] = [];
  private maxEvents = 1000;
  
  install() {
    const OriginalXHR = window.XMLHttpRequest;
    const self = this;
    
    function XHRHook() {
      const xhr = new OriginalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;
      const originalSetRequestHeader = xhr.setRequestHeader;
      
      const event: Partial<XHREvent> = {
        timestamp: Date.now(),
        requestHeaders: {},
      };
      
      // Hook setRequestHeader
      xhr.setRequestHeader = function(header: string, value: string) {
        event.requestHeaders![header] = value;
        return originalSetRequestHeader.apply(this, [header, value]);
      };
      
      // Hook open
      xhr.open = function(method: string, url: string | URL, ...args: any[]) {
        event.method = method;
        event.url = url.toString();
        return originalOpen.apply(this, [method, url, ...args]);
      };
      
      // Hook send
      xhr.send = function(data?: Document | XMLHttpRequestBodyInit | null) {
        event.requestBody = self.parseRequestBody(data);
        
        // 监听响应
        const originalOnReadyStateChange = xhr.onreadystatechange;
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            event.status = xhr.status;
            event.responseHeaders = self.parseResponseHeaders(xhr.getAllResponseHeaders());
            event.responseBody = self.parseResponseBody(xhr.responseText, xhr.responseType);
            
            self.recordEvent(event as XHREvent);
            self.notifyEvent(event as XHREvent);
          }
          
          if (originalOnReadyStateChange) {
            originalOnReadyStateChange.apply(this, arguments as any);
          }
        };
        
        return originalSend.apply(this, [data as any]);
      };
      
      return xhr;
    }
    
    // 保留原型链
    XHRHook.prototype = OriginalXHR.prototype;
    (XHRHook as any).prototype.constructor = XHRHook;
    
    // 替换全局对象
    (window as any).XMLHttpRequest = XHRHook as any;
  }
  
  private parseRequestBody(data: any): any {
    if (!data) return null;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    if (data instanceof FormData) {
      const obj: Record<string, any> = {};
      data.forEach((value, key) => {
        obj[key] = value;
      });
      return obj;
    }
    return data;
  }
  
  private parseResponseHeaders(headersString: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!headersString) return headers;
    
    headersString.split('\r\n').forEach(line => {
      const [key, value] = line.split(': ');
      if (key && value) {
        headers[key.toLowerCase()] = value;
      }
    });
    
    return headers;
  }
  
  private parseResponseBody(responseText: string, responseType: string): any {
    if (responseType === 'json' || responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
      try {
        return JSON.parse(responseText);
      } catch {
        return responseText;
      }
    }
    return responseText;
  }
  
  private recordEvent(event: XHREvent) {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }
  
  private notifyEvent(event: XHREvent) {
    // 发送到 Content Script
    window.postMessage({
      source: 'xhr-hook',
      type: 'xhr-event',
      data: event,
    }, '*');
  }
  
  getEvents(): XHREvent[] {
    return [...this.events];
  }
  
  clearEvents() {
    this.events = [];
  }
}
```

### 3. Fetch Hook

#### 基础 Fetch Hook

```typescript
// src/content/inject/fetchHook.ts
(function() {
  const OriginalFetch = window.fetch;
  
  window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    const requestBody = init?.body;
    
    try {
      // 调用原始 fetch
      const response = await OriginalFetch.apply(this, [input, init]);
      
      // 克隆响应以便读取（原始响应只能读取一次）
      const clonedResponse = response.clone();
      
      // 异步读取响应数据
      clonedResponse.json().then((data: any) => {
        // 发送到插件
        window.postMessage({
          source: 'fetch-hook',
          type: 'fetch-response',
          data: {
            url,
            method,
            request: requestBody,
            response: data,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
          }
        }, '*');
      }).catch(() => {
        // 非 JSON 响应，尝试读取文本
        clonedResponse.text().then((text: string) => {
          window.postMessage({
            source: 'fetch-hook',
            type: 'fetch-response',
            data: {
              url,
              method,
              request: requestBody,
              response: text,
              status: response.status,
            }
          }, '*');
        });
      });
      
      return response;
    } catch (error) {
      // 请求失败
      window.postMessage({
        source: 'fetch-hook',
        type: 'fetch-error',
        data: {
          url,
          method,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }, '*');
      
      throw error;
    }
  };
})();
```

#### 高级 Fetch Hook（支持请求拦截和修改）

```typescript
// src/content/inject/advancedFetchHook.ts
interface FetchEvent {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: any;
  responseHeaders: Record<string, string>;
  responseBody: any;
  status: number;
  timestamp: number;
}

export class AdvancedFetchHook {
  private events: FetchEvent[] = [];
  private interceptors: Array<(event: Partial<FetchEvent>) => Promise<boolean>> = [];
  
  install() {
    const OriginalFetch = window.fetch;
    const self = this;
    
    window.fetch = async function(
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const url = typeof input === 'string' 
        ? input 
        : input instanceof URL 
          ? input.toString() 
          : input.url;
      
      const method = init?.method || 'GET';
      const requestHeaders: Record<string, string> = {};
      
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((value, key) => {
            requestHeaders[key] = value;
          });
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([key, value]) => {
            requestHeaders[key] = value;
          });
        } else {
          Object.assign(requestHeaders, init.headers);
        }
      }
      
      const event: Partial<FetchEvent> = {
        url,
        method,
        requestHeaders,
        requestBody: self.parseRequestBody(init?.body),
        timestamp: Date.now(),
      };
      
      // 执行拦截器
      let shouldIntercept = false;
      for (const interceptor of self.interceptors) {
        if (await interceptor(event)) {
          shouldIntercept = true;
          break;
        }
      }
      
      if (shouldIntercept) {
        // 返回模拟响应
        return new Response(JSON.stringify({ intercepted: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      try {
        const response = await OriginalFetch.apply(this, [input, init]);
        const clonedResponse = response.clone();
        
        // 解析响应头
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
        
        // 解析响应体
        const contentType = response.headers.get('content-type') || '';
        let responseBody: any;
        
        if (contentType.includes('application/json')) {
          responseBody = await clonedResponse.json();
        } else if (contentType.includes('text/')) {
          responseBody = await clonedResponse.text();
        } else {
          responseBody = await clonedResponse.arrayBuffer();
        }
        
        event.status = response.status;
        event.responseHeaders = responseHeaders;
        event.responseBody = responseBody;
        
        self.recordEvent(event as FetchEvent);
        self.notifyEvent(event as FetchEvent);
        
        return response;
      } catch (error) {
        window.postMessage({
          source: 'fetch-hook',
          type: 'fetch-error',
          data: { ...event, error: error instanceof Error ? error.message : 'Unknown error' },
        }, '*');
        throw error;
      }
    };
  }
  
  addInterceptor(interceptor: (event: Partial<FetchEvent>) => Promise<boolean>) {
    this.interceptors.push(interceptor);
  }
  
  private parseRequestBody(body: any): any {
    if (!body) return null;
    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    }
    if (body instanceof FormData) {
      const obj: Record<string, any> = {};
      body.forEach((value, key) => {
        obj[key] = value;
      });
      return obj;
    }
    if (body instanceof URLSearchParams) {
      return Object.fromEntries(body.entries());
    }
    return body;
  }
  
  private recordEvent(event: FetchEvent) {
    this.events.push(event);
    if (this.events.length > 1000) {
      this.events.shift();
    }
  }
  
  private notifyEvent(event: FetchEvent) {
    window.postMessage({
      source: 'fetch-hook',
      type: 'fetch-event',
      data: event,
    }, '*');
  }
  
  getEvents(): FetchEvent[] {
    return [...this.events];
  }
  
  clearEvents() {
    this.events = [];
  }
}
```

## 📝 第一部分总结

本章第一部分介绍了：
- Hook 技术的基本原理和用途
- XHR 劫持的完整实现（基础版和高级版）
- Fetch 劫持的完整实现（基础版和高级版）

接下来我们将继续学习：
- WebSocket 劫持
- 数据过滤和搜索
- Content Script 集成
- 实战案例

---

## 🔌 第二部分：WebSocket 劫持与高级应用

### 4. WebSocket 劫持

WebSocket 是实时通信的重要协议，常用于直播弹幕、实时报价、在线聊天等场景。通过劫持 WebSocket，我们可以监听这些实时数据流。

#### 基础 WebSocket Hook

```typescript
// src/content/inject/websocketHook.ts
(function() {
  const OriginalWebSocket = window.WebSocket;
  
  function WebSocketHook(url: string | URL, protocols?: string | string[]) {
    const ws = new OriginalWebSocket(url, protocols);
    const wsUrl = url.toString();
    
    // Hook send 方法
    const originalSend = ws.send;
    ws.send = function(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      // 记录发送的数据
      const message = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
      
      window.postMessage({
        source: 'websocket-hook',
        type: 'ws-send',
        data: {
          url: wsUrl,
          message: message,
          timestamp: Date.now(),
        }
      }, '*');
      
      return originalSend.apply(this, [data]);
    };
    
    // Hook onmessage
    const originalOnMessage = ws.onmessage;
    ws.addEventListener('message', function(event: MessageEvent) {
      const message = typeof event.data === 'string' 
        ? event.data 
        : new TextDecoder().decode(event.data);
      
      let parsedData: any = message;
      try {
        parsedData = JSON.parse(message);
      } catch (e) {
        // 不是 JSON，保持原始字符串
      }
      
      window.postMessage({
        source: 'websocket-hook',
        type: 'ws-message',
        data: {
          url: wsUrl,
          message: parsedData,
          raw: message,
          timestamp: Date.now(),
        }
      }, '*');
      
      if (originalOnMessage) {
        originalOnMessage.call(this, event);
      }
    });
    
    // 监听连接事件
    ws.addEventListener('open', function() {
      window.postMessage({
        source: 'websocket-hook',
        type: 'ws-open',
        data: {
          url: wsUrl,
          timestamp: Date.now(),
        }
      }, '*');
    });
    
    ws.addEventListener('close', function(event) {
      window.postMessage({
        source: 'websocket-hook',
        type: 'ws-close',
        data: {
          url: wsUrl,
          code: event.code,
          reason: event.reason,
          timestamp: Date.now(),
        }
      }, '*');
    });
    
    ws.addEventListener('error', function(event) {
      window.postMessage({
        source: 'websocket-hook',
        type: 'ws-error',
        data: {
          url: wsUrl,
          timestamp: Date.now(),
        }
      }, '*');
    });
    
    return ws;
  }
  
  // 保留原型
  WebSocketHook.prototype = OriginalWebSocket.prototype;
  (WebSocketHook as any).prototype.constructor = WebSocketHook;
  
  // 替换全局 WebSocket
  (window as any).WebSocket = WebSocketHook as any;
})();
```

#### 高级 WebSocket Hook（支持消息拦截和修改）

```typescript
// src/content/inject/advancedWebSocketHook.ts
interface WebSocketEvent {
  url: string;
  type: 'open' | 'close' | 'message' | 'send' | 'error';
  message?: any;
  raw?: string;
  code?: number;
  reason?: string;
  timestamp: number;
}

export class AdvancedWebSocketHook {
  private connections = new Map<number, WebSocket>();
  private events: WebSocketEvent[] = [];
  private messageInterceptors: Array<(event: WebSocketEvent) => Promise<boolean>> = [];
  private connectionIdCounter = 0;
  
  install() {
    const OriginalWebSocket = window.WebSocket;
    const self = this;
    
    function WebSocketHook(url: string | URL, protocols?: string | string[]) {
      const ws = new OriginalWebSocket(url, protocols);
      const wsUrl = url.toString();
      const connectionId = self.connectionIdCounter++;
      
      self.connections.set(connectionId, ws);
      
      // Hook send
      const originalSend = ws.send;
      ws.send = function(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        const raw = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
        let message: any = raw;
        
        try {
          message = JSON.parse(raw);
        } catch (e) {
          // 保持原始字符串
        }
        
        const event: WebSocketEvent = {
          url: wsUrl,
          type: 'send',
          message,
          raw,
          timestamp: Date.now(),
        };
        
        // 执行拦截器
        let shouldBlock = false;
        self.messageInterceptors.forEach(async (interceptor) => {
          if (await interceptor(event)) {
            shouldBlock = true;
          }
        });
        
        if (!shouldBlock) {
          self.recordEvent(event);
          self.notifyEvent(event);
          return originalSend.apply(this, [data]);
        }
        
        // 被拦截，不发送
        return;
      };
      
      // 监听消息
      ws.addEventListener('message', function(event: MessageEvent) {
        const raw = typeof event.data === 'string' 
          ? event.data 
          : new TextDecoder().decode(event.data);
        
        let message: any = raw;
        try {
          message = JSON.parse(raw);
        } catch (e) {
          // 保持原始字符串
        }
        
        const wsEvent: WebSocketEvent = {
          url: wsUrl,
          type: 'message',
          message,
          raw,
          timestamp: Date.now(),
        };
        
        self.recordEvent(wsEvent);
        self.notifyEvent(wsEvent);
      });
      
      // 监听连接事件
      ws.addEventListener('open', function() {
        const event: WebSocketEvent = {
          url: wsUrl,
          type: 'open',
          timestamp: Date.now(),
        };
        self.recordEvent(event);
        self.notifyEvent(event);
      });
      
      ws.addEventListener('close', function(closeEvent) {
        const event: WebSocketEvent = {
          url: wsUrl,
          type: 'close',
          code: closeEvent.code,
          reason: closeEvent.reason,
          timestamp: Date.now(),
        };
        self.recordEvent(event);
        self.notifyEvent(event);
        self.connections.delete(connectionId);
      });
      
      ws.addEventListener('error', function() {
        const event: WebSocketEvent = {
          url: wsUrl,
          type: 'error',
          timestamp: Date.now(),
        };
        self.recordEvent(event);
        self.notifyEvent(event);
      });
      
      return ws;
    }
    
    // 保留原型
    WebSocketHook.prototype = OriginalWebSocket.prototype;
    (WebSocketHook as any).prototype.constructor = WebSocketHook;
    
    // 替换全局对象
    (window as any).WebSocket = WebSocketHook as any;
  }
  
  addMessageInterceptor(interceptor: (event: WebSocketEvent) => Promise<boolean>) {
    this.messageInterceptors.push(interceptor);
  }
  
  private recordEvent(event: WebSocketEvent) {
    this.events.push(event);
    if (this.events.length > 2000) {
      this.events.shift();
    }
  }
  
  private notifyEvent(event: WebSocketEvent) {
    window.postMessage({
      source: 'websocket-hook',
      type: 'ws-event',
      data: event,
    }, '*');
  }
  
  getEvents(): WebSocketEvent[] {
    return [...this.events];
  }
  
  getEventsByUrl(url: string): WebSocketEvent[] {
    return this.events.filter(e => e.url === url);
  }
  
  clearEvents() {
    this.events = [];
  }
  
  getActiveConnections(): number {
    return this.connections.size;
  }
}
```

### 5. 统一 Hook 管理器

将所有 Hook 技术整合到一个统一的管理器中：

```typescript
// src/content/inject/hookManager.ts
import { AdvancedXHRHook } from './advancedXhrHook';
import { AdvancedFetchHook } from './advancedFetchHook';
import { AdvancedWebSocketHook } from './advancedWebSocketHook';

export class HookManager {
  private xhrHook: AdvancedXHRHook;
  private fetchHook: AdvancedFetchHook;
  private wsHook: AdvancedWebSocketHook;
  private isInstalled = false;
  
  constructor() {
    this.xhrHook = new AdvancedXHRHook();
    this.fetchHook = new AdvancedFetchHook();
    this.wsHook = new AdvancedWebSocketHook();
  }
  
  install() {
    if (this.isInstalled) {
      console.warn('Hooks already installed');
      return;
    }
    
    this.xhrHook.install();
    this.fetchHook.install();
    this.wsHook.install();
    
    this.isInstalled = true;
    console.log('All hooks installed successfully');
  }
  
  uninstall() {
    // 注意：一旦替换了原生对象，很难完全恢复
    // 通常需要刷新页面
    console.warn('To uninstall hooks, please reload the page');
    this.isInstalled = false;
  }
  
  getXHRHook(): AdvancedXHRHook {
    return this.xhrHook;
  }
  
  getFetchHook(): AdvancedFetchHook {
    return this.fetchHook;
  }
  
  getWebSocketHook(): AdvancedWebSocketHook {
    return this.wsHook;
  }
  
  getAllEvents() {
    return {
      xhr: this.xhrHook.getEvents(),
      fetch: this.fetchHook.getEvents(),
      websocket: this.wsHook.getEvents(),
    };
  }
  
  clearAllEvents() {
    this.xhrHook.clearEvents();
    this.fetchHook.clearEvents();
    this.wsHook.clearEvents();
  }
}

// 创建全局实例
(window as any).__HOOK_MANAGER__ = new HookManager();
```

### 6. Content Script 集成

在 Content Script 中监听 Hook 发送的消息：

```typescript
// src/content/index.ts
import { MessageClient } from '@/shared/utils/messaging';
import { MessageType } from '@/shared/types/message';

interface HookEvent {
  source: string;
  type: string;
  data: any;
}

class HookListener {
  private eventBuffer: HookEvent[] = [];
  private bufferSize = 100;
  private flushInterval = 1000; // 每秒刷新一次
  
  constructor() {
    this.startListening();
    this.startFlushTimer();
  }
  
  private startListening() {
    window.addEventListener('message', (event: MessageEvent) => {
      // 只处理来自页面的消息
      if (event.source !== window) return;
      
      const data = event.data;
      if (data.source && (
        data.source === 'xhr-hook' ||
        data.source === 'fetch-hook' ||
        data.source === 'websocket-hook'
      )) {
        this.eventBuffer.push(data);
        
        // 缓冲区满了，立即刷新
        if (this.eventBuffer.length >= this.bufferSize) {
          this.flush();
        }
      }
    });
  }
  
  private startFlushTimer() {
    setInterval(() => {
      if (this.eventBuffer.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
  }
  
  private async flush() {
    if (this.eventBuffer.length === 0) return;
    
    const events = [...this.eventBuffer];
    this.eventBuffer = [];
    
    try {
      // 发送到 Background
      await MessageClient.send(MessageType.STORE_HOOK_EVENTS, { events });
      
      // 可选：发送到 Popup/SidePanel 实时显示
      chrome.runtime.sendMessage({
        type: 'hook-events',
        events: events,
      }).catch(() => {
        // Popup 可能未打开，忽略错误
      });
    } catch (error) {
      console.error('Failed to send hook events:', error);
      // 失败则重新加入缓冲区
      this.eventBuffer.unshift(...events);
    }
  }
  
  // 立即刷新（用于手动触发）
  flushNow() {
    this.flush();
  }
}

// 注入 Hook 脚本
function injectHookScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject/hooks.js');
  script.onload = function() {
    // 初始化 Hook Manager
    (window as any).__HOOK_MANAGER__?.install();
  };
  document.documentElement.appendChild(script);
}

// 初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    injectHookScript();
    new HookListener();
  });
} else {
  injectHookScript();
  new HookListener();
}
```

### 7. Background 数据存储

在 Background 中存储和管理 Hook 数据：

```typescript
// src/background/hookStorage.ts
import { Storage } from '@/shared/utils/storage';

interface StoredHookEvent {
  id: string;
  source: 'xhr' | 'fetch' | 'websocket';
  type: string;
  data: any;
  timestamp: number;
  url?: string;
}

export class HookStorage {
  private storage: Storage;
  private maxEvents = 10000;
  
  constructor() {
    this.storage = new Storage('local');
  }
  
  async storeEvents(events: any[]) {
    const storedEvents: StoredHookEvent[] = events.map(event => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source: this.getSource(event.source),
      type: event.type,
      data: event.data,
      timestamp: event.data.timestamp || Date.now(),
      url: event.data.url,
    }));
    
    // 获取现有事件
    const existingEvents = await this.storage.get<StoredHookEvent[]>('hook_events') || [];
    
    // 合并并限制数量
    const allEvents = [...storedEvents, ...existingEvents]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.maxEvents);
    
    await this.storage.set('hook_events', allEvents);
  }
  
  async getEvents(filters?: {
    source?: 'xhr' | 'fetch' | 'websocket';
    url?: string;
    startTime?: number;
    endTime?: number;
  }): Promise<StoredHookEvent[]> {
    const events = await this.storage.get<StoredHookEvent[]>('hook_events') || [];
    
    if (!filters) return events;
    
    return events.filter(event => {
      if (filters.source && event.source !== filters.source) return false;
      if (filters.url && event.url && !event.url.includes(filters.url)) return false;
      if (filters.startTime && event.timestamp < filters.startTime) return false;
      if (filters.endTime && event.timestamp > filters.endTime) return false;
      return true;
    });
  }
  
  async searchEvents(keyword: string): Promise<StoredHookEvent[]> {
    const events = await this.getEvents();
    const lowerKeyword = keyword.toLowerCase();
    
    return events.filter(event => {
      const dataStr = JSON.stringify(event.data).toLowerCase();
      return dataStr.includes(lowerKeyword);
    });
  }
  
  async clearEvents() {
    await this.storage.set('hook_events', []);
  }
  
  async getStatistics(): Promise<{
    total: number;
    bySource: Record<string, number>;
    byUrl: Record<string, number>;
  }> {
    const events = await this.getEvents();
    
    const bySource: Record<string, number> = {};
    const byUrl: Record<string, number> = {};
    
    events.forEach(event => {
      bySource[event.source] = (bySource[event.source] || 0) + 1;
      if (event.url) {
        const domain = new URL(event.url).hostname;
        byUrl[domain] = (byUrl[domain] || 0) + 1;
      }
    });
    
    return {
      total: events.length,
      bySource,
      byUrl,
    };
  }
  
  private getSource(source: string): 'xhr' | 'fetch' | 'websocket' {
    if (source.includes('xhr')) return 'xhr';
    if (source.includes('fetch')) return 'fetch';
    if (source.includes('websocket')) return 'websocket';
    return 'xhr'; // 默认
  }
}

export const hookStorage = new HookStorage();

// 注册消息处理器
import { router } from './router';
import { MessageType } from '@/shared/types/message';

router.register(MessageType.STORE_HOOK_EVENTS, async (message) => {
  await hookStorage.storeEvents(message.payload.events);
  return { success: true };
});

router.register(MessageType.GET_HOOK_EVENTS, async (message) => {
  const events = await hookStorage.getEvents(message.payload?.filters);
  return events;
});

router.register(MessageType.SEARCH_HOOK_EVENTS, async (message) => {
  const events = await hookStorage.searchEvents(message.payload.keyword);
  return events;
});

router.register(MessageType.GET_HOOK_STATISTICS, async () => {
  const stats = await hookStorage.getStatistics();
  return stats;
});
```

## 📝 第二部分总结

第二部分介绍了：
- WebSocket 劫持技术（基础版和高级版）
- 统一 Hook 管理器的设计
- Content Script 集成方案
- Background 数据存储和查询

接下来第三部分将介绍：
- 数据过滤和搜索功能
- 实时数据监控 UI
- 实战案例应用

---

## 🎨 第三部分：数据过滤、搜索与实战应用

### 8. 数据过滤和搜索功能

#### 高级过滤器实现

```typescript
// src/shared/utils/eventFilter.ts
export interface FilterOptions {
  sources?: ('xhr' | 'fetch' | 'websocket')[];
  urlPattern?: string;
  method?: string;
  statusCode?: number | { min?: number; max?: number };
  timeRange?: { start: number; end: number };
  keyword?: string;
  contentType?: string;
}

export class EventFilter {
  static filter<T extends { source?: string; url?: string; method?: string; status?: number; timestamp?: number; data?: any }>(
    events: T[],
    options: FilterOptions
  ): T[] {
    return events.filter(event => {
      // 过滤来源
      if (options.sources && event.source && !options.sources.includes(event.source as any)) {
        return false;
      }
      
      // 过滤 URL 模式
      if (options.urlPattern && event.url) {
        const regex = new RegExp(options.urlPattern, 'i');
        if (!regex.test(event.url)) {
          return false;
        }
      }
      
      // 过滤方法
      if (options.method && event.method && event.method.toUpperCase() !== options.method.toUpperCase()) {
        return false;
      }
      
      // 过滤状态码
      if (options.statusCode && event.status !== undefined) {
        if (typeof options.statusCode === 'number') {
          if (event.status !== options.statusCode) return false;
        } else {
          if (options.statusCode.min !== undefined && event.status < options.statusCode.min) return false;
          if (options.statusCode.max !== undefined && event.status > options.statusCode.max) return false;
        }
      }
      
      // 过滤时间范围
      if (options.timeRange && event.timestamp) {
        if (options.timeRange.start && event.timestamp < options.timeRange.start) return false;
        if (options.timeRange.end && event.timestamp > options.timeRange.end) return false;
      }
      
      // 关键词搜索
      if (options.keyword) {
        const searchText = JSON.stringify(event.data || event).toLowerCase();
        if (!searchText.includes(options.keyword.toLowerCase())) {
          return false;
        }
      }
      
      // 过滤内容类型
      if (options.contentType && event.data) {
        const headers = event.data.headers || event.data.responseHeaders || {};
        const contentType = headers['content-type'] || headers['Content-Type'] || '';
        if (!contentType.includes(options.contentType)) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  // 快速过滤器（链式调用）
  static create<T extends any>() {
    return new FilterBuilder<T>();
  }
}

class FilterBuilder<T> {
  private filters: Array<(event: T) => boolean> = [];
  
  bySource(sources: ('xhr' | 'fetch' | 'websocket')[]) {
    this.filters.push(event => {
      const source = (event as any).source;
      return !sources || sources.includes(source);
    });
    return this;
  }
  
  byUrl(pattern: string | RegExp) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    this.filters.push(event => {
      const url = (event as any).url || (event as any).data?.url;
      return !url || regex.test(url);
    });
    return this;
  }
  
  byMethod(method: string) {
    const upperMethod = method.toUpperCase();
    this.filters.push(event => {
      const eventMethod = (event as any).method || (event as any).data?.method;
      return !eventMethod || eventMethod.toUpperCase() === upperMethod;
    });
    return this;
  }
  
  byStatusCode(status: number | { min?: number; max?: number }) {
    this.filters.push(event => {
      const eventStatus = (event as any).status || (event as any).data?.status;
      if (eventStatus === undefined) return false;
      
      if (typeof status === 'number') {
        return eventStatus === status;
      } else {
        if (status.min !== undefined && eventStatus < status.min) return false;
        if (status.max !== undefined && eventStatus > status.max) return false;
        return true;
      }
    });
    return this;
  }
  
  byKeyword(keyword: string) {
    const lowerKeyword = keyword.toLowerCase();
    this.filters.push(event => {
      const text = JSON.stringify(event).toLowerCase();
      return text.includes(lowerKeyword);
    });
    return this;
  }
  
  byTimeRange(start: number, end: number) {
    this.filters.push(event => {
      const timestamp = (event as any).timestamp || (event as any).data?.timestamp;
      if (!timestamp) return false;
      return timestamp >= start && timestamp <= end;
    });
    return this;
  }
  
  apply(events: T[]): T[] {
    return events.filter(event => {
      return this.filters.every(filter => filter(event));
    });
  }
}
```

#### 搜索功能增强

```typescript
// src/shared/utils/eventSearch.ts
export class EventSearch {
  // 全文搜索（支持 JSON 路径）
  static fullTextSearch<T>(events: T[], query: string): T[] {
    if (!query.trim()) return events;
    
    const lowerQuery = query.toLowerCase();
    const keywords = lowerQuery.split(/\s+/).filter(k => k.length > 0);
    
    return events.filter(event => {
      const searchableText = this.extractSearchableText(event);
      return keywords.every(keyword => searchableText.includes(keyword));
    });
  }
  
  // 提取可搜索文本（递归遍历对象）
  private static extractSearchableText(obj: any, depth = 0): string {
    if (depth > 5) return ''; // 防止无限递归
    
    if (obj === null || obj === undefined) return '';
    if (typeof obj === 'string') return obj.toLowerCase();
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj).toLowerCase();
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.extractSearchableText(item, depth + 1)).join(' ');
    }
    
    if (typeof obj === 'object') {
      return Object.values(obj)
        .map(value => this.extractSearchableText(value, depth + 1))
        .join(' ');
    }
    
    return '';
  }
  
  // JSON 路径搜索（如 "data.user.name"）
  static pathSearch<T>(events: T[], path: string, value: any): T[] {
    const pathParts = path.split('.');
    
    return events.filter(event => {
      let current: any = event;
      
      for (const part of pathParts) {
        if (current === null || current === undefined) return false;
        current = current[part];
      }
      
      if (typeof value === 'string') {
        return String(current).toLowerCase().includes(value.toLowerCase());
      }
      
      return current === value;
    });
  }
  
  // 模糊匹配
  static fuzzySearch<T>(events: T[], query: string, threshold = 0.6): T[] {
    const lowerQuery = query.toLowerCase();
    
    return events.filter(event => {
      const text = JSON.stringify(event).toLowerCase();
      const similarity = this.calculateSimilarity(text, lowerQuery);
      return similarity >= threshold;
    });
  }
  
  // 简单的相似度计算（Levenshtein 距离的归一化）
  private static calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }
  
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
}
```

### 9. 实时数据监控 UI

#### Vue 组件：数据监控面板

```vue
<!-- src/sidepanel/components/HookMonitor.vue -->
<template>
  <div class="hook-monitor">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="filters">
        <select v-model="filterSource" @change="applyFilters">
          <option value="">所有来源</option>
          <option value="xhr">XHR</option>
          <option value="fetch">Fetch</option>
          <option value="websocket">WebSocket</option>
        </select>
        
        <input 
          v-model="searchKeyword" 
          @input="applyFilters"
          placeholder="搜索关键词..."
          class="search-input"
        />
        
        <input 
          v-model="urlFilter" 
          @input="applyFilters"
          placeholder="URL 过滤..."
          class="url-input"
        />
        
        <button @click="clearEvents" class="btn-clear">清空</button>
      </div>
      
      <div class="stats">
        <span>总计: {{ totalEvents }}</span>
        <span>显示: {{ filteredEvents.length }}</span>
        <span>XHR: {{ stats.xhr }}</span>
        <span>Fetch: {{ stats.fetch }}</span>
        <span>WS: {{ stats.websocket }}</span>
      </div>
    </div>
    
    <!-- 事件列表 -->
    <div class="event-list">
      <div 
        v-for="event in filteredEvents" 
        :key="event.id"
        :class="['event-item', `event-${event.source}`]"
        @click="selectEvent(event)"
      >
        <div class="event-header">
          <span class="event-source">{{ event.source.toUpperCase() }}</span>
          <span class="event-type">{{ event.type }}</span>
          <span class="event-time">{{ formatTime(event.timestamp) }}</span>
        </div>
        
        <div class="event-url" :title="event.url">
          {{ truncateUrl(event.url) }}
        </div>
        
        <div v-if="event.data?.method" class="event-method">
          {{ event.data.method }}
        </div>
        
        <div v-if="event.data?.status" class="event-status" :class="getStatusClass(event.data.status)">
          {{ event.data.status }}
        </div>
      </div>
      
      <div v-if="filteredEvents.length === 0" class="empty-state">
        暂无数据
      </div>
    </div>
    
    <!-- 详情面板 -->
    <div v-if="selectedEvent" class="detail-panel">
      <div class="detail-header">
        <h3>事件详情</h3>
        <button @click="selectedEvent = null" class="btn-close">×</button>
      </div>
      
      <div class="detail-content">
        <pre>{{ formatEventData(selectedEvent) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { MessageClient } from '@/shared/utils/messaging';
import { MessageType } from '@/shared/types/message';
import { EventFilter } from '@/shared/utils/eventFilter';
import { EventSearch } from '@/shared/utils/eventSearch';

interface HookEvent {
  id: string;
  source: 'xhr' | 'fetch' | 'websocket';
  type: string;
  data: any;
  timestamp: number;
  url?: string;
}

const events = ref<HookEvent[]>([]);
const filterSource = ref('');
const searchKeyword = ref('');
const urlFilter = ref('');
const selectedEvent = ref<HookEvent | null>(null);

const stats = computed(() => {
  const s = { xhr: 0, fetch: 0, websocket: 0 };
  events.value.forEach(e => {
    s[e.source]++;
  });
  return s;
});

const totalEvents = computed(() => events.value.length);

const filteredEvents = computed(() => {
  let result = [...events.value];
  
  // 应用过滤器
  if (filterSource.value) {
    result = EventFilter.filter(result, { sources: [filterSource.value as any] });
  }
  
  if (urlFilter.value) {
    result = EventFilter.filter(result, { urlPattern: urlFilter.value });
  }
  
  if (searchKeyword.value) {
    result = EventSearch.fullTextSearch(result, searchKeyword.value);
  }
  
  // 按时间倒序
  return result.sort((a, b) => b.timestamp - a.timestamp);
});

async function loadEvents() {
  try {
    const loadedEvents = await MessageClient.send<HookEvent[]>(MessageType.GET_HOOK_EVENTS);
    events.value = loadedEvents || [];
  } catch (error) {
    console.error('Failed to load events:', error);
  }
}

function applyFilters() {
  // 计算属性会自动更新
}

async function clearEvents() {
  try {
    await MessageClient.send(MessageType.CLEAR_HOOK_EVENTS);
    events.value = [];
  } catch (error) {
    console.error('Failed to clear events:', error);
  }
}

function selectEvent(event: HookEvent) {
  selectedEvent.value = event;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

function truncateUrl(url?: string): string {
  if (!url) return '';
  if (url.length > 60) {
    return url.substring(0, 57) + '...';
  }
  return url;
}

function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return 'status-success';
  if (status >= 300 && status < 400) return 'status-redirect';
  if (status >= 400) return 'status-error';
  return '';
}

function formatEventData(event: HookEvent): string {
  return JSON.stringify(event.data, null, 2);
}

// 实时更新
let updateInterval: number | null = null;

onMounted(() => {
  loadEvents();
  // 每2秒刷新一次
  updateInterval = window.setInterval(loadEvents, 2000);
  
  // 监听实时事件
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'hook-events') {
      loadEvents();
    }
  });
});

onUnmounted(() => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
});
</script>

<style scoped>
.hook-monitor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: system-ui, -apple-system, sans-serif;
}

.toolbar {
  padding: 12px;
  border-bottom: 1px solid #e0e0e0;
  background: #f5f5f5;
}

.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.search-input,
.url-input {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.btn-clear {
  padding: 6px 12px;
  background: #ff4444;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.stats {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #666;
}

.event-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.event-item {
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.event-item:hover {
  background: #f5f5f5;
}

.event-xhr {
  border-left: 4px solid #2196F3;
}

.event-fetch {
  border-left: 4px solid #4CAF50;
}

.event-websocket {
  border-left: 4px solid #FF9800;
}

.event-header {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
}

.event-source {
  font-weight: bold;
  color: #666;
}

.event-type {
  color: #999;
}

.event-time {
  margin-left: auto;
  color: #999;
}

.event-url {
  font-size: 13px;
  color: #333;
  word-break: break-all;
  margin-bottom: 4px;
}

.event-method {
  display: inline-block;
  padding: 2px 6px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 2px;
  font-size: 11px;
  margin-right: 8px;
}

.event-status {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 2px;
  font-size: 11px;
  font-weight: bold;
}

.status-success {
  background: #c8e6c9;
  color: #2e7d32;
}

.status-redirect {
  background: #fff9c4;
  color: #f57f17;
}

.status-error {
  background: #ffcdd2;
  color: #c62828;
}

.detail-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 500px;
  height: 100vh;
  background: white;
  box-shadow: -2px 0 8px rgba(0,0,0,0.1);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.detail-header {
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
}

.detail-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.detail-content pre {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 4px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #999;
}
</style>
```

### 10. 实战案例应用

#### 案例一：B站直播弹幕监控

```typescript
// src/content/inject/bilibiliDanmakuHook.ts
export class BilibiliDanmakuHook {
  private wsHook: AdvancedWebSocketHook;
  
  constructor() {
    this.wsHook = new AdvancedWebSocketHook();
    this.setupFilters();
  }
  
  install() {
    this.wsHook.install();
  }
  
  private setupFilters() {
    // 只监听 B站 WebSocket
    this.wsHook.addMessageInterceptor(async (event) => {
      if (!event.url || !event.url.includes('live-bilibili')) {
        return false; // 不过滤，继续处理
      }
      
      // 解析弹幕数据（B站协议）
      if (event.type === 'message' && event.message) {
        const danmaku = this.parseDanmaku(event.message);
        if (danmaku) {
          // 发送到插件
          chrome.runtime.sendMessage({
            type: 'bilibili-danmaku',
            data: danmaku,
          });
        }
      }
      
      return false; // 不拦截，让原始消息继续
    });
  }
  
  private parseDanmaku(message: any): any {
    // B站 WebSocket 使用自定义协议
    // 这里简化处理，实际需要根据 B站协议解析
    try {
      if (typeof message === 'object' && message.cmd) {
        if (message.cmd === 'DANMU_MSG') {
          return {
            type: 'danmaku',
            user: message.info[2][1],
            text: message.info[1],
            timestamp: Date.now(),
          };
        }
        if (message.cmd === 'SEND_GIFT') {
          return {
            type: 'gift',
            user: message.data.uname,
            gift: message.data.giftName,
            count: message.data.num,
            timestamp: Date.now(),
          };
        }
      }
    } catch (e) {
      console.error('Failed to parse danmaku:', e);
    }
    return null;
  }
}

// 在 B站页面注入
if (window.location.hostname.includes('live.bilibili.com')) {
  const hook = new BilibiliDanmakuHook();
  hook.install();
}
```

#### 案例二：小红书数据采集

```typescript
// src/content/inject/xiaohongshuHook.ts
export class XiaohongshuHook {
  private fetchHook: AdvancedFetchHook;
  
  constructor() {
    this.fetchHook = new AdvancedFetchHook();
    this.setupFilters();
  }
  
  install() {
    this.fetchHook.install();
  }
  
  private setupFilters() {
    // 监听小红书 API 请求
    this.fetchHook.addInterceptor(async (event) => {
      if (!event.url || !event.url.includes('edith.xiaohongshu.com')) {
        return false; // 不过滤
      }
      
      // 提取数据
      if (event.method === 'POST' && event.requestBody) {
        // 笔记列表、详情等 API
        const apiType = this.detectApiType(event.url);
        
        if (apiType) {
          chrome.runtime.sendMessage({
            type: 'xiaohongshu-data',
            apiType,
            url: event.url,
            request: event.requestBody,
          });
        }
      }
      
      return false;
    });
  }
  
  private detectApiType(url: string): string | null {
    if (url.includes('/api/sns/web/v1/feed')) return 'feed';
    if (url.includes('/api/sns/web/v1/note')) return 'note';
    if (url.includes('/api/sns/web/v1/user')) return 'user';
    if (url.includes('/api/sns/web/v1/search')) return 'search';
    return null;
  }
}

// Content Script 中处理响应数据
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'xiaohongshu-data') {
    // 从 Hook 事件中提取响应数据
    // 这里需要在 Hook 事件中找到对应的响应
    handleXiaohongshuData(message);
  }
});

async function handleXiaohongshuData(message: any) {
  // 获取对应的响应数据（需要在 Hook Storage 中查找）
  const events = await MessageClient.send(MessageType.GET_HOOK_EVENTS, {
    filters: { url: message.url }
  });
  
  const latestEvent = events[0];
  if (latestEvent && latestEvent.data?.responseBody) {
    const data = latestEvent.data.responseBody;
    
    // 提取笔记数据
    if (message.apiType === 'feed' && data.data?.items) {
      const notes = data.data.items.map((item: any) => ({
        id: item.id,
        title: item.note_card?.display_title,
        desc: item.note_card?.desc,
        images: item.note_card?.image_list?.map((img: any) => img.url),
        author: item.note_card?.user?.nickname,
        likes: item.note_card?.interact_info?.liked_count,
      }));
      
      // 保存到插件存储
      chrome.runtime.sendMessage({
        type: 'save-xiaohongshu-notes',
        notes,
      });
    }
  }
}
```

#### 案例三：通用 API 数据监控面板

```typescript
// src/shared/utils/apiMonitor.ts
export class APIMonitor {
  private endpoints = new Map<string, {
    url: string;
    method: string;
    count: number;
    lastCall: number;
    avgResponseTime: number;
    errors: number;
  }>();
  
  async analyzeEvents() {
    const events = await MessageClient.send(MessageType.GET_HOOK_EVENTS);
    
    // 按 URL 和 Method 分组统计
    events.forEach(event => {
      const key = `${event.data?.method || 'GET'}:${event.url}`;
      const stats = this.endpoints.get(key) || {
        url: event.url || '',
        method: event.data?.method || 'GET',
        count: 0,
        lastCall: 0,
        avgResponseTime: 0,
        errors: 0,
      };
      
      stats.count++;
      stats.lastCall = Math.max(stats.lastCall, event.timestamp);
      
      if (event.data?.status && event.data.status >= 400) {
        stats.errors++;
      }
      
      this.endpoints.set(key, stats);
    });
    
    return Array.from(this.endpoints.values())
      .sort((a, b) => b.count - a.count);
  }
  
  getTopEndpoints(limit = 10) {
    const stats = Array.from(this.endpoints.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    
    return stats;
  }
  
  getErrorRate() {
    const total = Array.from(this.endpoints.values())
      .reduce((sum, stat) => sum + stat.count, 0);
    
    const errors = Array.from(this.endpoints.values())
      .reduce((sum, stat) => sum + stat.errors, 0);
    
    return total > 0 ? (errors / total) * 100 : 0;
  }
}
```

## 📝 第三部分总结

第三部分介绍了：
- 高级数据过滤和搜索功能（过滤器、全文搜索、模糊匹配）
- 实时数据监控 UI（Vue 组件完整实现）
- 实战案例应用（B站弹幕、小红书数据采集、通用 API 监控）

## 🔗 完整章节总结

本章全面介绍了数据嗅探与 Hook 技术：
1. **XHR/Fetch/WebSocket 劫持**：掌握三大网络通信方式的拦截技术
2. **统一架构设计**：Hook Manager、Storage、Filter、Search 完整体系
3. **实战应用**：真实场景下的数据采集和监控

## ⚠️ 注意事项

- Hook 技术可能影响页面性能，建议在生产环境谨慎使用
- 某些网站可能会检测 Hook，需要做反检测处理
- 遵守相关法律法规，不要用于非法用途
- 注意数据隐私和安全

## 🔗 扩展阅读

- [MDN: XMLHttpRequest](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest)
- [MDN: Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [MDN: WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
