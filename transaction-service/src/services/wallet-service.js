require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");

const getWalletByAccount = async (accountNumber) => {
  const clusterToken =
    process.env.INTERNAL_SERVICE_TOKEN ||
    "my_top_secret_microservice_cluster_token_12345";

  const response = await axios.get(
    `${process.env.WALLET_SERVICE_URL || "http://localhost:3002"}/api/wallet/account/${accountNumber}`,
    {
      headers: {
        "x-internal-service-token": clusterToken,
      },
    },
  );

  return response.data?.data || response.data;
};

module.exports = { getWalletByAccount };
