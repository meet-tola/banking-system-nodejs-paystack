const redis = require("../config/redis");

const setOtp = async (userId, otp) => {
  await redis.setEx(`otp:${userId}`, 300, otp); // 5 min
};

const getOtp = async (userId) => {
  return await redis.get(`otp:${userId}`);
};

const deleteOtp = async (userId) => {
  return await redis.del(`otp:${userId}`);
};

module.exports = {
  setOtp,
  getOtp,
  deleteOtp,
};