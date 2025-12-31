/**
 * 常用工具函数集合
 * 适用于浏览器插件开发
 */

/**
 * 延迟函数
 * @param ms 延迟毫秒数
 * @returns Promise
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 等待元素出现在 DOM 中
 * @param selector CSS 选择器
 * @param timeout 超时时间（毫秒），默认 5000ms
 * @returns Promise<HTMLElement>
 */
export function waitForElement(
  selector: string,
  timeout = 5000
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    // 立即检查元素是否已存在
    const existingElement = document.querySelector(selector) as HTMLElement;
    if (existingElement) {
      resolve(existingElement);
      return;
    }

    // 使用 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector) as HTMLElement;
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    // 开始观察
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 设置超时
    setTimeout(() => {
      observer.disconnect();
      reject(
        new Error(`Element ${selector} not found within ${timeout}ms`)
      );
    }, timeout);
  });
}

/**
 * 生成唯一 ID
 * @returns 唯一 ID 字符串
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 防抖函数
 * 在事件被触发 n 秒后再执行回调，如果在这 n 秒内又被触发，则重新计时
 * @param func 要防抖的函数
 * @param wait 等待时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const context = this;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func.apply(context, args);
      timeout = null;
    }, wait);
  };
}

/**
 * 节流函数
 * 规定在一个单位时间内，只能触发一次函数
 * @param func 要节流的函数
 * @param wait 时间间隔（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastTime = 0;
  let timeout: NodeJS.Timeout | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const context = this;
    const now = Date.now();

    if (now - lastTime >= wait) {
      lastTime = now;
      func.apply(context, args);
    } else {
      // 如果距离上次执行时间还没到 wait，设置定时器等待执行
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        lastTime = Date.now();
        func.apply(context, args);
        timeout = null;
      }, wait - (now - lastTime));
    }
  };
}

/**
 * 深度克隆对象
 * @param obj 要克隆的对象
 * @returns 克隆后的对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as any;
  }

  if (typeof obj === 'object') {
    const clonedObj = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }

  return obj;
}

/**
 * 格式化日期时间
 * @param date Date 对象或时间戳
 * @param format 格式字符串，默认 'YYYY-MM-DD HH:mm:ss'
 * @returns 格式化后的字符串
 */
export function formatDate(
  date: Date | number,
  format = 'YYYY-MM-DD HH:mm:ss'
): string {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 解析 URL 参数
 * @param url URL 字符串，默认使用当前页面 URL
 * @returns 参数对象
 */
export function parseUrlParams(url?: string): Record<string, string> {
  const targetUrl = url || window.location.href;
  const urlObj = new URL(targetUrl);
  const params: Record<string, string> = {};

  urlObj.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return params;
}

/**
 * 对象转 URL 查询字符串
 * @param params 参数对象
 * @returns 查询字符串（不包含 ?）
 */
export function stringifyParams(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();

  Object.keys(params).forEach(key => {
    if (params[key] !== null && params[key] !== undefined) {
      searchParams.append(key, String(params[key]));
    }
  });

  return searchParams.toString();
}

/**
 * 检查值是否为空（null, undefined, '', [], {}）
 * @param value 要检查的值
 * @returns 是否为空
 */
export function isEmpty(value: any): boolean {
  if (value === null || value === undefined || value === '') {
    return true;
  }

  if (Array.isArray(value) && value.length === 0) {
    return true;
  }

  if (typeof value === 'object' && Object.keys(value).length === 0) {
    return true;
  }

  return false;
}

/**
 * 安全的 JSON 解析
 * @param jsonString JSON 字符串
 * @param defaultValue 解析失败时的默认值
 * @returns 解析后的对象或默认值
 */
export function safeJsonParse<T = any>(
  jsonString: string,
  defaultValue: T | null = null
): T | null {
  try {
    return JSON.parse(jsonString) as T;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * 随机数生成（包含 min 和 max）
 * @param min 最小值
 * @param max 最大值
 * @returns 随机数
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 随机延迟（模拟人类操作）
 * @param min 最小延迟（毫秒）
 * @param max 最大延迟（毫秒）
 * @returns Promise
 */
export function randomDelay(min: number, max: number): Promise<void> {
  const delay = randomInt(min, max);
  return sleep(delay);
}

