/**
 * MeetScribe Backend — Server Entry Point
 * 
 * Imports the Express app from app.js and attaches
 * Socket.IO and HTTP server listeners.
 */
require("dotenv").config();
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const { logger } = require("./utils/logger");
const app = require("./app");

try {
  const sa = require(path.resolve(__dirname, "..", "serviceAccount.json"));
  logger.info("Service account loaded", { action: "auth_init", projectId: sa.project_id });
} catch (err) {
  logger.warn("Service account not loaded (CI/test environment)", { action: "auth_init" });
}

const server = http.createServer(app);

/* =======================
   SOCKET.IO
   ======================= */

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

/* =======================
   SOCKET EVENTS
   ======================= */

io.on("connection", (socket) => {
  logger.info("Socket client connected", { action: "socket_connect", socketId: socket.id });

  socket.on("join-session", (sessionId) => {
    socket.join(sessionId);
    logger.info(`Socket joined session`, { action: "socket_join", sessionId, socketId: socket.id });
  });

  socket.on("disconnect", () => {
    logger.info("Socket client disconnected", { action: "socket_disconnect", socketId: socket.id });
  });
});

/* =======================
   PUBLIC SHARE ROUTE
   ======================= */

app.get("/api/share/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { db } = require("./middleware/auth");

    // Try Firestore first
    try {
      const doc = await db.collection("meetings").doc(sessionId).get();
      if (doc.exists) {
        const meetingData = doc.data();
        return res.json({
          sessionId: meetingData.sessionId,
          summary: meetingData.summary,
          transcript: meetingData.transcript,
          createdAt: meetingData.createdAt,
        });
      }
    } catch (dbErr) {
      console.warn("Firestore share lookup error:", dbErr.message);
    }

    // Fallback to local files if present
    const fs = require("fs").promises;
    const fsSync = require("fs");
    const LOCAL_DIR = path.join(__dirname, "data/meetings");

    if (fsSync.existsSync(LOCAL_DIR)) {
      const userDirs = await fs.readdir(LOCAL_DIR);
      for (const userId of userDirs) {
        const meetingPath = path.join(LOCAL_DIR, userId, `${sessionId}.json`);
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
    }

    return res.status(404).json({ error: "Meeting not found" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* =======================
   START SERVER
   ======================= */

const PORT = process.env.PORT || 8080;

server.listen(PORT, "0.0.0.0", () => {
  logger.info(`Backend running on port ${PORT}`, { action: "server_startup", port: PORT });
});