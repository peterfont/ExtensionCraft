# 11. 降维打击：Native Messaging 原生通信

## 📚 学习目标

- 理解 Native Messaging 的工作原理
- 实现插件与本地程序的通信
- 调用 Python/Go/Rust 脚本
- 实战：本地文件操作、系统级功能调用

## 🎯 核心知识点

### 1. Native Messaging 简介

Native Messaging 允许浏览器插件与本地应用程序通信，突破浏览器沙箱限制：

- **突破沙箱**：访问本地文件系统、调用系统 API
- **无限可能**：使用任何编程语言（Python、Go、Rust、C++ 等）
- **高性能**：处理复杂计算、大数据操作

### 2. 工作原理

```
┌─────────────┐      JSON      ┌──────────────┐      stdin/stdout      ┌─────────────┐
│   Extension │ ─────────────► │ Native Host  │ ─────────────────────► │ Local App   │
│             │                │ (Manifest)   │                        │ (Python/Go) │
└─────────────┘                └──────────────┘                        └─────────────┘
```

### 3. 配置 Native Host

#### 创建 Native Host Manifest（Windows）

```json
// C:\Users\<username>\AppData\Local\Google\Chrome\User Data\NativeMessagingHosts\com.mycompany.myapp.json
{
  "name": "com.mycompany.myapp",
  "description": "My Native Messaging Host",
  "path": "C:\\path\\to\\native-host.exe",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<your-extension-id>/"
  ]
}
```

#### 创建 Native Host Manifest（macOS/Linux）

```json
// ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.mycompany.myapp.json (macOS)
// ~/.config/google-chrome/NativeMessagingHosts/com.mycompany.myapp.json (Linux)

{
  "name": "com.mycompany.myapp",
  "description": "My Native Messaging Host",
  "path": "/path/to/native-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<your-extension-id>/"
  ]
}
```

### 4. Python Native Host 实现

#### Python 脚本

```python
# native_host.py
import sys
import json
import struct

# 读取消息（Chrome 使用 4 字节长度前缀）
def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        sys.exit(0)
    message_length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

# 发送消息
def send_message(message):
    encoded_content = json.dumps(message).encode('utf-8')
    encoded_length = struct.pack('@I', len(encoded_content))
    sys.stdout.buffer.write(encoded_length)
    sys.stdout.buffer.write(encoded_content)
    sys.stdout.buffer.flush()

# 主循环
def main():
    while True:
        try:
            message = read_message()
            
            # 处理不同类型的消息
            if message.get('type') == 'ping':
                send_message({'type': 'pong', 'data': 'Hello from Python!'})
            
            elif message.get('type') == 'read_file':
                file_path = message.get('path')
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    send_message({
                        'type': 'success',
                        'data': content
                    })
                except Exception as e:
                    send_message({
                        'type': 'error',
                        'error': str(e)
                    })
            
            elif message.get('type') == 'write_file':
                file_path = message.get('path')
                content = message.get('content')
                try:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    send_message({
                        'type': 'success',
                        'data': 'File written successfully'
                    })
                except Exception as e:
                    send_message({
                        'type': 'error',
                        'error': str(e)
                    })
            
            elif message.get('type') == 'exec_command':
                import subprocess
                command = message.get('command')
                try:
                    result = subprocess.run(
                        command,
                        shell=True,
                        capture_output=True,
                        text=True,
                        timeout=30
                    )
                    send_message({
                        'type': 'success',
                        'data': {
                            'stdout': result.stdout,
                            'stderr': result.stderr,
                            'returncode': result.returncode
                        }
                    })
                except Exception as e:
                    send_message({
                        'type': 'error',
                        'error': str(e)
                    })
            
            else:
                send_message({
                    'type': 'error',
                    'error': f'Unknown message type: {message.get("type")}'
                })
        
        except Exception as e:
            send_message({
                'type': 'error',
                'error': str(e)
            })

if __name__ == '__main__':
    main()
```

#### 打包为可执行文件

```bash
# 使用 PyInstaller
pip install pyinstaller
pyinstaller --onefile native_host.py
```

### 5. Go Native Host 实现

