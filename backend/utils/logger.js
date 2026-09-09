const winston = require("winston");
const { v4: uuidv4 } = require("uuid");

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

// Custom JSON format ensuring required structured fields
const structuredJsonFormat = winston.format.combine(
  winston.format.timestamp({ format: () => new Date().toISOString() }),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    // Default metadata fields
    info.service = info.service || "meetscribe-backend";
    info.traceId = info.traceId || info.sessionId || "system";
    info.action = info.action || "general";
    return info;
  })(),
  winston.format.json()
);

// Dev format for local readability
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, traceId, action, ...meta }) => {
    const trace = traceId ? `[trace:${traceId}]` : "";
    const act = action ? `[action:${action}]` : "";
    const extraMeta = Object.keys(meta).length ? JSON.stringify(meta) : "";
    return `${timestamp} ${level} ${trace}${act} ${message} ${extraMeta}`.trim();
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isTest ? "warn" : "info"),
  format: isProduction || isTest ? structuredJsonFormat : devFormat,
  defaultMeta: { service: "meetscribe-backend" },
  transports: [
    new winston.transports.Console({
      silent: isTest && !process.env.DEBUG_TESTS,
    }),
  ],
});

/**
 * Creates a child logger with an attached correlation traceId and metadata.
 * Useful for correlating all logs within a meeting session or background task.
 * 
 * @param {string} traceId - The session or request trace ID
 * @param {object} extraMeta - Additional context (e.g. action, userId)
 */
function createTraceLogger(traceId, extraMeta = {}) {
  return logger.child({
    traceId: traceId || uuidv4(),
    ...extraMeta,
  });
}

/**
 * Express middleware for structured HTTP request logging with trace correlation.
 * Attaches req.traceId and req.logger, sets X-Trace-Id header, and logs latency on finish.
 */
function requestLogger(req, res, next) {
  const traceId = req.headers["x-request-id"] || req.headers["x-trace-id"] || uuidv4();
  req.traceId = traceId;
  res.setHeader("X-Trace-Id", traceId);

  req.logger = createTraceLogger(traceId, {
    action: "http_request",
    path: req.originalUrl || req.url,
    method: req.method,
  });

  const startTime = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    req.logger.log({
      level: logLevel,
      message: `${req.method} ${req.originalUrl || req.url} ${res.statusCode} (${durationMs}ms)`,
      statusCode: res.statusCode,
      durationMs,
      action: "http_request_complete",
      traceId,
    });
  });

  next();
}

module.exports = {
  logger,
  createTraceLogger,
  requestLogger,
  structuredJsonFormat,
};
