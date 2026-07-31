# PlayLiquid

> Play. Create. Earn. — A production-grade, event-driven gaming platform.

PlayLiquid is a comprehensive gaming platform built with Domain-Driven Design (DDD), CQRS, Event Sourcing, and a multi-tenant architecture. It supports players, creators, studios, marketplace managers, moderators, support agents, finance teams, operations engineers, and administrators — each with a personalized experience.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York style)
- **Database**: Prisma ORM (SQLite for dev, Turso/libSQL for production)
- **Authentication**: Custom session-based auth with scrypt password hashing
- **State**: Zustand (client) + TanStack Query (server)
- **Icons**: Lucide React

## Architecture

The platform is built on a clean, layered architecture:

```
src/
├── shared/          # Primitives (ids, types, Result, config, logging)
├── domain/          # DDD aggregates, events, value objects, repositories
│   ├── shared/      # AggregateRoot, Entity, ValueObject, DomainEvent
│   ├── identity/    # User, Organization, RBAC/ABAC, MFA, sessions
│   ├── gaming/      # Game aggregate
│   └── launch/      # Beta cohorts, validation, reconciliation
├── application/     # CQRS (CommandBus, QueryBus, pipelines, handlers)
├── infrastructure/  # EventStore, Outbox, EventBus, DI, workers, Redis
└── interfaces/      # API routes, health checks
```

### Key Patterns

- **CQRS**: Separate CommandBus and QueryBus with middleware pipelines
- **Event Sourcing**: Append-only EventStore with optimistic concurrency
- **Outbox Pattern**: Reliable event publishing via transactional outbox
- **Domain Events**: 50+ event types across gaming, identity, and launch domains
- **Dependency Injection**: All services resolved through a DI container
- **Authorization**: RBAC + ABAC policy engine with audit logging

## Quick Start

### Prerequisites

- Node.js 18+ or Bun
- A PostgreSQL database (for production) or SQLite (for development)

### Installation

```bash
# Install dependencies
bun install

# Set up the database
bun run db:push

# Seed admin and demo accounts
bun run seed

# Start the dev server
bun run dev
```

### Default Accounts

| Account | Email | Password | Type |
|---------|-------|----------|------|
| Admin | `ekontetevi@gmail` | `Payswap123456` | Permanent |
| Player | `player@demo.playliquid.com` | `demo12345` | Demo |
| Creator | `creator@demo.playliquid.com` | `demo12345` | Demo |
| Studio | `studio@demo.playliquid.com` | `demo12345` | Demo |
| Marketplace | `marketplace@demo.playliquid.com` | `demo12345` | Demo |
| Moderator | `moderator@demo.playliquid.com` | `demo12345` | Demo |
| Support | `support@demo.playliquid.com` | `demo12345` | Demo |
| Finance | `finance@demo.playliquid.com` | `demo12345` | Demo |
| Operations | `operations@demo.playliquid.com` | `demo12345` | Demo |
| Developer | `developer@demo.playliquid.com` | `demo12345` | Demo |

Visit `http://localhost:3000` and click "Quick Demo Login" to explore any role.

## Deployment

### Deploy to Vercel

1. **Push to GitHub**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/playliquid.git
   git push -u origin main
   ```

2. **Create a Turso Database** (free tier, SQLite-compatible for serverless):
   ```bash
   # Install Turso CLI
   curl -sSfL https://get.tur.so/install.sh | bash

   # Create database
   turso db create playliquid

   # Get connection URL
   turso db show playliquid --url
   # → libsql://playliquid-xxx.turso.io

   # Create auth token
   turso db tokens create playliquid
   # → eyJxxx...
   ```

3. **Deploy on Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - Set environment variables:
     - `DATABASE_URL` = `libsql://playliquid-xxx.turso.io`
     - `DATABASE_AUTH_TOKEN` = `eyJxxx...`
     - `AUTH_SECRET` = (any random string, e.g. run `openssl rand -hex 32`)
     - `REDIS_URL` = (optional, for Redis features — works without it)
   - Deploy

4. **Seed the production database**:
   After the first deployment, run the seed script:
   ```bash
   DATABASE_URL="libsql://playliquid-xxx.turso.io" \
   DATABASE_AUTH_TOKEN="eyJxxx..." \
   bun run seed
   ```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `file:./db/custom.db` |
| `DATABASE_AUTH_TOKEN` | Turso auth token (production only) | — |
| `AUTH_SECRET` | HMAC signing secret for sessions | `dev-only-secret` |
| `REDIS_URL` | Redis connection (optional, falls back to in-memory) | — |
| `NODE_ENV` | Environment | `development` |

## Pages

### Public
- `/` — Welcome page
- `/signin` — Sign in (with demo quick-login)
- `/signup` — Join waitlist
- `/waitlist-confirmed` — Waitlist confirmation

### Authenticated (role-based)
- `/home` — Personalized dashboard per role
- `/wallet` — Player wallet
- `/create` — Creator studio
- `/my-games` — Creator's game library
- `/ai-studio` — AI game generation tools
- `/studios` — Studio management
- `/marketplace` — Marketplace overview
- `/reports` — Moderator reports
- `/tickets` — Support tickets
- `/payouts` — Finance payouts
- `/system-health` — Operations monitoring
- `/users` — Admin user management
- `/audit` — Admin audit log
- `/architecture` — System architecture dashboard (admin/developer only)

## API Endpoints

### Auth
- `POST /api/auth/v2/login` — Authenticate
- `POST /api/auth/v2/logout` — Sign out
- `GET /api/auth/v2/session` — Check session
- `POST /api/auth/v2/switch-role` — Switch active role
- `POST /api/auth/v2/waitlist` — Join waitlist
- `GET /api/auth/v2/demo-accounts` — List demo accounts

### Commands & Queries
- `POST /api/commands` — Dispatch a command
- `POST /api/queries` — Execute a query

### Health & Metrics
- `GET /api/health` — Basic health check
- `GET /api/health/extended` — Extended health (13 checks)
- `GET /api/ready` — Readiness probe
- `GET /api/live` — Liveness probe
- `GET /api/metrics` — Prometheus metrics

### Admin Console
- `GET/POST /api/admin/*` — Waitlist, users, organizations, roles, permissions, API keys, audit

### Launch & Scale
- `GET/POST /api/launch/alpha/*` — Validation, reconciliation, bugs, performance
- `GET/POST /api/launch/beta/*` — Cohorts, invitations, feedback

## Scripts

```bash
bun run dev          # Start dev server
bun run build        # Build for production
bun run lint         # ESLint
bun run arch:check   # Architecture boundary checker
bun run db:push      # Push Prisma schema to database
bun run db:generate  # Generate Prisma client
bun run seed         # Seed admin and demo accounts
```

## License

Private — All rights reserved.
