# 12. 算力外挂：WASM + 端侧 AI

## 📚 学习目标

- 理解 WebAssembly (WASM) 在插件中的应用
- 集成本地 OCR（Tesseract/PaddleOCR）
- 使用 WebLLM 运行本地大语言模型
- 实现端侧 AI 功能

## 🎯 核心知识点

### 1. WebAssembly 简介

WebAssembly (WASM) 是一种低级的二进制格式，可以在浏览器中高性能运行：

- **高性能**：接近原生代码的执行速度
- **跨平台**：支持所有现代浏览器
- **安全**：沙箱环境，不会影响系统安全
- **多语言支持**：C/C++/Rust/Go 等都可以编译为 WASM

### 2. 本地 OCR 实现

#### 使用 Tesseract.js

```bash
npm install tesseract.js
```

```typescript
// src/content/utils/ocr.ts
import Tesseract from 'tesseract.js';

export class OCRService {
  private worker: Tesseract.Worker | null = null;
  
  async init(lang: string = 'chi_sim+eng') {
    this.worker = await Tesseract.createWorker(lang);
  }
  
  async recognize(image: File | HTMLImageElement | HTMLCanvasElement): Promise<{
    text: string;
    confidence: number;
    words: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
  }> {
    if (!this.worker) {
      await this.init();
    }
    
    const result = await this.worker!.recognize(image);
    
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words: result.data.words.map(word => ({
        text: word.text,
        bbox: word.bbox,
      })),
    };
  }
  
  async recognizeFromCanvas(canvas: HTMLCanvasElement): Promise<string> {
    const result = await this.recognize(canvas);
    return result.text;
  }
  
  async recognizeFromImageUrl(url: string): Promise<string> {
    const result = await this.recognize(url);
    return result.text;
  }
  
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

// 使用示例
const ocr = new OCRService();
await ocr.init('chi_sim+eng'); // 中英文

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d')!;
// ... 绘制图像到 canvas

const text = await ocr.recognizeFromCanvas(canvas);
console.log('识别结果:', text);
```

#### 验证码识别示例

```typescript
// src/content/utils/captchaOCR.ts
import { OCRService } from './ocr';

export class CaptchaOCR {
  private ocr: OCRService;
  
  constructor() {
    this.ocr = new OCRService();
  }
  
  async init() {
    await this.ocr.init('eng'); // 验证码通常是英文
  }
  
  async solveCaptcha(imageElement: HTMLImageElement): Promise<string> {
    // 预处理图像（提高识别率）
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    
    ctx.drawImage(imageElement, 0, 0);
    
    // 转换为灰度图
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray;     // R
      data[i + 1] = gray; // G
      data[i + 2] = gray; // B
      // data[i + 3] = alpha (保持不变)
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // OCR 识别
    const result = await this.ocr.recognize(canvas);
    
    // 清理结果（移除空格、特殊字符）
    return result.text.replace(/\s+/g, '').toUpperCase();
  }
}
```

### 3. 使用 WebLLM 运行本地 LLM

#### 安装和配置

```bash
npm install @mlc-ai/web-llm
```

```typescript
// src/content/utils/webLLM.ts
import * as webllm from '@mlc-ai/web-llm';

export class LocalLLM {
  private engine: webllm.Engine | null = null;
  private model: string = 'Llama-2-7b-chat-hf-q4f32_1'; // 默认模型
  
  async init(modelName?: string) {
    if (modelName) {
      this.model = modelName;
    }
    
    // 初始化引擎
    this.engine = await webllm.CreateWebWorkerEngine(
      new Worker(new URL('@mlc-ai/web-llm/dist/worker.js', import.meta.url), { type: 'module' }),
      this.model,
      {
        initProgressCallback: (progress: webllm.InitProgressReport) => {
          console.log('Loading progress:', progress);
        },
      }
    );
  }
  
  async chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    if (!this.engine) {
      await this.init();
    }
    
    const response = await this.engine!.chat.completions.create({
      messages: messages as any,
      temperature: options?.temperature || 0.7,
      max_tokens: options?.maxTokens || 2048,
    });
    
    return response.choices[0].message.content;
  }
  
  async generate(prompt: string, options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    return await this.chat([
      { role: 'user', content: prompt }
    ], options);
  }
}

// 使用示例
const llm = new LocalLLM();
await llm.init();

const response = await llm.generate('请用一句话总结浏览器插件开发的核心要点');
console.log(response);
```

### 4. 端侧 AI 应用场景

#### 场景一：智能数据提取

```typescript
// src/content/utils/aiDataExtractor.ts
import { LocalLLM } from './webLLM';
import { OCRService } from './ocr';

export class AIDataExtractor {
  private llm: LocalLLM;
  private ocr: OCRService;
  
  constructor() {
    this.llm = new LocalLLM();
    this.ocr = new OCRService();
  }
  
  async extractStructuredData(html: string): Promise<any> {
    // 提取页面文本
    const text = this.extractText(html);
    
    // 使用 LLM 提取结构化数据
    const prompt = `
请从以下文本中提取结构化数据，返回 JSON 格式：
${text}

请提取：商品名称、价格、库存、描述等信息。
`;
    
    const response = await this.llm.generate(prompt);
    
    // 解析 JSON
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse LLM response:', e);
    }
    
    return null;
  }
  
  async extractTextFromImage(image: HTMLImageElement): Promise<string> {
    const result = await this.ocr.recognize(image);
    return result.text;
  }
  
  private extractText(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }
}
```

