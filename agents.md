

# Checkred AI Security — **AGENTS.md (World‑Class Build Playbook)**

> You (Copilot/Codex) are my multi‑agent engineering team. You can run shell commands, create/modify files, and generate code where instructed. Use **npm workspaces**, Node ≥18, macOS/Linux. After each step, **confirm success** (or fix automatically). **Do not store raw PII** anywhere. Default to **fail‑closed** if uncertain.

**Delivery Model (MVP):** Cross‑browser **Extension + Tiny Native Agent (later)**  
**Focus (Detect‑first):** Prompt redaction, output vetting, shadow‑AI detection + redirect, telemetry, basic risk‑adaptive policy.  
**Scope:** Works on **any AI web UI** (ChatGPT, Claude, Gemini, Copilot, etc.).  
**Design:** Modern & minimal, WCAG‑AA compliant, 21st.dev theme.  
**Compliance posture:** “No PII by default” logging, tokenization + hashing, daily salt rotation, DSR purge, region aware (local only in MVP).  
**Target OS:** macOS, Linux (browsers: Chrome, Edge; optional Firefox later).

---

## 0) Global Conventions

- **Monorepo layout**
  ```
  packages/
    extension/         # MV3 extension (TS)
    admin-console/     # Vite + React + TS (UI)
    shared/            # Types, tokenizer, policy DSL helpers
    native-agent/      # (Phase N) tiny daemon for advanced controls
  ```
- **Workspace commands (npm)**  
  Use `npm -w packages/<name> run <script>` to target a workspace.
- **TypeScript everywhere** for new code; strict mode.
- **Secrets/PII**: never persist raw prompts/outputs; use hashing/tokenization with rotating salts.
- **Feature flags**: gate risky or heavy logic behind flags in policy.
- **Testing**: vitest + playwright (later).
- **Docs**: Every step that modifies product behavior updates README and MANUAL‑QA.md.

---

## 1) Prereqs & Bootstrap

### 1.1 — Tooling
**Prompt to execute**
```
You are my Bootstrap Agent.

1) Ensure Node >= 18 and npm:
   node -v && npm -v

2) Install workspace deps at repo root (where package.json defines workspaces):
   npm install

3) Initialize lint/format/test (admin-console first):
   npm i -w packages/admin-console -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react eslint-plugin-react-hooks prettier vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
   npm pkg set -w packages/admin-console scripts.lint="eslint 'src/**/*.{ts,tsx}'"
   npm pkg set -w packages/admin-console scripts.test="vitest --environment jsdom"

4) Create shared editor config:
   tee .editorconfig <<'EOF'
   root = true
   [*]
   end_of_line = lf
   insert_final_newline = true
   charset = utf-8
   indent_style = space
   indent_size = 2
   EOF
```

### 1.2 — Git Hygiene
**Prompt to execute**
```
1) Add .gitignore:
   tee .gitignore <<'EOF'
   node_modules
   dist
   .DS_Store
   *.log
   coverage
   .vite
   EOF

2) Prettier config:
   tee .prettierrc <<'JSON'
   { "singleQuote": true, "semi": false, "trailingComma": "es5" }
   JSON
```

---

## 2) Shared Contracts & Utilities

