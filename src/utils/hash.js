const bcrypt = require("bcryptjs");

exports.hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

exports.comparePassword = (password, hashed) => {
  return bcrypt.compare(password, hashed);
};
