import { pgTable, text, varchar, timestamp, bigint } from "drizzle-orm/pg-core";

export const migrationsTable = pgTable("migrations", {
  jobId: varchar("job_id", { length: 66 }).primaryKey(),
  depositor: varchar("depositor", { length: 42 }).notNull(),
  beneficiary: varchar("beneficiary", { length: 42 }).notNull(),
  principalAmount: varchar("principal_amount", { length: 78 }).notNull(),
  maxDeductions: varchar("max_deductions", { length: 78 }).notNull(),
  executorReward: varchar("executor_reward", { length: 78 }).notNull(),
  minDeliveryThreshold: varchar("min_delivery_threshold", { length: 78 }).notNull(),
  messagePosition: bigint("message_position", { mode: "number" }).notNull(),
  novaTxHash: varchar("nova_tx_hash", { length: 66 }).notNull(),
  novaBlockNumber: bigint("nova_block_number", { mode: "number" }).notNull(),
  outboxClaimTxHash: varchar("outbox_claim_tx_hash", { length: 66 }),
  forwardTxHash: varchar("forward_tx_hash", { length: 66 }),
  retryableTicketId: varchar("retryable_ticket_id", { length: 78 }),
  status: varchar("status", { length: 32 }).notNull().default("DISCOVERED"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MigrationRecord = typeof migrationsTable.$inferSelect;
export type NewMigrationRecord = typeof migrationsTable.$inferInsert;
