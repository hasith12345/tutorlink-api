const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Tutor = sequelize.define("Tutor", {
  subjects: DataTypes.ARRAY(DataTypes.STRING),
  educationLevels: DataTypes.ARRAY(DataTypes.STRING),
  experience: DataTypes.STRING
});

module.exports = Tutor;
