const crypto = require("crypto");

const FundingTransaction = require("../models/funding-transaction");
const Withdrawal = require("../models/withdrawal");
const WebhookEvent = require("../models/webhook-event");
const VirtualAccount = require("../models/virtual-account");

const { transferFunds } = require("../services/ledger-service");

const handleWebhook = async (req, res) => {
  try {
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.sendStatus(401);
    }

    const event = req.body;

    const reference =
      event.data.reference || event.data.id;

    const eventId = `${event.event}_${reference}`;

    // Idempotency check
    const exists = await WebhookEvent.findOne({ eventId });

    if (exists) return res.sendStatus(200);

    await WebhookEvent.create({
      eventId,
      eventType: event.event,
      payload: event,
    });

    // FUNDING (DEPOSIT)
    if (event.event === "charge.success") {
      const amount = event.data.amount / 100;

      const virtualAccount =
        await VirtualAccount.findOne({
          customerCode:
            event.data.customer.customer_code,
        });

      if (!virtualAccount) return res.sendStatus(200);

      const funding =
        await FundingTransaction.create({
          user: virtualAccount.user,
          wallet: virtualAccount.user,
          amount,
          reference,
          providerTransactionId:
            event.data.id,
          status: "SUCCESS",
          channel:
            "DEDICATED_ACCOUNT",
          metadata: event.data,
        });

      // Ledger credit 
      await transferFunds({
        transactionId: reference,
        fromWallet:
          process.env.SETTLEMENT_ACCOUNT,
        toWallet: virtualAccount.user,
        amount,
      });

      funding.isProcessed = true;
      funding.processedAt = new Date();
      await funding.save();
    }

    // WITHDRAWAL FAILED
    if (event.event === "transfer.failed") {
      await Withdrawal.findOneAndUpdate(
        { reference },
        {
          status: "FAILED",
        }
      );
    }

    // WITHDRAWAL SUCCESS
    if (event.event === "transfer.success") {
      await Withdrawal.findOneAndUpdate(
        { reference },
        {
          status: "SUCCESS",
          processedAt: new Date(),
        }
      );
    }

    // mark processed
    await WebhookEvent.updateOne(
      { eventId },
      { processedAt: new Date() }
    );

    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    return res.sendStatus(500);
  }
};

module.exports = { handleWebhook };