### 2.1 — Types & Tokenizers
**Prompt to execute**
```
You are my Shared Contracts Agent.

1) Expand packages/shared/index.ts:
   tee packages/shared/index.ts <<'TS'
   export type Risk = 'low'|'medium'|'high'|'critical'
   export type Action = 'allow'|'block'|'sanitize'|'flag'

   export interface PolicyRule {
     id: string
     name: string
     condition: string   // DSL string (see below)
     action: Action
     enabled: boolean
     riskLevel: Risk
   }

   export interface Policy {
     id: string
     name: string
     version: number
     rules: PolicyRule[]
     allowlist?: string[]   // sanctioned hosts
     dryRun?: boolean
     featureFlags?: Record<string, boolean>
   }

   export interface TelemetryEvent {
     ts: number
     userHash: string
     hostHash: string
     app: string
     type: 'prompt'|'output'|'shadow-ai'|'policy'
     action: Action
     risk: Risk
     redactionCount?: number
     sampleHash?: string
     findings?: { type:string; line?:number; message:string; severity:Risk }[]
     dryRun?: boolean
   }

   export interface RedactionResult { sanitized: string; redactions: number; reasons: string[] }

   export const defaultPolicy: Policy = {
     id: 'default',
     name: 'Checkred AI Security Default',
     version: 1,
     dryRun: false,
     allowlist: ['chat.openai.com','claude.ai','gemini.google.com','bing.com'],
     featureFlags: { outputVetting: true, coachToasts: true, copySafely: true },
     rules: [
       { id:'r1', name:'Block unsanctioned AI', condition:'app NOT_IN allowlist', action:'block', enabled:true, riskLevel:'medium' },
       { id:'r2', name:'Sanitize secrets', condition:'contains(secrets)', action:'sanitize', enabled:true, riskLevel:'high' }
     ]
   }
   TS

2) Add tokenizer & DSL helpers:
   tee packages/shared/tokenize.ts <<'TS'
   import crypto from 'crypto'
   export const sha256 = (s:string)=>crypto.createHash('sha256').update(s).digest('hex')
   export const tokenizeSample = (text:string, salt:string)=>sha256(text+salt)
   export const dateKey = (d=new Date()) => d.toISOString().slice(0,10) // YYYY-MM-DD
   TS

   tee packages/shared/policy.ts <<'TS'
   import { Policy } from './index'
   export function evalCondition(cond: string, ctx: Record<string, any>): boolean {
     // Tiny interpreter: supports app IN/NOT_IN allowlist; contains(secrets)
     const norm = cond.trim()
     if (/^app\s+NOT_IN\s+allowlist$/i.test(norm)) return !ctx.allowlist?.some((h:string)=>ctx.app.endsWith(h))
     if (/^app\s+IN\s+allowlist$/i.test(norm)) return !!ctx.allowlist?.some((h:string)=>ctx.app.endsWith(h))
     if (/^contains\(secrets\)$/i.test(norm)) return !!ctx.secretsFound
     // Fallback: false
     return false
   }
   export function decide(policy: Policy, ctx: Record<string, any>) {
     for (const r of policy.rules) {
       if (!r.enabled) continue
       if (evalCondition(r.condition, ctx)) return { action:r.action, rule:r }
     }
     return { action:'allow', rule: null }
   }
   TS
```

### Acceptance
- `@checkred-ai-security/shared` exports types, `defaultPolicy`, `tokenize.ts`, and a trivial policy evaluator.

---

## 3) Extension (MV3, TypeScript, Detect‑First)

### 3.1 — Tooling & Build
**Prompt to execute**
```
You are my Extension Agent.

1) Install deps:
   npm i -w packages/extension -D typescript tsup esbuild chokidar zod nanoid webextension-polyfill

2) Add tsconfig:
   tee packages/extension/tsconfig.json <<'JSON'
   { "compilerOptions": { "target":"ES2020","lib":["ES2020","DOM"],"module":"ESNext","moduleResolution":"Bundler","strict":true,"skipLibCheck":true,"types":["chrome"] }, "include": ["src/**/*"] }
   JSON

3) tsup config:
   tee packages/extension/tsup.config.ts <<'TS'
   import { defineConfig } from 'tsup'
   export default defineConfig({
     entry: {
       'background/index': 'src/background/index.ts',
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
   TS

4) NPM scripts:
   npm pkg set -w packages/extension scripts.build="tsup"
   npm pkg set -w packages/extension scripts.dev="chokidar 'src/**/*.ts' -c 'npm -w packages/extension run build'"
```

