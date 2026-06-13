const axios = require("axios");

const getUsersByIds = async (userIds) => {
  const clusterToken = process.env.INTERNAL_SERVICE_TOKEN;

  try {
    const response = await axios.post(
      `${process.env.AUTH_SERVICE_URL || "http://localhost:3001"}/api/user/get-users-by-ids`,
      { ids: userIds },
      {
        headers: {
          "x-internal-service-token": clusterToken,
        },
        timeout: 5000,
      }
    );

    return response.data?.data || response.data || [];
  } catch (error) {
    throw new Error(`Auth Service look up failed: ${error.message}`);
  }
};

module.exports = { getUsersByIds };