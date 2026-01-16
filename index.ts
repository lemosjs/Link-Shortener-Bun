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

// Get all links (optional admin endpoint) with pagination
app.get('/admin/links', (c) => {
  // Parse pagination query params
  const page = parseInt(c.req.query('page') || '1', 10)
  const limit = parseInt(c.req.query('limit') || '20', 10)
  const offset = (page - 1) * limit

  //If not valid integer, return 400
  if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
    return c.json({ error: 'Invalid pagination parameters' } as ErrorResponse, 400)
  }

  // Get total count for pagination info
  const total = db.query(`SELECT COUNT(*) as count FROM links`).get() as { count: number }

  // Get paginated links
  const links = db.query(`
    SELECT short_code, original_url, created_at, clicks 
    FROM links 
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Link[]

  return c.json({
    links,
    pagination: {
      page,
      limit,
      total: total?.count ?? 0,
      totalPages: Math.ceil((total?.count ?? 0) / limit)
    }
  })
})

const port = process.env.PORT || 3000

console.log(`🚀 Link Shortener running on http://localhost:${port}`)

Bun.serve({
    port: Number(port),
    fetch: app.fetch,
  })