### 3.2 — Manifest & Selectors
**Prompt to execute**
```
1) Ensure manifest (MV3) uses built files:
   npx -y json -I -f packages/extension/manifest.json -e "this.background.service_worker='background/index.js'; this.content_scripts=[{matches:['<all_urls>'],js:['content/intercept.js','content/coach.js'],run_at:'document_idle'}]; this.permissions=['storage','scripting','tabs','activeTab','notifications']; this.host_permissions=['<all_urls>']"

2) Add site selectors:
   tee packages/extension/src/shared/site-selectors.ts <<'TS'
   export const Targets = {
     chatgpt: { host: /(^|\\.)openai\\.com$/, prompt: 'textarea, [data-id=prompt-textarea]', streamSelector: 'div[data-message-author-role=assistant]' },
     claude:  { host: /(^|\\.)claude\\.ai$/, prompt: 'textarea', streamSelector: '[data-test=message]' },
     gemini:  { host: /(^|\\.)gemini\\.google\\.com$/, prompt: 'textarea', streamSelector: 'chat-message,textarea' },
     copilot: { host: /(^|\\.)bing\\.com$/, prompt: 'textarea,[contenteditable=true]', streamSelector: '[aria-live=polite]' }
   } as const
   TS
```

### 3.3 — Content: Interceptor & Coach
**Prompt to execute**
```
1) Interceptor:
   tee packages/extension/src/content/intercept.ts <<'TS'
   import { Targets } from '../shared/site-selectors'
   const host = location.hostname
   const match = Object.values(Targets).find(t => t.host.test(host))

   function findPromptEl(): HTMLTextAreaElement | HTMLInputElement | null {
     if(!match) return null
     return document.querySelector(match.prompt) as any
   }

   async function sendPrompt(prompt: string) {
     const res = await chrome.runtime.sendMessage({ type: 'PROMPT_SUBMIT', prompt, url: location.href })
     if (!res) return prompt
     if (res.action === 'block') {
       window.dispatchEvent(new CustomEvent('checkred:coach', { detail: { type:'error', title:'Blocked', message: res.reason || 'Sensitive content detected. Prompt not sent.' } }))
       throw new Error('Prompt blocked')
     }
     if (res.action === 'sanitize' && res.text) {
       window.dispatchEvent(new CustomEvent('checkred:coach', { detail: { type:'warning', title:'Sanitized', message:`${res.redactions} sensitive item(s) redacted.` } }))
       return res.text
     }
     return prompt
   }

   function hookSubmit() {
     const el = findPromptEl()
     if(!el) return
     el.addEventListener('keydown', async (e: KeyboardEvent) => {
       if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
         const target = e.target as HTMLTextAreaElement
         const original = target.value || (target as any).innerText || ''
         try {
           const safe = await sendPrompt(original)
           if (safe !== original) {
             target.value = safe
             ;(target as any).dispatchEvent(new Event('input', { bubbles:true }))
           }
         } catch { e.preventDefault() }
       }
     }, { capture: true })
   }

   function observeOutputs() {
     if(!match) return
     const root = document.body
     const observer = new MutationObserver(async (muts) => {
       for (const m of muts) {
         m.addedNodes.forEach(async (n) => {
           if (!(n instanceof HTMLElement)) return
           if (match.streamSelector && n.matches?.(match.streamSelector)) {
             const text = n.innerText.slice(0, 4000)
             const res = await chrome.runtime.sendMessage({ type:'OUTPUT_OBSERVED', text, url: location.href })
             if (res?.warnings?.length) {
               window.dispatchEvent(new CustomEvent('checkred:coach', { detail: { type:'info', title:'Output check', message:`${res.warnings.length} warning(s) in model output.` } }))
             }
           }
         })
       }
     })
     observer.observe(root, { childList: true, subtree: true })
   }

   hookSubmit()
   observeOutputs()
   import('./coach')
   TS

2) Coach UI (toasts):
   tee packages/extension/src/content/coach.ts <<'TS'
   type Variant = 'info'|'success'|'warning'|'error'
   function ensureHost() {
     let host = document.getElementById('checkred-coach')
     if (host) return host
     host = document.createElement('div')
     host.id = 'checkred-coach'
     host.style.position = 'fixed'
     host.style.right = '16px'
     host.style.bottom = '16px'
     host.style.zIndex = '2147483647'
     document.body.appendChild(host)
     return host
   }
   function toast(variant:Variant, title:string, message:string) {
     const host = ensureHost()
     const el = document.createElement('div')
     el.setAttribute('role','alert')
     el.style.cssText = 'min-width:280px;max-width:360px;margin-top:8px;padding:10px 12px;border-radius:10px;background:#0b0b0c;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35);font:13px/1.35 system-ui, -apple-system, Segoe UI, Roboto'
     const bar = {info:'#3b82f6',success:'#22c55e',warning:'#f59e0b',error:'#ef4444'}[variant]
     el.style.border = `1px solid ${bar}`
     el.innerHTML = `<div style="font-weight:600;margin-bottom:2px">${title}</div><div style="opacity:.8">${message}</div>`
     host.appendChild(el)
     setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(10px)'; el.style.transition='all .25s ease'; setTimeout(()=>el.remove(), 250)}, 3500)
     if (navigator.vibrate) try { navigator.vibrate(50) } catch {}
   }
   window.addEventListener('checkred:coach', (e:any) => {
     toast(e.detail.type, e.detail.title, e.detail.message)
   })
   TS
```

