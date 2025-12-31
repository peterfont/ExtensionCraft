import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import path from 'path';

export default defineConfig({
  plugins: [
    vue(),
    crx({ manifest }),
  ],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@popup': path.resolve(__dirname, './src/popup'),
      '@content': path.resolve(__dirname, './src/content'),
      '@background': path.resolve(__dirname, './src/background'),
    },
  },
  
  build: {
    // 输出目录
    outDir: 'dist',
    
    // 代码分割
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        sidepanel: 'src/sidepanel/index.html',
        background: 'src/background/index.ts',
        content: 'src/content/index.ts',
      },
      output: {
        // 代码分割配置
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `images/[name]-[hash][extname]`;
          }
          if (/woff|woff2|eot|ttf|otf/i.test(ext)) {
            return `fonts/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
      },
    },
    
    // 压缩配置
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  
  // 开发服务器配置（用于预览）
  server: {
    port: 3000,
    strictPort: true,
  },
});

