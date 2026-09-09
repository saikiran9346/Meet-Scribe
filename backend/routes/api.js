const express = require("express");
const router = express.Router();
const { db, admin } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const { logger, createTraceLogger } = require("../utils/logger");
const MeetBot = require("../bot/meetBot");
const {
  summarizeTranscript,
  chatWithMeeting,
  chatAcrossAllMeetings,
  getChatHistory,
  clearChatSession,
  initChatSession,
} = require("../services/langchainService");
const {
  saveMeeting,
  getMeeting,
  listMeetings,
  getFullMeetingsForUser,
  deleteMeeting,
  getShareLink,
  getPdfLink,
  getPdfBuffer,
  generatePdf,
} = require("../services/storageService");

// Optional Auth resolver: extract user from Bearer token
router.use(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split("Bearer ")[1];
    if (token && token !== "null" && token !== "undefined") {
      try {
        req.user = await admin.auth().verifyIdToken(token);
      } catch (e) {
        req.user = null;
      }
    }
  }
  next();
});

// In-memory active bot sessions { sessionId: MeetBot }
const activeBots = new Map();

// ─── BOT CONTROL ─────────────────────────────────────────────────────────────

// Start bot
router.post("/bot/start", async (req, res) => {
  const { meetUrl } = req.body;
  const userId = req.user?.uid || "test-user";

  if (!meetUrl?.includes("meet.google.com")) {
    return res.status(400).json({ error: "Invalid Google Meet URL" });
  }

  const sessionId = uuidv4();
  const io = req.app.get("io");

  const bot = new MeetBot(sessionId, meetUrl, io);
  activeBots.set(sessionId, bot);

  // Launch async, errors emitted via socket
  bot.launch().catch((err) => {
    io.to(sessionId).emit("bot-error", { message: err.message });
    activeBots.delete(sessionId);
  });

  res.json({ sessionId });
});

