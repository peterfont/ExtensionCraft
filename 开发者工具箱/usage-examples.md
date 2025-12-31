# 代码片段使用示例

## 工具函数使用示例

```typescript
import { sleep, waitForElement, debounce, throttle } from '@/shared/utils/snippets';

// 延迟执行
async function example1() {
  console.log('开始');
  await sleep(1000); // 等待 1 秒
  console.log('结束');
}

// 等待元素出现
async function example2() {
  try {
    const element = await waitForElement('.my-button', 5000);
    element.click();
  } catch (error) {
    console.error('元素未找到:', error);
  }
}

// 防抖（搜索框输入）
const searchInput = document.querySelector('#search') as HTMLInputElement;
const debouncedSearch = debounce((query: string) => {
  console.log('搜索:', query);
}, 300);

searchInput.addEventListener('input', (e) => {
  debouncedSearch((e.target as HTMLInputElement).value);
});

// 节流（滚动事件）
const throttledScroll = throttle(() => {
  console.log('滚动位置:', window.scrollY);
}, 100);

window.addEventListener('scroll', throttledScroll);
```

## Hook 工具使用示例

```typescript
import { hookXHR, hookFetch, hookWebSocket } from '@/shared/utils/hooks';

// Hook XHR 请求
const cleanupXHR = hookXHR((url, responseData, requestData) => {
  console.log('XHR 请求:', url);
  console.log('请求数据:', requestData);
  console.log('响应数据:', responseData);
});

// Hook Fetch 请求
const cleanupFetch = hookFetch((url, responseData, requestData, method) => {
  console.log('Fetch 请求:', method, url);
  console.log('响应数据:', responseData);
});

// Hook WebSocket
const cleanupWS = hookWebSocket((url, message, type) => {
  console.log(`WebSocket ${type}:`, url, message);
});

// 组合使用多个 Hook
import { hookAll } from '@/shared/utils/hooks';
const cleanups = hookAll(
  () => hookXHR((url, data) => console.log('XHR:', url)),
  () => hookFetch((url, data) => console.log('Fetch:', url))
);

// 清理所有 Hook
cleanups.forEach(cleanup => cleanup());
```

## DOM 操作工具使用示例

```typescript
import {
  safeClick,
  getText,
  setValue,
  waitForElementDisappear,
  highlightElement,
} from '@/shared/utils/dom';

// 安全点击（等待元素出现）
async function example1() {
  await safeClick('.submit-button', {
    timeout: 5000,
    scrollIntoView: true,
  });
}

// 获取文本
const title = getText('.article-title');
console.log('标题:', title);

// 设置输入值
setValue('#username', 'myusername');
setValue('#password', 'mypassword');

// 等待元素消失（如加载动画）
await waitForElementDisappear('.loading-spinner');

// 高亮元素（调试用）
await highlightElement('.important-element', 2000, 'red');

// 滚动到元素
import { scrollToElement } from '@/shared/utils/dom';
await scrollToElement('#target-section', {
  behavior: 'smooth',
  block: 'start',
});
```

## 完整示例：自动化表单填写

```typescript
import { safeClick, setValue, waitForElement } from '@/shared/utils/dom';
import { sleep } from '@/shared/utils/snippets';

async function fillForm() {
  // 等待表单加载
  await waitForElement('form#myForm');
  
  // 填写字段
  setValue('#name', '张三');
  await sleep(200);
  
  setValue('#email', 'zhangsan@example.com');
  await sleep(200);
  
  setValue('#phone', '13800138000');
  await sleep(200);
  
  // 选择下拉框
  const select = document.querySelector('#city') as HTMLSelectElement;
  select.value = 'beijing';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(200);
  
  // 提交表单
  await safeClick('button[type="submit"]');
  
  // 等待提交完成
  await waitForElementDisappear('.loading');
  console.log('表单提交成功');
}

fillForm();
```

## 完整示例：监控网络请求

```typescript
import { hookXHR, hookFetch } from '@/shared/utils/hooks';

// 创建请求监控器
class RequestMonitor {
  private requests: Array<{
    url: string;
    method: string;
    requestData: any;
    responseData: any;
    timestamp: number;
  }> = [];
  
  start() {
    // Hook XHR
    hookXHR((url, responseData, requestData) => {
      this.requests.push({
        url,
        method: 'XHR',
        requestData,
        responseData,
        timestamp: Date.now(),
      });
      this.onRequest();
    });
    
    // Hook Fetch
    hookFetch((url, responseData, requestData, method) => {
      this.requests.push({
        url,
        method: method || 'GET',
        requestData,
        responseData,
        timestamp: Date.now(),
      });
      this.onRequest();
    });
  }
  
  private onRequest() {
    console.log('请求总数:', this.requests.length);
    console.log('最新请求:', this.requests[this.requests.length - 1]);
  }
  
  getRequests() {
    return this.requests;
  }
  
  clear() {
    this.requests = [];
  }
}

// 使用
const monitor = new RequestMonitor();
monitor.start();
```

## Content Script 集成示例

```typescript
// src/content/index.ts
import { safeClick, getText, waitForElement } from '@/shared/utils/dom';
import { hookXHR } from '@/shared/utils/hooks';

// 初始化
async function init() {
  // 等待页面加载完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDOMReady);
  } else {
    onDOMReady();
  }
}

async function onDOMReady() {
  // 设置网络监控
  hookXHR((url, data) => {
    if (url.includes('/api/data')) {
      console.log('检测到数据 API 调用:', data);
      handleDataResponse(data);
    }
  });
  
  // 等待特定元素出现后执行操作
  try {
    await waitForElement('.data-container');
    processData();
  } catch (error) {
    console.error('元素未找到:', error);
  }
}

async function processData() {
  // 提取数据
  const titles = document.querySelectorAll('.item-title');
  titles.forEach(title => {
    console.log('标题:', getText(title.className));
  });
  
  // 执行操作
  await safeClick('.load-more-button');
}

init();
```

