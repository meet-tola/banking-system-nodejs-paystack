require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");

const getBalance = async (walletId) => {
  const response = await axios.get(
    `${process.env.LEDGER_SERVICE_URL}/api/ledger/${walletId}/balance`
  );

  return response.data.balance;
};

module.exports = {
  getBalance,
};