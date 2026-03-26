import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

const __rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
dotenv.config({ path: path.join(__rootDir, '.env') })

const { Pool } = pg

const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

const generateRandomPassword = (length = 14) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

const createPasswordDigest = (password) => {
  const salt = crypto.randomBytes(16)
  const iterations = 120000
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('base64')
  return {
    hash,
    salt: salt.toString('base64'),
    iterations,
  }
}

const databaseUrl = process.env.DATABASE_URL || ''
if (!databaseUrl) {
  console.error('[reset-admin-password] DATABASE_URL não configurado no .env')
  process.exit(1)
}

const explicitEmailArg = String(process.argv[2] || '').trim()
const emailArg = normalizeEmail(explicitEmailArg || process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@mediahub.com')
const passwordArg = String(process.argv[3] || '').trim()
const nextPassword = passwordArg || generateRandomPassword(14)
const digest = createPasswordDigest(nextPassword)

const pool = new Pool({ connectionString: databaseUrl })

try {
  const result = await pool.query(
    `
    update app_users
       set password_hash = $1,
           password_salt = $2,
           password_iterations = $3,
           updated_at = now()
     where email = $4
       and type = 'admin'
     returning id, email, type
    `,
    [digest.hash, digest.salt, digest.iterations, emailArg]
  )

  let user = result.rows[0]
  if (!user) {
    const fallbackAdmin = await pool.query(
      `
      select id, email, type
        from app_users
       where type = 'admin'
       order by is_active desc, created_at asc
       limit 1
      `
    )
    user = fallbackAdmin.rows[0]
    if (!user) {
      console.error('[reset-admin-password] Nenhum usuário admin encontrado no banco.')
      process.exit(2)
    }
    await pool.query(
      `
      update app_users
         set password_hash = $1,
             password_salt = $2,
             password_iterations = $3,
             updated_at = now()
       where id = $4
      `,
      [digest.hash, digest.salt, digest.iterations, user.id]
    )
  }

  console.log('[reset-admin-password] Senha redefinida com sucesso.')
  console.log(`email: ${user.email}`)
  console.log(`senha: ${nextPassword}`)
} catch (error) {
  console.error('[reset-admin-password] Falha ao resetar senha:', error)
  process.exit(1)
} finally {
  await pool.end()
}
