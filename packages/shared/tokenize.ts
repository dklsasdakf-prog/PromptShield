import crypto from 'crypto'

export const sha256 = (input: string) => crypto.createHash('sha256').update(input).digest('hex')

export const tokenizeSample = (text: string, salt: string) => sha256(text + salt)
