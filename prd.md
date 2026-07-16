# PRD — LinkedIn Carousel SaaS (V1)

**Stack:** Next.js 14+ (App Router, TypeScript, Tailwind CSS) · Supabase (Postgres, Supabase Auth) · Prisma ORM · n8n (triggered via webhook)

---

## 1. Overview
Users pick a topic and a posting frequency. The app researches that topic on the web, drafts a LinkedIn carousel, and publishes it to the user's own LinkedIn account automatically on schedule. n8n does the research/writing/publishing work; Next.js owns users, campaigns, and scheduling.

---

## 2. Core features (V1)

### 2.1 User sign-up
- Authentication handled via **Supabase Auth** (Email/Password & Google OAuth).
- `User.id` in Prisma must equal the Supabase `auth.users.id` — do not auto-generate it. On signup, create the `User` row with that same ID (via a Postgres trigger on `auth.users`, or in the signup API route right after `supabase.auth.signUp`).

### 2.2 Connect LinkedIn (OAuth 2.0)
- User clicks "Connect LinkedIn" on the dashboard.
- App redirects user to LinkedIn OAuth login (`/api/auth/linkedin`).
- On successful callback (`/api/auth/linkedin/callback`), exchange the code for an `access_token`, `refresh_token`, and `expires_at`. Encrypt both tokens at the application layer (or via Postgres `pgcrypto`) before writing to `LinkedInAccount` — do not store them in plaintext.
- Add a scheduled job (`/api/cron/refresh-linkedin-tokens`) that refreshes tokens nearing `expiresAt` so scheduled runs don't fail on an expired token.

### 2.3 Create a campaign
- Simple UI form: **topic** (text input), **frequency** (`daily` / `3x_week` / `weekly`), and **tone/persona** override.
- On creation, compute the initial `next_run_at` timestamp based on the selected frequency.
- Provide toggle state to switch campaign status between `active` and `paused`.

### 2.4 View post history
- Clean table displaying past runs from `CampaignRun` for the active campaign.
- Display status badge: `SUCCESS` (green, links to LinkedIn post), `RUNNING` (blue), or `FAILED` (red, displays the exact error message).

---

## 3. Database Schema (Prisma Format)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id               String            @id // must match Supabase auth.users.id — no @default here
  email            String            @unique
  createdAt        DateTime          @default(now())
  linkedinAccounts LinkedInAccount[]
  campaigns        Campaign[]
}

model LinkedInAccount {
  id           String   @id @default(uuid())
  userId       String   @unique
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  linkedinUrn  String // e.g. urn:li:person:abc123
  accessToken  String // Encrypted at the application layer before write
  refreshToken String? // Encrypted at the application layer before write
  expiresAt    DateTime
  connectedAt  DateTime @default(now())
}

model Campaign {
  id             String          @id @default(uuid())
  userId         String
  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  topic          String
  tonePersona    String?
  frequency      String // "daily" | "3x_week" | "weekly"
  timezone       String          @default("UTC")
  status         String          @default("active") // "active" | "paused"
  nextRunAt      DateTime
  createdAt      DateTime        @default(now())
  runs           CampaignRun[]
  postedArticles PostedArticle[]
}

model CampaignRun {
  id              String    @id @default(uuid())
  campaignId      String
  campaign        Campaign  @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  status          String // "queued" | "running" | "success" | "failed"
  startedAt       DateTime  @default(now())
  finishedAt      DateTime?
  error           String?
  pdfUrl          String?
  linkedinPostUrl String?
}

// Dedup log — n8n's AI selector reads recent hashes from here (via the trigger
// payload) so it never re-selects the same article for the same campaign.
model PostedArticle {
  id           String   @id @default(uuid())
  campaignId   String
  campaign     Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  hashId       String
  articleTitle String
  postDate     DateTime @default(now())

  @@index([campaignId, hashId])
}
```

---

## 4. Webhook contracts

### 4.1 Backend → n8n (Trigger Run)
When a campaign is due (`next_run_at <= NOW()`), the Next.js cron/scheduler sends this payload. `previously_posted_hashes` is pulled from `PostedArticle` for that `campaign_id`, most recent 7–30 days.

```
POST https://n8n.rorays.com/webhook/carousel-run
Content-Type: application/json
Authorization: Bearer <shared_webhook_secret>
```

```json
{
  "campaign_id": "b7f1e2a0-1234-4c9a-9e2a-1a2b3c4d5e6f",
  "user_id": "9a8b7c6d-5432-4e1f-8a9b-0c1d2e3f4a5b",
  "topic": "AI agent infrastructure",
  "tone_persona": null,
  "linkedin_urn": "urn:li:person:abc123",
  "linkedin_access_token": "AQV...redacted",
  "previously_posted_hashes": ["3f2a91", "b0c4e7"],
  "callback_url": "https://yourapp.com/api/internal/n8n-callback",
  "callback_secret": "<shared_callback_secret>"
}
```

### 4.2 n8n → Backend (Callback)
n8n hits this endpoint to report completion. `selected_articles` is required on success — the backend writes these into `PostedArticle` so the next run can dedup correctly.

```
POST https://yourapp.com/api/internal/n8n-callback
Content-Type: application/json
Authorization: Bearer <shared_callback_secret>
```

**Success payload:**
```json
{
  "campaign_id": "b7f1e2a0-1234-4c9a-9e2a-1a2b3c4d5e6f",
  "status": "success",
  "pdf_url": "https://storage.yourapp.com/carousels/b7f1e2a0-run-042.pdf",
  "linkedin_post_url": "https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678",
  "selected_articles": [
    { "title": "OpenAI ships new agent SDK", "hash_id": "9c1f4a" },
    { "title": "Anthropic raises Series F", "hash_id": "2d8e71" }
  ],
  "finished_at": "2026-07-15T11:04:32Z"
}
```

**Failure payload:**
```json
{
  "campaign_id": "b7f1e2a0-1234-4c9a-9e2a-1a2b3c4d5e6f",
  "status": "failed",
  "error": "LinkedIn API returned 401: token expired",
  "finished_at": "2026-07-15T11:02:10Z"
}
```

**Backend behavior on receipt:**
- Update the matching `CampaignRun` row (`status`, `finishedAt`, `pdfUrl`/`linkedinPostUrl` or `error`).
- On success, insert `selected_articles` into `PostedArticle` and advance `Campaign.nextRunAt`.
- On failure, still advance `nextRunAt` (don't retry-loop indefinitely) and surface the error in the dashboard.

---

## 5. Execution Instructions for Antigravity Agent

1. Generate the Next.js pages using App Router (`app/dashboard`, `app/api/auth`, `app/api/internal/n8n-callback`).
2. Initialize Supabase Auth client logic for frontend authorization screens. Ensure `User.id` is set from `auth.users.id` on signup, not auto-generated.
3. Use Prisma for all PostgreSQL database operations.
4. Encrypt `accessToken`/`refreshToken` before writing to `LinkedInAccount` (application-layer encryption, not left as plaintext).
5. Set up `/api/cron/process-campaigns` — checks for due campaigns and fires the n8n webhook. Protect it with a shared secret (Vercel Cron sends one automatically via header; if using an external scheduler like cron-job.org, add the check manually).
6. Set up `/api/cron/refresh-linkedin-tokens` — refreshes any `LinkedInAccount` token nearing `expiresAt`.
7. Verify the `Authorization` header shared secret on both `/api/internal/n8n-callback` and the incoming trigger to n8n — neither endpoint should accept unauthenticated requests.
8. Required environment variables: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `N8N_CALLBACK_SECRET`, `TOKEN_ENCRYPTION_KEY`.
