# 03. 完美通信架构：Message Passing 设计模式

## 📚 学习目标

- 理解 Chrome Extension 的消息传递机制
- 设计统一的通信架构
- 掌握长连接与短连接的使用场景
- 实现跨域通信解决方案

## 🎯 核心知识点

### 1. Chrome Extension 通信架构

Chrome Extension 的通信涉及多个上下文：

```
┌─────────────┐
│   Popup     │
└──────┬──────┘
       │ sendMessage
       ▼
┌─────────────┐      ┌──────────────┐
│  Background │◄─────┤ Content Script│
│ (Service    │      │  (Isolated)  │
│  Worker)    │      └──────────────┘
└─────────────┘
       │
       │ connect (长连接)
       ▼
┌─────────────┐
│   Web Page  │
└─────────────┘
```

### 2. 统一 Router 设计

#### 消息类型定义

```typescript
// src/shared/types/message.ts
export enum MessageType {
  // 通用
  PING = 'ping',
  PONG = 'pong',
  
  // 数据操作
  GET_STORAGE = 'get_storage',
  SET_STORAGE = 'set_storage',
  
  // 页面操作
  INJECT_SCRIPT = 'inject_script',
  GET_PAGE_DATA = 'get_page_data',
  
  // 网络请求
  FETCH_DATA = 'fetch_data',
}

export interface Message<T = any> {
  type: MessageType;
  payload?: T;
  requestId?: string;
}

export interface MessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
}
```

#### Background Router 实现

```typescript
// src/background/router.ts
import { Message, MessageType, MessageResponse } from '@/shared/types/message';

type MessageHandler = (
  message: Message,
  sender: chrome.runtime.MessageSender
) => Promise<any> | any;

class MessageRouter {
  private handlers = new Map<MessageType, MessageHandler>();

  register(type: MessageType, handler: MessageHandler) {
    this.handlers.set(type, handler);
  }

  async handle(message: Message, sender: chrome.runtime.MessageSender): Promise<MessageResponse> {
    const handler = this.handlers.get(message.type);
    
    if (!handler) {
      return {
        success: false,
        error: `Unknown message type: ${message.type}`,
        requestId: message.requestId,
      };
    }

    try {
      const data = await handler(message, sender);
      return {
        success: true,
        data,
        requestId: message.requestId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: message.requestId,
      };
    }
  }
}

// 创建全局路由实例
export const router = new MessageRouter();

// 注册消息监听
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  router.handle(message, sender).then(sendResponse);
  return true; // 保持通道开放以支持异步响应
});
```

#### 注册处理器

```typescript
// src/background/handlers/index.ts
import { router } from '../router';
import { MessageType } from '@/shared/types/message';

// 存储操作
router.register(MessageType.GET_STORAGE, async (message) => {
  const { key } = message.payload;
  const result = await chrome.storage.local.get(key);
  return result[key];
});

router.register(MessageType.SET_STORAGE, async (message) => {
  const { key, value } = message.payload;
  await chrome.storage.local.set({ [key]: value });
  return { success: true };
});

// 页面数据获取
router.register(MessageType.GET_PAGE_DATA, async (message, sender) => {
  if (!sender.tab?.id) {
    throw new Error('No tab ID');
  }
  
  const results = await chrome.scripting.executeScript({
    target: { tabId: sender.tab.id },
    func: () => {
      return {
        url: window.location.href,
        title: document.title,
        // 获取页面数据
        data: (window as any).__INITIAL_STATE__,
      };
    },
  });
  
  return results[0].result;
});
```

### 3. 客户端封装

#### 统一消息发送器

```typescript
// src/shared/utils/messaging.ts
import { Message, MessageType, MessageResponse } from '@/shared/types/message';

export class MessageClient {
  private static generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static async send<T = any>(
    type: MessageType,
    payload?: any
  ): Promise<T> {
    const requestId = this.generateRequestId();
    const message: Message = { type, payload, requestId };

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: MessageResponse<T>) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response.success) {
          resolve(response.data as T);
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      });
    });
  }

  // 带超时的发送
  static async sendWithTimeout<T = any>(
    type: MessageType,
    payload?: any,
    timeout = 5000
  ): Promise<T> {
    return Promise.race([
      this.send<T>(type, payload),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      ),
    ]);
  }
}
```

#### 使用示例

```typescript
// src/popup/components/DataView.vue
import { MessageClient } from '@/shared/utils/messaging';
import { MessageType } from '@/shared/types/message';

async function loadData() {
  try {
    const data = await MessageClient.send(MessageType.GET_PAGE_DATA);
    console.log('Page data:', data);
  } catch (error) {
    console.error('Failed to load data:', error);
  }
}
```

