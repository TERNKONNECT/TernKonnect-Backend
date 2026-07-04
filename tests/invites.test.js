import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import authRoutes from "../routes/auth.js";
import User from "../models/User.js";
import { buildApp } from "./helpers/testApp.js";
import { stub } from "./helpers/stub.js";
import { makeUser, sha256 } from "./helpers/fixtures.js";

const app = buildApp({ path: "/api/auth", router: authRoutes });

function invitedUser(overrides = {}) {
  return makeUser({
    role: "admin",
    passwordSetupRequired: true,
    adminInviteToken: sha256("invite-token-123"),
    adminInviteExpires: new Date(Date.now() + 60_000),
    ...overrides,
  });
}

// ── Admin invite ─────────────────────────────────────────────────────────────

test("GET /api/auth/admin-invite rejects a missing token/email", async () => {
  const res = await request(app).get("/api/auth/admin-invite").query({ email: "a@b.com" });
  assert.equal(res.status, 400);
});

test("GET /api/auth/admin-invite rejects an expired invite", async (t) => {
  t.after(
    stub(User, "findOne", async () =>
      invitedUser({ adminInviteExpires: new Date(Date.now() - 1000) }),
    ),
  );

  const res = await request(app)
    .get("/api/auth/admin-invite")
    .query({ token: "invite-token-123", email: "admin@example.com" });

  assert.equal(res.status, 400);
});

test("GET /api/auth/admin-invite verifies a valid invite", async (t) => {
  t.after(stub(User, "findOne", async () => invitedUser({ name: "New Admin" })));

  const res = await request(app)
    .get("/api/auth/admin-invite")
    .query({ token: "invite-token-123", email: "admin@example.com" });

  assert.equal(res.status, 200);
  assert.equal(res.body.name, "New Admin");
});

test("POST /api/auth/admin-invite/accept rejects a short password", async () => {
  const res = await request(app)
    .post("/api/auth/admin-invite/accept")
    .send({ token: "invite-token-123", email: "admin@example.com", password: "123" });
  assert.equal(res.status, 400);
});

test("POST /api/auth/admin-invite/accept rejects a wrong token", async (t) => {
  t.after(stub(User, "findOne", async () => invitedUser()));

  const res = await request(app)
    .post("/api/auth/admin-invite/accept")
    .send({ token: "wrong-token", email: "admin@example.com", password: "password123" });

  assert.equal(res.status, 400);
});

test("POST /api/auth/admin-invite/accept sets the password and logs the admin in", async (t) => {
  const user = invitedUser();
  t.after(stub(User, "findOne", async () => user));

  const res = await request(app)
    .post("/api/auth/admin-invite/accept")
    .send({ token: "invite-token-123", email: "admin@example.com", password: "newpassword123" });

  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(user.passwordSetupRequired, false);
  assert.equal(user.emailVerified, true);
  assert.equal(user.adminInviteToken, null);
});

// ── Student invite (role-scoped separately from admin invites) ─────────────

test("GET /api/auth/student-invite rejects an admin-role invite token (wrong role for this endpoint)", async (t) => {
  // Regression guard: hasValidStudentInvite must check role === "user" so an
  // admin invite link can't be replayed against the student-invite endpoint.
  t.after(stub(User, "findOne", async () => invitedUser({ role: "admin" })));

  const res = await request(app)
    .get("/api/auth/student-invite")
    .query({ token: "invite-token-123", email: "admin@example.com" });

  assert.equal(res.status, 400);
});

test("GET /api/auth/student-invite verifies a valid student invite", async (t) => {
  t.after(stub(User, "findOne", async () => invitedUser({ role: "user", name: "New Student" })));

  const res = await request(app)
    .get("/api/auth/student-invite")
    .query({ token: "invite-token-123", email: "student@example.com" });

  assert.equal(res.status, 200);
  assert.equal(res.body.name, "New Student");
});

test("POST /api/auth/student-invite/accept sets the password and logs the student in", async (t) => {
  const user = invitedUser({ role: "user" });
  t.after(stub(User, "findOne", async () => user));

  const res = await request(app)
    .post("/api/auth/student-invite/accept")
    .send({ token: "invite-token-123", email: "student@example.com", password: "newpassword123" });

  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(user.passwordSetupRequired, false);
  assert.equal(user.adminInviteToken, null);
});

test("POST /api/auth/student-invite/accept rejects an expired invite", async (t) => {
  t.after(
    stub(User, "findOne", async () =>
      invitedUser({ role: "user", adminInviteExpires: new Date(Date.now() - 1000) }),
    ),
  );

  const res = await request(app)
    .post("/api/auth/student-invite/accept")
    .send({ token: "invite-token-123", email: "student@example.com", password: "newpassword123" });

  assert.equal(res.status, 400);
});