#### 场景二：智能评论生成

```typescript
// src/content/utils/aiCommentGenerator.ts
import { LocalLLM } from './webLLM';

export class AICommentGenerator {
  private llm: LocalLLM;
  
  constructor() {
    this.llm = new LocalLLM();
  }
  
  async generateComment(context: {
    productName?: string;
    productDescription?: string;
    userPreferences?: string[];
  }): Promise<string> {
    const prompt = `
基于以下信息，生成一条真实的用户评论（50-100字）：
商品名称：${context.productName || '未知'}
商品描述：${context.productDescription || '无'}
用户偏好：${context.userPreferences?.join(', ') || '无'}

要求：
1. 评论要真实自然，不要过于完美
2. 可以包含一些小缺点
3. 语气要像真实用户
4. 长度控制在 50-100 字
`;
    
    return await this.llm.generate(prompt, {
      temperature: 0.8, // 更高的温度，增加随机性
      maxTokens: 200,
    });
  }
  
  async generateMultipleComments(count: number, context: any): Promise<string[]> {
    const comments: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const comment = await this.generateComment(context);
      comments.push(comment);
      
      // 添加延迟，避免过快请求
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return comments;
  }
}
```

### 5. WASM 自定义模块

#### 使用 Rust 编写 WASM 模块

```rust
// src/wasm/processor/src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ImageProcessor {
    width: u32,
    height: u32,
}

#[wasm_bindgen]
impl ImageProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> ImageProcessor {
        ImageProcessor { width, height }
    }
    
    #[wasm_bindgen]
    pub fn process(&self, image_data: &[u8]) -> Vec<u8> {
        // 图像处理逻辑（如滤波、边缘检测等）
        image_data.to_vec()
    }
    
    #[wasm_bindgen]
    pub fn grayscale(&self, image_data: &[u8]) -> Vec<u8> {
        let mut result = Vec::new();
        for chunk in image_data.chunks(4) {
            if chunk.len() == 4 {
                let r = chunk[0] as f32;
                let g = chunk[1] as f32;
                let b = chunk[2] as f32;
                let gray = (r * 0.299 + g * 0.587 + b * 0.114) as u8;
                result.push(gray);
                result.push(gray);
                result.push(gray);
                result.push(chunk[3]); // alpha
            }
        }
        result
    }
}
```

编译：
```bash
# 安装 wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# 编译
wasm-pack build --target web
```

#### 在插件中使用

```typescript
// src/content/utils/wasmProcessor.ts
import init, { ImageProcessor } from '../../wasm/processor/pkg/processor';

export class WASMImageProcessor {
  private processor: ImageProcessor | null = null;
  private initialized = false;
  
  async init() {
    if (!this.initialized) {
      await init();
      this.initialized = true;
    }
  }
  
  async processImage(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
    await this.init();
    
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    this.processor = new ImageProcessor(canvas.width, canvas.height);
    const processed = this.processor.grayscale(imageData.data);
    
    // 创建新的 canvas
    const newCanvas = document.createElement('canvas');
    newCanvas.width = canvas.width;
    newCanvas.height = canvas.height;
    const newCtx = newCanvas.getContext('2d')!;
    
    const newImageData = new ImageData(
      new Uint8ClampedArray(processed),
      canvas.width,
      canvas.height
    );
    
    newCtx.putImageData(newImageData, 0, 0);
    
    return newCanvas;
  }
}
```

## 🛠️ 实战练习

### 练习 1：OCR + LLM 智能文档理解

创建一个工具，可以识别图片中的文字，然后用 LLM 理解内容：

```typescript
// src/content/utils/smartDocumentReader.ts
import { OCRService } from './ocr';
import { LocalLLM } from './webLLM';

export class SmartDocumentReader {
  private ocr: OCRService;
  private llm: LocalLLM;
  
  constructor() {
    this.ocr = new OCRService();
    this.llm = new LocalLLM();
  }
  
  async readAndUnderstand(image: HTMLImageElement): Promise<{
    text: string;
    summary: string;
    keyPoints: string[];
  }> {
    // 1. OCR 识别
    const ocrResult = await this.ocr.recognize(image);
    const text = ocrResult.text;
    
    // 2. LLM 理解和总结
    const prompt = `
请分析以下文本内容，提供：
1. 一句话总结
2. 3-5 个关键要点

文本内容：
${text}
`;
    
    const llmResponse = await this.llm.generate(prompt);
    
    // 解析响应（这里简化处理）
    return {
      text,
      summary: llmResponse.split('\n')[0],
      keyPoints: llmResponse.split('\n').slice(1).filter(line => line.trim()),
    };
  }
}
```

## 📝 总结

- WASM 提供接近原生的性能
- Tesseract.js 可以实现本地 OCR
- WebLLM 可以在浏览器中运行本地 LLM
- 端侧 AI 保护隐私，不需要网络请求
- 可以结合 OCR + LLM 实现智能文档处理

## ⚠️ 注意事项

- WASM 模块会增加插件体积
- LLM 模型文件很大（几百 MB 到几 GB）
- 首次加载需要下载和初始化模型
- OCR 识别率取决于图像质量
- 本地 LLM 性能不如云端 API

## 🔗 扩展阅读

- [WebAssembly 官方文档](https://webassembly.org/)
- [Tesseract.js](https://github.com/naptha/tesseract.js)
- [WebLLM](https://github.com/mlc-ai/web-llm)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/)

