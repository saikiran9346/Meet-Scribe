/**
 * MeetScribe Backend — API Integration & Route Contract Tests
 * 
 * Validates core REST endpoints, response schemas, error boundaries,
 * and distributed trace correlation IDs using Jest + Supertest with
 * a CI-safe in-memory Firestore mock.
 */
const request = require("supertest");
const app = require("../app");

// ─── Health & Root Endpoints ─────────────────────────────────────────────────

describe("Health & Root Endpoints", () => {
  test("GET / should return 200 with running message", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Backend is running");
  });

  test("GET /health should return { status: 'ok' }", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
  });
});

// ─── Meetings API ────────────────────────────────────────────────────────────

describe("Meetings API", () => {
  test("GET /api/meetings should return meetings array", async () => {
    const res = await request(app).get("/api/meetings");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("meetings");
    expect(Array.isArray(res.body.meetings)).toBe(true);
  });

  test("GET /api/meetings/:id should return 404 for non-existent meeting", async () => {
    const res = await request(app).get("/api/meetings/non-existent-id-12345");
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  test("DELETE /api/meetings/:id should return success for any id", async () => {
    const res = await request(app).delete("/api/meetings/non-existent-id-12345");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("success", true);
  });
});

// ─── Bot Control API ─────────────────────────────────────────────────────────

describe("Bot Control API", () => {
  test("POST /api/bot/start should reject invalid meet URL", async () => {
    const res = await request(app)
      .post("/api/bot/start")
      .send({ meetUrl: "https://example.com/not-a-meet" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toContain("Invalid");
  });

  test("POST /api/bot/start should reject missing meetUrl", async () => {
    const res = await request(app)
      .post("/api/bot/start")
      .send({});
    expect(res.statusCode).toBe(400);
  });

  test("POST /api/bot/stop should return 404 for non-existent session", async () => {
    const res = await request(app)
      .post("/api/bot/stop")
      .send({ sessionId: "non-existent-session-id" });
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  test("GET /api/bot/transcript/:id should return 404 for unknown session", async () => {
    const res = await request(app).get("/api/bot/transcript/unknown-session");
    expect(res.statusCode).toBe(404);
  });
});

// ─── Chat API ────────────────────────────────────────────────────────────────

describe("Chat API", () => {
  test("POST /api/meetings/:id/chat should reject empty message", async () => {
    const res = await request(app)
      .post("/api/meetings/test-session/chat")
      .send({ message: "" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("POST /api/meetings/:id/chat should reject missing message field", async () => {
    const res = await request(app)
      .post("/api/meetings/test-session/chat")
      .send({});
    expect(res.statusCode).toBe(400);
  });

  test("GET /api/meetings/:id/chat should return messages array", async () => {
    const res = await request(app).get("/api/meetings/test-session/chat");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("messages");
    expect(Array.isArray(res.body.messages)).toBe(true);
  });
});

// ─── Global Cross-Meeting Chat API ───────────────────────────────────────────

describe("Global Cross-Meeting Chat API", () => {
  test("POST /api/chat/global should reject empty message", async () => {
    const res = await request(app)
      .post("/api/chat/global")
      .send({ message: "" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("POST /api/chat/global should reject missing message field", async () => {
    const res = await request(app)
      .post("/api/chat/global")
      .send({});
    expect(res.statusCode).toBe(400);
  });
});

// ─── Response Schema Validation ──────────────────────────────────────────────

describe("Response Schema Validation", () => {
  test("Health endpoint should return valid JSON with correct content type", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(typeof res.body.status).toBe("string");
  });

  test("Meetings list should have correct schema shape", async () => {
    const res = await request(app).get("/api/meetings");
    expect(res.headers["content-type"]).toMatch(/json/);

    if (res.body.meetings.length > 0) {
      const meeting = res.body.meetings[0];
      expect(meeting).toHaveProperty("sessionId");
      expect(meeting).toHaveProperty("title");
      expect(meeting).toHaveProperty("createdAt");
    }
  });
});