### 3.4 — Background: Sanitizer, Risk, Shadow‑AI, Output Vetting
**Prompt to execute**
```
1) Background logic:
   tee packages/extension/src/background/index.ts <<'TS'
   import { defaultPolicy, Policy, RedactionResult } from '../../../shared/index'
   import { sha256, tokenizeSample, dateKey } from '../../../shared/tokenize'

   async function getPolicy(): Promise<Policy> {
     const p = await chrome.storage.sync.get(['ps:policy'])
     return p['ps:policy'] || defaultPolicy
   }
   async function setPolicy(policy: Policy) { await chrome.storage.sync.set({ 'ps:policy': policy }) }

   async function getSalt(): Promise<string> {
     const key = 'ps:salt:'+dateKey()
     const s = await chrome.storage.local.get([key])
     if (s[key]) return s[key]
     const v = crypto.getRandomValues(new Uint32Array(8)).join('-')
     await chrome.storage.local.set({ [key]: v })
     return v
   }

   const secretRegexes = [
     /sk-[a-zA-Z0-9]{20,}/g,
     /(?i)aws(.{0,10})?(access|secret)_?key[:=]\\s*([A-Za-z0-9\\/+=]{16,})/g,
     /AIza[0-9A-Za-z\\-_]{35}/g,
     /\\b\\d{3}-\\d{2}-\\d{4}\\b/g,
     /\\b(?:\\d[ -]*?){13,19}\\b/g
   ]
   function sanitize(text: string): RedactionResult {
     let redactions = 0
     let sanitized = text
     for (const re of secretRegexes) {
       sanitized = sanitized.replace(re, () => { redactions++; return '[REDACTED]' })
     }
     const reasons = redactions ? ['secrets_detected'] : []
     return { sanitized, redactions, reasons }
   }

   function analyzeOutput(text: string) {
     const findings: { type:string; line?:number; message:string; severity:'low'|'medium'|'high'|'critical' }[] = []
     const lines = text.split(/\\r?\\n/)
     const dangerCmd = /(rm -rf\\s+\\/|powershell\\s+-enc|Invoke-WebRequest|curl\\s+.*\\|\\s+sh)/i
     const urlRe = /https?:\\/\\/[^\\s)]+/ig
     lines.forEach((ln, i)=>{
       if (dangerCmd.test(ln)) findings.push({ type:'dangerous_command', line:i+1, message:'Potentially destructive command found', severity:'high' })
       const urls = ln.match(urlRe)||[]
       urls.forEach(u=>findings.push({ type:'url', line:i+1, message:`Link: ${u}`, severity:'medium' }))
     })
     if (/sk-[a-zA-Z0-9]{20,}/.test(text)) findings.push({ type:'secret_like', message:'API-key like token in output', severity:'high' })
     return findings
   }

   async function logEvent(evt: any) {
     const salt = await getSalt()
     const key = 'ps:events'
     const curr = (await chrome.storage.local.get([key]))[key] || []
     // Cap 10k
     curr.push(evt); if (curr.length > 10000) curr.shift()
     await chrome.storage.local.set({ [key]: curr })
   }

   chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
     (async () => {
       const policy = await getPolicy()
       const allowlist = policy.allowlist || defaultPolicy.allowlist!
       if (msg.type === 'PROMPT_SUBMIT') {
         const url = new URL(msg.url)
         const sanctioned = allowlist.some(h => url.hostname.endsWith(h))
         const { sanitized, redactions, reasons } = sanitize(String(msg.prompt||''))

         const ctx = { app: url.hostname, allowlist, secretsFound: redactions>0 }
         const decision = ((): { action:'allow'|'block'|'sanitize'; reason?:string } => {
           // Policy r1/r2 via trivial evaluator
           if (!sanctioned) return { action:'block', reason:'Unsanctioned AI host' }
           if (redactions>0) return { action:'sanitize', reason:'Secrets detected' }
           return { action:'allow' }
         })()

         // DRY-RUN?
         const dry = !!policy.dryRun
         const action = dry ? 'allow' : decision.action
         const salt = await getSalt()
         const evt = {
           ts: Date.now(),
           userHash: sha256('dev-user'),
           hostHash: sha256(url.hostname),
           app: url.hostname,
           type: 'prompt',
           action,
           risk: redactions>1 ? 'critical' : redactions===1 ? 'high' : sanctioned ? 'low' : 'medium',
           redactionCount: redactions,
           sampleHash: tokenizeSample(String(msg.prompt||'').slice(0,256), salt),
           dryRun: dry
         }
         await logEvent(evt)

         if (dry && decision.action!=='allow') { sendResponse({ action:'allow', dryRun:true, wouldHave: decision.action, reason: decision.reason }); return }
         if (decision.action==='block') { sendResponse({ action:'block', reason: decision.reason }); return }
         if (decision.action==='sanitize') { sendResponse({ action:'sanitize', text: sanitized, redactions, reasons }); return }
         sendResponse({ action:'allow' }); return
       }
       if (msg.type === 'OUTPUT_OBSERVED') {
         const url = new URL(msg.url)
         const findings = analyzeOutput(String(msg.text||''))
         await logEvent({
           ts: Date.now(), userHash: sha256('dev-user'), hostHash: sha256(url.hostname),
           app: url.hostname, type:'output', action:'allow', risk: findings.length? 'medium':'low', findings
         })
         sendResponse({ warnings: findings })
         return
       }
       // Admin bridge messages
       if (msg.type === 'PS_GET_POLICY') sendResponse(await getPolicy())
       if (msg.type === 'PS_SET_POLICY') { await setPolicy(msg.policy); sendResponse({ ok:true }) }
       if (msg.type === 'PS_EXPORT_EVENTS') {
         const rows = (await chrome.storage.local.get(['ps:events']))['ps:events']||[]
         const ndjson = rows.map((r:any)=>JSON.stringify(r)).join('\\n')
         sendResponse({ ndjson })
       }
     })()
     return true
   })
   TS

2) Build:
   npm run -w packages/extension build
```

