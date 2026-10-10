# AgriGuard

Platform peringatan dini banjir sawah hiper-lokal dengan AI untuk petani dan PPL/Dinas.

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **Backend/DB/Auth/Storage**: Supabase (Postgres + RLS + Auth + Storage)
- **Maps**: Leaflet + OpenStreetMap
- **AI**: FastAPI + YOLOv8n-cls (Hugging Face Spaces)
- **Offline**: IndexedDB (idb) + Service Worker

## Getting Started

### Prerequisites

- Node.js 18+
- npm/yarn/pnpm
- Supabase account

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env.local` and fill in your Supabase credentials:
   ```bash
   cp .env.example .env.local
   ```
4. Run database migrations in Supabase SQL Editor:
   - Execute `supabase/migrations/0001_init.sql`
   - Execute `supabase/seed.sql` for demo data
5. Start development server:
   ```bash
   npm run dev
   ```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `OPENWEATHER_API_KEY` | OpenWeatherMap API key (optional, for weather data) |
| `AI_API_URL` | Hugging Face Spaces endpoint for AI service |
| `OTP_MODE` | `mock` or `wa` (default: `mock`) |
| `WA_GATEWAY_URL` | WhatsApp gateway URL (for OTP_MODE=wa) |
| `WA_GATEWAY_TOKEN` | WhatsApp gateway token (for OTP_MODE=wa) |

## Project Structure

```
agriguard/
├── app/
│   ├── (marketing)/     # Landing, features, how-it-works, about
│   ├── (auth)/login/    # OTP + onboarding
│   ├── (app)/           # Dashboard layout (sidebar)
│   │   ├── dashboard/   # Early warning + CTA scan
│   │   ├── lahan/       # CRUD lahan
│   │   ├── scan/        # AI crop damage scanner
│   │   ├── laporan/     # Report history + sync status
│   │   ├── peta/        # Interactive map
│   │   └── verifikasi/  # PPL/Dinas verification
│   ├── api/             # API routes
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/              # shadcn primitives
│   └── features/        # Feature components
├── lib/
│   ├── supabase/        # Supabase clients
│   ├── auth/            # OTP service
│   ├── offline/         # IndexedDB + sync
│   ├── ai.ts            # AI service client
│   ├── geo.ts           # Geo utilities
│   ├── thresholds.ts    # Flood thresholds
│   └── utils.ts         # Utilities
├── supabase/
│   ├── migrations/      # Database migrations
│   └── seed.sql         # Demo seed data
├── ai-service/          # FastAPI AI service
└── public/              # Static assets
```

## Demo Accounts (OTP: 123456)

| Role | Phone | Email Alias |
|------|-------|-------------|
| Petani 1 | 081234567890 | 6281234567890@otp.agriguard.id |
| Petani 2 | 081234567891 | 6281234567891@otp.agriguard.id |
| PPL | 081234567892 | 6281234567892@otp.agriguard.id |
| Dinas | 081234567893 | 6281234567893@otp.agriguard.id |

Poktan invite code: `DEMO01`

## Deployment

### Vercel (Web)

1. Connect repository to Vercel
2. Add environment variables
3. Deploy

### Hugging Face Spaces (AI Service)

1. Create new Space with Docker
2. Use `ai-service/Dockerfile`
3. Set `AI_API_URL` to the Space URL

## License

MIT