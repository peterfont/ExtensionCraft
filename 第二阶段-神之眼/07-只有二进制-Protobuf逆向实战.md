# 07. 只有二进制？Protobuf 逆向实战

## 📚 学习目标

- 理解 Protobuf 协议原理
- 在浏览器插件中使用 protobuf.js
- 动态提取和解析 .proto 定义
- 实战：B站/小红书二进制数据解析

## 🎯 核心知识点

### 1. Protobuf 简介

Protocol Buffers（Protobuf）是 Google 开发的一种数据序列化协议，具有以下特点：

- **二进制格式**：比 JSON 更小、更快
- **强类型**：需要预先定义 .proto 文件
- **跨语言**：支持多种编程语言
- **向后兼容**：支持字段演进

许多网站使用 Protobuf 来传输数据以提高性能和节省带宽。

### 2. 安装和配置 protobuf.js

#### 安装依赖

```bash
npm install protobufjs
```

#### 基础使用

```typescript
// src/shared/utils/protobuf.ts
import protobuf from 'protobufjs';

export class ProtobufParser {
  private root: protobuf.Root;
  
  async loadProto(protoContent: string): Promise<void> {
    this.root = await protobuf.parse(protoContent).root;
  }
  
  async loadProtoFile(url: string): Promise<void> {
    this.root = await protobuf.load(url);
  }
  
  decodeMessage(messageType: string, buffer: ArrayBuffer | Uint8Array): any {
    const MessageType = this.root.lookupType(messageType);
    
    if (!MessageType) {
      throw new Error(`Message type "${messageType}" not found`);
    }
    
    const message = MessageType.decode(buffer);
    const obj = MessageType.toObject(message, {
      longs: String,
      enums: String,
      bytes: String,
      defaults: true,
      arrays: true,
      objects: true,
      oneofs: true,
    });
    
    return obj;
  }
  
  encodeMessage(messageType: string, data: any): Uint8Array {
    const MessageType = this.root.lookupType(messageType);
    const message = MessageType.create(data);
    const buffer = MessageType.encode(message).finish();
    return buffer;
  }
  
  validate(messageType: string, data: any): string | null {
    const MessageType = this.root.lookupType(messageType);
    const errMsg = MessageType.verify(data);
    return errMsg || null;
  }
}
```

### 3. 动态提取 .proto 定义

许多网站在 JavaScript 代码中嵌入或引用了 .proto 定义，我们可以通过 Hook 技术提取：

```typescript
// src/content/inject/protoExtractor.ts
export class ProtoExtractor {
  private extractedProtos = new Map<string, string>();
  
  install() {
    // Hook fetch 来拦截 .proto 文件请求
    const originalFetch = window.fetch;
    window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      
      const response = await originalFetch.apply(this, [input, init]);
      
      // 检查是否是 .proto 文件
      if (url.endsWith('.proto') || url.includes('.proto?')) {
        const clonedResponse = response.clone();
        const text = await clonedResponse.text();
        
        // 保存并发送到插件
        chrome.runtime.sendMessage({
          type: 'proto-extracted',
          url,
          content: text,
        });
      }
      
      return response;
    };
    
    // Hook Webpack/模块加载器来提取内联的 proto
    this.hookModuleLoader();
  }
  
  private hookModuleLoader() {
    // 尝试从常见的模块系统中提取
    if ((window as any).webpackChunkName) {
      this.extractFromWebpack();
    }
    
    // Hook require/import
    this.hookRequire();
  }
  
  private extractFromWebpack() {
    // Webpack 模块提取逻辑
    // 这里需要根据具体网站的实现来定制
  }
  
  private hookRequire() {
    // 如果网站使用 require
    const originalRequire = (window as any).require;
    if (originalRequire) {
      (window as any).require = function(...args: any[]) {
        const result = originalRequire.apply(this, args);
        
        // 检查是否是 proto 相关内容
        if (result && typeof result === 'object') {
          const str = JSON.stringify(result);
          if (str.includes('syntax') && str.includes('proto')) {
            chrome.runtime.sendMessage({
              type: 'proto-in-module',
              module: args[0],
              data: result,
            });
          }
        }
        
        return result;
      };
    }
  }
  
  // 从 JavaScript 代码中提取 proto 字符串
  extractFromScript(scriptContent: string): string[] {
    const protos: string[] = [];
    
    // 匹配 proto 字符串（可能是多行字符串）
    const patterns = [
      /syntax\s*=\s*["']proto3?["'][\s\S]*?message\s+\w+[\s\S]*?}/g,
      /protobuf\.parse\(`([\s\S]*?)`\)/g,
      /protoContent\s*[:=]\s*`([\s\S]*?)`/g,
    ];
    
    patterns.forEach(pattern => {
      const matches = scriptContent.matchAll(pattern);
      for (const match of matches) {
        const protoContent = match[1] || match[0];
        if (protoContent.includes('message ') || protoContent.includes('syntax')) {
          protos.push(protoContent);
        }
      }
    });
    
    return protos;
  }
  
  // 从页面所有脚本中提取
  async extractFromPage(): Promise<string[]> {
    const scripts = Array.from(document.querySelectorAll('script'));
    const allProtos: string[] = [];
    
    for (const script of scripts) {
      if (script.src) {
        try {
          const response = await fetch(script.src);
          const content = await response.text();
          const protos = this.extractFromScript(content);
          allProtos.push(...protos);
        } catch (e) {
          // 跨域脚本无法读取
        }
      } else {
        const protos = this.extractFromScript(script.textContent || '');
        allProtos.push(...protos);
      }
    }
    
    return allProtos;
  }
}
```

