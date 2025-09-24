let injected = false

const STYLE_ID = 'checkred-admin-theme'

const STYLE_CONTENT = `:root { color-scheme: light dark; }
.checkred-overlay { position: fixed; right: 24px; bottom: 24px; width: min(360px, calc(100vw - 32px)); z-index: 2147483646; display: grid; gap: 12px; pointer-events: none; }
.checkred-card { background: #ffffff; border-radius: 16px; border: 1px solid rgba(148,163,184,0.45); padding: 18px 20px; box-shadow: 0 18px 45px rgba(15,23,42,0.18); color: #0f172a; pointer-events: auto; font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: grid; gap: 12px; }
.checkred-card header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.checkred-card h2 { font-size: 16px; font-weight: 600; margin: 0; color: inherit; }
.checkred-card p { margin: 0; font-size: 13px; line-height: 1.5; color: rgba(15,23,42,0.78); }
.checkred-card footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.checkred-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 10px; border-radius: 999px; }
.checkred-badge[data-risk="low"] { background: rgba(34,197,94,0.15); color: #047857; }
.checkred-badge[data-risk="medium"] { background: rgba(251,191,36,0.18); color: #92400e; }
.checkred-badge[data-risk="high"] { background: rgba(248,113,113,0.18); color: #b91c1c; }
.checkred-badge[data-risk="critical"] { background: rgba(190,24,93,0.18); color: #be185d; }
.checkred-badge[data-risk="info"] { background: rgba(59,130,246,0.18); color: #1d4ed8; }
.checkred-subtle { color: rgba(15,23,42,0.55); font-size: 12px; }
.checkred-preview { border: 1px dashed rgba(148,163,184,0.55); background: rgba(148,163,184,0.08); border-radius: 12px; padding: 12px; max-height: 160px; overflow-y: auto; font-size: 13px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.checkred-button { appearance: none; border-radius: 999px; border: 1px solid transparent; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.18s ease; font-family: inherit; }
.checkred-button:focus-visible { outline: 2px solid rgba(59,130,246,0.55); outline-offset: 2px; }
.checkred-button--primary { background: #2563eb; color: #f8fafc; box-shadow: 0 10px 30px rgba(37,99,235,0.25); }
.checkred-button--primary:hover { background: #1d4ed8; }
.checkred-button--ghost { background: transparent; color: #1d4ed8; border-color: rgba(148,163,184,0.5); }
.checkred-button--ghost:hover { background: rgba(59,130,246,0.08); }
.checkred-highlight { outline: 2px solid rgba(37,99,235,0.45); outline-offset: 2px; border-radius: 8px; transition: outline 0.18s ease; }
.checkred-dismiss { position: absolute; top: 12px; right: 12px; background: transparent; border: none; color: rgba(15,23,42,0.55); font-size: 12px; font-weight: 600; cursor: pointer; }
.checkred-dismiss:hover { color: #0f172a; }
.checkred-grid { display: grid; gap: 10px; }
.checkred-metadata { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: rgba(15,23,42,0.6); }
.checkred-meta-chip { padding: 4px 8px; border-radius: 999px; background: rgba(148,163,184,0.18); font-weight: 600; }
.checkred-pill-group { display: flex; flex-wrap: wrap; gap: 6px; }
.checkred-pill { padding: 4px 8px; border-radius: 999px; background: rgba(148,163,184,0.16); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(15,23,42,0.65); }
.checkred-toast-host { position: fixed; right: 24px; bottom: 24px; width: min(320px, calc(100vw - 32px)); z-index: 2147483647; display: grid; gap: 10px; pointer-events: none; }
.checkred-toast { background: #ffffff; border: 1px solid rgba(148,163,184,0.4); border-radius: 14px; padding: 14px 18px; box-shadow: 0 16px 38px rgba(15,23,42,0.18); color: #0f172a; pointer-events: auto; display: grid; gap: 6px; font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif; animation: checkred-fade-in 0.18s ease forwards; }
.checkred-toast header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.checkred-toast h3 { margin: 0; font-size: 14px; font-weight: 600; }
.checkred-toast p { margin: 0; font-size: 12px; line-height: 1.45; opacity: 0.8; }
.checkred-toast[data-variant="success"] { border-color: rgba(34,197,94,0.45); }
.checkred-toast[data-variant="warning"] { border-color: rgba(251,191,36,0.45); }
.checkred-toast[data-variant="error"] { border-color: rgba(248,113,113,0.45); }
.checkred-toast[data-variant="info"] { border-color: rgba(59,130,246,0.45); }
.checkred-toast button { appearance: none; background: transparent; border: none; color: rgba(15,23,42,0.55); font-weight: 600; font-size: 12px; cursor: pointer; }
.checkred-toast button:hover { color: #0f172a; }
@keyframes checkred-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-color-scheme: dark) {
  .checkred-card { background: #0b1120; border-color: rgba(148,163,184,0.22); color: #e2e8f0; box-shadow: 0 20px 50px rgba(15,23,42,0.55); }
  .checkred-card p { color: rgba(226,232,240,0.75); }
  .checkred-subtle { color: rgba(148,163,184,0.75); }
  .checkred-preview { background: rgba(30,41,59,0.66); border-color: rgba(148,163,184,0.35); color: #e2e8f0; }
  .checkred-button--ghost { color: #93c5fd; border-color: rgba(148,163,184,0.35); }
  .checkred-button--ghost:hover { background: rgba(59,130,246,0.18); }
  .checkred-button--primary { background: #3b82f6; color: #f8fafc; }
  .checkred-button--primary:hover { background: #2563eb; }
  .checkred-dismiss { color: rgba(148,163,184,0.65); }
  .checkred-dismiss:hover { color: rgba(226,232,240,0.92); }
  .checkred-meta-chip { background: rgba(59,130,246,0.2); color: #bfdbfe; }
  .checkred-pill { background: rgba(59,130,246,0.15); color: #bfdbfe; }
  .checkred-toast { background: #0f172a; border-color: rgba(148,163,184,0.28); color: #e2e8f0; box-shadow: 0 18px 45px rgba(15,23,42,0.58); }
  .checkred-toast p { opacity: 0.82; }
  .checkred-toast button { color: rgba(148,163,184,0.7); }
  .checkred-toast button:hover { color: rgba(226,232,240,0.95); }
}
`

export function ensureCheckredTheme() {
  if (injected) return
  try {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLE_CONTENT
    document.head?.appendChild(style) ?? document.documentElement.appendChild(style)
    injected = true
  } catch (error) {
    console.error('[Checkred AI Security] theme injection failed', error)
  }
}
