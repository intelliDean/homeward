import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address")?.trim() || null;
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10), 1), 50);

    const pool = getDbPool();
    let query: string;
    let params: (string | number)[];

    if (address) {
      query = `
        SELECT 
          job_id AS "jobId",
          depositor,
          beneficiary,
          principal_amount AS "principalAmount",
          max_deductions AS "maxDeductions",
          executor_reward AS "executorReward",
          min_delivery_threshold AS "minDeliveryThreshold",
          message_position AS "messagePosition",
          nova_tx_hash AS "novaTxHash",
          nova_block_number AS "novaBlockNumber",
          outbox_claim_tx_hash AS "outboxClaimTxHash",
          forward_tx_hash AS "forwardTxHash",
          retryable_ticket_id AS "retryableTicketId",
          status,
          error_message AS "errorMessage",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM migrations
        WHERE LOWER(depositor) = LOWER($1) OR LOWER(beneficiary) = LOWER($1)
        ORDER BY created_at DESC
        LIMIT $2;
      `;
      params = [address, limit];
    } else {
      query = `
        SELECT 
          job_id AS "jobId",
          depositor,
          beneficiary,
          principal_amount AS "principalAmount",
          max_deductions AS "maxDeductions",
          executor_reward AS "executorReward",
          min_delivery_threshold AS "minDeliveryThreshold",
          message_position AS "messagePosition",
          nova_tx_hash AS "novaTxHash",
          nova_block_number AS "novaBlockNumber",
          outbox_claim_tx_hash AS "outboxClaimTxHash",
          forward_tx_hash AS "forwardTxHash",
          retryable_ticket_id AS "retryableTicketId",
          status,
          error_message AS "errorMessage",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM migrations
        ORDER BY created_at DESC
        LIMIT $1;
      `;
      params = [limit];
    }

    const result = await pool.query(query, params);

    return NextResponse.json({
      success: true,
      jobs: result.rows,
      count: result.rows.length,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("API /api/jobs error:", err);
    return NextResponse.json(
      { success: false, error: "Database query failed: " + errorMsg },
      { status: 500 }
    );
  }
}
