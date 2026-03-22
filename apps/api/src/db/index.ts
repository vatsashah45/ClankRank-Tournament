import dns from "node:dns";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";
import { config } from "../config.js";

dns.setDefaultResultOrder("ipv4first");

// Fail fast if DATABASE_URL is missing or not a valid Postgres URL
if (!config.databaseUrl || !config.databaseUrl.startsWith("postgres")) {
  console.error(
    `\n❌ Invalid DATABASE_URL: "${config.databaseUrl}"\n` +
    `   Expected a PostgreSQL connection string (postgres://... or postgresql://...)\n` +
    `   Set DATABASE_URL in your environment or .env file\n`
  );
  process.exit(1);
}

const isSupabase = config.databaseUrl.includes("supabase.co");

const client = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: isSupabase ? "require" : false,
});

export const db = drizzle(client, { schema });
export { schema };
export type DB = typeof db;
