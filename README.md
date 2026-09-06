# MandiSync — منڈی سنک | Agricultural Market Intelligence Platform

Production-ready multi-crop market transparency dashboard for Pakistan's mandi ecosystem. Bridging the information gap between farmers, arthis (commission agents), and bidders through real-time pricing, voice-driven updates, AI-powered receipt analysis, and RTL Urdu-first design.

---

## Features

| Feature | Description |
|---------|-------------|
| **Real-time Mandi Prices** | Min / Max / Avg / Current price per 40kg with historical charts |
| **Urdu-first Localized UI** | Full RTL interface in Urdu across all three dashboards |
| **Voice Updates (Groq Whisper + Gemini)** | Arthi records voice notes → Groq Whisper transcribes (with Gemini fallback) → Gemini AI extracts structured entities (crop, mandi, prices, farmer, gattu/peti) |
| **AI Settlement & Receipt Analysis** | Upload handwritten purchase list → Gemini Vision extracts bidder items → auto-calculates kacchi/pakhta bikri settlements |
| **Crop Arrivals & Auction Notices** | Real-time arrival tracking with farmer details, gattu/peti counts, and auction scheduling |
| **Direct Arthi Contact** | Arthi shop profiles with address, phone, and direct messaging |
| **AI Chatbot** | Urdu-language assistant with 41-entry knowledge base covering all dashboard features |
| **Chat System** | Farmer ↔ Arthi real-time messaging via Supabase Realtime |
| **Role-based Dashboards** | Separate views for Farmer, Arthi, and Bidder roles |
| **Multi-crop Support** | Tracks wheat, cotton, rice, citrus (kinno), sugarcane, maize, and more across multiple mandis |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Lucide Icons, inline RTL styles |
| Charts | Recharts |
| Database | Supabase (PostgreSQL + RLS + Storage + Realtime) |
| Auth | Supabase Auth (email/password) |
| AI Voice | Groq Whisper v3 Large Turbo (Urdu transcription) |
| AI Vision | Google Gemini 2.5 Flash (receipt OCR, entity extraction) |
| Language | TypeScript (strict mode) |

---

## Project Structure

```
mandi-sync/
├── app/
│   ├── auth/           # Login & Signup pages
│   └── dashboard/
│       ├── arthi/      # Arthi (commission agent) dashboard
│       ├── farmer/     # Farmer dashboard
│       └── bidder/     # Bidder dashboard
├── components/
│   ├── chat/           # Real-time chat drawer
│   └── chatbot/        # AI chatbot component
├── lib/
│   ├── actions/        # Server actions (voiceNote, receipt, chatbot)
│   ├── services/       # Gemini AI, Groq Whisper integrations
│   ├── supabase/       # Supabase client (browser + server)
│   └── utils/          # Calculator, entity resolver
├── supabase/
│   └── migrations/     # SQL migration files
├── types/              # Generated Supabase TypeScript types
└── proxy.ts            # Auth middleware (route protection)
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- A [Groq](https://console.groq.com/keys) API key
- A [Google AI Studio](https://aistudio.google.com/apikey) Gemini API key

### 1. Clone & Install

```bash
git clone https://github.com/Urwaabid10/MandiSync.git
cd MandiSync
npm install
```

### 2. Environment Setup

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
```

### 3. Database Setup

Run the migration files in order via the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql):

1. `supabase/migrations/RUN_THIS_IN_SQL_EDITOR.sql` — Core tables (users, crops, mandis, mandi_prices, etc.)
2. `supabase/migrations/20260904_full_mango_seed.sql` — Mango seed data
3. `supabase/migrations/20260904_comprehensive_rls.sql` — Row Level Security policies
4. `supabase/migrations/20260904_users_shop_columns.sql` — Shop columns, storage buckets, settlement_bidders
5. `supabase/migrations/20260904_test_data.sql` — Test users and sample data
6. `supabase/migrations/20260904_chatbot_knowledge_seed.sql` — Chatbot knowledge base

Or using the Supabase CLI:

```bash
npx supabase db push --linked
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Test Accounts (from seed data)

| Role | Email | Password |
|------|-------|----------|
| Farmer | farmer@test.com | farmer123 |
| Arthi | arthi@test.com | arthi123 |
| Bidder | bidder@test.com | bidder123 |

---

## Key Business Concepts

| Urdu Term | English | Description |
|-----------|---------|-------------|
| کچّی بکری (Kacchi Bikri) | Raw Sale | Total revenue from all bidder purchases |
| پختہ بکری (Pakhta Bikri) | Net Payout | What the farmer receives after all deductions |
| گٹو (Gattu) | Large Container | ~40kg crate of produce |
| پیٹی (Peti) | Small Container | ~20kg box of produce |
| آرتھی (Arthi) | Commission Agent | Middleman who auctions and sells farmers' produce |
| منڈی (Mandi) | Wholesale Market | Physical agricultural market |

---

## License

MIT
