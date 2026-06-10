require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");

const getBalance = async (wallet) => {
  try {
    const clusterToken = process.env.INTERNAL_SERVICE_TOKEN;
    
    const targetId = wallet._id || wallet.walletId || wallet.id;

    if (!targetId) {
      console.error("Ledger balance check aborted: No valid ID structure found on target wallet object.");
      return 0;
    }

    const response = await axios.get(
      `${process.env.LEDGER_SERVICE_URL}/api/ledger/${targetId}/balance`,
      {
        headers: {
          "x-internal-service-token": clusterToken,
        },
      }
    );

    const payload = response.data;
    return payload && payload.balance !== undefined ? payload.balance : (payload?.data?.balance ?? 0);
  } catch (error) {
    console.error(`Ledger client balance extraction error:`, error.message);
    return 0; 
  }
};

module.exports = {
  getBalance,
};