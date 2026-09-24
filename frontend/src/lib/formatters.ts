import { formatEther } from "viem";
import { MigrationJob, StageStates, ChallengeProgress } from "../types";

export function formatEthValue(weiStr?: string): string {
  if (!weiStr) return "0.0000";
  try {
    const eth = formatEther(BigInt(weiStr));
    return Number(eth).toFixed(4);
  } catch {
    return "0.0000";
  }
}

export function formatShortHash(hash?: string | null, left = 8, right = 6): string {
  if (!hash) return "";
  if (hash.length <= left + right) return hash;
  return `${hash.slice(0, left)}...${hash.slice(-right)}`;
}

export function calculateChallengeProgress(createdAt?: string): ChallengeProgress {
  if (!createdAt) {
    return { percent: 10, daysLeft: 7, hoursLeft: 0, text: "7 days remaining" };
  }

  const createdTime = new Date(createdAt).getTime();
  const now = Date.now();
  const challengeDurationMs = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
  const elapsed = now - createdTime;

  if (elapsed >= challengeDurationMs) {
    return { percent: 100, daysLeft: 0, hoursLeft: 0, text: "Challenge window complete" };
  }

  const remainingMs = Math.max(0, challengeDurationMs - elapsed);
  const totalHoursLeft = Math.floor(remainingMs / (1000 * 60 * 60));
  const daysLeft = Math.floor(totalHoursLeft / 24);
  const hoursLeft = totalHoursLeft % 24;
  const percent = Math.min(99, Math.max(5, Math.floor((elapsed / challengeDurationMs) * 100)));

  return {
    percent,
    daysLeft,
    hoursLeft,
    text: daysLeft > 0 ? `~${daysLeft}d ${hoursLeft}h remaining` : `~${hoursLeft}h remaining`,
  };
}

export function getStageStates(job: MigrationJob | null): StageStates {
  if (!job) {
    return { s1: "pending", s2: "pending", s3: "pending", s4: "pending" };
  }

  const status = job.status;

  // Stage 1: Always completed once in database
  const s1 = "completed";

  // Stage 2: Canonical Challenge Period
  let s2: StageStates["s2"] = "pending";
  if (status === "DISCOVERED" || status === "MONITORING_CHALLENGE") {
    s2 = "active";
  } else if (
    status === "CHALLENGE_PASSED" ||
    status === "CLAIMING_OUTBOX" ||
    status === "FORWARDING" ||
    status === "TRACKING_RETRYABLE" ||
    status === "COMPLETED"
  ) {
    s2 = "completed";
  }

  // Stage 3: L1 Outbox Claim & Forward
  let s3: StageStates["s3"] = "pending";
  if (status === "OVER_BUDGET") {
    s3 = "warning";
  } else if (status === "CHALLENGE_PASSED" || status === "CLAIMING_OUTBOX" || status === "FORWARDING") {
    s3 = "active";
  } else if (status === "TRACKING_RETRYABLE" || status === "COMPLETED") {
    s3 = "completed";
  }

  // Stage 4: Arb One Delivery
  let s4: StageStates["s4"] = "pending";
  if (status === "TRACKING_RETRYABLE") {
    s4 = "active";
  } else if (status === "COMPLETED") {
    s4 = "completed";
  }

  return { s1, s2, s3, s4 };
}
