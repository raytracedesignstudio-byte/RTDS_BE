# RayTrace Backend (Standalone)

Standalone Express + TypeScript backend rebuilt outside the old Replit monorepo.

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm db:init
pnpm dev
```

Backend runs on `http://localhost:4000`.

## Scripts

- `pnpm dev` - Start dev server with hot reload
- `pnpm build` - TypeScript compilation to `dist/`
- `pnpm start` - Run production server (requires build first)
- `pnpm typecheck` - Type checking only (no emit)
- `pnpm db:init` - Initialize/reset SQLite schema and seed data

## Environment Variables

### Required (All Environments)

- `ADMIN_EMAIL` - Admin login email
- `ADMIN_PASSWORD` - Admin password (minimum 6 chars)
- `JWT_SECRET` - JWT signing key (minimum 32 chars for security)
- `CLOUDINARY_CLOUD_NAME` - Cloudinary account name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret

### Optional (Gmail Integration)

- `GMAIL_USER` - Gmail address for sending emails
- `GMAIL_APP_PASSWORD` - Gmail app-specific password

Leave empty to disable email (graceful degradation in dev).

### Optional (Database & Server)

- `NODE_ENV` - `development` (default) or `production`
- `PORT` - Server port (default: 4000)
- `SQLITE_PATH` - Database file path (default: `./data/raytrace.db`)
- `ADMIN_SESSION_TTL` - JWT expiry (default: `12h`)
- `CONTACT_TO` - Email recipient for contact/apply forms (default: admin email)
- `CLOUDINARY_FOLDER` - Cloudinary upload folder (default: `raytrace`)

### Production-Only Recommendations

- Set `NODE_ENV=production` for optimal performance
- Use strong random `JWT_SECRET` (at least 32 chars)
- Use unique `ADMIN_PASSWORD` (not default)
- Restrict `FRONTEND_ORIGIN` to your domain(s)
- Use backing up solution for `SQLITE_PATH` (see Backup/Restore below)

## Health & Readiness

### Liveness Check

```bash
GET /api/healthz
```

Returns `200 OK` when database is running. Returns `503 Service Unavailable` if database is down.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-04-17T12:34:56.000Z",
  "requestId": "uuid-v4",
  "dependencies": {
    "database": {
      "status": "up",
      "error": null
    },
    "email": {
      "status": "configured" | "not_configured"
    },
    "mediaStorage": {
      "status": "configured" | "not_configured"
    }
  }
}
```

Use this endpoint in orchestration (Kubernetes, Docker Compose, etc.) for:

- **Liveness probe** (restart if failing)
- **Readiness probe** (prevent traffic during startup)

## API Endpoints

### Public Endpoints (No Auth Required)

- `GET /api/healthz` - Health check
- `GET /api/projects/public` - List published projects
- `GET /api/vacancies` - List all vacancies
- `GET /api/vacancies/active` - List active vacancies
- `GET /api/site-settings/public` - Site contact info
- `POST /api/apply` - Job application
- `POST /api/contact` - Contact form

### Admin Endpoints (Require JWT Bearer Token)

- `POST /api/admin/login` - Get JWT token
- `GET/POST/PUT/DELETE /api/admin/projects*` - Manage projects
- `GET/PUT /api/admin/site-profile` - Update site info
- `GET/PUT /api/admin/team-members` - Manage team
- `GET/PUT /api/admin/vertical-covers` - Manage verticals
- `GET/PUT /api/admin/featured-projects` - Manage featured projects
- `POST/PUT/DELETE /api/admin/vacancies/*` - Manage vacancies
- `POST /api/storage/uploads/request-url` - Get Cloudinary signed params

## Data Storage

- **Images:** Uploaded directly to Cloudinary (no local storage)
- **Data:** SQLite database at `./data/raytrace.db`
- **Seed Data:** Auto-loaded on first boot from `src/lib/seed-data.json`
- **Credentials:** Admin passwords hashed with bcrypt (never plain text)

## Graceful Shutdown

The server automatically handles:

- **SIGTERM** - Closes database, flushes pending requests, exits cleanly
- **SIGINT** (Ctrl+C) - Same as SIGTERM

No manual cleanup needed; the process closes all connections before exiting.

## Backup & Restore

### Backup SQLite Database

```bash
# Simple file copy
cp ./data/raytrace.db ./data/raytrace.db.backup

# Or with timestamp
cp ./data/raytrace.db ./data/raytrace.db.$(date +%Y%m%d-%H%M%S).backup
```

### Restore from Backup

```bash
# Stop the server first
cp ./data/raytrace.db.backup ./data/raytrace.db
# Restart server
pnpm dev
```

### Automated Daily Backup (Linux/macOS)

Add to crontab: `crontab -e`

```cron
# Backup SQLite database daily at 2 AM
0 2 * * * cp /path/to/raytrace-be/data/raytrace.db /backups/raytrace.db.$(date +\%Y\%m\%d)
```

### Production Deployment Notes

- **Mount a volume** for `/data/` directory to persist database across container restarts
- **Regular backups** to separate storage (S3, external drive, etc.)
- **Verify backup integrity** before deleting old backups
- **Test restore procedure** in non-production first
- **Keep 7+ daily backups** for recovery options

## Database Schema

Use this command to create all required tables, constraints, and indexes:

```bash
pnpm db:init
```

This is idempotent - safe to run multiple times without data loss.

## Build for Production

```bash
pnpm typecheck
pnpm build
NODE_ENV=production node dist/index.js
```

Or with Docker (example):

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod
COPY dist ./dist
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
```
