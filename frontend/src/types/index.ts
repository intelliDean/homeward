export type MigrationStatus =
  | "DISCOVERED"
  | "MONITORING_CHALLENGE"
  | "CHALLENGE_PASSED"
  | "CLAIMING_OUTBOX"
  | "FORWARDING"
  | "TRACKING_RETRYABLE"
  | "COMPLETED"
  | "OVER_BUDGET"
  | "FAILED";

export interface MigrationJob {
  jobId: string;
  depositor: string;
  beneficiary: string;
  principalAmount: string;
  maxDeductions: string;
  executorReward: string;
  minDeliveryThreshold: string;
  messagePosition: string;
  novaTxHash: string;
  novaBlockNumber: string;
  outboxClaimTxHash: string | null;
  forwardTxHash: string | null;
  retryableTicketId: string | null;
  status: MigrationStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StepState = "completed" | "active" | "warning" | "pending";

export interface StageStates {
  s1: StepState;
  s2: StepState;
  s3: StepState;
  s4: StepState;
}

export interface ChallengeProgress {
  percent: number;
  daysLeft: number;
  hoursLeft: number;
  text: string;
}
