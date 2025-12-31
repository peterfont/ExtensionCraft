/**
 * Hook 工具函数
 * 用于拦截和监控网络请求
 */

/**
 * XHR Hook - 拦截 XMLHttpRequest 请求
 * @param callback 回调函数，参数为 (url, responseData, requestData)
 * @returns 清理函数，调用可恢复原始 XHR
 */
export function hookXHR(
  callback: (url: string, responseData: any, requestData?: any) => void
): () => void {
  const OriginalXHR = window.XMLHttpRequest;

  function XHRHook(this: XMLHttpRequest) {
    const xhr = new OriginalXHR();
    const originalOpen = xhr.open.bind(xhr);
    const originalSend = xhr.send.bind(xhr);

    let requestUrl = '';
    let requestMethod = '';
    let requestData: any = null;

    // Hook open 方法
    xhr.open = function (
      method: string,
      url: string | URL,
      async?: boolean,
      user?: string | null,
      password?: string | null
    ) {
      requestMethod = method;
      requestUrl = typeof url === 'string' ? url : url.toString();
      return originalOpen(method, url, async !== false, user, password);
    };

    // Hook send 方法
    xhr.send = function (data?: Document | XMLHttpRequestBodyInit | null) {
      requestData = data;

      // 监听响应
      xhr.addEventListener('load', function () {
        try {
          let responseData: any = xhr.responseText;
          
          // 尝试解析 JSON
          try {
            responseData = JSON.parse(xhr.responseText);
          } catch (e) {
            // 保持原始文本
          }

          callback(requestUrl, responseData, requestData);
        } catch (e) {
          console.error('XHR Hook callback error:', e);
        }
      });

      return originalSend(data);
    };

    return xhr;
  }

  // 保留原始 XHR 的原型和静态属性
  XHRHook.prototype = OriginalXHR.prototype;
  Object.setPrototypeOf(XHRHook, OriginalXHR);

  // 替换全局 XHR
  (window as any).XMLHttpRequest = XHRHook;

  // 返回清理函数
  return () => {
    (window as any).XMLHttpRequest = OriginalXHR;
  };
}

/**
 * Fetch Hook - 拦截 fetch 请求
 * @param callback 回调函数，参数为 (url, responseData, requestData, method)
 * @returns 清理函数，调用可恢复原始 fetch
 */
export function hookFetch(
  callback: (
    url: string,
    responseData: any,
    requestData?: any,
    method?: string
  ) => void
): () => void {
  const originalFetch = window.fetch;

  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = init?.method || 'GET';
    const requestData = init?.body;

    try {
      const response = await originalFetch.apply(this, [input, init]);
      const clonedResponse = response.clone();

      // 异步处理响应（不阻塞原始请求）
      (async () => {
        try {
          let responseData: any;

          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            responseData = await clonedResponse.json();
          } else if (contentType.includes('text/')) {
            responseData = await clonedResponse.text();
          } else {
            // 对于其他类型，尝试 JSON，失败则使用文本
            try {
              responseData = await clonedResponse.json();
            } catch {
              responseData = await clonedResponse.text();
            }
          }

          callback(url, responseData, requestData, method);
        } catch (e) {
          console.error('Fetch Hook callback error:', e);
        }
      })();

      return response;
    } catch (error) {
      // 请求失败也通知回调
      callback(url, null, requestData, method);
      throw error;
    }
  };

  // 返回清理函数
  return () => {
    window.fetch = originalFetch;
  };
}

/**
 * WebSocket Hook - 拦截 WebSocket 连接
 * @param callback 回调函数，参数为 (url, message, type)
 * @returns 清理函数，调用可恢复原始 WebSocket
 */
export function hookWebSocket(
  callback: (url: string, message: any, type: 'send' | 'message') => void
): () => void {
  const OriginalWebSocket = window.WebSocket;

  function WebSocketHook(
    this: WebSocket,
    url: string | URL,
    protocols?: string | string[]
  ) {
    const ws = new OriginalWebSocket(url, protocols);
    const wsUrl = typeof url === 'string' ? url : url.toString();

    // Hook send 方法
    const originalSend = ws.send.bind(ws);
    ws.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      try {
        const message =
          typeof data === 'string'
            ? data
            : new TextDecoder().decode(data as ArrayBuffer);

        let parsedMessage: any = message;
        try {
          parsedMessage = JSON.parse(message);
        } catch (e) {
          // 保持原始字符串
        }

        callback(wsUrl, parsedMessage, 'send');
      } catch (e) {
        console.error('WebSocket send Hook error:', e);
      }

      return originalSend(data);
    };

    // Hook message 事件
    ws.addEventListener('message', function (event: MessageEvent) {
      try {
        const raw =
          typeof event.data === 'string'
            ? event.data
            : new TextDecoder().decode(event.data);

        let message: any = raw;
        try {
          message = JSON.parse(raw);
        } catch (e) {
          // 保持原始字符串
        }

        callback(wsUrl, message, 'message');
      } catch (e) {
        console.error('WebSocket message Hook error:', e);
      }
    });

    return ws;
  }

  // 保留原型
  WebSocketHook.prototype = OriginalWebSocket.prototype;
  Object.setPrototypeOf(WebSocketHook, OriginalWebSocket);

  // 替换全局 WebSocket
  (window as any).WebSocket = WebSocketHook;

  // 返回清理函数
  return () => {
    (window as any).WebSocket = OriginalWebSocket;
  };
}

/**
 * 组合多个 Hook
 * @param hooks Hook 函数数组
 * @returns 清理函数数组
 */
export function hookAll(
  ...hooks: Array<() => () => void>
): Array<() => void> {
  return hooks.map(hook => hook());
}

