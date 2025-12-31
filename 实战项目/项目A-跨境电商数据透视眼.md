# 项目 A：跨境电商数据透视眼

## 📋 项目概述

**商业价值极高** - 在亚马逊/淘宝详情页自动嵌入历史价格曲线、销量预测等数据。

## 🎯 核心功能

1. **价格历史追踪**
   - 自动记录商品价格变化
   - 显示价格趋势曲线
   - 价格提醒功能

2. **销量预测**
   - 基于历史数据分析
   - 预测未来销量趋势
   - 展示销量图表

3. **竞品对比**
   - 对比同类商品价格
   - 显示性价比分析

## 🛠️ 技术实现

### 1. 项目结构

```
amazon-price-tracker/
├── manifest.json
├── package.json
├── vite.config.ts
├── src/
│   ├── background/
│   │   ├── index.ts
│   │   └── priceTracker.ts
│   ├── content/
│   │   ├── index.ts
│   │   ├── pricePanel.ts
│   │   └── chart.ts
│   ├── popup/
│   │   ├── index.html
│   │   └── App.vue
│   └── shared/
│       ├── types/
│       └── utils/
```

### 2. Content Script 注入

```typescript
// src/content/index.ts
import { PricePanel } from './pricePanel';

class AmazonPriceTracker {
  private panel: PricePanel;
  
  init() {
    // 检测页面类型
    if (this.isProductPage()) {
      this.panel = new PricePanel();
      this.panel.inject();
      this.loadPriceData();
    }
  }
  
  private isProductPage(): boolean {
    return window.location.pathname.includes('/dp/') || 
           window.location.pathname.includes('/gp/product/');
  }
  
  private async loadPriceData() {
    const productId = this.extractProductId();
    const priceData = await chrome.runtime.sendMessage({
      type: 'get-price-history',
      productId,
    });
    
    this.panel.updatePriceData(priceData);
  }
  
  private extractProductId(): string {
    // 从 URL 提取商品 ID
    const match = window.location.pathname.match(/\/dp\/([A-Z0-9]+)/);
    return match ? match[1] : '';
  }
}

new AmazonPriceTracker().init();
```

### 3. 价格面板 UI

```typescript
// src/content/pricePanel.ts
import { createShadowRoot } from '@/shared/utils/shadowDOM';
import { renderChart } from './chart';

export class PricePanel {
  private container: HTMLElement;
  private shadowRoot: ShadowRoot;
  
  inject() {
    this.container = document.createElement('div');
    this.container.id = 'price-tracker-panel';
    this.shadowRoot = createShadowRoot(this.container);
    
    // 插入到商品信息区域
    const targetElement = document.querySelector('#productDetails_feature_div');
    if (targetElement) {
      targetElement.insertAdjacentElement('beforebegin', this.container);
    }
    
    this.render();
  }
  
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        .price-panel {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 16px;
          margin: 16px 0;
        }
        .price-trend {
          height: 200px;
        }
      </style>
      <div class="price-panel">
        <h3>价格趋势</h3>
        <div class="price-trend" id="chart"></div>
        <div class="price-info">
          <div>当前价格：<span id="current-price"></span></div>
          <div>历史最低：<span id="lowest-price"></span></div>
          <div>平均价格：<span id="avg-price"></span></div>
        </div>
      </div>
    `;
  }
  
  updatePriceData(data: any) {
    const chartElement = this.shadowRoot.getElementById('chart');
    if (chartElement) {
      renderChart(chartElement, data);
    }
    
    // 更新价格信息
    this.shadowRoot.getElementById('current-price')!.textContent = `$${data.current}`;
    this.shadowRoot.getElementById('lowest-price')!.textContent = `$${data.lowest}`;
    this.shadowRoot.getElementById('avg-price')!.textContent = `$${data.average}`;
  }
}
```

### 4. 价格数据采集

```typescript
// src/background/priceTracker.ts
export class PriceTracker {
  async trackPrice(productId: string, price: number) {
    const history = await this.getPriceHistory(productId);
    
    history.push({
      price,
      timestamp: Date.now(),
    });
    
    await chrome.storage.local.set({
      [`price_${productId}`]: history,
    });
  }
  
  async getPriceHistory(productId: string): Promise<Array<{price: number; timestamp: number}>> {
    const key = `price_${productId}`;
    const { [key]: history } = await chrome.storage.local.get(key);
    return history || [];
  }
  
  async analyzePrice(productId: string) {
    const history = await this.getPriceHistory(productId);
    
    if (history.length === 0) return null;
    
    const prices = history.map(h => h.price);
    const current = prices[prices.length - 1];
    const lowest = Math.min(...prices);
    const highest = Math.max(...prices);
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    return {
      current,
      lowest,
      highest,
      average,
      history,
    };
  }
}
```

### 5. 图表渲染

```typescript
// src/content/chart.ts
import * as echarts from 'echarts';

export function renderChart(container: HTMLElement, data: any) {
  const chart = echarts.init(container);
  
  const option = {
    xAxis: {
      type: 'time',
    },
    yAxis: {
      type: 'value',
      name: '价格 ($)',
    },
    series: [{
      data: data.history.map((item: any) => [item.timestamp, item.price]),
      type: 'line',
      smooth: true,
    }],
  };
  
  chart.setOption(option);
}
```

## 📝 总结

这个项目整合了：
- Content Script UI 注入
- 数据采集和存储
- 图表可视化
- Shadow DOM 样式隔离

