require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const mongoose = require("mongoose");
const dns = require("node:dns"); 
const logger = require("../utils/logger");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    logger.info("Connected to MongoDB");
  } catch (error) {
    logger.error("MongoDB connection error", error);

    process.exit(1);
  }
};

module.exports = connectDB;
