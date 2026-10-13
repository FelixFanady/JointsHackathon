# SiagaKu Frontend (Support + Admin)

Next.js 15 (App Router) + SCSS + Supabase + OpenStreetMap (Leaflet) + OpenRouter.

## Setup
1. Supabase Dashboard -> SQL Editor -> run `supabase/schema.sql`.
2. Fill `.env.local` (see `.env.example`). `OPENROUTER_API_KEY` is still empty.
3. `npm install`
4. `npm run create-admin -- <username> <password> "<Full Name>"`
5. Optional demo data around Jakarta: `npm run seed-demo`
6. `npm run dev` -> http://127.0.0.1:3000

## Security model
- The browser never talks to Supabase. All data goes through Next.js route handlers.
- The `service_role` key is read only in server code (`src/lib/supabase.ts`, `server-only`).
- Tables have RLS enabled with no policies, so the anon key can read nothing.
- Session = httpOnly cookies; every route handler/layout re-validates the token and role.
- Support/admin usernames map to Supabase Auth users `<username>@siagaku.internal`.

## Routes
- `/login`
- Support: `/support/reports`, `/support/map`
- Admin: `/admin`, `/admin/citizens`, `/admin/support`, `/admin/performance`, `/admin/settings`
