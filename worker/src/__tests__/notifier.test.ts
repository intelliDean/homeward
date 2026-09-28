import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendAlert,
  notifyJobDiscovered,
  notifyChallengeMatured,
  notifyJobForwarded,
  notifyMigrationCompleted,
  notifyGasSpike,
  notifyWorkerError,
} from "../alerts/notifier.js";
import { config } from "../config.js";

describe("Worker Alerting and Webhook Service", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete (config as any).DISCORD_WEBHOOK_URL;
    delete (config as any).SLACK_WEBHOOK_URL;
    delete (config as any).TELEGRAM_BOT_TOKEN;
    delete (config as any).TELEGRAM_CHAT_ID;
  });

  it("completes cleanly without dispatching when no webhooks are configured", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await sendAlert({
      title: "Test Alert",
      message: "Testing local notification",
      severity: "info",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("formats and dispatches Discord embed payload", async () => {
    (config as any).DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/mock-url";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = fetchMock;

    await notifyJobDiscovered({
      jobId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      depositor: "0x1111111111111111111111111111111111111111",
      beneficiary: "0x2222222222222222222222222222222222222222",
      principalAmount: "1.0",
      maxDeductions: "0.05",
      executorReward: "0.01",
      txHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/webhooks/mock-url",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.embeds).toBeDefined();
    expect(callBody.embeds[0].title).toContain("New Migration Job Discovered");
    expect(callBody.embeds[0].color).toBe(0x3b82f6); // info color
  });

  it("formats and dispatches Slack webhook payload", async () => {
    (config as any).SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/mock-url";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    await notifyJobForwarded({
      jobId: "0xabc",
      forwardTxHash: "0xdef",
      ticketId: "1234",
      netDeliveryAmount: "0.95",
      workerReward: "0.02",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.text).toContain("Retryable Ticket Dispatched");
    expect(callBody.attachments[0].color).toBe("#10b981"); // success color
  });

  it("formats and dispatches Telegram Bot message", async () => {
    (config as any).TELEGRAM_BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
    (config as any).TELEGRAM_CHAT_ID = "-100123456789";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    await notifyGasSpike({
      jobId: "0x9999",
      totalRequiredDeductions: "0.08",
      maxAllowedDeductions: "0.05",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/sendMessage"),
      expect.objectContaining({
        method: "POST",
      })
    );

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.chat_id).toBe("-100123456789");
    expect(callBody.text).toContain("Gas Spike Delay");
  });

  it("throttles repeated alerts with identical throttleKey", async () => {
    (config as any).DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/mock-url";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = fetchMock;

    // Send first alert
    await notifyGasSpike({
      jobId: "0xthrottled_job",
      totalRequiredDeductions: "0.08",
      maxAllowedDeductions: "0.05",
    });

    // Send second identical alert immediately
    await notifyGasSpike({
      jobId: "0xthrottled_job",
      totalRequiredDeductions: "0.08",
      maxAllowedDeductions: "0.05",
    });

    // Should only have dispatched once
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gracefully catches and logs webhook network errors without throwing", async () => {
    (config as any).DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/error-url";
    global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    // Must not reject or throw
    await expect(
      notifyWorkerError({
        context: "Test Queue",
        errorMessage: "Simulated worker error",
      })
    ).resolves.toBeUndefined();
  });
});
