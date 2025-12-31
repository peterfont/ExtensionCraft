# 项目 C：本地硬件桥接器

## 📋 项目概述

网页端点击"导出"，自动调用本地 Python 脚本将数据写入桌面的 Excel 文件，并打开文件夹。

## 🎯 核心功能

1. **数据导出**
   - 网页数据导出到 Excel
   - 调用本地 Python 脚本
   - 自动打开文件位置

2. **本地文件操作**
   - 读取/写入本地文件
   - 调用系统命令
   - 打印机操作

## 🛠️ 技术实现

### 1. Native Host 配置

```json
// native-host-manifest.json
{
  "name": "com.mycompany.fileexporter",
  "description": "File Exporter Native Host",
  "path": "/path/to/file_exporter.py",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<extension-id>/"
  ]
}
```

### 2. Python Native Host

```python
# file_exporter.py
import sys
import json
import struct
import openpyxl
from openpyxl import Workbook
import os
from pathlib import Path

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        sys.exit(0)
    message_length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

def send_message(message):
    encoded_content = json.dumps(message).encode('utf-8')
    encoded_length = struct.pack('@I', len(encoded_content))
    sys.stdout.buffer.write(encoded_length)
    sys.stdout.buffer.write(encoded_content)
    sys.stdout.buffer.flush()

def export_to_excel(data, filepath):
    wb = Workbook()
    ws = wb.active
    
    if data:
        # 写入表头
        headers = list(data[0].keys())
        ws.append(headers)
        
        # 写入数据
        for row in data:
            ws.append([row.get(key, '') for key in headers])
    
    wb.save(filepath)
    return filepath

def main():
    while True:
        try:
            message = read_message()
            
            if message.get('type') == 'export_excel':
                data = message.get('data', [])
                filename = message.get('filename', 'export.xlsx')
                
                # 保存到桌面
                desktop = Path.home() / 'Desktop'
                filepath = desktop / filename
                
                export_to_excel(data, str(filepath))
                
                send_message({
                    'type': 'success',
                    'data': {
                        'filepath': str(filepath),
                        'message': 'File exported successfully'
                    }
                })
            
            elif message.get('type') == 'open_folder':
                folder_path = message.get('path')
                import subprocess
                import platform
                
                if platform.system() == 'Windows':
                    os.startfile(folder_path)
                elif platform.system() == 'Darwin':
                    subprocess.Popen(['open', folder_path])
                else:
                    subprocess.Popen(['xdg-open', folder_path])
                
                send_message({
                    'type': 'success',
                    'data': {'message': 'Folder opened'}
                })
            
        except Exception as e:
            send_message({
                'type': 'error',
                'error': str(e)
            })

if __name__ == '__main__':
    main()
```

### 3. 插件端调用

```typescript
// src/shared/utils/fileExporter.ts
import { nativeMessagingClient } from '@/background/nativeMessaging';

export class FileExporter {
  async exportToExcel(data: any[], filename: string = 'export.xlsx'): Promise<string> {
    const response = await nativeMessagingClient.send({
      type: 'export_excel',
      data,
      filename,
    });
    
    return response.filepath;
  }
  
  async openFolder(path: string): Promise<void> {
    await nativeMessagingClient.send({
      type: 'open_folder',
      path,
    });
  }
  
  async exportAndOpen(data: any[], filename: string): Promise<void> {
    const filepath = await this.exportToExcel(data, filename);
    const folderPath = filepath.substring(0, filepath.lastIndexOf('/'));
    await this.openFolder(folderPath);
  }
}
```

## 📝 总结

这个项目展示了：
- Native Messaging 通信
- 本地文件操作
- Python 脚本集成
- 跨平台兼容处理

