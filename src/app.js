const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const tutorRoutes = require("./routes/tutor.routes");
const uploadRoutes = require("./routes/uploadRoutes");
const tutorApplicationRoutes = require("./routes/tutorApplication.routes");
const paymentRoutes = require("./routes/payment.routes");
const classFolderRoutes = require("./routes/classFolder.routes");
const reviewRoutes = require("./routes/review.routes");
const notificationRoutes = require("./routes/notification.routes");
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

// ✅ PUBLIC TUTOR ROUTES
app.use("/api/tutors", tutorRoutes);

// ✅ UPLOAD ROUTES (authenticated)
app.use("/api/upload", uploadRoutes);

// ✅ TUTOR APPLICATION & CLASS ROUTES
app.use("/api/tutor", tutorApplicationRoutes);

// ✅ CLASS FOLDER & MATERIAL ROUTES
app.use("/api/tutor", classFolderRoutes);

// ✅ PAYMENT ROUTES
app.use("/api/payments", paymentRoutes);

// ✅ REVIEW ROUTES
app.use("/api/reviews", reviewRoutes);

// ✅ NOTIFICATION ROUTES
app.use("/api/notifications", notificationRoutes);

// ✅ ERROR HANDLER (LAST)
app.use(errorMiddleware);

module.exports = app;
