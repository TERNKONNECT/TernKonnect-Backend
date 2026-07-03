import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import authRoutes from "../routes/auth.js";
import User from "../models/User.js";
import { buildApp } from "./helpers/testApp.js";
import { stub, stubFetch, fetchOk } from "./helpers/stub.js";
import { makeUser, sha256 } from "./helpers/fixtures.js";

const app = buildApp({ path: "/api/auth", router: authRoutes });

// ── Registration (onboarding) ───────────────────────────────────────────────

test("POST /api/auth/register rejects missing fields", async () => {
  const res = await request(app).post("/api/auth/register").send({ email: "a@b.com" });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /required/i);
});

test("POST /api/auth/register creates a new unverified user and emails an OTP", async (t) => {
  t.after(stub(User, "findOne", async () => null));
  let createArgs;
  t.after(stub(User, "create", async (attrs) => {
    createArgs = attrs;
    return makeUser({ ...attrs, id: "new-user" });
  }));
  const { restore, calls } = stubFetch(fetchOk());
  t.after(restore);

  const res = await request(app).post("/api/auth/register").send({
    name: "Jane Learner",
    email: "Jane@Example.com",
    password: "password123",
    userType: "learner",
  });

  assert.equal(res.status, 201);
  assert.match(res.body.message, /check your email/i);
  assert.equal(createArgs.email, "jane@example.com");
  assert.equal(createArgs.role, "user");
  assert.equal(createArgs.emailVerified, false);
  assert.equal(calls.length, 1, "should have emailed a verification OTP");
});

test("POST /api/auth/register rejects an email already in use by a verified user", async (t) => {
  t.after(stub(User, "findOne", async () => makeUser({ role: "user", emailVerified: true })));

  const res = await request(app).post("/api/auth/register").send({
    name: "Jane",
    email: "jane@example.com",
    password: "password123",
  });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /already in use/i);
});

// ── Email verification (OTP) ────────────────────────────────────────────────

test("POST /api/auth/verify-email rejects missing otp/email", async () => {
  const res = await request(app).post("/api/auth/verify-email").send({ email: "a@b.com" });
  assert.equal(res.status, 400);
});

test("POST /api/auth/verify-email rejects an invalid code", async (t) => {
  t.after(
    stub(User, "findOne", async () =>
      makeUser({
        emailVerified: false,
        emailVerificationToken: sha256("111111"),
        emailVerificationExpires: new Date(Date.now() + 60_000),
      }),
    ),
  );

  const res = await request(app)
    .post("/api/auth/verify-email")
    .send({ email: "test@example.com", otp: "999999" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /invalid or expired/i);
});

test("POST /api/auth/verify-email rejects an expired code", async (t) => {
  t.after(
    stub(User, "findOne", async () =>
      makeUser({
        emailVerified: false,
        emailVerificationToken: sha256("123456"),
        emailVerificationExpires: new Date(Date.now() - 1000),
      }),
    ),
  );

  const res = await request(app)
    .post("/api/auth/verify-email")
    .send({ email: "test@example.com", otp: "123456" });

  assert.equal(res.status, 400);
});

test("POST /api/auth/verify-email verifies the account on a correct, unexpired code", async (t) => {
  const user = makeUser({
    emailVerified: false,
    emailVerificationToken: sha256("123456"),
    emailVerificationExpires: new Date(Date.now() + 60_000),
  });
  t.after(stub(User, "findOne", async () => user));

  const res = await request(app)
    .post("/api/auth/verify-email")
    .send({ email: "test@example.com", otp: "123456" });

  assert.equal(res.status, 200);
  assert.match(res.body.message, /verified/i);
  assert.equal(user.emailVerified, true);
  assert.equal(user.emailVerificationToken, null);
});

// ── Resend verification (never leaks whether the email exists) ─────────────

test("POST /api/auth/resend-verification returns the same message for an unverified account and a stranger email", async (t) => {
  const { restore, calls } = stubFetch(fetchOk());
  t.after(restore);

  t.after(
    stub(User, "findOne", async ({ where }) =>
      where.email === "known@example.com"
        ? makeUser({ email: "known@example.com", emailVerified: false })
        : null,
    ),
  );

  const known = await request(app)
    .post("/api/auth/resend-verification")
    .send({ email: "known@example.com" });
  const unknown = await request(app)
    .post("/api/auth/resend-verification")
    .send({ email: "nobody@example.com" });

  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.equal(known.body.message, unknown.body.message);
  assert.equal(calls.length, 1, "should only email the account that actually exists");
});

// ── Login ────────────────────────────────────────────────────────────────────

test("POST /api/auth/login rejects wrong password", async (t) => {
  t.after(
    stub(User, "findOne", async () =>
      makeUser({ comparePassword: async () => false }),
    ),
  );

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "test@example.com", password: "wrong" });

  assert.equal(res.status, 401);
});

test("POST /api/auth/login blocks a blocked account", async (t) => {
  t.after(stub(User, "findOne", async () => makeUser({ isBlocked: true })));

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "test@example.com", password: "password123" });

  assert.equal(res.status, 403);
  assert.match(res.body.error, /blocked/i);
});

test("POST /api/auth/login blocks an unverified account with a machine-readable code", async (t) => {
  t.after(stub(User, "findOne", async () => makeUser({ emailVerified: false })));

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "test@example.com", password: "password123" });

  assert.equal(res.status, 403);
  assert.equal(res.body.code, "EMAIL_NOT_VERIFIED");
});

test("POST /api/auth/login blocks an unverified self-registered instructor too", async (t) => {
  // Regression guard: login used to only gate role "user" on emailVerified,
  // letting self-registered instructors (role "admin") log in unverified.
  t.after(
    stub(User, "findOne", async () =>
      makeUser({ role: "admin", emailVerified: false, passwordSetupRequired: false }),
    ),
  );

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "instructor@example.com", password: "password123" });

  assert.equal(res.status, 403);
  assert.equal(res.body.code, "EMAIL_NOT_VERIFIED");
});

test("POST /api/auth/login succeeds and returns a token for a verified, active user", async (t) => {
  t.after(
    stub(User, "findOne", async () =>
      makeUser({
        id: "user-42",
        email: "test@example.com",
        emailVerified: true,
        comparePassword: async (pw) => pw === "password123",
      }),
    ),
  );

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "test@example.com", password: "password123" });

  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.email, "test@example.com");
  assert.equal(res.body.user._id, "user-42");
});