```go
// native_host.go
package main

import (
    "encoding/binary"
    "encoding/json"
    "fmt"
    "io"
    "os"
    "os/exec"
    "time"
)

// 读取消息
func readMessage() (map[string]interface{}, error) {
    var length uint32
    if err := binary.Read(os.Stdin, binary.LittleEndian, &length); err != nil {
        return nil, err
    }
    
    messageBytes := make([]byte, length)
    if _, err := io.ReadFull(os.Stdin, messageBytes); err != nil {
        return nil, err
    }
    
    var message map[string]interface{}
    if err := json.Unmarshal(messageBytes, &message); err != nil {
        return nil, err
    }
    
    return message, nil
}

// 发送消息
func sendMessage(message map[string]interface{}) error {
    messageBytes, err := json.Marshal(message)
    if err != nil {
        return err
    }
    
    length := uint32(len(messageBytes))
    if err := binary.Write(os.Stdout, binary.LittleEndian, length); err != nil {
        return err
    }
    
    if _, err := os.Stdout.Write(messageBytes); err != nil {
        return err
    }
    
    return nil
}

func main() {
    for {
        message, err := readMessage()
        if err != nil {
            if err == io.EOF {
                break
            }
            sendMessage(map[string]interface{}{
                "type":  "error",
                "error": err.Error(),
            })
            continue
        }
        
        msgType, ok := message["type"].(string)
        if !ok {
            sendMessage(map[string]interface{}{
                "type":  "error",
                "error": "Missing type field",
            })
            continue
        }
        
        switch msgType {
        case "ping":
            sendMessage(map[string]interface{}{
                "type": "pong",
                "data": "Hello from Go!",
            })
        
        case "exec_command":
            command, _ := message["command"].(string)
            cmd := exec.Command("sh", "-c", command)
            output, err := cmd.CombinedOutput()
            if err != nil {
                sendMessage(map[string]interface{}{
                    "type":  "error",
                    "error": err.Error(),
                })
            } else {
                sendMessage(map[string]interface{}{
                    "type": "success",
                    "data": string(output),
                })
            }
        
        default:
            sendMessage(map[string]interface{}{
                "type":  "error",
                "error": fmt.Sprintf("Unknown type: %s", msgType),
            })
        }
    }
}
```

编译：
```bash
go build -o native_host native_host.go
```

### 6. 插件端实现

#### Native Messaging 客户端

```typescript
// src/background/nativeMessaging.ts
export class NativeMessagingClient {
  private port: chrome.runtime.Port | null = null;
  private messageQueue: Array<{
    message: any;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }> = [];
  private messageIdCounter = 0;
  
  connect(hostName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.port = chrome.runtime.connectNative(hostName);
        
        this.port.onMessage.addListener((response) => {
          this.handleMessage(response);
        });
        
        this.port.onDisconnect.addListener(() => {
          const error = chrome.runtime.lastError;
          if (error) {
            console.error('Native messaging disconnected:', error.message);
            this.rejectAll(new Error(error.message));
          }
          this.port = null;
        });
        
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
  
  send(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.port) {
        reject(new Error('Not connected to native host'));
        return;
      }
      
      const messageId = ++this.messageIdCounter;
      const messageWithId = {
        ...message,
        id: messageId,
      };
      
      this.messageQueue.push({
        message: messageWithId,
        resolve,
        reject,
      });
      
      try {
        this.port.postMessage(messageWithId);
      } catch (error) {
        this.messageQueue.pop();
        reject(error);
      }
    });
  }
  
  private handleMessage(response: any) {
    const messageId = response.id;
    const queueItem = this.messageQueue.find(item => item.message.id === messageId);
    
    if (queueItem) {
      const index = this.messageQueue.indexOf(queueItem);
      this.messageQueue.splice(index, 1);
      
      if (response.type === 'error') {
        queueItem.reject(new Error(response.error));
      } else {
        queueItem.resolve(response.data || response);
      }
    }
  }
  
  private rejectAll(error: Error) {
    this.messageQueue.forEach(item => item.reject(error));
    this.messageQueue = [];
  }
  
  disconnect() {
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    this.rejectAll(new Error('Disconnected'));
  }
  
  isConnected(): boolean {
    return this.port !== null;
  }
}

// 全局实例
export const nativeMessagingClient = new NativeMessagingClient();

// 初始化连接
async function init() {
  try {
    await nativeMessagingClient.connect('com.mycompany.myapp');
    console.log('Connected to native host');
  } catch (error) {
    console.error('Failed to connect to native host:', error);
  }
}

init();
```

#### 封装常用操作

