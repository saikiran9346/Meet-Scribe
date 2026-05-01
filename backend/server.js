require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const apiRoutes = require("./routes/api");
const { verifyToken } = require("./middleware/auth");

console.log(
  "Service account loaded:",
  require("./serviceAccount.json").project_id
);

// Initialize global temp storage
global.tempMeetingData = {};

const app = express();
const server = http.createServer(app);

// ✅ Allowed origins
const allowedOrigins = [
  "https://meetbotscribe.netlify.app",
  "http://localhost:3000",
];

// ✅ CORS FIX (MAIN FIX)
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow Postman

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("CORS blocked: " + origin));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// ✅ VERY IMPORTANT (handles preflight requests)
app.options("*", cors());

app.use(express.json());

// ✅ Socket setup (AFTER cors defined)
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

// Make io available in routes
app.set("io", io);

// ✅ Root route
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

// ✅ Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ─── PUBLIC SHARE (no auth required) ─────────────────────────
app.get("/api/share/:sessionId", async (req, res) => {
  try {
    const fs = require("fs").promises;
    const fsSync = require("fs");
    const path = require("path");

    const LOCAL_DIR = path.join(__dirname, "data/meetings");
    const { sessionId } = req.params;

    if (!fsSync.existsSync(LOCAL_DIR)) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    const userDirs = await fs.readdir(LOCAL_DIR);

    for (const userId of userDirs) {
      const meetingPath = path.join(
        LOCAL_DIR,
        userId,
        `${sessionId}.json`
      );

      if (fsSync.existsSync(meetingPath)) {
        const content = await fs.readFile(meetingPath, "utf-8");
        const meetingData = JSON.parse(content);

        return res.json({
          sessionId: meetingData.sessionId,
          summary: meetingData.summary,
          transcript: meetingData.transcript,
          createdAt: meetingData.createdAt,
        });
      }
    }

    return res.status(404).json({ error: "Meeting not found" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 🔒 Protected API routes
app.use("/api", verifyToken, apiRoutes);

// ✅ Socket.IO
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join-session", (sessionId) => {
    socket.join(sessionId);
    console.log(`Joined session: ${sessionId}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// ✅ Server start
const PORT = process.env.PORT || 8080;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
});
