const logger = require("../utils/logger");
const FraudRiskLog = require("../models/fraud-risk-log");
const FraudProfile = require("../models/fraud-profile");

const getRiskLogs = async (req, res, next) => {
  try {
    const { userId, recommendation, eventType } = req.query;
    const filter = {};

    if (userId) filter.userId = userId;
    if (recommendation) filter.recommendation = recommendation;
    if (eventType) filter.eventType = eventType;

    const logs = await FraudRiskLog.find(filter).sort({ createdAt: -1 }).limit(100);

    return res.status(200).json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (err) {
    logger.error("Failed to query systemic threat analytics collections logs", err);
    next(err);
  }
};

const getUserFraudProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const profile = await FraudProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Fraud baseline identity profile not resolved for entity query"
      });
    }

    return res.status(200).json({
      success: true,
      data: profile
    });
  } catch (err) {
    logger.error("Failed resolving specific individual structural profile records details", err);
    next(err);
  }
};

const resolveTriggerAlertOverride = async (req, res, next) => {
  try {
    const { logId } = req.params;
    const { adminResolutionComment, forceOverrideStatus } = req.body;

    if (!forceOverrideStatus) {
      return res.status(400).json({
        success: false,
        message: "forceOverrideStatus parameter missing inside payload updates"
      });
    }

    const log = await FraudRiskLog.findById(logId);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Targeted critical risk record reference sequence missing"
      });
    }

    log.recommendation = forceOverrideStatus;
    log.payloadSnapshot = {
      ...log.payloadSnapshot,
      overrideResolutionMeta: {
        agentId: req.user?.userId || "SYSTEM_ADMIN",
        comment: adminResolutionComment || "Manual verification cleared override",
        resolvedAt: new Date()
      }
    };

    await log.save();

    return res.status(200).json({
      success: true,
      message: `System target risk state changed status override to: ${forceOverrideStatus}`,
      data: log
    });
  } catch (err) {
    logger.error("Internal threat evaluation resolution agent override transaction failure", err);
    next(err);
  }
};

module.exports = {
  getRiskLogs,
  getUserFraudProfile,
  resolveTriggerAlertOverride
};