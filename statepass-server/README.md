# StatePass Sync Server

Self-hosted REST API for syncing StatePass profiles. Stores only profile metadata (site, login, settings) — never master passwords or generated passwords.

## Architecture
- **Runtime**: Node.js 20+ (Express)
- **Database**: PostgreSQL 16
- **Auth**: JWT (15-min access + 30-day refresh with rotation)
- **Deployment**: Docker Compose

## API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login, get JWT pair |
| GET | `/api/profiles` | List all profiles |
| POST | `/api/profiles/sync` | Bulk replace all profiles |
| PUT, DELETE | `/api/profiles/:id` | Update/delete one profile |

## Quick Start
```bash
cp .env.example .env  # edit JWT_SECRET and DB_PASSWORD
docker compose up -d
```

## Design
- **Zero-knowledge**: Server never sees master passwords
- **Frontend-less**: Pure API — the extension IS the frontend
