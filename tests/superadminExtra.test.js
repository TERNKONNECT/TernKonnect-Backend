import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import superadminRoutes from "../routes/superadmin.js";
import User from "../models/User.js";
import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import Lesson from "../models/Lesson.js";
import LessonProgress from "../models/LessonProgress.js";
import { buildApp } from "./helpers/testApp.js";
import { stub, stubFetch, fetchOk } from "./helpers/stub.js";
import { authHeader } from "./helpers/token.js";
import { makeUser } from "./helpers/fixtures.js";

const app = buildApp({ path: "/api/superadmin", router: superadminRoutes });

// ── Instructor invitations ──────────────────────────────────────────────────

test("POST /instructors/invite rejects missing fields", async () => {
  const res = await request(app)
    .post("/api/superadmin/instructors/invite")
    .set("Authorization", authHeader({ role: "super-admin" }))
    .send({ email: "new@example.com" });
  assert.equal(res.status, 400);
});

test("POST /instructors/invite refuses to re-invite someone who already accepted", async (t) => {
  t.after(
    stub(User, "findOne", async () =>
      makeUser({ role: "admin", passwordSetupRequired: false }),
    ),
  );

  const res = await request(app)
    .post("/api/superadmin/instructors/invite")
    .set("Authorization", authHeader({ role: "super-admin" }))
    .send({ name: "Jane", email: "jane@example.com" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /already accepted/i);
});

test("POST /instructors/invite creates a new admin and emails an invite link", async (t) => {
  t.after(stub(User, "findOne", async () => null));
  t.after(stub(User, "findByPk", async () => makeUser({ name: "Super Admin" })));
  let createArgs;
  t.after(
    stub(User, "create", async (attrs) => {
      createArgs = attrs;
      return makeUser({ ...attrs, id: "new-admin" });
    }),
  );
  const { restore, calls } = stubFetch(fetchOk());
  t.after(restore);

  const res = await request(app)
    .post("/api/superadmin/instructors/invite")
    .set("Authorization", authHeader({ role: "super-admin" }))
    .send({ name: "New Instructor", email: "instructor@example.com" });

  assert.equal(res.status, 201);
  assert.equal(createArgs.role, "admin");
  assert.equal(createArgs.passwordSetupRequired, true);
  assert.equal(calls.length, 1);
  assert.equal(res.body.instructor.inviteStatus, "pending");
});

test("POST /instructors/invite resends the invite for a still-pending admin", async (t) => {
  const existing = makeUser({ role: "admin", passwordSetupRequired: true });
  t.after(stub(User, "findOne", async () => existing));
  t.after(stub(User, "findByPk", async () => makeUser({ name: "Super Admin" })));
  const { restore } = stubFetch(fetchOk());
  t.after(restore);

  const res = await request(app)
    .post("/api/superadmin/instructors/invite")
    .set("Authorization", authHeader({ role: "super-admin" }))
    .send({ name: "New Instructor", email: "instructor@example.com" });

  assert.equal(res.status, 200);
  assert.match(res.body.message, /resent/i);
});

// ── Instructor listing / detail ─────────────────────────────────────────────

test("GET /instructors lists admins with course + enrollment stats", async (t) => {
  t.after(
    stub(User, "findAll", async () => [
      makeUser({ id: "instructor-1", name: "Jane", passwordSetupRequired: false }),
    ]),
  );
  t.after(stub(Course, "findAll", async () => [{ id: "course-1" }]));
  t.after(stub(Enrollment, "count", async () => 5));

  const res = await request(app)
    .get("/api/superadmin/instructors")
    .set("Authorization", authHeader({ role: "super-admin" }));

  assert.equal(res.status, 200);
  assert.equal(res.body[0].totalCourses, 1);
  assert.equal(res.body[0].totalEnrollments, 5);
  assert.equal(res.body[0].inviteStatus, "accepted");
});

test("GET /instructors/:id 404s for an unknown instructor", async (t) => {
  t.after(stub(User, "findOne", async () => null));

  const res = await request(app)
    .get("/api/superadmin/instructors/does-not-exist")
    .set("Authorization", authHeader({ role: "super-admin" }));

  assert.equal(res.status, 404);
});

test("GET /instructors/:id returns course + student progress detail", async (t) => {
  t.after(stub(User, "findOne", async () => ({ id: "instructor-1", name: "Jane", email: "jane@example.com", createdAt: new Date() })));
  t.after(
    stub(Course, "findAll", async () => [
      { id: "course-1", title: "Course 1", toJSON: () => ({ id: "course-1", title: "Course 1" }) },
    ]),
  );
  t.after(stub(Lesson, "count", async () => 3));
  t.after(
    stub(Enrollment, "findAll", async () => [
      { id: "enr-1", createdAt: new Date(), isCompleted: false, completedAt: null, User: { id: "student-1", name: "Student", email: "s@example.com" } },
    ]),
  );
  t.after(stub(LessonProgress, "count", async () => 1));

  const res = await request(app)
    .get("/api/superadmin/instructors/instructor-1")
    .set("Authorization", authHeader({ role: "super-admin" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.totalCourses, 1);
  assert.equal(res.body.courses[0].students[0].completedLessons, 1);
  assert.equal(res.body.courses[0].students[0].progressPct, 33);
});

// ── User moderation ──────────────────────────────────────────────────────────

test("PUT /users/:id/toggle-block 404s for an unknown user", async (t) => {
  t.after(stub(User, "findOne", async () => null));

  const res = await request(app)
    .put("/api/superadmin/users/does-not-exist/toggle-block")
    .set("Authorization", authHeader({ role: "super-admin" }));

  assert.equal(res.status, 404);
});

test("PUT /users/:id/toggle-block flips the blocked flag", async (t) => {
  const user = makeUser({ id: "student-1", isBlocked: false });
  t.after(stub(User, "findOne", async () => user));
  t.after(stub(Enrollment, "findAll", async () => []));

  const res = await request(app)
    .put("/api/superadmin/users/student-1/toggle-block")
    .set("Authorization", authHeader({ role: "super-admin" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.isBlocked, true);
});

test("DELETE /users/:id 404s for an unknown user", async (t) => {
  t.after(stub(User, "findOne", async () => null));

  const res = await request(app)
    .delete("/api/superadmin/users/does-not-exist")
    .set("Authorization", authHeader({ role: "super-admin" }));

  assert.equal(res.status, 404);
});

test("DELETE /users/:id removes the user", async (t) => {
  let destroyed = false;
  t.after(
    stub(User, "findOne", async () => ({
      id: "student-1",
      destroy: async () => {
        destroyed = true;
      },
    })),
  );

  const res = await request(app)
    .delete("/api/superadmin/users/student-1")
    .set("Authorization", authHeader({ role: "super-admin" }));

  assert.equal(res.status, 200);
  assert.equal(destroyed, true);
});

test("PUT /users/:id/toggle-block forbids non-super-admins", async () => {
  const res = await request(app)
    .put("/api/superadmin/users/student-1/toggle-block")
    .set("Authorization", authHeader({ role: "admin" }));
  assert.equal(res.status, 403);
});
