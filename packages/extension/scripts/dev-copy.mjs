import { context as createContext } from 'esbuild'
import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const srcDir = path.join(rootDir, 'src')
const distDir = path.join(rootDir, 'dist')
const watchMode = process.argv.includes('--watch')

await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })

const ctx = await createContext({
  entryPoints: [
    path.join(srcDir, 'background', 'index.ts'),
    path.join(srcDir, 'content', 'inject.ts'),
  ],
  outdir: distDir,
  outbase: srcDir,
  bundle: false,
  format: 'esm',
  platform: 'browser',
  sourcemap: true,
  target: ['chrome109'],
  logLevel: 'info',
})

if (watchMode) {
  await ctx.watch()
  console.log('PromptShield extension watch mode enabled — compiling on changes.')
} else {
  await ctx.rebuild()
  await ctx.dispose()
}

await cp(path.join(rootDir, 'manifest.json'), path.join(distDir, 'manifest.json'))