// Stop bot + generate summary (BUT DON'T SAVE YET)
router.post("/bot/stop", async (req, res) => {
  const { sessionId } = req.body;
  const userId = req.user?.uid || "test-user";
  const bot = activeBots.get(sessionId);

  if (!bot) return res.status(404).json({ error: "Session not found" });

  const io = req.app.get("io");
  io.to(sessionId).emit("bot-status", { status: "summarizing", message: "Generating AI summary..." });

  try {
    const transcript = await bot.stop();
    activeBots.delete(sessionId);

    if (!transcript.length) {
      return res.status(400).json({ error: "No transcript was captured" });
    }

    const log = createTraceLogger(sessionId, { action: "bot_stop", userId });
    log.info("Stopping bot session", { transcriptCount: transcript.length });

    // AI summarize
    log.info("Generating AI summary");
    const summary = await summarizeTranscript(transcript);
    log.info("Summary generated", { title: summary.title });

    // Store in memory temporarily (don't save to database yet)
    global.tempMeetingData = global.tempMeetingData || {};
    global.tempMeetingData[sessionId] = {
      userId,
      sessionId,
      summary,
      transcript,
      createdAt: new Date().toISOString(),
    };
    
    log.info("Meeting data stored in memory", { action: "temp_storage" });

    // Init chatbot session
    initChatSession(sessionId, transcript, summary);
    log.info("Chat session initialized", { action: "chat_init" });

    // Respond immediately
    res.json({ 
      success: true, 
      sessionId, 
      message: "Summary generated" 
    });

    // Emit socket event after short delay
    setTimeout(() => {
      io.to(sessionId).emit("summary-ready", { sessionId });
      log.info("Summary ready event emitted", { action: "socket_emit" });
    }, 300);

  } catch (err) {
    logger.error("Stop error", { action: "bot_stop_error", sessionId, error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

// SAVE meeting to dashboard (user explicitly clicks Save)
router.post("/meetings/:sessionId/save", async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user?.uid || "test-user";

  try {
    const log = createTraceLogger(sessionId, { action: "meeting_save", userId });

    // Get from temp storage or already saved
    let meetingData = null;
    
    if (global.tempMeetingData && global.tempMeetingData[sessionId]) {
      meetingData = global.tempMeetingData[sessionId];
      log.info("Found meeting in temp storage");
    } else {
      // Try to load from existing saved meetings
      meetingData = await getMeeting(userId, sessionId);
      if (meetingData) {
        log.info("Meeting already saved");
        return res.json({ success: true, message: "Meeting is already saved to dashboard", alreadySaved: true });
      }
    }

    if (!meetingData) {
      return res.status(404).json({ error: "Meeting data not found. The session may have expired." });
    }

    log.info("Saving meeting to dashboard (Firestore)");

    // Save to Firestore
    await saveMeeting(userId, sessionId, meetingData.summary, meetingData.transcript);
    log.info("Meeting saved to Firestore");

    // Remove from temp storage
    if (global.tempMeetingData) {
      delete global.tempMeetingData[sessionId];
    }

    log.info("Meeting successfully saved to dashboard", { title: meetingData.summary.title });

    res.json({ 
      success: true, 
      message: "Meeting saved to dashboard",
      title: meetingData.summary.title
    });
  } catch (err) {
    logger.error("Save error", { action: "meeting_save_error", sessionId, error: err.message, stack: err.stack });
    // Even if there's an error, check if the doc was saved
    try {
      const existingData = await getMeeting(userId, sessionId);
      if (existingData) {
        logger.info("Meeting exists in Firestore despite error, returning success", { action: "meeting_save_recovery", sessionId });
        return res.json({ success: true, message: "Meeting saved (with warnings)", title: existingData.summary?.title });
      }
    } catch (_) {}
    
    res.status(500).json({ error: err.message || "Failed to save meeting" });
  }
});

// Get live transcript for active session
router.get("/bot/transcript/:sessionId", (req, res) => {
  const bot = activeBots.get(req.params.sessionId);
  if (!bot) return res.status(404).json({ error: "Session not found" });
  res.json({ transcript: bot.getTranscript() });
});

// ─── MEETINGS HISTORY ─────────────────────────────────────────────────────────

// List all meetings for user
router.get("/meetings", async (req, res) => {
  try {
    const userId = req.user?.uid || "test-user";
    logger.info("Listing meetings for user", { action: "meetings_list", userId });
    const meetings = await listMeetings(userId);
    res.json({ meetings });
  } catch (err) {
    logger.error("GET /meetings error", { action: "meetings_list_error", error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Get full meeting data (summary + transcript) from temp storage OR Firestore
router.get("/meetings/:sessionId", async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const userId = req.user?.uid || "test-user";
    const log = createTraceLogger(sessionId, { action: "meeting_get", userId });
    log.info("Loading meeting data");
    
    // First check temp storage (for unsaved meetings) - NO userId check needed
    if (global.tempMeetingData && global.tempMeetingData[sessionId]) {
      const data = { ...global.tempMeetingData[sessionId] };
      data._saved = false;
      log.info("Loaded from temp storage");
      return res.json(data);
    }
    
    // Try saved meetings (requires userId match)
    log.info("Checking Firestore for saved meeting");
    const data = await getMeeting(userId, sessionId);
    
    if (data) {
      data._saved = true;
      log.info("Loaded from Firestore");
      return res.json(data);
    }
    
    // Not found anywhere
    log.warn("Meeting not found", {
      tempSessions: global.tempMeetingData ? Object.keys(global.tempMeetingData) : "none"
    });
    
    return res.status(404).json({ 
      error: "Meeting not found", 
      sessionId: sessionId,
      hint: "The meeting may have been cleared from memory."
    });
  } catch (err) {
    logger.error("Get meeting error", { action: "meeting_get_error", sessionId: req.params.sessionId, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Delete meeting
router.delete("/meetings/:sessionId", async (req, res) => {
  try {
    const userId = req.user?.uid || "test-user";
    const sessionId = req.params.sessionId;
    const log = createTraceLogger(sessionId, { action: "meeting_delete", userId });
    log.info("Deleting meeting");
    await deleteMeeting(userId, sessionId);
    clearChatSession(sessionId);
    log.info("Meeting deleted successfully");
    res.json({ success: true });
  } catch (err) {
    logger.error("Delete meeting error", { action: "meeting_delete_error", sessionId: req.params.sessionId, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── MEETING CHATBOT ──────────────────────────────────────────────────────────

// Send message to meeting chatbot
router.post("/meetings/:sessionId/chat", async (req, res) => {
  const { message } = req.body;
  const { sessionId } = req.params;
  const userId = req.user?.uid || "test-user";

  if (!message?.trim()) return res.status(400).json({ error: "Message is required" });

  try {
    const log = createTraceLogger(sessionId, { action: "chat_meeting", userId });
    log.info("Chat message received", { messageLength: message.length });

    // Load transcript + summary if session not in memory (e.g. after server restart)
    if (!getChatHistory(sessionId).length) {
      const data = await getMeeting(userId, sessionId);
      if (!data) return res.status(404).json({ error: "Meeting not found" });
      initChatSession(sessionId, data.transcript, data.summary);
    }

    // Get transcript + summary for context (already in memory after init)
    const data = await getMeeting(userId, sessionId);
    const result = await chatWithMeeting(
      sessionId,
      message,
      data?.transcript || [],
      data?.summary || null
    );

    res.json(result);
  } catch (err) {
    logger.error("Meeting chat error", { action: "chat_meeting_error", sessionId, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Get chat history for a meeting
router.get("/meetings/:sessionId/chat", (req, res) => {
  const history = getChatHistory(req.params.sessionId);
  res.json({ messages: history });
});

// ─── CROSS-MEETING GLOBAL AI CHAT ─────────────────────────────────────────────

// Send message across all user meetings
router.post("/chat/global", async (req, res) => {
  const { message, history } = req.body;
  const userId = req.user?.uid || "test-user";

  if (!message?.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    logger.info("Global cross-meeting chat query", { action: "chat_global", userId, messageLength: message.length });
    const allMeetings = await getFullMeetingsForUser(userId);
    const result = await chatAcrossAllMeetings(message.trim(), history || [], allMeetings);
    res.json(result);
  } catch (err) {
    logger.error("Global cross-meeting chat error", { action: "chat_global_error", error: err.message });
    res.status(500).json({ error: err.message || "Failed to process cross-meeting query" });
  }
});

// ─── SHARE + PDF ──────────────────────────────────────────────────────────────

// Generate share link
router.post("/meetings/:sessionId/share", async (req, res) => {
  try {
    const userId = req.user?.uid || "test-user";
    const url = await getShareLink(userId, req.params.sessionId);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get PDF download link
router.get("/meetings/:sessionId/pdf", async (req, res) => {
  try {
    const userId = req.user?.uid || "test-user";
    const { sessionId } = req.params;
    
    let url = await getPdfLink(userId, sessionId);
    if (!url) return res.status(404).json({ error: "PDF not found" });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download PDF file
router.get("/meetings/:sessionId/pdf/download", async (req, res) => {
  try {
    const userId = req.user?.uid || "test-user";
    const pdfBuffer = await getPdfBuffer(userId, req.params.sessionId);
    if (!pdfBuffer) return res.status(404).json({ error: "PDF not found" });
    
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="meeting-${req.params.sessionId}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
