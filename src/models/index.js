const sequelize = require("../config/db");

const User = require("./User");
const Student = require("./Student");
const Tutor = require("./Tutor");

User.hasOne(Student, { foreignKey: "userId" });
User.hasOne(Tutor, { foreignKey: "userId" });

Student.belongsTo(User);
Tutor.belongsTo(User);

module.exports = { sequelize, User, Student, Tutor };
