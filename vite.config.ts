import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { resolve } from 'path'

type BuildTarget = 'content' | 'background'
const target = (process.env.BUILD_TARGET as BuildTarget | undefined) ?? 'content'

// Content script와 background service worker는 Chrome MV3에서 허용하는 모듈
// 포맷이 다르다.
//   - content script: ESM import 구문을 지원하지 않아 반드시 IIFE로 단일 파일 번들.
//   - background (service worker): manifest에 "type": "module"이면 ESM 사용 가능.
// 두 엔트리를 한 번에 빌드하면 Rollup이 공유 모듈을 별도 chunks/*.js로 쪼개면서
// content.js가 `import` 구문을 갖게 되어 Chrome이 로드에 실패한다. 그래서 빌드를
// BUILD_TARGET에 따라 두 번 나눠서 수행한다.
const config = {
  content: {
    input: resolve(__dirname, 'src/content/index.tsx'),
    entryFileName: 'content.js',
    format: 'iife' as const,
    emptyOutDir: true,
    publicDir: 'public' as string | false,
  },
  background: {
    input: resolve(__dirname, 'src/background/background.ts'),
    entryFileName: 'background.js',
    format: 'es' as const,
    emptyOutDir: false,
    publicDir: false as string | false,
  },
}[target]

export default defineConfig({
  plugins: [
    react(),
    // `import Icon from './foo.svg?react'` 형태로 SVG를 React 컴포넌트로 import.
    // icon: true → <svg>의 고정 width/height를 제거해 props로 크기 제어 가능.
    svgr({
      svgrOptions: { icon: true },
      include: '**/*.svg?react',
    }),
  ],
  publicDir: config.publicDir,
  build: {
    outDir: 'dist',
    emptyOutDir: config.emptyOutDir,
    rollupOptions: {
      input: config.input,
      // 각 엔트리를 하나의 파일로 강제하여 content.js가 import 구문을 포함하지 않도록 한다.
      // (content script는 ESM import 불가)
      output: {
        entryFileNames: config.entryFileName,
        assetFileNames: 'assets/[name].[ext]',
        format: config.format,
        codeSplitting: false,
      },
    },
  },
})
