const mongoose = require("mongoose");
const argon2 = require("argon2");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    mfaEnabled: {
      type: Boolean,
      default: false,
    },

    mfaSecret: {
      type: String,
    },

    devices: [
      {
        deviceId: { type: String, required: true },
        userAgent: String,
        ip: String,
        refreshToken: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

// Hash Password
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    this.password = await argon2.hash(this.password);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare Password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return argon2.verify(this.password, candidatePassword);
};

userSchema.index({ fullName: "text", email: "text" });

const User = mongoose.model("User", userSchema);
module.exports = User;
