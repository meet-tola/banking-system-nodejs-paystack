const Joi = require("joi");

// register
const validateRegistration = (data) => {
  const schema = Joi.object({
    fullName: Joi.string().min(3).max(50).required(),

    email: Joi.string().email().required(),

    password: Joi.string().min(6).required(),
  });

  return schema.validate(data);
};

// login
const validateLogin = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),

    password: Joi.string().required(),
  });

  return schema.validate(data);
};

module.exports = {
  validateRegistration,
  validateLogin,
};