### 4. 实战案例：B站 Protobuf 解析

B站的部分 API 使用 Protobuf 格式，我们需要：

1. 提取 B站的 .proto 定义
2. 解析二进制响应数据
3. 转换为可读的 JSON

```typescript
// src/content/inject/bilibiliProtobuf.ts
import { ProtobufParser } from '@/shared/utils/protobuf';

// B站常用的 proto 定义（需要从实际代码中提取）
const BILIBILI_PROTO = `
syntax = "proto3";

package bilibili.app.dynamic.v2;

message DynamicItem {
  int64 dynamic_id = 1;
  string content = 2;
  UserInfo author = 3;
  repeated string images = 4;
  int64 timestamp = 5;
}

message UserInfo {
  int64 uid = 1;
  string name = 2;
  string avatar = 3;
}

message DynamicList {
  repeated DynamicItem items = 1;
  bool has_more = 2;
}
`;

export class BilibiliProtobufParser {
  private parser: ProtobufParser;
  
  constructor() {
    this.parser = new ProtobufParser();
    this.init();
  }
  
  private async init() {
    await this.parser.loadProto(BILIBILI_PROTO);
  }
  
  // Hook B站 API 响应
  install() {
    const originalFetch = window.fetch;
    window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
      const response = await originalFetch.apply(this, [input, init]);
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      
      // 检查是否是 B站 API
      if (url.includes('api.bilibili.com') || url.includes('grpc.bilibili.com')) {
        const clonedResponse = response.clone();
        const contentType = response.headers.get('content-type');
        
        // 检查是否是 protobuf
        if (contentType?.includes('application/x-protobuf') || 
            contentType?.includes('application/grpc')) {
          const arrayBuffer = await clonedResponse.arrayBuffer();
          this.parseBilibiliResponse(url, arrayBuffer);
        }
      }
      
      return response;
    };
  }
  
  private async parseBilibiliResponse(url: string, buffer: ArrayBuffer) {
    try {
      // 尝试不同的 message type
      const messageTypes = [
        'bilibili.app.dynamic.v2.DynamicList',
        'bilibili.app.dynamic.v2.DynamicItem',
      ];
      
      for (const messageType of messageTypes) {
        try {
          const decoded = this.parser.decodeMessage(messageType, buffer);
          
          // 发送解析后的数据
          chrome.runtime.sendMessage({
            type: 'bilibili-protobuf-parsed',
            url,
            messageType,
            data: decoded,
          });
          
          return;
        } catch (e) {
          // 尝试下一个类型
        }
      }
      
      // 如果都失败，尝试通用解析
      console.warn('Failed to parse Bilibili protobuf:', url);
    } catch (error) {
      console.error('Protobuf parsing error:', error);
    }
  }
}
```

