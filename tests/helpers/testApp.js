import express from "express";

// Builds a minimal Express app mounting one or more routers, mirroring how
// server.js mounts them, without connecting to a real database. Pass either a
// single { path, router } or an array of them for routers that depend on
// params from a parent mount (e.g. lessons.js needs :courseId/:moduleId).
export function buildApp(mounts) {
  const app = express();
  app.use(express.json());

  const list = Array.isArray(mounts) ? mounts : [mounts];
  for (const { path, router } of list) {
    app.use(path, router);
  }

  // Route-level try/catch already handles most errors as JSON; this is a
  // safety net so a thrown error doesn't hang the test with an HTML response.
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message });
  });

  return app;
}
