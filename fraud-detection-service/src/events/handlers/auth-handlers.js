const logger = require("../../utils/logger");
const FraudProfile = require("../../models/fraud-profile");
const FraudRiskLog = require("../../models/fraud-risk-log");
const { evaluateRiskProfile } = require("../../services/risk-engine");

const handleUserRegistered = async (event) => {
  try {
    const { userId, email, ip } = event.payload || event;
    
    // Build initial local read model footprint
    await FraudProfile.create({
      userId,
      email,
      lastKnownIp: ip,
      knownDevices: []
    });

    logger.info(`Fraud local profile populated for new user identity: ${userId}`);
  } catch (err) {
    logger.error("Failed to parse register sync footprint inside fraud context", err);
  }
};

const handleUserLoggedIn = async (event) => {
  try {
    const payload = event.payload || event;
    const context = event.context || {};
    const { userId, email } = payload;
    const { ip, deviceId, userAgent } = context;

    // 1. Execute risk assessment checks immediately on login pattern
    const assessment = await evaluateRiskProfile("user.logged_in", payload, context);

    // 2. Persist audit trail log inside risk archive
    await FraudRiskLog.create({
      eventId: event.eventId || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      eventType: "user.logged_in",
      userId,
      riskScore: assessment.riskScore,
      recommendation: assessment.recommendation,
      triggeredRules: assessment.triggeredRules,
      breakdown: assessment.breakdown,
      payloadSnapshot: { payload, context }
    });

    // 3. Incrementally synchronize known endpoints to read model
    let profile = await FraudProfile.findOne({ userId });
    if (!profile && userId) {
      profile = new FraudProfile({ userId, email: email || "unknown@mail.com" });
    }

    if (profile) {
      profile.lastKnownIp = ip || profile.lastKnownIp;
      if (deviceId) {
        const matchingDeviceExists = profile.knownDevices.some(d => d.deviceId === deviceId);
        if (!matchingDeviceExists) {
          profile.knownDevices.push({ deviceId, ip, userAgent });
        }
      }
      await profile.save();
    }

    logger.info(`Login event risk parsed. Score: ${assessment.riskScore}, Recommendation: ${assessment.recommendation}`);
  } catch (err) {
    logger.error("Error executing login pattern processing inside fraud runtime", err);
  }
};

const handlePasswordChanged = async (event) => {
  try {
    const { userId } = event.payload || event;
    
    await FraudProfile.updateOne(
      { userId },
      { $set: { lastPasswordChangedAt: new Date() } },
      { upsert: false }
    );

    logger.info(`Security profile updated: tracking timestamp password change for ${userId}`);
  } catch (err) {
    logger.error("Failed to map user security profile mutation for password event", err);
  }
};

module.exports = {
  handleUserRegistered,
  handleUserLoggedIn,
  handlePasswordChanged
};