import { Hono } from 'hono'
import { Database } from 'bun:sqlite'

// TypeScript interfaces
interface Link {
  id?: number
  short_code: string
  original_url: string
  created_at?: string
  clicks: number
}

interface ShortenRequest {
  url: string
}

interface CustomSlugRequest {
  url: string
  slug: string
}

interface AuthRequest {
  password: string
}

interface ShortenResponse {
  short_code: string
  short_url: string
  original_url: string
}

interface ErrorResponse {
  error: string
}

const app = new Hono()

// Initialize SQLite database
const db = new Database('links.db')

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_code TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    clicks INTEGER DEFAULT 0
  )
`)

// Generate random short code
function generateShortCode(length: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Validate URL
function isValidUrl(string: string): boolean {
  try {
    new URL(string)
    return true
  } catch (_) {
    return false
  }
}

// Admin password from env with default
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'doppy'

// Simple token storage (in production, use proper JWT or session management)
const validTokens = new Set<string>()

function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let token = ''
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

function validateToken(authHeader: string | undefined): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false
  }
  const token = authHeader.substring(7)
  return validTokens.has(token)
}

// Validate slug format (alphanumeric, hyphens, underscores)
function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(slug) && slug.length >= 1 && slug.length <= 50
}

// Root endpoint
app.get('/', (c) => {
  return c.json({
    message: 'Link Shortener API is running!'
  })
})

// Create short link
app.post('/shorten', async (c) => {
  try {
    const body = await c.req.json() as ShortenRequest
    const { url } = body
    
    if (!url) {
      return c.json({ error: 'URL is required' } as ErrorResponse, 400)
    }
    
    if (!isValidUrl(url)) {
      return c.json({ error: 'Invalid URL format' } as ErrorResponse, 400)
    }
    
    // Generate unique short code
    let shortCode: string
    let attempts = 0
    const maxAttempts = 10
    
    do {
      shortCode = generateShortCode()
      attempts++
    } while (
      db.query('SELECT id FROM links WHERE short_code = ?').get(shortCode) && 
      attempts < maxAttempts
    )
    
    if (attempts >= maxAttempts) {
      return c.json({ error: 'Failed to generate unique short code' } as ErrorResponse, 500)
    }
    
    // Insert into database
    const insertStmt = db.prepare('INSERT INTO links (short_code, original_url) VALUES (?, ?)')
    insertStmt.run(shortCode, url)
    
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
    
    return c.json({
      short_code: shortCode,
      short_url: `${baseUrl}/${shortCode}`,
      original_url: url
    } as ShortenResponse)
    
  } catch (error) {
    return c.json({ error: 'Invalid JSON or server error' } as ErrorResponse, 400)
  }
})

// Serve admin page
app.get('/admin', async (c) => {
  const file = Bun.file('./admin.html')
  const html = await file.text()
  return c.html(html)
})

// Admin authentication
app.post('/admin/auth', async (c) => {
  try {
    const body = await c.req.json() as AuthRequest
    const { password } = body

    if (password === ADMIN_PASSWORD) {
      const token = generateToken()
      validTokens.add(token)
      return c.json({ token })
    }

    return c.json({ error: 'Invalid password' } as ErrorResponse, 401)
  } catch (error) {
    return c.json({ error: 'Invalid request' } as ErrorResponse, 400)
  }
})

// Create link with custom slug (authenticated)
app.post('/admin/create', async (c) => {
  const authHeader = c.req.header('Authorization')

  if (!validateToken(authHeader)) {
    return c.json({ error: 'Unauthorized' } as ErrorResponse, 401)
  }

  try {
    const body = await c.req.json() as CustomSlugRequest
    const { url, slug } = body

    if (!url) {
      return c.json({ error: 'URL is required' } as ErrorResponse, 400)
    }

    if (!isValidUrl(url)) {
      return c.json({ error: 'Invalid URL format' } as ErrorResponse, 400)
    }

    if (!slug) {
      return c.json({ error: 'Slug is required' } as ErrorResponse, 400)
    }

    if (!isValidSlug(slug)) {
      return c.json({ error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores (1-50 chars)' } as ErrorResponse, 400)
    }

    // Check if slug already exists
    const existing = db.query('SELECT id FROM links WHERE short_code = ?').get(slug)
    if (existing) {
      return c.json({ error: 'This slug is already taken' } as ErrorResponse, 409)
    }

    // Insert into database
    const insertStmt = db.prepare('INSERT INTO links (short_code, original_url) VALUES (?, ?)')
    insertStmt.run(slug, url)

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000'

    return c.json({
      short_code: slug,
      short_url: `${baseUrl}/${slug}`,
      original_url: url
    } as ShortenResponse)

  } catch (error) {
    return c.json({ error: 'Invalid JSON or server error' } as ErrorResponse, 400)
  }
})

// Redirect to original URL
app.get('/:code', (c) => {
  const code = c.req.param('code')
  
  if (!code) {
    return c.json({ error: 'Short code is required' } as ErrorResponse, 400)
  }
  
  // Get link from database
  const link = db.query('SELECT original_url FROM links WHERE short_code = ?').get(code) as { original_url: string } | null
  
  if (!link) {
    return c.json({ error: 'Short link not found' } as ErrorResponse, 404)
  }
  
  // Increment click count
  db.query('UPDATE links SET clicks = clicks + 1 WHERE short_code = ?').run(code)
  
  // Redirect to original URL
  return c.redirect(link.original_url, 302)
})

// Get link statistics
app.get('/stats/:code', (c) => {
  const code = c.req.param('code')
  
  if (!code) {
    return c.json({ error: 'Short code is required' } as ErrorResponse, 400)
  }
  
  const link = db.query(`
    SELECT short_code, original_url, created_at, clicks 
    FROM links 
    WHERE short_code = ?
  `).get(code) as Link | null
  
  if (!link) {
    return c.json({ error: 'Short link not found' } as ErrorResponse, 404)
  }
  
  return c.json(link)
})

// Get all links (authenticated admin endpoint) with pagination
app.get('/admin/links', (c) => {
  const authHeader = c.req.header('Authorization')

  if (!validateToken(authHeader)) {
    return c.json({ error: 'Unauthorized' } as ErrorResponse, 401)
  }

  // Parse pagination query params
  const page = parseInt(c.req.query('page') || '1', 10)
  const limit = parseInt(c.req.query('limit') || '50', 10)
  const offset = (page - 1) * limit
  const search = c.req.query('search') || ''

  //If not valid integer, return 400
  if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
    return c.json({ error: 'Invalid pagination parameters' } as ErrorResponse, 400)
  }

  // Build query based on search
  let links: Link[]
  let total: { count: number }

  if (search) {
    const searchPattern = `%${search}%`
    total = db.query(`SELECT COUNT(*) as count FROM links WHERE short_code LIKE ? OR original_url LIKE ?`).get(searchPattern, searchPattern) as { count: number }
    links = db.query(`
      SELECT short_code, original_url, created_at, clicks
      FROM links
      WHERE short_code LIKE ? OR original_url LIKE ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(searchPattern, searchPattern, limit, offset) as Link[]
  } else {
    total = db.query(`SELECT COUNT(*) as count FROM links`).get() as { count: number }
    links = db.query(`
      SELECT short_code, original_url, created_at, clicks
      FROM links
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as Link[]
  }

  // Get total clicks across all links
  const totalClicks = db.query(`SELECT SUM(clicks) as total FROM links`).get() as { total: number | null }

  return c.json({
    links,
    pagination: {
      page,
      limit,
      total: total?.count ?? 0,
      totalPages: Math.ceil((total?.count ?? 0) / limit)
    },
    stats: {
      totalLinks: total?.count ?? 0,
      totalClicks: totalClicks?.total ?? 0
    }
  })
})

const port = process.env.PORT || 3000

console.log(`🚀 Link Shortener running on http://localhost:${port}`)

Bun.serve({
    port: Number(port),
    fetch: app.fetch,
  })