### 4. 长连接 vs 短连接

#### 短连接（sendMessage）

**适用场景：**
- 一次性请求/响应
- 不需要持续通信
- 简单数据交换

```typescript
// 短连接示例
const response = await MessageClient.send(MessageType.GET_STORAGE, { key: 'user' });
```

#### 长连接（connect）

**适用场景：**
- 需要双向持续通信
- 实时数据流
- 保持状态同步

```typescript
// src/shared/utils/longConnection.ts
export class LongConnection {
  private port: chrome.runtime.Port | null = null;
  private listeners: Map<string, Function[]> = new Map();

  connect(name: string) {
    this.port = chrome.runtime.connect({ name });
    
    this.port.onMessage.addListener((message: Message) => {
      const handlers = this.listeners.get(message.type) || [];
      handlers.forEach(handler => handler(message.payload));
    });

    this.port.onDisconnect.addListener(() => {
      this.port = null;
      // 自动重连
      setTimeout(() => this.connect(name), 1000);
    });
  }

  on(type: MessageType, handler: Function) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(handler);
  }

  post(type: MessageType, payload?: any) {
    if (this.port) {
      this.port.postMessage({ type, payload });
    }
  }
}
```

#### Background 端长连接处理

```typescript
// src/background/connections.ts
const connections = new Map<number, chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  const tabId = port.sender?.tab?.id;
  if (tabId) {
    connections.set(tabId, port);
  }

  port.onMessage.addListener((message: Message) => {
    router.handle(message, port.sender as chrome.runtime.MessageSender)
      .then(response => port.postMessage(response));
  });

  port.onDisconnect.addListener(() => {
    if (tabId) {
      connections.delete(tabId);
    }
  });
});

// 主动推送消息
export function broadcastToTabs(type: MessageType, payload?: any) {
  connections.forEach(port => {
    port.postMessage({ type, payload });
  });
}
```

### 5. 跨域通信

#### Extension ↔ Web Page

```typescript
// Content Script 注入通信桥接
function injectBridge() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      window.__EXTENSION_BRIDGE__ = {
        send: (message, callback) => {
          window.postMessage({
            source: 'extension-bridge',
            message: message
          }, '*');
          
          window.addEventListener('message', function handler(event) {
            if (event.data.source === 'extension-response') {
              callback(event.data.message);
              window.removeEventListener('message', handler);
            }
          });
        }
      };
    })();
  `;
  document.documentElement.appendChild(script);
  script.remove();
}

// Content Script 监听
window.addEventListener('message', (event) => {
  if (event.data.source === 'extension-bridge') {
    MessageClient.send(event.data.message.type, event.data.message.payload)
      .then(data => {
        window.postMessage({
          source: 'extension-response',
          message: { success: true, data }
        }, '*');
      });
  }
});
```

#### Extension ↔ Iframe

```typescript
// 在 iframe 中
const iframe = document.createElement('iframe');
iframe.src = chrome.runtime.getURL('iframe.html');
document.body.appendChild(iframe);

iframe.onload = () => {
  iframe.contentWindow!.postMessage(
    { type: 'init', payload: 'data' },
    chrome.runtime.getURL('')
  );
};

// iframe.html 中
window.addEventListener('message', (event) => {
  if (event.origin !== chrome.runtime.getURL('').slice(0, -1)) return;
  
  // 处理消息
  chrome.runtime.sendMessage(event.data);
});
```

## 🛠️ 实战练习

### 练习 1：实现消息队列

```typescript
// src/shared/utils/messageQueue.ts
export class MessageQueue {
  private queue: Array<{ message: Message; resolve: Function; reject: Function }> = [];
  private processing = false;

  async enqueue(message: Message): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ message, resolve, reject });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const { message, resolve, reject } = this.queue.shift()!;
    
    try {
      const response = await MessageClient.send(message.type, message.payload);
      resolve(response);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      this.process();
    }
  }
}
```

### 练习 2：实现消息重试机制

```typescript
// src/shared/utils/messaging.ts (扩展)
static async sendWithRetry<T = any>(
  type: MessageType,
  payload?: any,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await this.send<T>(type, payload);
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError!;
}
```

## 📝 总结

- 统一 Router 模式简化消息处理逻辑
- 短连接适合一次性请求，长连接适合持续通信
- 跨域通信需要桥接层，注意安全性
- 消息队列和重试机制提升可靠性

## 🔗 扩展阅读

- [Chrome Extension 消息传递](https://developer.chrome.com/docs/extensions/mv3/messaging/)
- [Port 长连接最佳实践](https://developer.chrome.com/docs/extensions/mv3/messaging/#connect)