### 5. 实战案例：小红书 Protobuf 解析

小红书的部分接口也使用 Protobuf：

```typescript
// src/content/inject/xiaohongshuProtobuf.ts
import { ProtobufParser } from '@/shared/utils/protobuf';

// 小红书的 proto 定义（示例）
const XIAOHONGSHU_PROTO = `
syntax = "proto3";

package xiaohongshu;

message Note {
  string id = 1;
  string title = 2;
  string desc = 3;
  repeated string images = 4;
  User author = 5;
  int64 likes = 6;
}

message User {
  string id = 1;
  string nickname = 2;
  string avatar = 3;
}

message NoteList {
  repeated Note notes = 1;
  int32 total = 2;
}
`;

export class XiaohongshuProtobufParser {
  private parser: ProtobufParser;
  
  constructor() {
    this.parser = new ProtobufParser();
    this.init();
  }
  
  private async init() {
    await this.parser.loadProto(XIAOHONGSHU_PROTO);
  }
  
  install() {
    // Hook 小红书 API
    const originalFetch = window.fetch;
    window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
      const response = await originalFetch.apply(this, [input, init]);
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      
      if (url.includes('edith.xiaohongshu.com') || url.includes('api.xiaohongshu.com')) {
        const clonedResponse = response.clone();
        const contentType = response.headers.get('content-type');
        
        if (contentType?.includes('x-protobuf') || 
            contentType?.includes('application/octet-stream')) {
          const arrayBuffer = await clonedResponse.arrayBuffer();
          
          // 检查是否是 protobuf（通常 protobuf 以特定字节开头）
          if (this.isProtobuf(arrayBuffer)) {
            this.parseXiaohongshuResponse(url, arrayBuffer);
          }
        }
      }
      
      return response;
    };
  }
  
  private isProtobuf(buffer: ArrayBuffer): boolean {
    // Protobuf 的简单检测：检查前几个字节
    // 这不是完全可靠的方法，但可以作为初步判断
    const view = new Uint8Array(buffer);
    if (view.length < 2) return false;
    
    // 检查是否包含常见的 protobuf field tag 模式
    // 这里使用简单的启发式方法
    return true; // 简化处理
  }
  
  private async parseXiaohongshuResponse(url: string, buffer: ArrayBuffer) {
    try {
      // 尝试解析
      const messageTypes = [
        'xiaohongshu.NoteList',
        'xiaohongshu.Note',
      ];
      
      for (const messageType of messageTypes) {
        try {
          const decoded = this.parser.decodeMessage(messageType, buffer);
          
          chrome.runtime.sendMessage({
            type: 'xiaohongshu-protobuf-parsed',
            url,
            messageType,
            data: decoded,
          });
          
          return;
        } catch (e) {
          // 继续尝试
        }
      }
    } catch (error) {
      console.error('Xiaohongshu protobuf parsing error:', error);
    }
  }
}
```

### 6. 通用 Protobuf 解析器

创建一个通用的解析器，可以自动识别和解析 protobuf：

