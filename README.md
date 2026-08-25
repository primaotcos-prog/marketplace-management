# Marketplace Management

Central management dashboard for game marketplace operations.

## V1 scope

The first integration is **GameBoost** only. The architecture intentionally separates marketplace-specific code from the core product, order, inventory, pricing, and automation domains so additional marketplaces such as U7BUY can be added later without rebuilding the core.

## Architecture

```text
Web Dashboard
    |
    +-- Core Domain
    |     +-- Products
    |     +-- Listings
    |     +-- Orders
    |     +-- Inventory
    |     +-- Pricing
    |     +-- Delivery
    |     +-- Automation
    |
    +-- Marketplace Adapter Layer
          +-- GameBoost (V1)
          +-- U7BUY (future)
          +-- Other marketplaces (future)

Supabase
    +-- Postgres
    +-- Auth
    +-- Edge Functions (server-side marketplace API calls)
```

## Security rules

- Marketplace API secrets must never be committed to GitHub.
- Marketplace credentials must never be exposed to browser code.
- Server-side functions are responsible for privileged API calls.
- Supabase Row Level Security will be enabled on exposed application tables.

## Database

The proposed database design is documented in `docs/database-schema.sql`. It is a design artifact for the new Supabase project; the existing `gameboost-management-db` project is intentionally not modified by this repository.

Supabase migrations should become the source of truth before production deployment.

## Current status

- Repository foundation: ready
- Dashboard shell: ready
- Database design: ready
- GameBoost API adapter: next
- Supabase project: not connected yet
- U7BUY: future phase
