# Architecture

## Goal

Build one control panel for marketplace selling operations. GameBoost is the first marketplace adapter; the core is marketplace-neutral.

## Layers

### 1. Presentation

The browser contains dashboards, tables, forms, filters, and status views. It must never hold privileged marketplace credentials.

### 2. Core domain

- Products: canonical product definitions.
- Listings: marketplace-specific offers mapped to a canonical product.
- Orders: normalized orders independent of marketplace.
- Inventory: canonical available/reserved stock.
- Pricing: rules and calculated prices.
- Delivery: delivery attempts and proof/logs.
- Automation: background jobs and sync rules.

### 3. Marketplace adapters

Every marketplace implements a common conceptual interface:

```text
connect()
getOffers()
getOffer(id)
updateOffer(id, payload)
getOrders(cursor)
getOrder(id)
updateOrderStatus(id, status)
getInventory()
```

The exact methods will be implemented only after verifying the official API for each marketplace.

### 4. Server-side integration

Marketplace calls belong in server-side code, preferably Supabase Edge Functions or an equivalent backend. The browser calls our backend, and the backend calls GameBoost.

```text
Browser
  -> Marketplace service
  -> GameBoost adapter
  -> GameBoost API
```

## GameBoost V1 flow

```text
GameBoost
  |
  +-- Offers --------> listings
  +-- Orders --------> orders
  +-- Stock ---------> inventory
  +-- Delivery ------> delivery_logs
```

## Future U7BUY flow

Adding U7BUY should require a new adapter and marketplace account configuration, not a redesign of products/orders/inventory.

## Security

- Keep API secrets in server-side environment/secret storage.
- Use Supabase RLS for exposed tables.
- Never trust client-provided marketplace IDs without authorization checks.
- Log external API requests without storing secrets or sensitive tokens.
