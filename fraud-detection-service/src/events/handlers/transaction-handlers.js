const logger = require("../../utils/logger");
const FraudRiskLog = require("../../models/fraud-risk-log");
const { evaluateRiskProfile } = require("../../services/risk-engine");
const redis = require("../../config/redis");

const handleTransactionCreated = async (event) => {
  try {
    const payload = event.payload || event;
    const context = event.context || {};
    const { transactionId, userId, fromAccount } = payload;

    const assessment = await evaluateRiskProfile("transaction.created", payload, context);

    await FraudRiskLog.create({
      eventId: event.eventId || `tx-evt-${Date.now()}`,
      eventType: "transaction.created",
      userId,
      targetEntityId: transactionId || fromAccount,
      riskScore: assessment.riskScore,
      recommendation: assessment.recommendation,
      triggeredRules: assessment.triggeredRules,
      breakdown: assessment.breakdown,
      payloadSnapshot: { payload, context }
    });

    if (assessment.recommendation === "BLOCK") {
      logger.error(`[CRITICAL SECURITY ALERT] BLOCK enforcement recommended on transaction: ${transactionId} for account: ${fromAccount}`);
    }
  } catch (err) {
    logger.error("Failed processing analytics execution for created transaction", err);
  }
};

const handleTransactionFailed = async (event) => {
  try {
    const payload = event.payload || event;
    const context = event.context || {};

    const assessment = await evaluateRiskProfile("transaction.failed", payload, context);

    await FraudRiskLog.create({
      eventId: event.eventId || `fail-evt-${Date.now()}`,
      eventType: "transaction.failed",
      userId: payload.userId,
      targetEntityId: payload.fromAccount,
      riskScore: assessment.riskScore,
      recommendation: assessment.recommendation,
      triggeredRules: assessment.triggeredRules,
      breakdown: assessment.breakdown,
      payloadSnapshot: { payload, context }
    });
  } catch (err) {
    logger.error("Failed tracking transactional failures profile updates", err);
  }
};

const handleTransactionCompleted = async (event) => {
  try {
    const { fromAccount, amount } = event.payload || event;
    if (!fromAccount || !amount) return;

    const cacheKey = `fraud:baseline:avg:${fromAccount}`;
    const currentCachedAverage = await redis.get(cacheKey);

    let newAverage = parseFloat(amount);
    if (currentCachedAverage) {
      const totalAverageValue = parseFloat(currentCachedAverage);
      newAverage = (totalAverageValue * 0.7) + (parseFloat(amount) * 0.3);
    }

    await redis.setex(cacheKey, 2592000, newAverage.toFixed(2));
    logger.info(`Recalculated internal behavioral baseline cache for wallet profile: ${fromAccount} to ${newAverage.toFixed(2)}`);
  } catch (err) {
    logger.error("Failed post validation metrics synchronization on transaction completed event", err);
  }
};

module.exports = {
  handleTransactionCreated,
  handleTransactionFailed,
  handleTransactionCompleted
};