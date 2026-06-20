const logger = require("../utils/logger");
const FraudProfile = require("../models/fraud-profile");
const redis = require("../config/redis");
const { checkVelocityWindow } = require("./cache-service");

const evaluateRiskProfile = async (eventType, payload, context = {}) => {
  let riskScore = 0;
  const triggeredRules = [];
  const breakdown = { ruleBased: 0, device: 0, velocity: 0, behavioral: 0 };

  const userId = payload.userId;
  const fromAccount = payload.fromAccount;
  const amount = parseFloat(payload.amount || 0);
  const { ip, deviceId } = context;

  let profile = null;
  if (userId) {
    profile = await FraudProfile.findOne({ userId });
  }

  // RULE 1: COMPLEX MULTI-EVENT BEHAVIOR CHAINING
  if (eventType === "transaction.created" && profile?.lastPasswordChangedAt) {
    const timeDelta = Date.now() - new Date(profile.lastPasswordChangedAt).getTime();
    if (timeDelta < 30 * 60 * 1000) {
      breakdown.behavioral += 50;
      triggeredRules.push("IMMEDIATE_TRANSFER_AFTER_PASSWORD_CHANGE");
    }
  }

  // RULE 2: SYSTEMIC VELOCITY ASSIGNMENT 
  if (userId && eventType === "transaction.created") {
    const velocityKey = `fraud:velocity:tx:${userId}`;
    const velocityCheck = await checkVelocityWindow(velocityKey, 5, 60); // Max 5 transfers per minute
    
    if (velocityCheck.isLimitExceeded) {
      breakdown.velocity += 40;
      triggeredRules.push("VELOCITY_LIMIT_EXCEEDED_1M");
    } else if (velocityCheck.currentCount > 3) {
      breakdown.velocity += 15;
      triggeredRules.push("HIGH_VELOCITY_BURST_DETECTED");
    }
  }

  //  RULE 3: DEVICE IDENTITY & GEOGRAPHIC RISK
  if ((eventType === "user.logged_in" || eventType === "transaction.created") && profile) {
    if (deviceId) {
      const isDeviceRecognized = profile.knownDevices.some(d => d.deviceId === deviceId);
      if (!isDeviceRecognized) {
        breakdown.device += 30;
        triggeredRules.push("UNRECOGNIZED_DEVICE_SIGNATURE");
      }
    }
    if (ip && profile.lastKnownIp && profile.lastKnownIp !== ip) {
      breakdown.device += 15;
      triggeredRules.push("IP_ADDRESS_GEOGRAPHIC_DIVERGENCE");
    }
  }

  // RULE 4: STRUCTURAL ANOMALIES & HISTORICAL AVERAGES
  if (eventType === "transaction.created") {
    if (amount > 10000) { // High transfer limit ceiling
      breakdown.ruleBased += 30;
      triggeredRules.push("EXCESSIVE_SINGLE_TRANSACTION_VALUE");
    }
    if (fromAccount && payload.toAccount && fromAccount === payload.toAccount) {
      breakdown.ruleBased += 40;
      triggeredRules.push("SELF_TRANSFER_ANOMALY");
    }

    // Dynamic historical checking using Ledger background parameters optimized in Redis
    if (fromAccount) {
      const averageKey = `fraud:baseline:avg:${fromAccount}`;
      const cachedBaselineAverage = await redis.get(averageKey);
      if (cachedBaselineAverage) {
        const historicalAverage = parseFloat(cachedBaselineAverage);
        if (historicalAverage > 0 && amount > historicalAverage * 3) {
          breakdown.behavioral += 35;
          triggeredRules.push("BEHAVIORAL_SPENDING_OUTLIER");
        }
      }
    }
  }

  // RULE LAYER 5: BRUTE FORCE REPEATED TRANSFER FAILURES
  if (eventType === "transaction.failed" && fromAccount) {
    const failureKey = `fraud:failures:wallet:${fromAccount}`;
    const failureCheck = await checkVelocityWindow(failureKey, 3, 300); 
    if (failureCheck.isLimitExceeded) {
      breakdown.velocity += 45;
      triggeredRules.push("BRUTE_FORCE_TRANSFER_SUSPICION");
    }
  }

  riskScore = Math.min(100, breakdown.ruleBased + breakdown.device + breakdown.velocity + breakdown.behavioral);

  let recommendation = "ALLOW";
  if (riskScore >= 75) {
    recommendation = "BLOCK";
  } else if (riskScore >= 40) {
    recommendation = "CHALLENGE_MFA";
  }

  return { riskScore, recommendation, breakdown, triggeredRules };
};

module.exports = { evaluateRiskProfile };