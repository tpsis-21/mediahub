import pg from 'pg'
import jwt from 'jsonwebtoken'

const { Pool } = pg

const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' })
const userResult = await pool.query('select id from app_users order by created_at asc limit 1')
const userId = userResult.rows[0]?.id
if (!userId) {
  console.log('no user')
  await pool.end()
  process.exit(1)
}

const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET || '', {
  algorithm: 'HS256',
  expiresIn: '30m',
})

const body = {
  mediaType: 'movie',
  id: 557,
  trailerId: 'PlulyWs1kS4',
  layout: 'portrait',
  includeLogo: true,
  includeCta: true,
  includePhone: false,
  includeWebsite: false,
  ctaText: 'Dica',
  synopsisTheme: 'default',
  limitDuration: false,
}

const res = await fetch('http://127.0.0.1:8088/api/video-branding/trailer', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(body),
})

console.log('status', res.status)
console.log('content-type', res.headers.get('content-type') || '')
if ((res.headers.get('content-type') || '').includes('application/json')) {
  const text = await res.text()
  console.log('body', text.slice(0, 1200))
}

await pool.end()
