require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");

const getWalletById = async (walletId) => {
  const response = await axios.get(
    `${process.env.WALLET_SERVICE_URL}/api/wallet/${walletId}`
  );

  return response.data.data;
};

module.exports = {
  getWalletById,
};