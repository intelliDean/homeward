import { config } from "../config.js";
import { logger } from "../logger.js";

export type AlertSeverity = "info" | "success" | "warn" | "error";

export interface AlertPayload {
  title: string;
  message: string;
  severity: AlertSeverity;
  jobId?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  url?: string;
}

// In-memory rate limiting / deduplication cache (e.g. avoid repeating gas spike spam)
const alertCache = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Checks if an alert should be suppressed due to recent identical dispatch.
 */
function shouldThrottle(dedupKey: string): boolean {
  const now = Date.now();
  const lastSent = alertCache.get(dedupKey);
  if (lastSent && now - lastSent < DEDUPLICATION_WINDOW_MS) {
    return true;
  }
  alertCache.set(dedupKey, now);

  // Evict old entries
  if (alertCache.size > 1000) {
    for (const [key, timestamp] of alertCache.entries()) {
      if (now - timestamp > DEDUPLICATION_WINDOW_MS) {
        alertCache.delete(key);
      }
    }
  }
  return false;
}

/**
 * Dispatch an alert across all configured channels (Discord, Slack, Telegram, Generic).
 */
export async function sendAlert(alert: AlertPayload, options: { throttleKey?: string } = {}): Promise<void> {
  if (options.throttleKey && shouldThrottle(options.throttleKey)) {
    logger.debug({ title: alert.title, key: options.throttleKey }, "Alert throttled by deduplication window");
    return;
  }

  const dispatchPromises: Promise<any>[] = [];

  if (config.DISCORD_WEBHOOK_URL) {
    dispatchPromises.push(sendDiscordAlert(alert, config.DISCORD_WEBHOOK_URL));
  }
  if (config.SLACK_WEBHOOK_URL) {
    dispatchPromises.push(sendSlackAlert(alert, config.SLACK_WEBHOOK_URL));
  }
  if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
    dispatchPromises.push(sendTelegramAlert(alert, config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID));
  }
  if (config.ALERT_WEBHOOK_URL) {
    dispatchPromises.push(sendGenericWebhook(alert, config.ALERT_WEBHOOK_URL));
  }

  if (dispatchPromises.length === 0) {
    // No external webhooks configured; log locally
    logger.debug({ alert }, "Alert created (no external webhooks configured)");
    return;
  }

  const results = await Promise.allSettled(dispatchPromises);
  for (const res of results) {
    if (res.status === "rejected") {
      logger.warn({ err: res.reason }, "Failed to deliver webhook alert notification");
    }
  }
}

// ============================================================================
// Channel Formatters & Senders
// ============================================================================

const SEVERITY_COLORS = {
  info: 0x3b82f6,    // Blue
  success: 0x10b981, // Emerald Green
  warn: 0xf59e0b,    // Amber
  error: 0xef4444,   // Red
};

async function sendDiscordAlert(alert: AlertPayload, webhookUrl: string): Promise<void> {
  const payload = {
    username: "Homeward Relayer Worker",
    avatar_url: "https://ethereum.org/static/6b935ac0e6194247347855e4d08cba99/622f6/eth-diamond-purple.png",
    embeds: [
      {
        title: alert.title,
        description: alert.message,
        color: SEVERITY_COLORS[alert.severity],
        url: alert.url,
        fields: alert.fields?.map((f) => ({
          name: f.name,
          value: f.value,
          inline: f.inline !== false,
        })),
        timestamp: new Date().toISOString(),
        footer: { text: "Homeward Bridge Protocol • Arbitrum Nova → Arbitrum One" },
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook returned status ${response.status}`);
  }
}

async function sendSlackAlert(alert: AlertPayload, webhookUrl: string): Promise<void> {
  const colorHex = {
    info: "#3b82f6",
    success: "#10b981",
    warn: "#f59e0b",
    error: "#ef4444",
  }[alert.severity];

  const payload = {
    text: `*${alert.title}*\n${alert.message}`,
    attachments: [
      {
        color: colorHex,
        fields: alert.fields?.map((f) => ({
          title: f.name,
          value: f.value,
          short: f.inline !== false,
        })),
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook returned status ${response.status}`);
  }
}

async function sendTelegramAlert(alert: AlertPayload, botToken: string, chatId: string): Promise<void> {
  const icon = {
    info: "ℹ️",
    success: "✅",
    warn: "⚠️",
    error: "🚨",
  }[alert.severity];

  let text = `${icon} *${alert.title}*\n\n${alert.message}\n`;
  if (alert.fields && alert.fields.length > 0) {
    text += "\n" + alert.fields.map((f) => `• *${f.name}:* ${f.value}`).join("\n");
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API returned status ${response.status}`);
  }
}

async function sendGenericWebhook(alert: AlertPayload, webhookUrl: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "homeward_worker_alert",
      timestamp: new Date().toISOString(),
      ...alert,
    }),
  });

  if (!response.ok) {
    throw new Error(`Generic webhook returned status ${response.status}`);
  }
}

// ============================================================================
// High-Level Domain Alert Functions
// ============================================================================

export async function notifyJobDiscovered(params: {
  jobId: string;
  depositor: string;
  beneficiary: string;
  principalAmount: string;
  maxDeductions: string;
  executorReward: string;
  txHash: string;
}): Promise<void> {
  await sendAlert({
    title: "🚀 New Migration Job Discovered",
    message: `A new ETH migration has been initiated on Arbitrum Nova and entered the monitoring queue.`,
    severity: "info",
    jobId: params.jobId,
    fields: [
      { name: "Job ID", value: `\`${params.jobId.slice(0, 10)}...${params.jobId.slice(-8)}\``, inline: false },
      { name: "Principal Amount", value: `${params.principalAmount} ETH`, inline: true },
      { name: "Max Deductions", value: `${params.maxDeductions} ETH`, inline: true },
      { name: "Executor Reward", value: `${params.executorReward} ETH`, inline: true },
      { name: "Depositor", value: `\`${params.depositor.slice(0, 8)}...${params.depositor.slice(-6)}\``, inline: true },
      { name: "Beneficiary", value: `\`${params.beneficiary.slice(0, 8)}...${params.beneficiary.slice(-6)}\``, inline: true },
      { name: "Nova Tx", value: `\`${params.txHash.slice(0, 10)}...\``, inline: false },
    ],
  });
}

