import { test, expect, chromium } from '@playwright/test'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { AddressInfo } from 'node:net'
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const BACKEND_URL = 'http://127.0.0.1:8080'

let backendProc: ChildProcessWithoutNullStreams | undefined
let testServer: http.Server | undefined
let testPageUrl = ''

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function probe(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const target = new URL(url)
    const client = target.protocol === 'https:' ? https : http
    const request = client.get(target, (response) => {
      response.resume()
      response.on('end', () => {
        const status = response.statusCode ?? 0
        resolve(status >= 200 && status < 300)
      })
    })
    request.on('error', () => resolve(false))
    request.end()
  })
}

async function waitForHealth(url: string, timeoutMs = 10_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await probe(url)) return
    await wait(250)
  }
  throw new Error(`Timed out waiting for backend health check at ${url}`)
}

async function startBackend() {
  const proc = spawn('python3', ['-m', 'backend.api.scripts.mock_server', '--host', '127.0.0.1', '--port', '8080'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  proc.stdout.setEncoding('utf-8')
  proc.stderr.setEncoding('utf-8')

  const logs: string[] = []

  proc.stdout.on('data', (data: string) => {
    logs.push(data)
  })
  proc.stderr.on('data', (data: string) => {
    logs.push(data)
  })

  await waitForHealth(`${BACKEND_URL}/v1/health`).catch(async (error) => {
    proc.kill('SIGINT')
    await wait(250)
    throw new Error(`Backend failed to start:\n${logs.join('') || '[no logs]'}`, { cause: error })
  })

  backendProc = proc
}

async function stopBackend() {
  if (!backendProc) return
  await new Promise<void>((resolve) => {
    backendProc?.once('exit', () => resolve())
    backendProc?.kill('SIGINT')
    setTimeout(() => backendProc?.kill('SIGKILL'), 5_000)
  })
  backendProc = undefined
}

async function createTestPageServer() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Prompt Shield Smoke Test</title>
</head>
<body>
  <h1>Prompt Shield Test Harness</h1>
  <form id="prompt-form">
    <label for="prompt">Prompt</label>
    <textarea id="prompt" name="prompt" rows="8" cols="40"></textarea>
    <button type="submit">Send</button>
  </form>
</body>
</html>`

  testServer = http.createServer((request, response) => {
    if (!request.url || request.url === '/' || request.url.startsWith('/?')) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(html)
      return
    }
    response.statusCode = 404
    response.end()
  })

  await new Promise<void>((resolve, reject) => {
    testServer?.once('error', reject)
    testServer?.listen(0, '127.0.0.1', () => resolve())
  })

  const address = testServer?.address() as AddressInfo
  testPageUrl = `http://127.0.0.1:${address.port}/`
}

async function stopTestServer() {
  if (!testServer) return
  await new Promise<void>((resolve, reject) => {
    testServer?.close((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
  testServer = undefined
}

test.beforeAll(async () => {
  await startBackend()
  await createTestPageServer()
})

test.afterAll(async () => {
  await stopTestServer()
  await stopBackend()
})

test('blocks secret paste and logs telemetry', async () => {
  const extensionDir = path.resolve(REPO_ROOT, 'apps/extension/dist')
  await fs.access(extensionDir)

  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'playwright-chrome-'))

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  })

  try {
    const page = await context.newPage()
    await page.goto(testPageUrl)
    await page.waitForLoadState('load')
    await page.waitForTimeout(500)

    const secretValue = 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234'

    const ingestResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/v1/events/ingest') && response.request().method() === 'POST',
    )
    const dialogPromise = page.waitForEvent('dialog')

    await page.locator('textarea#prompt').click()

    await page.evaluate((payload) => {
      const textarea = document.querySelector<HTMLTextAreaElement>('textarea#prompt')
      if (!textarea) throw new Error('Textarea not found')
      const transfer = new DataTransfer()
      transfer.setData('text/plain', payload)
      const event = new ClipboardEvent('paste', { clipboardData: transfer })
      textarea.dispatchEvent(event)
    }, secretValue)

    const dialog = await dialogPromise
    await expect(dialog.message()).toContain('Sensitive content detected in clipboard')
    await dialog.dismiss()

    const response = await ingestResponsePromise
    expect(response.status()).toBe(200)

    const request = response.request()
    const raw = request.postData()
    expect(raw).toBeTruthy()

    const payload = JSON.parse(raw ?? '[]') as Array<Record<string, unknown>>
    expect(Array.isArray(payload)).toBeTruthy()
    const event = payload[0]
    expect(event?.action).toBe('paste.intercept')
    expect(event?.outcome).toBe('blocked')

    await expect(page.locator('textarea#prompt')).toHaveValue('')
  } finally {
    await context.close()
    await fs.rm(userDataDir, { recursive: true, force: true })
  }
})
