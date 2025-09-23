import crypto from 'crypto'
export const sha256 = (s:string)=>crypto.createHash('sha256').update(s).digest('hex')
export const tokenizeSample = (text:string, salt:string)=>sha256(text+salt)
export const dateKey = (d=new Date()) => d.toISOString().slice(0,10) // YYYY-MM-DD
