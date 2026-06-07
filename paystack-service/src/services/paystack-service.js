require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");

const client = axios.create({
  baseURL: "https://api.paystack.co",
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

const createCustomer = async ({
  email,
  firstName,
  lastName,
  phone,
}) => {
  const response = await client.post("/customer", {
    email,
    first_name: firstName,
    last_name: lastName,
    phone,
  });

  return response.data.data;
};

const createDedicatedAccount = async ({
  customerCode,
}) => {
  const response = await client.post(
    "/dedicated_account",
    {
      customer: customerCode,
      preferred_bank: "wema-bank",
    }
  );

  return response.data.data;
};

const verifyBankAccount = async (
  accountNumber,
  bankCode
) => {
  const response = await client.get(
    `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
  );

  return response.data.data;
};

const listBanks = async () => {
  const response = await client.get("/bank");

  return response.data.data;
};

const createTransferRecipient = async ({
  accountNumber,
  bankCode,
  accountName,
}) => {
  const response = await client.post(
    "/transferrecipient",
    {
      type: "nuban",
      name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "NGN",
    }
  );

  return response.data.data;
};

const initiateTransfer = async ({
  amount,
  recipientCode,
  reference,
}) => {
  const response = await client.post(
    "/transfer",
    {
      source: "balance",
      amount: amount * 100,
      recipient: recipientCode,
      reference,
    }
  );

  return response.data.data;
};

module.exports = {
  createCustomer,
  createDedicatedAccount,
  verifyBankAccount,
  createTransferRecipient,
  initiateTransfer,
  listBanks,
};