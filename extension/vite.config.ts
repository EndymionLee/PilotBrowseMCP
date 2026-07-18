import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync, cpSync, rmSync } from 'fs';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content.ts'),
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    target: 'es2022',
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    {
      name: 'copy-extension-files',
      closeBundle() {
        const dist = resolve(__dirname, 'dist');
        const root = __dirname;

        // 复制 manifest.json
        copyFileSync(resolve(root, 'manifest.json'), resolve(dist, 'manifest.json'));

        // 复制 _locales（多语言）
        const localesSrc = resolve(root, '_locales');
        const localesDst = resolve(dist, '_locales');
        if (existsSync(localesSrc) && !existsSync(localesDst)) {
          mkdirSync(localesDst, { recursive: true });
          cpSync(localesSrc, localesDst, { recursive: true });
        }

        // 复制 icons
        const iconsSrc = resolve(root, 'public/icons');
        const iconsDst = resolve(dist, 'icons');
        if (existsSync(iconsSrc) && !existsSync(iconsDst)) {
          mkdirSync(iconsDst, { recursive: true });
          cpSync(iconsSrc, iconsDst, { recursive: true });
        }

        // 把 popup HTML 从 dist/src/popup/ 移到 dist/popup/
        const srcPopup = resolve(dist, 'src/popup/index.html');
        const dstPopupDir = resolve(dist, 'popup');
        if (existsSync(srcPopup)) {
          if (!existsSync(dstPopupDir)) mkdirSync(dstPopupDir, { recursive: true });
          copyFileSync(srcPopup, resolve(dstPopupDir, 'index.html'));
          // 清理 src 目录
          const srcDir = resolve(dist, 'src');
          rmSync(srcDir, { recursive: true, force: true });
        }
      },
    },
  ],
});