export async function notifyChallengeMatured(params: {
  jobId: string;
  beneficiary: string;
  principalAmount: string;
}): Promise<void> {
  await sendAlert({
    title: "⏳ 7-Day Challenge Window Matured",
    message: `Migration challenge period is complete! Outbox claim is executable on Ethereum L1.`,
    severity: "info",
    jobId: params.jobId,
    fields: [
      { name: "Job ID", value: `\`${params.jobId}\``, inline: false },
      { name: "Beneficiary", value: `\`${params.beneficiary}\``, inline: true },
      { name: "Principal", value: `${params.principalAmount} ETH`, inline: true },
    ],
  });
}

export async function notifyJobForwarded(params: {
  jobId: string;
  forwardTxHash: string;
  ticketId: string;
  netDeliveryAmount: string;
  workerReward: string;
}): Promise<void> {
  await sendAlert({
    title: "⚡ Retryable Ticket Dispatched to Arb One",
    message: `EthCompletionRouter successfully forwarded net ETH and dispatched the canonical retryable ticket.`,
    severity: "success",
    jobId: params.jobId,
    fields: [
      { name: "Job ID", value: `\`${params.jobId.slice(0, 10)}...${params.jobId.slice(-8)}\``, inline: false },
      { name: "Ticket ID", value: `\`${params.ticketId}\``, inline: true },
      { name: "Net Delivered", value: `${params.netDeliveryAmount} ETH`, inline: true },
      { name: "Worker Compensation", value: `${params.workerReward} ETH`, inline: true },
      { name: "L1 Forward Tx", value: `\`${params.forwardTxHash}\``, inline: false },
    ],
  });
}

export async function notifyMigrationCompleted(params: {
  jobId: string;
  ticketId: string;
  beneficiary: string;
}): Promise<void> {
  await sendAlert({
    title: "🎉 Migration Fully Completed!",
    message: `Retryable ticket successfully redeemed on Arbitrum One. Funds delivered to beneficiary.`,
    severity: "success",
    jobId: params.jobId,
    fields: [
      { name: "Job ID", value: `\`${params.jobId}\``, inline: false },
      { name: "Ticket ID", value: `\`${params.ticketId}\``, inline: true },
      { name: "Beneficiary", value: `\`${params.beneficiary}\``, inline: true },
    ],
  });
}

export async function notifyGasSpike(params: {
  jobId: string;
  totalRequiredDeductions: string;
  maxAllowedDeductions: string;
}): Promise<void> {
  await sendAlert(
    {
      title: "⚠️ Gas Spike Delay (Over Budget)",
      message: `Current L1 baseFee and retryable gas costs exceed the depositor's signed maxDeductions cap. Relaying is paused for 5 minutes.`,
      severity: "warn",
      jobId: params.jobId,
      fields: [
        { name: "Job ID", value: `\`${params.jobId.slice(0, 10)}...${params.jobId.slice(-8)}\``, inline: false },
        { name: "Calculated Cost", value: `${params.totalRequiredDeductions} ETH`, inline: true },
        { name: "Signed Cap", value: `${params.maxAllowedDeductions} ETH`, inline: true },
      ],
    },
    { throttleKey: `gas-spike-${params.jobId}` }
  );
}

export async function notifyWorkerError(params: {
  context: string;
  errorMessage: string;
  jobId?: string;
}): Promise<void> {
  await sendAlert(
    {
      title: "🚨 Relayer Worker Error",
      message: `An error occurred during worker operation: ${params.errorMessage}`,
      severity: "error",
      jobId: params.jobId,
      fields: [
        { name: "Context", value: params.context, inline: true },
        ...(params.jobId ? [{ name: "Job ID", value: `\`${params.jobId}\``, inline: true }] : []),
      ],
    },
    { throttleKey: `error-${params.context}-${params.jobId || "global"}` }
  );
}