```typescript
// src/shared/utils/universalProtobufParser.ts
import { ProtobufParser } from './protobuf';

interface ProtoDefinition {
  name: string;
  content: string;
  messageTypes: string[];
}

export class UniversalProtobufParser {
  private parsers = new Map<string, ProtobufParser>();
  private protoDefinitions = new Map<string, ProtoDefinition>();
  
  async registerProto(name: string, protoContent: string): Promise<void> {
    const parser = new ProtobufParser();
    await parser.loadProto(protoContent);
    
    // 提取 message types
    const messageTypes = this.extractMessageTypes(protoContent);
    
    this.parsers.set(name, parser);
    this.protoDefinitions.set(name, {
      name,
      content: protoContent,
      messageTypes,
    });
  }
  
  async tryParse(buffer: ArrayBuffer, domain?: string): Promise<{
    success: boolean;
    data?: any;
    messageType?: string;
    protoName?: string;
  }> {
    // 根据域名选择可能匹配的 proto
    const candidates = domain 
      ? Array.from(this.protoDefinitions.entries()).filter(([name]) => 
          name.toLowerCase().includes(domain.toLowerCase())
        )
      : Array.from(this.protoDefinitions.entries());
    
    for (const [protoName, definition] of candidates) {
      const parser = this.parsers.get(protoName);
      if (!parser) continue;
      
      // 尝试每个 message type
      for (const messageType of definition.messageTypes) {
        try {
          const data = parser.decodeMessage(messageType, buffer);
          return {
            success: true,
            data,
            messageType,
            protoName,
          };
        } catch (e) {
          // 继续尝试
        }
      }
    }
    
    return { success: false };
  }
  
  private extractMessageTypes(protoContent: string): string[] {
    const messageTypes: string[] = [];
    const lines = protoContent.split('\n');
    let currentPackage = '';
    
    for (const line of lines) {
      // 提取 package
      const packageMatch = line.match(/package\s+([\w.]+)/);
      if (packageMatch) {
        currentPackage = packageMatch[1];
      }
      
      // 提取 message
      const messageMatch = line.match(/message\s+(\w+)/);
      if (messageMatch) {
        const messageName = messageMatch[1];
        const fullName = currentPackage 
          ? `${currentPackage}.${messageName}`
          : messageName;
        messageTypes.push(fullName);
      }
    }
    
    return messageTypes;
  }
  
  getRegisteredProtos(): string[] {
    return Array.from(this.protoDefinitions.keys());
  }
}

// 全局实例
export const universalProtobufParser = new UniversalProtobufParser();
```

### 7. Background 集成

在 Background 中处理 Protobuf 解析：

```typescript
// src/background/protobufHandler.ts
import { universalProtobufParser } from '@/shared/utils/universalProtobufParser';
import { router } from './router';
import { MessageType } from '@/shared/types/message';

// 注册 proto 定义（可以从配置或动态加载）
async function initProtos() {
  // B站
  await universalProtobufParser.registerProto('bilibili', BILIBILI_PROTO);
  
  // 小红书
  await universalProtobufParser.registerProto('xiaohongshu', XIAOHONGSHU_PROTO);
  
  // 可以从服务器动态加载更多
  try {
    const response = await fetch(chrome.runtime.getURL('protos/definitions.json'));
    const definitions = await response.json();
    
    for (const def of definitions) {
      await universalProtobufParser.registerProto(def.name, def.content);
    }
  } catch (e) {
    console.warn('Failed to load proto definitions:', e);
  }
}

initProtos();

// 注册消息处理器
router.register(MessageType.PARSE_PROTOBUF, async (message) => {
  const { buffer, domain } = message.payload;
  
  // 将 base64 或 ArrayBuffer 转换为 ArrayBuffer
  let arrayBuffer: ArrayBuffer;
  if (typeof buffer === 'string') {
    // base64
    const binaryString = atob(buffer);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    arrayBuffer = bytes.buffer;
  } else {
    arrayBuffer = buffer;
  }
  
  const result = await universalProtobufParser.tryParse(arrayBuffer, domain);
  return result;
});

// 监听来自 Content Script 的 proto 提取
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'proto-extracted') {
    // 保存提取的 proto 定义
    handleExtractedProto(message.url, message.content);
    sendResponse({ success: true });
  }
  
  if (message.type === 'bilibili-protobuf-parsed' || 
      message.type === 'xiaohongshu-protobuf-parsed') {
    // 存储解析后的数据
    storeParsedData(message.type, message.data);
  }
  
  return true;
});

async function handleExtractedProto(url: string, content: string) {
  // 保存到 storage
  const extracted = await chrome.storage.local.get('extracted_protos') || {};
  extracted[url] = {
    content,
    timestamp: Date.now(),
  };
  await chrome.storage.local.set({ extracted_protos: extracted });
  
  // 尝试自动注册
  try {
    const name = new URL(url).hostname;
    await universalProtobufParser.registerProto(name, content);
    console.log(`Auto-registered proto from ${url}`);
  } catch (e) {
    console.warn('Failed to auto-register proto:', e);
  }
}

async function storeParsedData(type: string, data: any) {
  const key = `parsed_${type}_${Date.now()}`;
  await chrome.storage.local.set({
    [key]: {
      type,
      data,
      timestamp: Date.now(),
    }
  });
}
```

