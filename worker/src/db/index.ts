import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

/**
 * Initializes database tables if not existing
 */
export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        job_id VARCHAR(66) PRIMARY KEY,
        depositor VARCHAR(42) NOT NULL,
        beneficiary VARCHAR(42) NOT NULL,
        principal_amount VARCHAR(78) NOT NULL,
        max_deductions VARCHAR(78) NOT NULL,
        executor_reward VARCHAR(78) NOT NULL,
        min_delivery_threshold VARCHAR(78) NOT NULL,
        message_position BIGINT NOT NULL,
        nova_tx_hash VARCHAR(66) NOT NULL,
        nova_block_number BIGINT NOT NULL,
        outbox_claim_tx_hash VARCHAR(66),
        forward_tx_hash VARCHAR(66),
        retryable_ticket_id VARCHAR(78),
        status VARCHAR(32) NOT NULL DEFAULT 'DISCOVERED',
        error_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_migrations_status ON migrations(status);
    `);
  } finally {
    client.release();
  }
}
