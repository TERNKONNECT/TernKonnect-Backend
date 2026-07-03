import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import courseRoutes from "../routes/courses.js";
import Course from "../models/Course.js";
import Module from "../models/Module.js";
import Lesson from "../models/Lesson.js";
import Quiz from "../models/Quiz.js";
import Enrollment from "../models/Enrollment.js";
import { buildApp } from "./helpers/testApp.js";
import { stub } from "./helpers/stub.js";
import { authHeader } from "./helpers/token.js";

const app = buildApp({ path: "/api/courses", router: courseRoutes });

function courseFixture(overrides = {}) {
  return {
    id: "course-1",
    title: "Intro to Testing",
    thumbnail: "",
    thumbnailCloudinaryId: "",
    introVideoUrl: "",
    introVideoCloudinaryId: "",
    status: "published",
    pricingType: "free",
    price: 0,
    createdBy: "instructor-1",
    toJSON() {
      const { toJSON, ...rest } = this;
      return rest;
    },
    ...overrides,
  };
}

// ── Listing (public catalog vs admin scope) ─────────────────────────────────

test("GET /api/courses only queries published courses for anonymous visitors", async (t) => {
  let whereUsed;
  t.after(
    stub(Course, "findAll", async ({ where }) => {
      whereUsed = where;
      return [];
    }),
  );

  const res = await request(app).get("/api/courses");

  assert.equal(res.status, 200);
  assert.deepEqual(whereUsed, { status: "published" });
});

test("GET /api/courses?scope=admin scopes to the instructor's own courses", async (t) => {
  let whereUsed;
  t.after(
    stub(Course, "findAll", async ({ where }) => {
      whereUsed = where;
      return [];
    }),
  );

  const res = await request(app)
    .get("/api/courses?scope=admin")
    .set("Authorization", authHeader({ id: "instructor-1", role: "admin" }));

  assert.equal(res.status, 200);
  assert.deepEqual(whereUsed, { createdBy: "instructor-1" });
});

// ── Creation (admin-only, validation) ───────────────────────────────────────

test("POST /api/courses requires authentication", async () => {
  const res = await request(app).post("/api/courses").send({ title: "New course" });
  assert.equal(res.status, 401);
});

test("POST /api/courses forbids non-admin roles", async () => {
  const res = await request(app)
    .post("/api/courses")
    .set("Authorization", authHeader({ role: "user" }))
    .send({ title: "New course" });
  assert.equal(res.status, 403);
});

test("POST /api/courses rejects a missing title", async () => {
  const res = await request(app)
    .post("/api/courses")
    .set("Authorization", authHeader({ role: "admin" }))
    .send({});
  assert.equal(res.status, 400);
});

test("POST /api/courses normalizes paid pricing and attributes the creator", async (t) => {
  let createArgs;
  t.after(
    stub(Course, "create", async (attrs) => {
      createArgs = attrs;
      return courseFixture(attrs);
    }),
  );

  const res = await request(app)
    .post("/api/courses")
    .set("Authorization", authHeader({ id: "instructor-9", role: "admin" }))
    .send({ title: "Paid course", pricingType: "paid", price: -5 });

  assert.equal(res.status, 201);
  assert.equal(createArgs.createdBy, "instructor-9");
  assert.equal(createArgs.pricingType, "paid");
  // price is clamped to a minimum of 1 even if a bogus/negative value is sent
  assert.equal(createArgs.price, 1);
});

// ── Single course access control (locked content for non-enrolled users) ───

test("GET /api/courses/:id returns 404 for a missing course", async (t) => {
  t.after(stub(Course, "findByPk", async () => null));
  const res = await request(app).get("/api/courses/does-not-exist");
  assert.equal(res.status, 404);
});

test("GET /api/courses/:id locks lesson content for a visitor with no enrollment", async (t) => {
  t.after(stub(Course, "findByPk", async () => courseFixture()));
  t.after(stub(Module, "findAll", async () => [{ id: "mod-1", toJSON: () => ({ id: "mod-1", title: "Module 1" }) }]));
  t.after(
    stub(Lesson, "findAll", async () => [
      { toJSON: () => ({ id: "lesson-1", type: "text", content: "secret content" }) },
    ]),
  );
  t.after(stub(Quiz, "findOne", async () => null));
  t.after(stub(Enrollment, "findOne", async () => null));

  const res = await request(app).get("/api/courses/course-1");

  assert.equal(res.status, 200);
  assert.equal(res.body.hasAccess, false);
  const lesson = res.body.modules[0].lessons[0];
  assert.equal(lesson.locked, true);
  assert.equal(lesson.content, "");
});

test("GET /api/courses/:id unlocks lesson content for an enrolled student", async (t) => {
  t.after(stub(Course, "findByPk", async () => courseFixture()));
  t.after(stub(Module, "findAll", async () => [{ id: "mod-1", toJSON: () => ({ id: "mod-1", title: "Module 1" }) }]));
  t.after(
    stub(Lesson, "findAll", async () => [
      { toJSON: () => ({ id: "lesson-1", type: "text", content: "secret content" }) },
    ]),
  );
  t.after(stub(Quiz, "findOne", async () => null));
  t.after(stub(Enrollment, "findOne", async () => ({ id: "enr-1" })));

  const res = await request(app)
    .get("/api/courses/course-1")
    .set("Authorization", authHeader({ id: "student-1", role: "user" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.hasAccess, true);
  assert.equal(res.body.modules[0].lessons[0].content, "secret content");
});

test("GET /api/courses/:id grants admins full access without an enrollment row", async (t) => {
  t.after(stub(Course, "findByPk", async () => courseFixture()));
  t.after(stub(Module, "findAll", async () => []));
  t.after(stub(Enrollment, "findOne", async () => null));

  const res = await request(app)
    .get("/api/courses/course-1")
    .set("Authorization", authHeader({ id: "admin-1", role: "super-admin" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.hasAccess, true);
});
