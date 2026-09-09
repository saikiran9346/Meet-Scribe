const path = require("path");
const admin = require("firebase-admin");

let db;

try {
  const serviceAccount = require(path.resolve(__dirname, "..", "..", "serviceAccount.json"));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  // Test Firestore connection
  db.collection("test").limit(1).get()
    .then(() => console.log("Firestore connected OK"))
    .catch((err) => console.log("Firestore connection FAILED:", err.message));
} catch (err) {
  console.warn("Firebase init skipped (CI/test environment):", err.message);

  // Initialize with default credentials for environments without serviceAccount
  if (!admin.apps.length) {
    try {
      admin.initializeApp({ projectId: "meetscribe-ci-test" });
      db = admin.firestore();
      db.settings({ ignoreUndefinedProperties: true });
    } catch (fallbackErr) {
      console.warn("Firestore fallback also failed:", fallbackErr.message);
      // Provide a minimal stub so routes that import db don't crash
      db = {
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: false }),
            set: async () => ({}),
            delete: async () => ({}),
          }),
          where: () => ({
            orderBy: () => ({
              get: async () => ({ docs: [], empty: true }),
            }),
            get: async () => ({ docs: [], empty: true }),
          }),
          orderBy: () => ({
            get: async () => ({ docs: [], empty: true }),
          }),
          limit: () => ({
            get: async () => ({ docs: [], empty: true }),
          }),
          get: async () => ({ docs: [], empty: true }),
        }),
        settings: () => {},
      };
    }
  }
}

const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    req.user = await admin.auth().verifyIdToken(header.split("Bearer ")[1]);
    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = { verifyToken, admin, db };