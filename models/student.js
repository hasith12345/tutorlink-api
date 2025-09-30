const pool = require("../db");

const getAllStudents = async () => {
  const result = await pool.query("SELECT * FROM students");
  return result.rows;
};

const createStudent = async (name, email) => {
  const result = await pool.query(
    "INSERT INTO students (name, email) VALUES ($1, $2) RETURNING *",
    [name, email]
  );
  return result.rows[0];
};

module.exports = { getAllStudents, createStudent };
