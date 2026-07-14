import crypto from 'node:crypto'

export const createPasswordDigest = (password) => {
  const salt = crypto.randomBytes(16)
  const iterations = 120000
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('base64')
  return {
    hash,
    salt: salt.toString('base64'),
    iterations,
  }
}

export const generateRandomPassword = (length = 14) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}

export const verifyPassword = ({ password, digest }) => {
  try {
    const salt = Buffer.from(digest.salt, 'base64')
    const computed = crypto.pbkdf2Sync(String(password), salt, digest.iterations, 32, 'sha256')
    const expected = Buffer.from(String(digest.hash || ''), 'base64')
    if (computed.length !== expected.length) return false
    return crypto.timingSafeEqual(computed, expected)
  } catch {
    return false
  }
}
