/**
 * DOM 操作工具函数
 * 提供安全的 DOM 操作方法
 */

import { sleep, waitForElement } from './snippets';

/**
 * 安全的点击（等待元素可见并滚动到视图中）
 * @param selector CSS 选择器
 * @param options 选项
 * @returns Promise<void>
 */
export async function safeClick(
  selector: string,
  options?: {
    timeout?: number;
    scrollIntoView?: boolean;
    waitAfterScroll?: number;
  }
): Promise<void> {
  const {
    timeout = 5000,
    scrollIntoView = true,
    waitAfterScroll = 300,
  } = options || {};

  const element = await waitForElement(selector, timeout);

  if (scrollIntoView) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(waitAfterScroll);
  }

  element.click();
}

/**
 * 获取元素文本内容
 * @param selector CSS 选择器
 * @param defaultValue 元素不存在时的默认值
 * @returns 文本内容
 */
export function getText(
  selector: string,
  defaultValue = ''
): string {
  const element = document.querySelector(selector);
  return element?.textContent?.trim() || defaultValue;
}

/**
 * 获取所有匹配元素的文本内容
 * @param selector CSS 选择器
 * @returns 文本内容数组
 */
export function getAllText(selector: string): string[] {
  const elements = document.querySelectorAll(selector);
  return Array.from(elements).map(el => el.textContent?.trim() || '');
}

/**
 * 设置输入元素的值（触发 input 和 change 事件）
 * @param selector CSS 选择器
 * @param value 要设置的值
 * @returns 是否设置成功
 */
export function setValue(selector: string, value: string): boolean {
  const element = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  if (!element) {
    return false;
  }

  element.value = value;

  // 触发 input 事件
  element.dispatchEvent(
    new Event('input', { bubbles: true, cancelable: true })
  );

  // 触发 change 事件
  element.dispatchEvent(
    new Event('change', { bubbles: true, cancelable: true })
  );

  // 对于 React，还需要触发更原生的事件
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return true;
}

/**
 * 获取元素的属性值
 * @param selector CSS 选择器
 * @param attribute 属性名
 * @param defaultValue 默认值
 * @returns 属性值
 */
export function getAttribute(
  selector: string,
  attribute: string,
  defaultValue = ''
): string {
  const element = document.querySelector(selector);
  return element?.getAttribute(attribute) || defaultValue;
}

/**
 * 设置元素的属性值
 * @param selector CSS 选择器
 * @param attribute 属性名
 * @param value 属性值
 * @returns 是否设置成功
 */
export function setAttribute(
  selector: string,
  attribute: string,
  value: string
): boolean {
  const element = document.querySelector(selector);
  if (!element) {
    return false;
  }

  element.setAttribute(attribute, value);
  return true;
}

/**
 * 检查元素是否存在
 * @param selector CSS 选择器
 * @returns 是否存在
 */
export function elementExists(selector: string): boolean {
  return document.querySelector(selector) !== null;
}

/**
 * 等待元素消失
 * @param selector CSS 选择器
 * @param timeout 超时时间（毫秒）
 * @returns Promise<void>
 */
export function waitForElementDisappear(
  selector: string,
  timeout = 5000
): Promise<void> {
  return new Promise((resolve, reject) => {
    // 如果元素不存在，立即解析
    if (!document.querySelector(selector)) {
      resolve();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(
        new Error(`Element ${selector} still exists after ${timeout}ms`)
      );
    }, timeout);
  });
}

/**
 * 获取元素在页面中的位置
 * @param selector CSS 选择器
 * @returns 元素位置信息，如果元素不存在返回 null
 */
export function getElementPosition(
  selector: string
): {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
} | null {
  const element = document.querySelector(selector) as HTMLElement;
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    bottom: rect.bottom + window.scrollY,
    right: rect.right + window.scrollX,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * 高亮元素（用于调试）
 * @param selector CSS 选择器
 * @param duration 高亮持续时间（毫秒），默认 2000ms
 * @param color 高亮颜色，默认 'yellow'
 */
export async function highlightElement(
  selector: string,
  duration = 2000,
  color = 'yellow'
): Promise<void> {
  const element = document.querySelector(selector) as HTMLElement;
  if (!element) {
    return;
  }

  const originalOutline = element.style.outline;
  const originalOutlineOffset = element.style.outlineOffset;
  const originalTransition = element.style.transition;

  element.style.outline = `3px solid ${color}`;
  element.style.outlineOffset = '2px';
  element.style.transition = 'outline 0.2s';

  await sleep(duration);

  element.style.outline = originalOutline;
  element.style.outlineOffset = originalOutlineOffset;
  element.style.transition = originalTransition;
}

/**
 * 模拟鼠标悬停
 * @param selector CSS 选择器
 * @param duration 悬停持续时间（毫秒），默认 100ms
 */
export async function hoverElement(
  selector: string,
  duration = 100
): Promise<void> {
  const element = document.querySelector(selector) as HTMLElement;
  if (!element) {
    return;
  }

  // 触发 mouseenter 和 mouseover 事件
  element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

  await sleep(duration);

  // 触发 mouseleave 和 mouseout 事件
  element.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
}

/**
 * 滚动到元素
 * @param selector CSS 选择器
 * @param options 滚动选项
 */
export async function scrollToElement(
  selector: string,
  options?: {
    behavior?: ScrollBehavior;
    block?: ScrollLogicalPosition;
    inline?: ScrollLogicalPosition;
  }
): Promise<void> {
  const element = await waitForElement(selector);
  element.scrollIntoView({
    behavior: options?.behavior || 'smooth',
    block: options?.block || 'center',
    inline: options?.inline || 'nearest',
  });
}

/**
 * 创建并插入元素
 * @param tag 标签名
 * @param attributes 属性对象
 * @param parentSelector 父元素选择器，默认 'body'
 * @param position 插入位置，默认 'beforeend'
 * @returns 创建的元素
 */
export function createAndInsert(
  tag: string,
  attributes: Record<string, string> = {},
  parentSelector = 'body',
  position: InsertPosition = 'beforeend'
): HTMLElement {
  const element = document.createElement(tag);

  // 设置属性
  Object.keys(attributes).forEach(key => {
    if (key === 'textContent' || key === 'innerHTML') {
      (element as any)[key] = attributes[key];
    } else {
      element.setAttribute(key, attributes[key]);
    }
  });

  // 插入到父元素
  const parent = document.querySelector(parentSelector);
  if (parent) {
    parent.insertAdjacentElement(position, element);
  }

  return element;
}

