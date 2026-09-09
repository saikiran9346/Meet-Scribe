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
  addMetadataFormat,
} = require("../utils/logger");

describe("Structured Logger Core Unit Tests", () => {
  test("Logger should provide all standard log level methods", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  test("createTraceLogger should return a child logger with traceId and metadata context", () => {
    const traceId = "test-session-uuid-1234";
    const child = createTraceLogger(traceId, { action: "meeting_capture", userId: "user-42" });

    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
    expect(typeof child.error).toBe("function");
    expect(child.traceId).toBe(traceId);
    expect(child.metadata.traceId).toBe(traceId);
    expect(child.metadata.action).toBe("meeting_capture");
    expect(child.metadata.userId).toBe("user-42");
  });

  test("createTraceLogger should execute log methods cleanly without errors", () => {
    const child = createTraceLogger("trace-test-555", { action: "bot_start" });
    expect(() => child.info("Test info message")).not.toThrow();
    expect(() => child.warn("Test warning message")).not.toThrow();
    expect(() => child.error("Test error message", { detail: "error details" })).not.toThrow();
  });

  test("addMetadataFormat should enrich log info with service, traceId, and action defaults", () => {
    const formatInstance = addMetadataFormat();
    const info = {
      level: "info",
      message: "Test message for observability",
      traceId: "trace-abc-123",
      action: "test_action",
    };

    const formatted = formatInstance.transform(info);
    expect(formatted.service).toBe("meetscribe-backend");
    expect(formatted.traceId).toBe("trace-abc-123");
    expect(formatted.action).toBe("test_action");
    expect(formatted.level).toBe("info");
    expect(formatted.message).toBe("Test message for observability");
  });

  test("addMetadataFormat should supply system and general fallbacks when fields are missing", () => {
    const formatInstance = addMetadataFormat();
    const info = {
      level: "info",
      message: "System startup",
    };

    const formatted = formatInstance.transform(info);
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
    expect(req.logger.traceId).toBe(req.traceId);
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
    expect(req.logger.traceId).toBe(customRequestId);
    expect(req.logger.metadata.traceId).toBe(customRequestId);
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
