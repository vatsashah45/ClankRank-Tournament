import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required for Postgres migration");
  process.exit(1);
}

const isSupabase = databaseUrl.includes("supabase.co");
const sql = postgres(databaseUrl, {
  max: 1,
  ssl: isSupabase ? "require" : false,
});

await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS tournament_entries (
    id SERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL UNIQUE,
    wallet_address TEXT NOT NULL,
    chain TEXT NOT NULL CHECK(chain IN ('monad','ethereum','arbitrum','base')),
    authorized_feedback BOOLEAN NOT NULL DEFAULT false,
    created_at TEXT NOT NULL DEFAULT (now()::text),
    status TEXT NOT NULL DEFAULT 'registered'
      CHECK(status IN ('registered','qualified','eliminated','active','champion'))
  );

  CREATE TABLE IF NOT EXISTS qualification_scores (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER NOT NULL UNIQUE REFERENCES tournament_entries(id),
    score DOUBLE PRECISION NOT NULL,
    tier TEXT NOT NULL,
    respected429 BOOLEAN,
    loops INTEGER,
    total_requests INTEGER,
    error_rate DOUBLE PRECISION,
    avg_latency DOUBLE PRECISION,
    burstiness DOUBLE PRECISION,
    on_chain_feedback_count INTEGER,
    on_chain_avg_score DOUBLE PRECISION,
    raw_metrics_json TEXT,
    scored_at TEXT NOT NULL DEFAULT (now()::text)
  );

  CREATE TABLE IF NOT EXISTS bracket_state (
    id SERIAL PRIMARY KEY,
    round TEXT NOT NULL CHECK(round IN ('R64','R32','R16','QF','SF','CHAMPIONSHIP')),
    region TEXT CHECK(region IN ('monad','ethereum','arbitrum','base') OR region IS NULL),
    seed_a INTEGER,
    seed_b INTEGER,
    entry_a_id INTEGER NOT NULL REFERENCES tournament_entries(id),
    entry_b_id INTEGER NOT NULL REFERENCES tournament_entries(id),
    winner_id INTEGER REFERENCES tournament_entries(id),
    score_a DOUBLE PRECISION,
    score_b DOUBLE PRECISION,
    metrics_a_json TEXT,
    metrics_b_json TEXT,
    ipfs_cid TEXT,
    tx_hash TEXT,
    started_at TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS predictors (
    id SERIAL PRIMARY KEY,
    display_name TEXT NOT NULL,
    email TEXT,
    wallet_address TEXT,
    chain TEXT CHECK(chain IN ('monad','ethereum','arbitrum','base') OR chain IS NULL),
    type TEXT NOT NULL DEFAULT 'human',
    agent_id TEXT,
    access_token TEXT,
    created_at TEXT NOT NULL DEFAULT (now()::text)
  );

  CREATE TABLE IF NOT EXISTS bracket_predictions (
    id SERIAL PRIMARY KEY,
    predictor_id INTEGER NOT NULL REFERENCES predictors(id),
    picks_json TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    correct_picks INTEGER NOT NULL DEFAULT 0,
    max_possible_score INTEGER NOT NULL DEFAULT 192,
    submitted_at TEXT NOT NULL DEFAULT (now()::text),
    updated_at TEXT DEFAULT (now()::text)
  );

  CREATE TABLE IF NOT EXISTS tournament_meta (
    id INTEGER PRIMARY KEY DEFAULT 1,
    state TEXT NOT NULL DEFAULT 'REGISTRATION'
      CHECK(state IN ('REGISTRATION','QUALIFICATION','R64','R32','R16','QF','SF','CHAMPIONSHIP','COMPLETE')),
    current_round TEXT,
    started_at TEXT,
    updated_at TEXT DEFAULT (now()::text)
  );

  CREATE TABLE IF NOT EXISTS waitlist (
    id SERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL UNIQUE,
    wallet_address TEXT NOT NULL,
    chain TEXT NOT NULL CHECK(chain IN ('monad','ethereum','arbitrum','base')),
    authorized_feedback BOOLEAN NOT NULL DEFAULT false,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (now()::text)
  );

  CREATE TABLE IF NOT EXISTS sponsor_slots (
    id SERIAL PRIMARY KEY,
    tier TEXT NOT NULL CHECK(tier IN ('surf','crawl','refer')),
    wallet_address TEXT NOT NULL,
    agent_id TEXT,
    display_name TEXT,
    tx_hash TEXT,
    amount_usd INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (now()::text)
  );

  INSERT INTO tournament_meta (id, state)
  VALUES (1, 'REGISTRATION')
  ON CONFLICT (id) DO NOTHING;
`);

// ── Additive migrations (safe to re-run) ──────────────────────────

// Add missing columns to predictors (fixes "column email does not exist")
await sql.unsafe(`
  ALTER TABLE predictors
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS chain TEXT CHECK (chain IN ('monad','ethereum','arbitrum','base') OR chain IS NULL),
    ADD COLUMN IF NOT EXISTS agent_id TEXT,
    ADD COLUMN IF NOT EXISTS access_token TEXT;
`);

// Add predictor registration fields (twitter, email opt-in, open-ended answer)
await sql.unsafe(`
  ALTER TABLE predictors
    ADD COLUMN IF NOT EXISTS twitter_handle TEXT,
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS open_ended_answer TEXT;
`);

// Add password hash column for predictor auth
await sql.unsafe(`
  ALTER TABLE predictors
    ADD COLUMN IF NOT EXISTS password_hash TEXT;
`);

// Ensure email and access_token are unique for predictor auth/lookup
await sql.unsafe(`
  CREATE UNIQUE INDEX IF NOT EXISTS predictors_email_key
    ON predictors (email)
    WHERE email IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS predictors_access_token_key
    ON predictors (access_token)
    WHERE access_token IS NOT NULL;
`);

// Locus checkout sessions table
await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS checkout_sessions (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    predictor_id INTEGER NOT NULL REFERENCES predictors(id),
    purpose TEXT NOT NULL DEFAULT 'registration',
    picks_json TEXT,
    amount TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payment_tx_hash TEXT,
    payer_address TEXT,
    webhook_secret TEXT,
    created_at TEXT NOT NULL DEFAULT (now()::text),
    paid_at TEXT
  );
`);

// Add paid column to predictors (idempotent)
await sql.unsafe(`
  ALTER TABLE predictors ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT false;
`);

// Ensure purpose column exists on checkout_sessions (for older schemas)
// The CREATE TABLE above already includes it, but this handles pre-existing tables.
await sql.unsafe(`
  ALTER TABLE checkout_sessions ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'registration';
`);

// Ensure picks_json is nullable (older schemas may have had it as NOT NULL)
await sql.unsafe(`
  ALTER TABLE checkout_sessions ALTER COLUMN picks_json DROP NOT NULL;
`);

// Enable Row Level Security on all public tables.
// All app access uses service_role or direct postgres (both bypass RLS),
// so this only blocks unauthorized access via the public anon key / PostgREST.
await sql.unsafe(`
  ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.sponsor_slots ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.tournament_entries ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.qualification_scores ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.bracket_state ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.bracket_predictions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.tournament_meta ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.predictors ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;
`);

console.log(`✓ Database migrated (Postgres)`);
await sql.end();
