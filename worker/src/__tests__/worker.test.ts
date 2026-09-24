import { describe, it, expect } from "vitest";
import { ethers } from "ethers";

describe("Worker Fee and Deduction Calculations", () => {
  it("correctly checks if deductions exceed maxDeductions cap", () => {
    const maxDeductions = ethers.parseEther("0.05");
    const executorReward = ethers.parseEther("0.01");
    const workerReimbursement = ethers.parseEther("0.02");
    const retryableGasCost = ethers.parseEther("0.015");

    const totalDeductions = workerReimbursement + executorReward + retryableGasCost;
    expect(totalDeductions <= maxDeductions).toBe(true);

    const netDelivery = ethers.parseEther("1.0") - totalDeductions;
    expect(netDelivery).toBe(ethers.parseEther("0.955"));
  });

  it("detects when gas spike exceeds signed cap", () => {
    const maxDeductions = ethers.parseEther("0.03");
    const executorReward = ethers.parseEther("0.01");
    const workerReimbursement = ethers.parseEther("0.02"); // high L1 gas
    const retryableGasCost = ethers.parseEther("0.01");

    const totalDeductions = workerReimbursement + executorReward + retryableGasCost;
    expect(totalDeductions > maxDeductions).toBe(true);
  });
});
