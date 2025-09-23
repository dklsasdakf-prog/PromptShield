export const sha256 = async (s: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(s)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
export const tokenizeSample = async (text: string, salt: string): Promise<string> => await sha256(text + salt)
export const dateKey = (d = new Date()) => d.toISOString().slice(0, 10) // YYYY-MM-DD
