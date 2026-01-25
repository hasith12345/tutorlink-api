const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Student = sequelize.define("Student", {
  educationLevel: DataTypes.STRING,
  grade: DataTypes.STRING,
  subjects: DataTypes.ARRAY(DataTypes.STRING),
  learningMode: DataTypes.STRING
});

module.exports = Student;