## 🛠️ 实战练习

### 练习 1：自动 Proto 发现和注册

创建一个工具，自动扫描页面并发现 proto 定义：

```typescript
// src/content/inject/autoProtoDiscovery.ts
export class AutoProtoDiscovery {
  async discover(): Promise<string[]> {
    const protos: string[] = [];
    
    // 1. 从网络请求中发现
    protos.push(...await this.discoverFromNetwork());
    
    // 2. 从页面脚本中发现
    protos.push(...await this.discoverFromScripts());
    
    // 3. 从 Storage 中发现（某些网站会缓存）
    protos.push(...await this.discoverFromStorage());
    
    return protos;
  }
  
  private async discoverFromNetwork(): Promise<string[]> {
    // 已经在 ProtoExtractor 中实现
    return [];
  }
  
  private async discoverFromScripts(): Promise<string[]> {
    const extractor = new ProtoExtractor();
    return await extractor.extractFromPage();
  }
  
  private async discoverFromStorage(): Promise<string[]> {
    // 检查 localStorage、sessionStorage、IndexedDB
    // 某些网站可能会存储 proto 定义
    return [];
  }
}
```

### 练习 2：Proto 定义管理器 UI

创建一个 UI 界面来管理 proto 定义：

```vue
<!-- src/sidepanel/components/ProtoManager.vue -->
<template>
  <div class="proto-manager">
    <h2>Proto 定义管理</h2>
    
    <div class="proto-list">
      <div 
        v-for="proto in protos" 
        :key="proto.name"
        class="proto-item"
      >
        <h3>{{ proto.name }}</h3>
        <p>{{ proto.messageTypes.length }} 个消息类型</p>
        <button @click="viewProto(proto)">查看</button>
        <button @click="deleteProto(proto.name)">删除</button>
      </div>
    </div>
    
    <div class="add-proto">
      <h3>添加 Proto</h3>
      <textarea v-model="newProtoContent" placeholder="粘贴 .proto 内容..."></textarea>
      <input v-model="newProtoName" placeholder="名称" />
      <button @click="addProto">添加</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { MessageClient } from '@/shared/utils/messaging';
import { MessageType } from '@/shared/types/message';

interface ProtoInfo {
  name: string;
  messageTypes: string[];
  content?: string;
}

const protos = ref<ProtoInfo[]>([]);
const newProtoName = ref('');
const newProtoContent = ref('');

async function loadProtos() {
  // 从 Background 获取已注册的 proto
  const registered = await MessageClient.send<string[]>(MessageType.GET_REGISTERED_PROTOS);
  // 获取详细信息
  protos.value = registered.map(name => ({
    name,
    messageTypes: [], // 需要从 Background 获取
  }));
}

async function addProto() {
  if (!newProtoName.value || !newProtoContent.value) return;
  
  await MessageClient.send(MessageType.REGISTER_PROTO, {
    name: newProtoName.value,
    content: newProtoContent.value,
  });
  
  newProtoName.value = '';
  newProtoContent.value = '';
  await loadProtos();
}

function viewProto(proto: ProtoInfo) {
  // 显示 proto 内容
  console.log(proto);
}

async function deleteProto(name: string) {
  await MessageClient.send(MessageType.UNREGISTER_PROTO, { name });
  await loadProtos();
}

onMounted(loadProtos);
</script>
```

## 📝 总结

- Protobuf 是高效的二进制序列化协议，许多网站使用它
- 使用 protobuf.js 可以在浏览器中解析 Protobuf 数据
- 通过 Hook 技术可以提取网站中的 proto 定义
- 通用解析器可以自动识别和解析不同网站的 Protobuf 数据

## 🔗 扩展阅读

- [Protocol Buffers 官方文档](https://protobuf.dev/)
- [protobuf.js GitHub](https://github.com/protobufjs/protobuf.js)
- [Protobuf 编码原理](https://protobuf.dev/programming-guides/encoding/)

