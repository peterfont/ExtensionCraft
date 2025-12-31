# 项目 B：全自动社交媒体矩阵助手

## 📋 项目概述

**自动化黑科技** - 一键采集小红书/抖音博主信息，自动点赞、自动评论（带 AI 生成评论）。

## 🎯 核心功能

1. **博主信息采集**
   - 自动提取博主资料
   - 保存笔记/视频数据
   - 导出为 Excel

2. **自动点赞**
   - 批量点赞笔记
   - 模拟真实用户行为
   - 随机延迟

3. **AI 评论生成**
   - 基于内容生成评论
   - 模拟真实用户语气
   - 批量评论

## 🛠️ 技术实现

### 1. 数据采集

```typescript
// src/content/xiaohongshu/collector.ts
export class BloggerCollector {
  async collectBloggerInfo() {
    const info = {
      name: this.extractName(),
      followers: this.extractFollowers(),
      notes: await this.collectNotes(),
    };
    
    await chrome.runtime.sendMessage({
      type: 'save-blogger-info',
      data: info,
    });
    
    return info;
  }
  
  private extractName(): string {
    return document.querySelector('.user-name')?.textContent || '';
  }
  
  private extractFollowers(): number {
    const text = document.querySelector('.follower-count')?.textContent || '0';
    return parseInt(text.replace(/,/g, ''));
  }
  
  private async collectNotes(): Promise<any[]> {
    // 滚动加载所有笔记
    await this.scrollToLoadAll();
    
    const notes: any[] = [];
    const noteElements = document.querySelectorAll('.note-item');
    
    noteElements.forEach(el => {
      notes.push({
        title: el.querySelector('.title')?.textContent,
        likes: el.querySelector('.like-count')?.textContent,
        url: el.querySelector('a')?.href,
      });
    });
    
    return notes;
  }
  
  private async scrollToLoadAll() {
    let lastHeight = document.body.scrollHeight;
    while (true) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) break;
      lastHeight = newHeight;
    }
  }
}
```

### 2. 自动点赞

```typescript
// src/content/xiaohongshu/autoLike.ts
import { RealEventGenerator } from '@/shared/utils/realEvents';
import { HumanBehavior } from '@/shared/utils/humanBehavior';

export class AutoLiker {
  async likeAll() {
    const likeButtons = document.querySelectorAll('.like-button:not(.liked)');
    
    for (const button of Array.from(likeButtons)) {
      await RealEventGenerator.humanClick(button as HTMLElement);
      await HumanBehavior.randomDelay(1000, 3000);
    }
  }
}
```

### 3. AI 评论生成

```typescript
// src/content/xiaohongshu/autoComment.ts
import { AICommentGenerator } from '@/shared/utils/aiCommentGenerator';

export class AutoCommenter {
  private commentGenerator: AICommentGenerator;
  
  constructor() {
    this.commentGenerator = new AICommentGenerator();
  }
  
  async commentOnNote(noteContent: string) {
    const comment = await this.commentGenerator.generateComment({
      productDescription: noteContent,
    });
    
    // 输入评论
    const commentInput = document.querySelector('.comment-input') as HTMLTextAreaElement;
    await RealEventGenerator.type(commentInput, comment);
    
    // 提交
    const submitButton = document.querySelector('.submit-comment') as HTMLButtonElement;
    await RealEventGenerator.humanClick(submitButton);
  }
}
```

## 📝 总结

这个项目展示了：
- 数据采集和导出
- 自动化操作（CDP/真实事件）
- AI 内容生成
- 批量任务管理

