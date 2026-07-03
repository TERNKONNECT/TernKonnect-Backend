import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import superadminRoutes from "../routes/superadmin.js";
import User from "../models/User.js";
import { buildApp } from "./helpers/testApp.js";
import { stub, stubFetch, fetchOk } from "./helpers/stub.js";
import { authHeader } from "./helpers/token.js";
import { makeUser } from "./helpers/fixtures.js";

const app = buildApp({ path: "/api/superadmin", router: superadminRoutes });

// ── Template download ───────────────────────────────────────────────────────

test("GET /bulk-onboard/template requires authentication", async () => {
  const res = await request(app).get("/api/superadmin/bulk-onboard/template");
  assert.equal(res.status, 401);
});

test("GET /bulk-onboard/template forbids non-super-admins", async () => {
  const res = await request(app)
    .get("/api/superadmin/bulk-onboard/template")
    .set("Authorization", authHeader({ role: "admin" }));
  assert.equal(res.status, 403);
});

test("GET /bulk-onboard/template returns the expected CSV headers", async () => {
  const res = await request(app)
    .get("/api/superadmin/bulk-onboard/template")
    .set("Authorization", authHeader({ role: "super-admin" }));

  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/csv/);
  assert.equal(res.text.trim(), "firstname,lastname,email");
});

// ── CSV upload ───────────────────────────────────────────────────────────────

test("POST /bulk-onboard/upload requires authentication", async () => {
  const res = await request(app).post("/api/superadmin/bulk-onboard/upload");
  assert.equal(res.status, 401);
});

test("POST /bulk-onboard/upload rejects a request with no file", async () => {
  const res = await request(app)
    .post("/api/superadmin/bulk-onboard/upload")
    .set("Authorization", authHeader({ role: "super-admin" }));
  assert.equal(res.status, 400);
});

test("POST /bulk-onboard/upload rejects a CSV with no data rows", async () => {
  const res = await request(app)
    .post("/api/superadmin/bulk-onboard/upload")
    .set("Authorization", authHeader({ role: "super-admin" }))
    .attach("file", Buffer.from("firstname,lastname,email\n"), "students.csv");

  assert.equal(res.status, 400);
  assert.match(res.body.error, /empty|no data rows/i);
});

test("POST /bulk-onboard/upload rejects a CSV missing required columns", async () => {
  const res = await request(app)
    .post("/api/superadmin/bulk-onboard/upload")
    .set("Authorization", authHeader({ role: "super-admin" }))
    .attach("file", Buffer.from("name,mail\nJane,jane@example.com\n"), "students.csv");

  assert.equal(res.status, 400);
  assert.match(res.body.error, /firstname, lastname, email/i);
});

test("POST /bulk-onboard/upload creates, skips, and fails rows correctly", async (t) => {
  t.after(stub(User, "findByPk", async () => makeUser({ name: "Super Admin" })));

  const created = [];
  t.after(
    stub(User, "findOne", async ({ where }) => {
      if (where.email === "existing@example.com") {
        return makeUser({ email: "existing@example.com", passwordSetupRequired: false });
      }
      return null;
    }),
  );
  t.after(
    stub(User, "create", async (attrs) => {
      created.push(attrs);
      return makeUser({ ...attrs, id: `new-${created.length}` });
    }),
  );

  const { restore, calls } = stubFetch(fetchOk());
  t.after(restore);

  const csv = [
    "firstname,lastname,email",
    "Jane,Doe,jane@example.com", // valid, new -> created
    "John,Existing,existing@example.com", // already onboarded -> skipped
    "NoEmail,Row,", // missing email -> failed
    "Bad,Email,not-an-email", // invalid format -> failed
  ].join("\n");

  const res = await request(app)
    .post("/api/superadmin/bulk-onboard/upload")
    .set("Authorization", authHeader({ id: "super-1", role: "super-admin" }))
    .attach("file", Buffer.from(csv), "students.csv");

  assert.equal(res.status, 200);
  assert.equal(res.body.total, 4);
  assert.equal(res.body.created, 1);
  assert.equal(res.body.skipped, 1);
  assert.equal(res.body.failed, 2);

  assert.equal(created.length, 1);
  assert.equal(created[0].email, "jane@example.com");
  assert.equal(created[0].role, "user");
  assert.equal(created[0].passwordSetupRequired, true);

  // Only the one genuinely-created row should trigger an invite email.
  assert.equal(calls.length, 1);

  const byEmail = Object.fromEntries(res.body.details.map((d) => [d.email, d]));
  assert.equal(byEmail["jane@example.com"].status, "created");
  assert.equal(byEmail["existing@example.com"].status, "skipped");
  assert.equal(byEmail["not-an-email"].status, "failed");
});

test("POST /bulk-onboard/upload re-invites a user who never completed setup", async (t) => {
  t.after(stub(User, "findByPk", async () => makeUser({ name: "Super Admin" })));
  t.after(
    stub(User, "findOne", async () =>
      makeUser({ email: "pending@example.com", passwordSetupRequired: true }),
    ),
  );
  const { restore } = stubFetch(fetchOk());
  t.after(restore);

  const csv = "firstname,lastname,email\nPending,User,pending@example.com";

  const res = await request(app)
    .post("/api/superadmin/bulk-onboard/upload")
    .set("Authorization", authHeader({ role: "super-admin" }))
    .attach("file", Buffer.from(csv), "students.csv");

  assert.equal(res.status, 200);
  assert.equal(res.body.reInvited, 1);
  assert.equal(res.body.details[0].status, "re-invited");
});