### Acceptance
- Built files exist in `packages/extension/dist/`.
- On ChatGPT, ⌘/Ctrl+Enter triggers sanitize/block with coach toasts.
- Unsanctioned host gets blocked (fail‑closed unless dry‑run).

---

## 4) Admin Console (UI, Policy, Events, Export)

### 4.1 — Tailwind + Theme + Pages
**Prompt to execute**
```
You are my Admin UI Agent.

1) Ensure tailwind in admin-console and index.css imported (Phase 1 had it). If missing, add.

2) Create bridge for now (dev mode, mocked extension messaging):
   tee packages/admin-console/src/lib/bridge.ts <<'TS'
   export async function getPolicy(){ return (await fetch('/api/mock-policy.json').catch(()=>null))?.json?.() ?? null }
   export async function savePolicy(p:any){ localStorage.setItem('ps:policy-ui', JSON.stringify(p)); return true }
   export async function getEvents(){ const raw = localStorage.getItem('ps:events-ui'); return raw? JSON.parse(raw): [] }
   export async function exportEvents(ndjson:string){ const blob = new Blob([ndjson],{type:'application/x-ndjson'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='checkred-ai-security-telemetry.ndjson'; a.click() }
   TS

3) Wire PolicyEditor to load/save from bridge; add Dry-Run toggle saved alongside policy.

4) EventsDashboard: render virtualized table showing (ts, app, action, risk, redactionCount); add "Export" button calling a dev stub that fetches ndjson via bridge (will map to extension later).

5) Add AppCatalog page to manage allowlist (table of sanctioned hosts, add/remove). Persist to localStorage for now.
```

