/**
 * MeetScribe Backend — Express App Export for Testing
 * 
 * This module exports the Express app instance separately from the server
 * listener so that Supertest can import and test routes without starting
 * a live HTTP server.
 */
require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const { requestLogger } = require("./utils/logger");
const apiRoutes = require("./routes/api");

// Initialize global temp storage
if (!global.tempMeetingData) {
  global.tempMeetingData = {};
}

const app = express();

app.use(cors());
app.options("*", cors());
app.use(express.json());
app.use(requestLogger);

// Root route
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// API routes
app.use("/api", apiRoutes);

module.exports = app;
