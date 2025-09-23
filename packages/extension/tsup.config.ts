import { defineConfig } from 'tsup'
export default defineConfig({
  entry: {
    'background/index': 'src/background/index.ts',
    'content/inject': 'src/content/inject.ts',
    'content/intercept': 'src/content/intercept.ts',
    'content/coach': 'src/content/coach.ts'
  },
  format: ['esm'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  target: 'es2020',
  outDir: 'dist'
})