### Acceptance
- Admin shows Dashboard, Policy Editor (edit/add rules), App Catalog (allowlist), Export button.

---

## 5) Shadow‑AI Detection & Redirect

### 5.1 — Policy‑driven allowlist & redirect microcopy
**Prompt to execute**
```
You are my Shadow-AI Agent.

1) Add to background: upon PROMPT_SUBMIT on unsanctioned host, if policy.featureFlags.coachToasts true:
   - sendResponse({ action:'block', reason:'This AI service is not approved. Redirecting to a sanctioned tool.' })
   - Optional: open a sanctioned tool tab via chrome.tabs.create({ url:'https://chat.openai.com' }) if configured `policy.redirectTo`

2) In admin Policy Editor add a field 'Redirect unsanctioned to' (string URL) stored in policy.
```

### Acceptance
- Visiting unknown AI sites triggers block + (optional) redirect.

---

## 6) Output Vetting UX (Inline Warnings, Copy Safely)

### 6.1 — Inline banners & safe copy
**Prompt to execute**
```
You are my Output Vetting UI Agent.

1) Extend content/intercept to, on OUTPUT_OBSERVED warnings:
   - For each AI message node, insert a small banner DIV at the top with summary (e.g., "2 warnings"). Include buttons:
     a) "Learn why" → dispatch coach toast with educational copy.
     b) "Copy safely" → removes dangerous commands / tokens, then copies.

2) Implement 'copySafely(node:Element)': extracts textContent; strips matches of dangerous regex; writes to clipboard; shows coach success.
```

### Acceptance
- Warnings visible inline; safe copy mutates clipboard content (user‑visible confirmation).

---

## 7) Risk‑Adaptive Policy & Dry‑Run

### 7.1 — Policy evaluation details
**Prompt to execute**
```
You are my Policy Engine Agent v2.

1) Extend policy.ts evaluator to support:
   - `risk >= high`
   - `when host IN allowlist`
   - `when contains(pattern:<name>)` where pattern resolves to a named detector group (e.g., 'secrets', 'financial').
2) Create detectors.ts in shared with named regex groups for 'secrets', 'financial', 'credentials'.
3) Update background to compute detector flags once per prompt/output and pass to evaluator ctx.
```

### Acceptance
- Rules can target named detector groups and risk thresholds.

---

## 8) Privacy & DPIA Enforcement

### 8.1 — No‑PII logging + rotating salts + DSR
**Prompt to execute**
```
You are my Privacy Agent.

1) Background: ensure telemetry stores only hashed fields (userHash, hostHash, sampleHash). Never store raw prompt/output. Add a code comment block stating this policy.

2) Implement daily salt rotation using dateKey(); salts in chrome.storage.local 'ps:salt:<YYYY-MM-DD>'.

3) Add message {type:'PS_DSR_PURGE'} to clear all 'ps:' storage keys. Confirm success.

4) Add README section "Privacy by Default" documenting categories, retention (10k records cap, ~N days), hashing method, daily salt, and DSR flow.
```

### Acceptance
- Storage inspection shows no raw content; DSR purge empties local storage.

---

## 9) UX Microcopy & Accessibility

### 9.1 — Coach microcopy (empathetic, instructive)
- **Sanitized:** “We removed sensitive tokens from your prompt to keep data safe. Review the redactions before sending.”  
- **False‑positive apology:** “Looks like our systems were too cautious. Thanks for flagging—this helps us improve.”  
- **Compliance reason:** “We require additional verification to meet your organization’s compliance standards.”  
- **Teach‑me‑why sidebar:** explain detection rationale, data handling, and links to policy.

### 9.2 — Motion & haptics
- Toast enter: 300ms ease‑out (fade + translateY). Exit: 250ms ease‑in.
- Haptic: light impact on show; selection feedback on action (if supported).
- All banners/controls meet **WCAG‑AA** (contrast; focus ring; ARIA roles).

---