```typescript
// src/shared/utils/nativeOperations.ts
import { nativeMessagingClient } from '@/background/nativeMessaging';

export class NativeOperations {
  // 读取文件
  static async readFile(path: string): Promise<string> {
    return await nativeMessagingClient.send({
      type: 'read_file',
      path,
    });
  }
  
  // 写入文件
  static async writeFile(path: string, content: string): Promise<void> {
    await nativeMessagingClient.send({
      type: 'write_file',
      path,
      content,
    });
  }
  
  // 执行命令
  static async execCommand(command: string): Promise<{
    stdout: string;
    stderr: string;
    returncode: number;
  }> {
    return await nativeMessagingClient.send({
      type: 'exec_command',
      command,
    });
  }
  
  // 打开文件
  static async openFile(path: string): Promise<void> {
    const command = process.platform === 'win32'
      ? `start "" "${path}"`
      : process.platform === 'darwin'
        ? `open "${path}"`
        : `xdg-open "${path}"`;
    
    await this.execCommand(command);
  }
  
  // 打开文件夹
  static async openFolder(path: string): Promise<void> {
    const command = process.platform === 'win32'
      ? `explorer "${path}"`
      : process.platform === 'darwin'
        ? `open "${path}"`
        : `xdg-open "${path}"`;
    
    await this.execCommand(command);
  }
  
  // 导出 Excel（需要 Python 脚本支持）
  static async exportToExcel(data: any[], filePath: string): Promise<void> {
    await nativeMessagingClient.send({
      type: 'export_excel',
      data,
      path: filePath,
    });
  }
  
  // 打印文件
  static async printFile(filePath: string): Promise<void> {
    const command = process.platform === 'win32'
      ? `print /D:printer "${filePath}"`
      : process.platform === 'darwin'
        ? `lpr "${filePath}"`
        : `lp "${filePath}"`;
    
    await this.execCommand(command);
  }
}
```

### 7. 实战案例：数据导出到 Excel

#### Python 脚本（处理 Excel）

```python
# excel_export.py (集成到 native_host.py)
elif message.get('type') == 'export_excel':
    import openpyxl
    from openpyxl import Workbook
    
    data = message.get('data', [])
    file_path = message.get('path')
    
    try:
        wb = Workbook()
        ws = wb.active
        
        if data:
            # 写入表头
            headers = list(data[0].keys())
            ws.append(headers)
            
            # 写入数据
            for row in data:
                ws.append([row.get(key, '') for key in headers])
        
        wb.save(file_path)
        send_message({
            'type': 'success',
            'data': f'Excel file saved to {file_path}'
        })
    except Exception as e:
        send_message({
            'type': 'error',
            'error': str(e)
        })
```

#### 插件中使用

```typescript
// src/popup/components/DataExporter.vue
<script setup lang="ts">
import { NativeOperations } from '@/shared/utils/nativeOperations';

const data = ref([
  { name: '张三', age: 25, city: '北京' },
  { name: '李四', age: 30, city: '上海' },
]);

async function exportToExcel() {
  try {
    const filePath = '~/Desktop/exported_data.xlsx';
    await NativeOperations.exportToExcel(data.value, filePath);
    
    // 打开文件所在文件夹
    await NativeOperations.openFolder('~/Desktop');
    
    alert('导出成功！');
  } catch (error) {
    console.error('Export failed:', error);
    alert('导出失败：' + error.message);
  }
}
</script>

<template>
  <button @click="exportToExcel">导出到 Excel</button>
</template>
```

## 🛠️ 实战练习

### 练习 1：创建安装脚本

创建一个自动安装 Native Host 的脚本：

```typescript
// src/background/nativeHostInstaller.ts
export class NativeHostInstaller {
  async install(): Promise<void> {
    // 获取扩展 ID
    const extensionId = chrome.runtime.id;
    
    // 生成 manifest 内容
    const manifest = {
      name: 'com.mycompany.myapp',
      description: 'My Native Messaging Host',
      path: this.getNativeHostPath(),
      type: 'stdio',
      allowed_origins: [
        `chrome-extension://${extensionId}/`
      ]
    };
    
    // 调用本地安装脚本
    // 注意：这需要用户手动运行一次，因为需要管理员权限
    await this.showInstallInstructions(manifest);
  }
  
  private getNativeHostPath(): string {
    // 根据平台返回路径
    if (process.platform === 'win32') {
      return 'C:\\Program Files\\MyApp\\native_host.exe';
    } else if (process.platform === 'darwin') {
      return '/usr/local/bin/native_host';
    } else {
      return '/usr/bin/native_host';
    }
  }
  
  private async showInstallInstructions(manifest: any) {
    // 显示安装说明
    chrome.tabs.create({
      url: chrome.runtime.getURL('install.html'),
    });
  }
}
```

## 📝 总结

- Native Messaging 允许插件与本地程序通信
- 需要配置 Native Host Manifest
- 支持任何编程语言（Python、Go、Rust 等）
- 可以实现文件操作、系统调用等高级功能
- 需要用户安装 Native Host 程序

## ⚠️ 注意事项

- Native Host 需要用户手动安装
- 跨平台路径处理要小心
- 消息格式必须符合规范（4字节长度前缀 + JSON）
- 注意安全性，不要执行未经验证的命令
- Native Host 程序需要有执行权限

## 🔗 扩展阅读

- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/mv3/nativeMessaging/)
- [Native Messaging 示例](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api/nativeMessaging)

