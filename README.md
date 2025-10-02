# Bun Link Shortener

A simple REST API link shortener built with Bun, Hono, SQLite, and TypeScript.

## Quick Start

```bash
# Install dependencies
bun install

# Start the server
bun run index.ts

# Or start with auto-reload for development
bun run dev
```

The server will start on `http://localhost:3000`

## Configuration

Set environment variables for production:

```bash
# For production domain
export BASE_URL=https://betlink.to
export PORT=3000

# Then start the server
bun run index.ts
```

## API Endpoints

### 1. Create Short Link
```bash
POST /shorten
Content-Type: application/json

{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "short_code": "abc123",
  "short_url": "https://betlink.to/abc123",
  "original_url": "https://example.com"
}
```

*Note: The `short_url` will use your configured `BASE_URL` (production: `https://betlink.to`, development: `http://localhost:3000`)*

### 2. Redirect to Original URL
```bash
GET /:code
```
Automatically redirects to the original URL and increments click count.

### 3. Get Link Statistics
```bash
GET /stats/:code
```

**Response:**
```json
{
  "short_code": "abc123",
  "original_url": "https://example.com",
  "created_at": "2024-01-01 12:00:00",
  "clicks": 5
}
```

### 4. Admin - View All Links
```bash
GET /admin/links
```

## Examples

### Development (localhost)
```bash
# Create a short link
curl -X POST http://localhost:3000/shorten \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.google.com"}'

# Visit the short link (redirects to original)
curl -L http://localhost:3000/abc123

# Check statistics
curl http://localhost:3000/stats/abc123

# View all links
curl http://localhost:3000/admin/links
```

### Production (betlink.to)
```bash
# Create a short link
curl -X POST https://betlink.to/shorten \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.google.com"}'

# Visit the short link (redirects to original)
curl -L https://betlink.to/abc123

# Check statistics
curl https://betlink.to/stats/abc123
```

## Database

Uses SQLite database (`links.db`) with automatic table creation on startup.

## Production Deployment

For production deployment with `betlink.to` domain:

1. Set environment variables:
   ```bash
   export BASE_URL=https://betlink.to
   export PORT=80  # or your preferred port
   ```

2. Start the server:
   ```bash
   bun run index.ts
   ```

3. Configure your domain (`betlink.to`) to point to your server IP and port.
