require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const app = require("./src/app");
const { prisma } = require("./src/models");
const { setIO } = require("./src/config/socket");
const { startTutorAvailabilityCron } = require("./src/jobs/tutorAvailabilityCron");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await prisma.$connect();
    console.log("Database connected");

    const httpServer = http.createServer(app);

    const io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error("Unauthorized"));
      try {
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || "tutorlink_jwt_secret_key_2024"
        );
        socket.userId = decoded.id;
        socket.isAdmin = !!decoded.isAdmin;
        next();
      } catch {
        next(new Error("Invalid token"));
      }
    });

    io.on("connection", (socket) => {
      if (socket.isAdmin) {
        socket.join("admin");
      } else {
        socket.join(socket.userId);
      }
      socket.on("disconnect", () => {});
    });

    setIO(io);

    // Start scheduled jobs
    startTutorAvailabilityCron();

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    process.on("SIGINT", async () => {
      console.log("Shutting down gracefully...");
      await prisma.$disconnect();
      httpServer.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    });

    httpServer.on("error", (err) => {
      console.error("Server error:", err);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    await prisma.$disconnect();
    process.exit(1);
  }
};

startServer();
