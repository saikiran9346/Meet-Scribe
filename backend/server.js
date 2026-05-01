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

/* =======================
   ✅ CORS (FINAL FIX)
   ======================= */

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (Postman, mobile apps)
      if (!origin) return callback(null, true);

      // allow Netlify, localhost, ngrok
      if (
        origin.includes("netlify.app") ||
        origin.includes("localhost") ||
        origin.includes("ngrok-free.dev")
      ) {
        return callback(null, true);
      }

      console.log("❌ Blocked by CORS:", origin);
      return callback(new Error("CORS blocked"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// handle preflight requests
app.options("*", cors());

app.use(express.json());

/* =======================
   ✅ SOCKET.IO
   ======================= */

const io = new Server(server, {
  cors: {
    origin: "*", // safe for dev (can restrict later)
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

/* =======================
   ✅ ROUTES
   ======================= */

// Root route
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Public share (no auth)
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

// Protected routes
app.use("/api", verifyToken, apiRoutes);

/* =======================
   ✅ SOCKET EVENTS
   ======================= */

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

/* =======================
   ✅ START SERVER
   ======================= */

const PORT = process.env.PORT || 8080;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
});
