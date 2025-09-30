const studentModel = require("../models/studentModel");

const getStudents = async (req, res) => {
  try {
    const students = await studentModel.getAllStudents();
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const addStudent = async (req, res) => {
  const { name, email } = req.body;
  try {
    const student = await studentModel.createStudent(name, email);
    res.status(201).json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getStudents, addStudent };
