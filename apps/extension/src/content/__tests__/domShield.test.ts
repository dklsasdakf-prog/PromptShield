import { beforeEach, describe, expect, it } from 'vitest'

import { collectVisibleText } from '../domShield'

describe('collectVisibleText', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('counts zero-width and bidi characters while returning visible text', () => {
    const host = document.createElement('div')
    host.textContent = `hello\u200bworld\u202E`
    document.body.appendChild(host)

    const result = collectVisibleText(host)

    expect(result.text).toBe('helloworld')
    expect(result.zeroWidthCount).toBe(1)
    expect(result.bidiCount).toBe(1)
    expect(result.removedSegments).toEqual([])
  })

  it('drops hidden, tiny, white-on-white, and base64-like segments', () => {
    const host = document.createElement('div')
    const visible = document.createElement('p')
    visible.textContent = 'Visible prompt'
    const hiddenDisplay = document.createElement('span')
    hiddenDisplay.style.display = 'none'
    hiddenDisplay.textContent = 'hidden-display'
    const tiny = document.createElement('span')
    tiny.style.fontSize = '0.5px'
    tiny.textContent = 'tiny-text'
    const whiteOnWhite = document.createElement('span')
    whiteOnWhite.style.color = 'rgb(255, 255, 255)'
    whiteOnWhite.style.backgroundColor = 'rgb(255, 255, 255)'
    whiteOnWhite.textContent = 'white-on-white'
    const base64 = document.createElement('span')
    const base64Payload = 'QUJD'.repeat(12)
    base64.textContent = base64Payload

    host.append(visible, hiddenDisplay, tiny, whiteOnWhite, base64)
    document.body.appendChild(host)

    const result = collectVisibleText(host)

    expect(result.text).toBe('Visible prompt')
    expect(result.removedSegments).toEqual(
      expect.arrayContaining(['hidden-display', 'tiny-text', 'white-on-white', base64Payload]),
    )
  })
})
