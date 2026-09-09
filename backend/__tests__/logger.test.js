/**
 * MeetScribe Backend — Structured Logger Tests
 * 
 * Validates Winston structured JSON logging, trace correlation IDs,
 * child loggers, and HTTP request logging middleware.
 */
const request = require("supertest");
const winston = require("winston");
const app = require("../app");
const {
  logger,
  createTraceLogger,
  requestLogger,
  structuredJsonFormat,
} = require("../utils/logger");

describe("Structured Logger Core Unit Tests", () => {
  test("Logger should have all standard log levels", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  test("createTraceLogger should return a child logger with traceId and action context", () => {
    const traceId = "test-session-uuid-1234";
    const child = createTraceLogger(traceId, { action: "meeting_capture", userId: "user-42" });

    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
    expect(typeof child.error).toBe("function");
    expect(child.defaultMeta.traceId).toBe(traceId);
    expect(child.defaultMeta.action).toBe("meeting_capture");
    expect(child.defaultMeta.userId).toBe("user-42");
  });

  test("structuredJsonFormat should transform info into JSON with required observability fields", () => {
    // Test the custom winston format directly
    const info = {
      level: "info",
      message: "Test message for observability",
      traceId: "trace-abc-123",
      action: "test_action",
    };

    const formatted = structuredJsonFormat.transform(info);
    expect(formatted).toHaveProperty("timestamp");
    expect(formatted).toHaveProperty("level", "info");
    expect(formatted).toHaveProperty("message", "Test message for observability");
    expect(formatted).toHaveProperty("traceId", "trace-abc-123");
    expect(formatted).toHaveProperty("action", "test_action");
    expect(formatted).toHaveProperty("service", "meetscribe-backend");
  });

  test("structuredJsonFormat should assign default values when traceId or action are omitted", () => {
    const info = {
      level: "info",
      message: "System startup",
    };

    const formatted = structuredJsonFormat.transform(info);
    expect(formatted.traceId).toBe("system");
    expect(formatted.action).toBe("general");
    expect(formatted.service).toBe("meetscribe-backend");
  });
});

describe("HTTP Request Logger Middleware Tests", () => {
  test("requestLogger should attach traceId and req.logger, and set X-Trace-Id header", () => {
    const req = {
      headers: {},
      method: "GET",
      url: "/api/test",
      originalUrl: "/api/test",
    };
    const res = {
      setHeader: jest.fn(),
      on: jest.fn(),
    };
    const next = jest.fn();

    requestLogger(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.traceId).toBeDefined();
    expect(typeof req.traceId).toBe("string");
    expect(req.traceId.length).toBeGreaterThan(0);
    expect(req.logger).toBeDefined();
    expect(typeof req.logger.info).toBe("function");
    expect(res.setHeader).toHaveBeenCalledWith("X-Trace-Id", req.traceId);
  });

  test("requestLogger should propagate incoming X-Request-Id header as traceId", () => {
    const customRequestId = "client-provided-trace-id-999";
    const req = {
      headers: { "x-request-id": customRequestId },
      method: "POST",
      url: "/api/bot/start",
      originalUrl: "/api/bot/start",
    };
    const res = {
      setHeader: jest.fn(),
      on: jest.fn(),
    };
    const next = jest.fn();

    requestLogger(req, res, next);

    expect(req.traceId).toBe(customRequestId);
    expect(res.setHeader).toHaveBeenCalledWith("X-Trace-Id", customRequestId);
    expect(req.logger.defaultMeta.traceId).toBe(customRequestId);
  });

  test("End-to-end: GET /health should include X-Trace-Id in HTTP response headers", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.headers).toHaveProperty("x-trace-id");
    expect(res.headers["x-trace-id"]).toBeTruthy();
  });

  test("End-to-end: Custom X-Request-Id sent by client should be echoed as X-Trace-Id", async () => {
    const customTraceId = "distributed-trace-uuid-777";
    const res = await request(app)
      .get("/health")
      .set("X-Request-Id", customTraceId);

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-trace-id"]).toBe(customTraceId);
  });
});
