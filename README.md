# LinkedIn Carousel Automation Platform

An AI-powered SaaS platform that automates the entire lifecycle of LinkedIn carousel content: a user picks a topic and a posting frequency, and the system researches the live web, writes a multi-slide analytical carousel, renders it as a branded PDF, and publishes it directly to the user's own LinkedIn account — on schedule, with no manual work.

> Built as two cooperating halves: a **Next.js web application** (auth, campaigns, scheduling, dashboard) and an **n8n automation workflow** (research, AI writing, PDF generation, LinkedIn publishing), connected by an authenticated webhook contract.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Getting Started (Local Development)](#getting-started-local-development)
- [Database Setup](#database-setup)
- [n8n Workflow](#n8n-workflow)
- [Scheduler](#scheduler)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [API Routes](#api-routes)
- [Known Limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## Features

### User-facing
- Sign up / sign in — email + password, or one-click **Google OAuth**
- **Connect LinkedIn** via OAuth 2.0 — each user posts through their own account, not a shared one
- Create campaigns on **any topic**, with a choice of `daily`, `3x_week`, or `weekly` posting frequency
- First post fires on the **next scheduler tick** after creation (not after waiting a full interval); subsequent posts follow the chosen cadence, anchored to avoid time drift
- Pause / resume / edit / delete campaigns
- Run history with live status and a direct link to the published LinkedIn post

### Content intelligence
- **Topic-agnostic live web research** — not a fixed RSS list; searches the open web for whatever topic a user enters, restricted to the last 24 hours
- Source-quality filtering (excludes job boards, social media noise)
- **Duplicate-topic detection** — avoids re-covering a story that topically overlaps something already posted, not just exact duplicates
- AI-written carousels in an analytical, non-AI-sounding voice — cover slide, one slide per article, a synthesis ("Bigger Picture") slide, and a discussion-question CTA
- Consistent branded 1080×1350px (4:5) LinkedIn-optimized visual design

### Engineering / reliability
- LinkedIn tokens encrypted at rest (AES-256-GCM)
- Webhook and callback endpoints authenticated with distinct shared secrets
- Duplicate-run protection — a campaign won't fire twice while a previous run is still in progress
- Race-condition-safe scheduling — `nextRunAt` advances immediately on dispatch, not on completion
- Fully unattended scheduling via an external cron service
- Deployed on Vercel with CI/CD from GitHub

---

## Architecture

```
┌─────────────────────┐         webhook (auth)         ┌──────────────────────┐
│   Next.js Web App    │ ──────────────────────────────▶│   n8n Workflow        │
│                       │                                 │                       │
│  • Auth (Supabase)    │                                 │  • Web research       │
│  • Campaign CRUD      │                                 │    (Parallel API)     │
│  • Scheduler route    │                                 │  • AI selection       │
│  • Callback receiver  │◀──────────────────────────────  │    (Gemini)           │
│  • Dashboard UI        │        callback (auth)          │  • AI carousel writer │
└─────────┬─────────────┘                                 │  • HTML → PDF         │
          │                                                │  • LinkedIn publish   │
          ▼                                                └──────────────────────┘
┌──────────────────────┐
│  Supabase (Postgres)  │
│  User / Campaign /    │
│  CampaignRun /        │
│  LinkedInAccount /    │
│  PostedArticle        │
└──────────────────────┘
```

**Flow:** User creates a campaign → external cron hits `/api/cron/process-campaigns` on a schedule → route finds due campaigns, decrypts the user's LinkedIn token, and POSTs a payload to the n8n webhook → n8n researches, writes, renders, and publishes → n8n POSTs the result back to `/api/internal/n8n-callback` → the app updates the run's status and stores dedup history for next time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| Backend / API | Next.js API routes, Prisma ORM 7 (driver adapters) |
| Database | Supabase (managed Postgres) — pooled + direct connections |
| Auth | Supabase Auth — Email/Password + Google OAuth (PKCE) |
| Automation engine | n8n (self-hosted), triggered via authenticated webhook |
| Web research | [Parallel.ai](https://parallel.ai) Search API |
| AI / LLM | Google Gemini (selection agent + writing agent) |
| PDF generation | HTML/CSS → PDF conversion service, 1080×1350px carousel format |
| Publishing | LinkedIn REST API (Documents API + Posts API) |
| Scheduling | [cron-job.org](https://cron-job.org) → Next.js API route → n8n webhook |
| Hosting | Vercel |

---

## Prerequisites

- Node.js 20+ and npm
- A [Supabase](https://supabase.com) project (free tier is fine to start)
- An [n8n](https://n8n.io) instance (self-hosted or cloud)
- A [LinkedIn Developer App](https://www.linkedin.com/developers/apps) with Sign In with LinkedIn (OIDC) and Share on LinkedIn / Posts API products enabled
- A [Google Cloud](https://console.cloud.google.com) OAuth client (for Google sign-in)
- A [Parallel.ai](https://parallel.ai) API key
- A Gemini API key ([Google AI Studio](https://aistudio.google.com))
- An HTML-to-PDF conversion service account (e.g. PDFMonkey)
- A [cron-job.org](https://cron-job.org) account (or Vercel Cron on a paid plan)

---

## Environment Variables

Create a `.env` file in the project root (never commit this file):

```dotenv
# Database — pooled connection (app runtime queries, via PgBouncer, port 6543)
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres?pgbouncer=true"

# Database — direct connection (migrations only, port 5432)
DIRECT_DATABASE_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# LinkedIn OAuth (app credentials)
LINKEDIN_CLIENT_ID="<client-id>"
LINKEDIN_CLIENT_SECRET="<client-secret>"

# n8n integration
N8N_WEBHOOK_URL="https://your-n8n-instance.com/webhook/carousel-run"
N8N_WEBHOOK_SECRET="<random-secret>"       # verifies backend → n8n requests
N8N_CALLBACK_SECRET="<random-secret>"      # verifies n8n → backend callback

# Security
TOKEN_ENCRYPTION_KEY="<32-byte-hex-key>"   # encrypts LinkedIn tokens at rest
CRON_SECRET="<random-secret>"              # protects /api/cron/* routes

# App
APP_URL="https://your-deployed-domain.vercel.app"
```

Generate random secrets with:
```bash
openssl rand -hex 32
```

> **Never commit `.env` or paste real secret values into issues, PRs, commit messages, or chat.** Rotate any secret that's ever been exposed accidentally.

---

## Getting Started (Local Development)

```bash
# 1. Clone and install
git clone <this-repo-url>
cd <repo-folder>
npm install

# 2. Set up environment variables
cp .env.example .env
# fill in the real values

# 3. Generate the Prisma client and run migrations
npx prisma generate
npx prisma migrate dev --name init

# 4. Run the Postgres trigger (see Database Setup below)

# 5. Start the dev server
npm run dev
```

Visit `http://localhost:3000`.

---

## Database Setup

Schema is managed with Prisma (`prisma/schema.prisma`). Core tables:

| Table | Purpose |
|---|---|
| `User` | App users — `id` matches Supabase's `auth.users.id` |
| `LinkedInAccount` | One connected LinkedIn account per user, tokens encrypted |
| `Campaign` | Topic, frequency, timezone, status, `nextRunAt` |
| `CampaignRun` | Execution history — status, timestamps, error, post URL |
| `PostedArticle` | Dedup log — article hash/title/date per campaign |

After running migrations, apply the Postgres trigger that syncs new Supabase Auth users into the `User` table (works for both email/password and OAuth sign-ups):

```bash
# Run the contents of prisma/trigger.sql in the Supabase SQL Editor
```

This trigger fires on every `INSERT` into `auth.users`, regardless of sign-up method.

---

## n8n Workflow

The automation engine lives in n8n, not in this repo. High-level structure:

1. **Webhook** trigger (Header Auth, verified against `N8N_WEBHOOK_SECRET`)
2. **Research** — HTTP Request to the Parallel Search API, scoped to the campaign's topic, filtered to the last 24 hours, excluding low-quality domains
3. **Dedup + selection** — an AI agent picks the most relevant, non-duplicate articles, using dedup history passed in from the webhook payload (not a live database query)
4. **Carousel writing** — a second AI agent writes cover/article/trends/CTA slide content
5. **HTML rendering** — builds the branded, escaped, truncation-safe carousel markup
6. **PDF conversion** — renders to a 1080×1350px PDF
7. **LinkedIn publish** — uploads the document and posts it under the connecting user's own account (dynamic `linkedin_urn` / `linkedin_access_token` from the webhook payload, not a hardcoded account)
8. **Callback** — reports success/failure and selected article hashes back to `/api/internal/n8n-callback`

Export/import the workflow JSON from your n8n instance to version it alongside this repo if desired.

---

## Scheduler

`/api/cron/process-campaigns` is a plain HTTP endpoint, not a built-in cron job — it needs an external trigger to actually run on a schedule:

1. Create an account at [cron-job.org](https://cron-job.org) (or use Vercel Cron on a paid plan).
2. Create a job:
   - **URL**: `https://<your-domain>/api/cron/process-campaigns`
   - **Method**: `POST`
   - **Header**: `Authorization: Bearer <CRON_SECRET>`
   - **Interval**: every 15 minutes (or your preferred cadence)
3. A second job on the same pattern should hit `/api/cron/refresh-linkedin-tokens` at a lower frequency (e.g. daily) to keep LinkedIn access tokens fresh.

---

## Deployment

Deployed on **Vercel**:

1. Import the GitHub repo into Vercel.
2. Add all environment variables from the [Environment Variables](#environment-variables) section in Vercel's project settings.
3. Ensure `package.json` includes a `postinstall` script so Prisma's client is generated on every fresh install (Vercel does a clean `npm install` with no prior state):
   ```json
   "scripts": {
     "postinstall": "prisma generate"
   }
   ```
4. Deploy. Once live, set `APP_URL` to the real deployed domain and redeploy.
5. Add the production redirect URIs to both LinkedIn's Developer App and Supabase's Google OAuth provider:
   - `https://<your-domain>/api/auth/linkedin/callback`
   - `https://<your-domain>/auth/callback` (Google, via Supabase)
6. Update Supabase's **Authentication → URL Configuration** — Site URL and Redirect URLs — to the production domain.

> **Always verify with a clean build before pushing:** `rm -rf node_modules .next && npm install && npm run build`. A plain `npm run build` on a machine with stale cached artifacts can pass locally while still failing on Vercel's fresh environment.

---

## Project Structure

```
app/
├── page.tsx                          # redirects to /dashboard
├── login/                            # sign-in / sign-up UI
├── dashboard/                        # campaign management UI
├── auth/callback/                    # Google OAuth PKCE code exchange
└── api/
    ├── auth/linkedin/                # LinkedIn OAuth connect flow
    │   └── callback/
    ├── campaigns/                    # campaign CRUD
    │   └── [id]/
    ├── cron/
    │   ├── process-campaigns/        # scheduler — finds due campaigns, triggers n8n
    │   └── refresh-linkedin-tokens/  # refreshes expiring LinkedIn tokens
    └── internal/
        └── n8n-callback/             # receives results back from n8n
lib/
├── prisma.ts                         # Prisma client singleton (driver adapter)
├── encryption.ts                     # AES-256-GCM helpers for token storage
├── scheduler.ts                      # nextRunAt computation, shared across routes
└── supabase/
    ├── client.ts                     # browser Supabase client
    └── server.ts                     # server Supabase client
prisma/
├── schema.prisma
├── trigger.sql                       # auth.users → public.User sync trigger
└── migrations/
proxy.ts                              # route guarding (Next.js 16 middleware replacement)
```

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/campaigns` | `GET`, `POST` | List / create campaigns |
| `/api/campaigns/:id` | `PATCH`, `DELETE` | Edit / delete a campaign |
| `/api/auth/linkedin` | `GET` | Start LinkedIn OAuth connect flow |
| `/api/auth/linkedin/callback` | `GET` | LinkedIn OAuth callback — stores encrypted tokens |
| `/api/auth/linkedin/status` | `GET` | Connection status for the dashboard |
| `/api/cron/process-campaigns` | `POST` | Scheduler — finds due campaigns, triggers n8n (requires `CRON_SECRET`) |
| `/api/cron/refresh-linkedin-tokens` | `POST` | Refreshes expiring LinkedIn tokens (requires `CRON_SECRET`) |
| `/api/internal/n8n-callback` | `POST` | Receives run results from n8n (requires `N8N_CALLBACK_SECRET`) |
| `/auth/callback` | `GET` | Google OAuth PKCE code exchange |

---

## Known Limitations

- **LinkedIn refresh tokens** require a separate "Programmatic Refresh Tokens" product approval from LinkedIn; until approved, connected accounts remain valid for their initial ~60-day token lifetime and then need manual reconnection.
- **Multi-user posting review** — LinkedIn's app review for posting on behalf of non-admin users may be required before onboarding external users at scale.
- **Failure-path reporting** in the n8n workflow (mid-run failures such as a PDF service outage) is partially built; success-path reporting is fully verified.
- **Durable PDF storage** for an in-dashboard "download PDF" link is not yet implemented — generated carousels currently exist only as the LinkedIn-hosted document.

## Roadmap

- [ ] Upload generated PDFs to durable storage (Supabase Storage / S3) and surface a download link
- [ ] Full failure-path handling and reporting in the n8n workflow
- [ ] LinkedIn refresh-token flow, once product access is approved
- [ ] Tighten `Prisma.TransactionClient` typing in the n8n callback route (currently loosely typed)
- [ ] Campaign-level analytics (engagement tracking on published posts)

---

## License

Proprietary — internal project. Not licensed for public reuse without permission.
