const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const errorMiddleware = require("./middleware/error.middleware.js");

const app = express();

// Debug middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  console.log("Body:", req.body);
  next();
});

app.use(cors());
app.use(express.json());

// ✅ PUBLIC AUTH ROUTES
app.use("/api/auth", authRoutes);

// ✅ ERROR HANDLER (LAST)
app.use(errorMiddleware);

module.exports = app;
