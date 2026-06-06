require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");

const transferFunds = async ({
  transactionId,
  fromWallet,
  toWallet,
  amount,
}) => {
  try {
    const response = await axios.post(
      `${process.env.LEDGER_SERVICE_URL}/api/ledger/transfer`,
      {
        transactionId,
        fromWallet,
        toWallet,
        amount,
      },
    );

    return response.data;
  } catch (error) {
    throw error;
  }
};

const getBalance = async (walletId) => {
  const response = await axios.get(
    `${process.env.LEDGER_SERVICE_URL}/api/ledger/${walletId}/balance`,
  );

  return response.data.balance;
};
module.exports = {
  transferFunds,
  getBalance,
};
