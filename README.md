# Social Media Content Intelligence Platform

An automated SaaS platform designed to generate, schedule, and seamlessly publish high-impact LinkedIn carousels and content briefs using advanced AI agents.

## 🚀 Features

- **AI-Driven Market Intelligence**: Automated ingestion and ranking of fresh tech articles, market data, and industry trends without hallucinations.
- **Dynamic Content Engine**: Automatically formats raw technical data into highly optimized, LinkedIn-ready portrait (4:5) HTML/CSS carousel templates.
- **Automated Campaign Scheduler**: A robust cron-based scheduling layer tracking custom frequencies (daily, multi-day, weekly) for multiple concurrent campaigns.
- **Secure Native Publishing**: Built-in OAuth flow with LinkedIn's API for hands-free direct publishing, leveraging secure token encryption (`AES-256-GCM`).
- **Distributed Workflow Orchestration**: Powered by n8n webhook triggers to handle complex backend processing, payload generation, and callback validation.

## 🛠️ Tech Stack

- **Framework**: Next.js (App Router) with TypeScript
- **Database**: Supabase (PostgreSQL)
- **ORM**: Prisma
- **Automation / Orchestration**: n8n, Cron-job.org
- **Deployment**: Vercel

## ⚙️ Environment Variables Setup

Create a `.env` file in your root directory and configure the following variables (do not commit this file to version control):

```env
# Database Connections
DATABASE_URL="your-supabase-connection-string"
DIRECT_DATABASE_URL="your-supabase-direct-connection-string"

# Supabase Keys
SUPABASE_URL="your-supabase-project-url"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Workflow & Secret Verification
APP_URL="http://localhost:3000"
CRON_SECRET="your-secure-cron-handshake-secret"
TOKEN_ENCRYPTION_KEY="your-32-byte-encryption-key"

# Integrations
N8N_WEBHOOK_URL="your-n8n-webhook-endpoint"
N8N_WEBHOOK_SECRET="your-n8n-secret"
N8N_CALLBACK_SECRET="your-n8n-callback-secret"
LINKEDIN_CLIENT_ID="your-linkedin-client-id"
LINKEDIN_CLIENT_SECRET="your-linkedin-client-secret"
```
