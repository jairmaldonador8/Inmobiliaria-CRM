---
name: easybroker-api
description: Use when writing or debugging any code that calls the EasyBroker API — property/lead sync, cron jobs, dedup logic, or tests against the staging sandbox.
---

# EasyBroker API

## Overview
Read-only integration: EasyBroker is the source of truth for inventory; our CRM is the source of truth for commercial follow-up. All facts below were verified against official docs (dev.easybroker.com) AND live calls to the official staging API (2026-08-03).

## Auth & environments

- Header: `X-Authorization: <api_key>` (not Bearer). Backend-only — never call from the browser.
- Prod: `https://api.easybroker.com/v1` (requires the client's key; **paid EasyBroker account needed** — confirm Montana's plan includes API).
- **Staging sandbox: `https://api.stagingeb.com` with public test key `l7u502p8v46ba3ppgvj5y2aad50lb9`** (fictional data: ~1,473 properties, ~955 leads). Develop and test against staging; prod keys don't work there and vice versa.
- Rate limit: 20 req/s. Unauthenticated → 401.

## Properties

- List: `GET /v1/properties?page=N&limit=50` — **limit max 50**. Envelope: `{"pagination": {"limit","page","total","next_page"}, "content": [...]}`. `next_page` is a full URL, null at end.
- Incremental cursor: `search[updated_after]=<ISO>` + `search[sort_by]=updated_at-asc`.
- **No `status` field in responses.** Get status by querying per status: `search[statuses][]=published` etc. (published | not_published | reserved | sold | rented | suspended), or `GET /v1/listing_statuses` (limit max 100, returns public_id/status/updated_at only).
- **Two-level sync:** list gives `public_id`, `title`, `title_image_full/thumb`, `location` (STRING), `operations[]` ({type: "sale"|"rental", amount, currency, commission}), `bedrooms`, `bathrooms`, `parking_spaces`, `property_type` (localized Spanish string, e.g. "Departamento"), `lot_size`, `construction_size` (m² floats), `updated_at`, `agent`. Detail (`GET /v1/properties/{public_id}`) adds `description`, `location` as OBJECT (lat/lng, street, postal_code), full `images[]` ({title,url}; ignore deprecated `property_images`), `public_url`, `half_bathrooms`, `age`. Fetch detail (N+1) only for new/changed properties.
- **Per-portal syndication is NOT exposed by the API.** Don't try; `propiedad_portales` is manual in our schema. Portal intelligence comes from lead `source`.

## Leads (contact requests)

- `GET /v1/contact_requests?page=N&limit=50` (real path uses underscore). Fields: `id` (int), `name`, `phone`, `email`, `contact_id`, `property_id` (EB public_id string), `message`, `source` (origin portal/site — prod values unverified, log them), **`happened_at`** (there is NO `created_at`).
- Cursor filters are **top-level** (not `search[...]`): `happened_after`, `happened_before`.
- **No webhooks exist.** Polling every 15 min is the officially sanctioned pattern (EasyBroker's own Zapier integration polls at 15 min).

## Sync rules

```ts
// Idempotent upsert — Vercel Cron has no retries and may duplicate invocations
await supabase.from('propiedades').upsert(mapped, { onConflict: 'easybroker_id' })
```

- Timestamps arrive with `-06:00` offset → normalize to UTC before storing.
- Store cursors (`updated_after` / `happened_after`) in DB, advance only after a successful page.
- Detect sold/unpublished via per-status queries + periodic full reconcile of `public_id`s (no delete events).
- **`estatus` y `activa` NO se derivan solas.** Bug encontrado en producción el 2026-08-06: el sync insertaba con los defaults del esquema (`estatus='published'`, `activa=true`) y nunca los volvía a tocar, así que 21 de 177 propiedades (rentadas, despublicadas) se seguían ofreciendo a los asesores como disponibles. La fase `reconciliarEstatusPropiedades` en `sync.ts` es quien lo mantiene: lee `listing_statuses` completo, mapea `published → activa=true` (y solo `published` — `reserved` ya tiene oferta en curso), y apaga `activa` en las que desaparecieron del catálogo. **Nunca las borra**: pueden estar referenciadas por leads y por seguimientos inmutables.
- Salvaguarda obligatoria en esa reconciliación: solo marcar «ausente → inactiva» si la paginación de `listing_statuses` se completó y el mapa no vino vacío. Una respuesta parcial desactivaría el catálogo entero.
- Dedup leads by phone/email before insert; a repeat inquiry becomes a seguimiento with `propiedad_id` on the existing lead.

## Common mistakes

- Assuming `location` is an object in the list endpoint (it's a string there; object only in detail).
- Filtering leads with `search[happened_after]` (it's top-level `happened_after`).
- Expecting portal placement or `status` in property payloads.
- Exceeding `limit=50` (silently capped) or 20 req/s during full backfills (~30 pages on staging).
- Inmuebles24 leads may reach EasyBroker up to a day late (Chrome-extension "EasyBroker Assistant" daily check) — don't treat `happened_at` as the portal inquiry time for that source.
- Docs tip: append `.md` to any dev.easybroker.com URL for clean markdown.
