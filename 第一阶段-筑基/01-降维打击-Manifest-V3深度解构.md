# 01. 降维打击：Manifest V3 深度解构

## 📚 学习目标

- 深入理解 Manifest V3 的核心架构
- 掌握 Service Worker 的保活机制
- 理解 Content Script 的隔离机制
- 熟悉三大入口的使用场景

## 🎯 核心知识点

### 1. Manifest V3 架构概览

Manifest V3 是 Chrome 扩展的新标准，相比 V2 有以下重大变化：

- **Background Script → Service Worker**：从持久化后台脚本变为事件驱动的 Service Worker
- **更严格的 CSP**：禁止内联脚本，必须使用外部文件
- **更安全的权限模型**：最小权限原则

### 2. Service Worker 的"短命"特性与保活方案

#### 问题：Service Worker 会自动休眠

Service Worker 在以下情况会被终止：
- 30秒无活动
- 所有消息端口关闭
- 没有打开的扩展页面

#### 解决方案一：定期心跳

```javascript
// background.js
let heartbeatInterval;

function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    // 发送消息保持活跃
    chrome.runtime.sendMessage({ type: 'heartbeat' }).catch(() => {});
  }, 20000); // 每20秒一次
}

chrome.runtime.onStartup.addListener(() => {
  startHeartbeat();
});

chrome.runtime.onInstalled.addListener(() => {
  startHeartbeat();
});
```

#### 解决方案二：长连接保活

```javascript
// background.js
const connections = new Set();

chrome.runtime.onConnect.addListener((port) => {
  connections.add(port);
  
  port.onDisconnect.addListener(() => {
    connections.delete(port);
  });
});

// 定期发送消息保持连接
setInterval(() => {
  connections.forEach(port => {
    try {
      port.postMessage({ type: 'keepalive' });
    } catch (e) {}
  });
}, 25000);
```

#### 解决方案三：Alarms API

```javascript
// background.js
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // 执行一些轻量操作保持活跃
    chrome.storage.local.get('lastActive', () => {});
  }
});
```

### 3. Content Script 与页面的隔离墙（World 概念）

#### ISOLATED WORLD（隔离世界）

Content Script 运行在隔离的世界中，无法直接访问页面的 JavaScript 变量。

```javascript
// content.js
// ❌ 无法直接访问
console.log(window.vue); // undefined

// ✅ 需要通过 DOM 注入
const script = document.createElement('script');
script.textContent = `
  window.__PLUGIN_DATA__ = window.vue;
`;
document.documentElement.appendChild(script);
```

#### MAIN WORLD（主世界）注入

使用 `world: 'MAIN'` 或 `userScripts` API 注入到主世界：

```json
// manifest.json
{
  "user_scripts": {
    "api_script": "injected.js"
  }
}
```

```javascript
// injected.js (运行在主世界)
window.__PLUGIN_HOOK__ = true;
```

### 4. 三大入口全解析

#### Popup（弹窗）

**特点：**
- 点击扩展图标时显示
- 尺寸限制：800x600px
- 关闭后立即销毁

**使用场景：**
- 快速设置
- 状态展示
- 简单操作面板

```json
{
  "action": {
    "default_popup": "popup.html"
  }
}
```

#### SidePanel（侧边栏）

**特点：**
- 持久化显示
- 更大空间（可自定义宽度）
- 不占用页面空间

**使用场景：**
- 复杂工具面板
- 数据展示
- 多标签页共享状态

```javascript
// 打开侧边栏
chrome.sidePanel.open({ windowId: tab.windowId });

// manifest.json
{
  "side_panel": {
    "default_path": "sidepanel.html"
  }
}
```

#### DevTools Page（开发者工具页）

**特点：**
- 完全独立的环境
- 可访问 Chrome DevTools Protocol
- 适合调试工具

**使用场景：**
- 网络监控
- 性能分析
- 调试辅助工具

```json
{
  "devtools_page": "devtools.html"
}
```

## 🛠️ 实战练习

### 练习 1：Service Worker 保活监控

创建一个监控工具，实时显示 Service Worker 的状态：

```javascript
// background.js
let lastActiveTime = Date.now();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ping') {
    lastActiveTime = Date.now();
    sendResponse({ alive: true, lastActive: lastActiveTime });
  }
});

// 定期更新状态
setInterval(() => {
  chrome.storage.local.set({ 
    lastActive: lastActiveTime,
    uptime: Date.now() - lastActiveTime 
  });
}, 1000);
```

### 练习 2：跨世界通信桥接

创建一个桥接器，让 Content Script 安全访问页面变量：

```javascript
// content.js
function injectBridge() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      window.__BRIDGE__ = {
        get: (key) => {
          try {
            return window[key];
          } catch (e) {
            return null;
          }
        },
        set: (key, value) => {
          window[key] = value;
        }
      };
    })();
  `;
  document.documentElement.appendChild(script);
  script.remove();
}

// 使用桥接器
injectBridge();
const pageData = document.documentElement.getAttribute('data-bridge');
```

## 📝 总结

- Service Worker 需要主动保活，使用心跳、长连接或 Alarms
- Content Script 运行在隔离世界，需要特殊方法访问页面变量
- 根据场景选择合适的入口：Popup（快速）、SidePanel（持久）、DevTools（调试）

## 🔗 扩展阅读

- [Chrome Extension Service Worker 生命周期](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [Content Scripts 隔离机制详解](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Manifest V3 迁移指南](https://developer.chrome.com/docs/extensions/mv3/intro/)

