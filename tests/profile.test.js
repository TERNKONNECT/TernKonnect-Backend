import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import profileRoutes from "../routes/profile.js";
import User from "../models/User.js";
import { buildApp } from "./helpers/testApp.js";
import { stub } from "./helpers/stub.js";
import { authHeader } from "./helpers/token.js";

// NOTE: POST /avatar (real multipart upload) is intentionally not covered here —
// it calls Cloudinary's SDK directly rather than through fetch/Sequelize, so
// there's nothing safe to stub at the boundaries this suite mocks. Everything
// below only exercises paths that stay inside our own stubbed models — no real
// network or database call is made.

const app = buildApp({ path: "/api/profile", router: profileRoutes });

function userFixture(overrides = {}) {
  const user = {
    id: "user-1",
    name: "Jane Doe",
    email: "jane@example.com",
    title: "",
    bio: "",
    avatar: "",
    avatarCloudinaryId: "",
    role: "user",
    createdAt: new Date(),
    ...overrides,
  };
  user.update =
    overrides.update ||
    (async function update(fields) {
      Object.assign(this, fields);
      return this;
    });
  return user;
}

test("GET /api/profile requires authentication", async () => {
  const res = await request(app).get("/api/profile");
  assert.equal(res.status, 401);
});

test("GET /api/profile 404s if the user record is gone", async (t) => {
  t.after(stub(User, "findByPk", async () => null));

  const res = await request(app)
    .get("/api/profile")
    .set("Authorization", authHeader({ role: "user" }));

  assert.equal(res.status, 404);
});

test("GET /api/profile returns the caller's serialized profile", async (t) => {
  t.after(stub(User, "findByPk", async () => userFixture({ title: "Instructor" })));

  const res = await request(app)
    .get("/api/profile")
    .set("Authorization", authHeader({ id: "user-1", role: "user" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.email, "jane@example.com");
  assert.equal(res.body.title, "Instructor");
});

test("PUT /api/profile updates name/title/bio", async (t) => {
  const user = userFixture();
  t.after(stub(User, "findByPk", async () => user));

  const res = await request(app)
    .put("/api/profile")
    .set("Authorization", authHeader({ id: "user-1", role: "user" }))
    .send({ name: "Jane Updated", title: "Senior Instructor", bio: "New bio" });

  assert.equal(res.status, 200);
  assert.equal(res.body.name, "Jane Updated");
  assert.equal(user.title, "Senior Instructor");
});

test("POST /api/profile/avatar-url rejects a missing avatar URL", async () => {
  const res = await request(app)
    .post("/api/profile/avatar-url")
    .set("Authorization", authHeader({ role: "user" }))
    .send({});
  assert.equal(res.status, 400);
});

test("POST /api/profile/avatar-url saves a pre-uploaded avatar URL without touching any storage SDK", async (t) => {
  const user = userFixture();
  t.after(stub(User, "findByPk", async () => user));

  const res = await request(app)
    .post("/api/profile/avatar-url")
    .set("Authorization", authHeader({ id: "user-1", role: "user" }))
    .send({ avatar: "https://res.cloudinary.com/demo/avatar.png", avatarCloudinaryId: "avatar_123" });

  assert.equal(res.status, 200);
  assert.equal(res.body.avatar, "https://res.cloudinary.com/demo/avatar.png");
  assert.equal(user.avatarCloudinaryId, "avatar_123");
});

test("GET /api/profile/:adminId 404s for a non-instructor id", async (t) => {
  t.after(stub(User, "findOne", async () => null));

  const res = await request(app).get("/api/profile/nope");
  assert.equal(res.status, 404);
});

test("GET /api/profile/:adminId returns a public profile with email/role stripped", async (t) => {
  t.after(
    stub(User, "findOne", async () =>
      userFixture({ id: "instructor-1", role: "admin", title: "Lead Instructor" }),
    ),
  );

  const res = await request(app).get("/api/profile/instructor-1");

  assert.equal(res.status, 200);
  assert.equal(res.body.title, "Lead Instructor");
  assert.equal("email" in res.body, false);
  assert.equal("role" in res.body, false);
});
