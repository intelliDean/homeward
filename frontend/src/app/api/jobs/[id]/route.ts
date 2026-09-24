import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id || id.trim() === "") {
    return NextResponse.json(
      { success: false, error: "Missing or invalid job ID" },
      { status: 400 }
    );
  }

  try {
    const pool = getDbPool();
    const query = `
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
      WHERE LOWER(job_id) = LOWER($1) OR LOWER(nova_tx_hash) = LOWER($1)
      LIMIT 1;
    `;

    const result = await pool.query(query, [id.trim()]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Migration job not found in database" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: result.rows[0],
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("API /api/jobs/[id] error:", err);
    return NextResponse.json(
      { success: false, error: "Database query failed: " + errorMsg },
      { status: 500 }
    );
  }
}