## 10) Native Agent (Stub for Later)

- Responsibilities: screenshot prevention overlays, OS‑level DLP hooks, trusted clipboard integration.
- IPC: postMessage over native messaging host to extension.
- MVP: **deferred**—define folder `packages/native-agent/` and README with TODOs.

---

## 11) QA, Security Testing, & CI

### 11.1 — Manual QA Matrix
- **Unsanctioned host** → block (and optional redirect).  
- **Secrets in prompt** → sanitize & coach warning.  
- **Dangerous output** → warnings + copy safely.  
- **Dry‑run on** → no blocking, “would‑have” in toast.  
- **DSR purge** → storage cleared.  
- Browsers: Chrome stable + Edge stable on macOS & Linux.

### 11.2 — Automated
**Prompt to execute**
```
You are my QA Agent.

1) Admin-console vitest:
   - RiskBadge exposes aria-label with level/score.
   - BannerToast uses role="alert" and dismiss works via keyboard.

2) Add basic Playwright e2e later (deferred) to simulate content script on sandbox page.
```

### 11.3 — Security checks
- Lint against `eval`/Function constructor.
- CSP: content scripts avoid remote code.
- Dependency review + `npm audit` in CI.

### 11.4 — CI
**Prompt to execute**
```
You are my CI Agent.

1) Add .github/workflows/ci.yml:
   - jobs: install → build extension → build admin → run tests.
   - Upload artifacts: extension/dist zip, admin dist.
```

---

## 12) Packaging & Release

- **Chrome/Edge**: load `packages/extension/dist/` unpacked; for store release, zip the `dist` folder with manifest and built files.
- **Firefox (later)**: use `webextension-polyfill` and adapt manifest (MV2/MV3 bridge).

---

## 13) Metrics to Optimize (defensible)

- **Leak Prevention:** `% prompts sanitized or blocked` (target trend ↑ early, then ↓ as users adapt).  
- **Shadow‑AI Reduction:** `unsanctioned → sanctioned redirect rate`.  
- **Unsafe Code Copy Prevention:** `copy-safely clicks / total copies from code blocks`.  
- **False Positive Rate:** `user FP reports / total blocks`.  
- **MTTR for incidents:** time from detection → policy improvement.

---

## 14) Red Team Scenarios (Top 12 Abuse Cases Mapped)

- Prompt injection (malicious web page), data exfil via prompts, malicious outputs (commands/links), agentic actions, shadow‑AI, insider misuse, extension supply‑chain, model‑poisoned content, credential stuffing via output, long‑context data bleed, drive‑by prompts, jailbreak kits.  
**Controls:** interceptors, sanitizer, allowlist, output vetting, copy‑safely, dry‑run + override with step‑up auth, tokenized telemetry, CSP, code signing, update cadence. (Aligns with earlier STRIDE table.)

---

## 15) Admin Information Architecture (MVP)

- **Overview** (KPIs)  
- **Events** (table + export)  
- **Policies** (editor + dry‑run + redirect target + feature flags)  
- **AI App Catalog** (allowlist)  
- **Trust Zone** (frame/watermark demo)  
- **Components** (spec gallery for QA)

---

## 16) Done Definition per Phase

- **Phase 2:** Extension TS, intercept & coach, sanitizer + risk, output vetting minimal, policy storage + dry‑run, admin wiring (policy/events/export), allowlist, privacy safeguards, telemetry export.  
- **Phase 3:** Inline banners + copy safely, detectors expanded, teach‑me‑why.  
- **Phase 4:** Privacy hardening (rotating salts, DSR), docs.  
- **Phase 5:** Packaging + CI + QA docs.  
- **Phase 6:** Simulation page + red team kit.

---

# COPY‑PASTE PROMPTS (ready to run)

For each agent above, use the **“Prompt to execute”** blocks verbatim in order. If a command fails, fix and retry automatically, then continue.

**Quick start commands**
```bash
# Admin dev
npm run -w packages/admin-console dev

# Extension build
npm run -w packages/extension build
```

**Reminder:** *No PII by default.* If unsure → **fail‑closed** and notify user with empathetic microcopy + override path (step‑up auth) and full audit log.
