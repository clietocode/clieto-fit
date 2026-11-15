# Clieto Fit

A responsive gym-training portal with a Next.js web app and a separately deployable REST API service, plus tenant-scoped Super Admin, Gym Admin/Trainer, and Member experiences. The API is the authority for authentication, permissions, and gym ownership; clients never access Prisma or the database directly.

## Local setup

Requirements: npm and a Node.js version supported by Expo, as listed in
`apps/mobile/package.json`.

The repository is an npm workspace: the web app is in `apps/web`, the Expo
mobile app is in `apps/mobile`, the existing Next.js API is in `services/api`,
and shared auth contracts are in `packages/shared`.

1. Copy `.env.example` to `.env`. Set `DATABASE_URL` to your Supabase PostgreSQL connection string, a random `SESSION_SECRET` of at least 32 characters, and a Super Admin email, name, and password (at least 12 characters). Keep `.env` private.
2. From the project directory, run:

   ```powershell
   npm install
   npm run db:generate
   npm run db:deploy
   npm run db:seed
   ```

3. Start both the web app and API together:

   ```powershell
   npm run dev
   ```

   The web app runs at `http://localhost:3000` and the API at `http://localhost:3001`. Start `npm run dev:api` in one terminal first, then `npm run dev:web` in a second terminal; the web app requires the API to be ready. Alternatively, `npm run dev` starts both services together.

4. Visit `http://localhost:3000/login` and sign in to the **Super Admin** portal using the seed values from `.env`.
5. Create a gym in **Gyms & accounts**, then create its Admin account. Admins can add members, assign fees, and manage gym operations.

`npm run db:deploy` applies the committed PostgreSQL migrations; `npm run db:seed` is safe to repeat and sets the account password to the current environment value. Use a Supabase direct or session-pooler connection for migrations; transaction-pooler connections are not suitable for Prisma Migrate. Logo uploads are stored privately under `storage/logos`, which is excluded from Git.

## Mobile app

The separate Android and iOS Expo / React Native project is in [`apps/mobile`](./apps/mobile/README.md). Configure `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` for the device or simulator, then run `npm run dev:mobile` from the repository root to start Expo on the LAN and generate an Expo Go QR code. The app uses the existing API and stores mobile bearer sessions with Expo SecureStore.

## Portals and capabilities

- **Super Admin:** create and suspend gyms and gym accounts, configure the allow-listed platform settings, and review an audit trail for platform mutations. Member health plans and payment records are not included in platform summaries.
- **Admin / Trainer:** manage members and fee assignments, training and diet plans, daily attendance, fee structures, manual payment records, offers, equipment, gym timezone, and a validated gym logo.
- **Member:** view only their assigned plans, own attendance and payment history, assigned fee, enabled/in-date gym offers, and gym equipment; check in once per local gym day; update their own name and password.

All data-bearing APIs enforce role, gym, and (for members) record ownership on the server. Login checks the selected portal against the stored role. Sessions use random opaque tokens stored as HMAC digests; web sessions use HTTP-only cookies and mobile sessions use bearer tokens. Cookie-authenticated mutations check the configured web origin. Passwords are bcrypt-hashed. Admin and Super Admin account creation requires a 12-character minimum password; the Super Admin bootstrap values are supplied only through environment variables.

## Explicit initial policies

- Attendance is unique per member, gym, and calendar date in the gym's configured IANA timezone. The database constraint prevents duplicate same-day check-ins even under concurrent requests.
- The payment dashboard counts active members with an active fee assignment. A member is paid for a `YYYY-MM` billing month only when the authoritative payment record is `PAID` and its amount covers the fee snapshot. Partial, refunded, overdue, and missing records count as unpaid. Members without an active fee are reported separately and excluded from paid/unpaid totals.
- Payment records are manually maintained; no payment gateway, collection, or settlement integration is included. Member reminders are in-app only.
- Offers apply to all members in a gym when enabled and within their configured date range.

## API outline

The standalone API service lives in `services/api`; run it with `npm run dev:api` and build it with `npm run api:build`. Its Prisma schema and migrations live under `services/api/prisma`. The web app calls it at `NEXT_PUBLIC_API_URL`. Configure `CORS_ALLOWED_ORIGINS` on the API with the exact web origin(s). For production subdomains, set `SESSION_COOKIE_DOMAIN` to their shared parent domain so the web server can forward the HTTP-only session cookie during server rendering. Do not use wildcard CORS origins with credentials.

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Mobile clients can send `"client": "mobile"` to the login endpoint to receive a bearer session token; include it as `Authorization: Bearer <token>` on subsequent requests and call logout to revoke it. Keep tokens in the platform's secure storage.
- `GET /api/health` (service and database readiness)
- `GET /api/portal`
- `GET /api/records/{members|training|diets|attendance|fees|payments|offers|equipment}`
- `POST /api/records/{resource}`, `PATCH|DELETE /api/records/{resource}/{id}`
- `GET|POST|PATCH /api/platform` (Super Admin only)
- `GET|PATCH /api/gym` (Admin only)
- `PUT|DELETE /api/branding`, `GET /api/branding/{gymId}`
- `PATCH /api/account` (the signed-in account only)

Every mutating route validates its input, checks the configured web origin for cookie-authenticated requests, and uses the authenticated principal's role and gym rather than trusting client-supplied ownership. Logo uploads accept PNG/JPEG/WebP content up to 2 MB, derive the extension from file bytes, and are served through an authenticated, tenant-checked endpoint. Configure persistent `LOGO_STORAGE_DIR` storage for deployed API instances.

## Supabase PostgreSQL

Prisma connects to Supabase PostgreSQL using `DATABASE_URL` from the root `.env`. Run `npm run db:deploy` to create the tables in a new, empty Supabase database, then run `npm run db:seed` to create the Super Admin. Configure `NEXT_PUBLIC_API_URL` on the web app at build time, and configure `CORS_ALLOWED_ORIGINS`, `SESSION_SECRET`, and `DATABASE_URL` on the API. For production subdomains, set `SESSION_COOKIE_DOMAIN` to their shared parent domain. Changing the provider does not transfer data from an existing SQLite database; move any data you need with a deliberate export/import and reconciliation plan. Keep Supabase credentials on the server and use a least-privilege database role.

## Verification

```powershell
npm run typecheck
npm run api:typecheck
npm run lint
npm test
npm run build
npm run api:build
npm audit
```

The focused automated tests cover gym-timezone day/month boundaries and the full-payment rule. They are not a substitute for end-to-end testing against a production deployment. The login rate limiter is process-local and intended for this local-first baseline; use a shared rate-limit store for multi-instance deployment. Production also requires HTTPS, managed secrets, durable private logo storage, backups, monitoring, Super Admin MFA, and a deployment-specific review of proxy/origin configuration and access policy.
