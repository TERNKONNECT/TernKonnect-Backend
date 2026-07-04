import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import enrollmentRoutes from "../routes/enrollment.js";
import Enrollment from "../models/Enrollment.js";
import User from "../models/User.js";
import Course from "../models/Course.js";
import Lesson from "../models/Lesson.js";
import LessonProgress from "../models/LessonProgress.js";
import { buildApp } from "./helpers/testApp.js";
import { stub } from "./helpers/stub.js";
import { authHeader } from "./helpers/token.js";

const app = buildApp({ path: "/api/enrollments", router: enrollmentRoutes });

// ── Admin manual enrollment ─────────────────────────────────────────────────

test("POST /admin/enroll rejects missing fields", async () => {
  const res = await request(app)
    .post("/api/enrollments/admin/enroll")
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ email: "student@example.com" });
  assert.equal(res.status, 400);
});

test("POST /admin/enroll 404s when the target user doesn't exist", async (t) => {
  t.after(stub(User, "findOne", async () => null));

  const res = await request(app)
    .post("/api/enrollments/admin/enroll")
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ email: "nobody@example.com", courseId: "course-1" });

  assert.equal(res.status, 404);
});

test("POST /admin/enroll forbids an instructor enrolling into another instructor's course", async (t) => {
  t.after(stub(User, "findOne", async () => ({ id: "student-1", name: "Student", email: "s@example.com" })));
  t.after(stub(Course, "findByPk", async () => ({ id: "course-1", createdBy: "someone-else" })));

  const res = await request(app)
    .post("/api/enrollments/admin/enroll")
    .set("Authorization", authHeader({ id: "instructor-1", role: "admin" }))
    .send({ email: "s@example.com", courseId: "course-1" });

  assert.equal(res.status, 403);
});

test("POST /admin/enroll rejects a duplicate enrollment", async (t) => {
  t.after(stub(User, "findOne", async () => ({ id: "student-1", name: "Student", email: "s@example.com" })));
  t.after(stub(Course, "findByPk", async () => ({ id: "course-1", createdBy: "instructor-1" })));
  t.after(stub(Enrollment, "findOrCreate", async () => [{ id: "enr-1" }, false]));

  const res = await request(app)
    .post("/api/enrollments/admin/enroll")
    .set("Authorization", authHeader({ id: "instructor-1", role: "admin" }))
    .send({ email: "s@example.com", courseId: "course-1" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /already enrolled/i);
});

test("POST /admin/enroll enrolls a student and records who enrolled them", async (t) => {
  t.after(stub(User, "findOne", async () => ({ id: "student-1", name: "Student", email: "s@example.com" })));
  t.after(stub(Course, "findByPk", async () => ({ id: "course-1", createdBy: "instructor-1" })));
  let createArgs;
  t.after(
    stub(Enrollment, "findOrCreate", async (opts) => {
      createArgs = opts;
      return [{ id: "enr-1", createdAt: new Date() }, true];
    }),
  );

  const res = await request(app)
    .post("/api/enrollments/admin/enroll")
    .set("Authorization", authHeader({ id: "instructor-1", role: "admin" }))
    .send({ email: "s@example.com", courseId: "course-1" });

  assert.equal(res.status, 201);
  assert.equal(createArgs.defaults.enrolledBy, "instructor-1");
  assert.equal(res.body.enrollment.user.email, "s@example.com");
});

// ── Admin listing endpoints ─────────────────────────────────────────────────

test("GET /admin/courses/:courseId 404s for a missing course", async (t) => {
  t.after(stub(Course, "findByPk", async () => null));

  const res = await request(app)
    .get("/api/enrollments/admin/courses/course-1")
    .set("Authorization", authHeader({ role: "admin" }));

  assert.equal(res.status, 404);
});

test("GET /admin/courses/:courseId forbids a non-owning instructor", async (t) => {
  t.after(stub(Course, "findByPk", async () => ({ id: "course-1", createdBy: "someone-else" })));

  const res = await request(app)
    .get("/api/enrollments/admin/courses/course-1")
    .set("Authorization", authHeader({ id: "instructor-1", role: "admin" }));

  assert.equal(res.status, 403);
});

test("GET /admin/courses/:courseId returns enrolled students with progress", async (t) => {
  t.after(stub(Course, "findByPk", async () => ({ id: "course-1", title: "Course 1", pricingType: "free", createdBy: "instructor-1" })));
  t.after(
    stub(Enrollment, "findAll", async () => [
      { id: "enr-1", createdAt: new Date(), isCompleted: true, completedAt: new Date(), User: { id: "s1", name: "S1" }, EnrolledByAdmin: null },
    ]),
  );
  t.after(stub(Lesson, "count", async () => 4));
  t.after(stub(LessonProgress, "count", async () => 2));

  const res = await request(app)
    .get("/api/enrollments/admin/courses/course-1")
    .set("Authorization", authHeader({ id: "instructor-1", role: "admin" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.totalEnrolled, 1);
  assert.equal(res.body.totalCompleted, 1);
});

test("GET /admin/users/:userId 404s for an unknown user", async (t) => {
  t.after(stub(User, "findByPk", async () => null));

  const res = await request(app)
    .get("/api/enrollments/admin/users/does-not-exist")
    .set("Authorization", authHeader({ role: "admin" }));

  assert.equal(res.status, 404);
});

test("GET /admin/users/:userId returns the user's enrollments with progress", async (t) => {
  t.after(stub(User, "findByPk", async () => ({ id: "student-1", name: "Student" })));
  t.after(
    stub(Enrollment, "findAll", async () => [
      { id: "enr-1", courseId: "course-1", createdAt: new Date(), isCompleted: false, completedAt: null, Course: { id: "course-1", title: "Course 1" } },
    ]),
  );
  t.after(stub(Lesson, "count", async () => 4));
  t.after(stub(LessonProgress, "count", async () => 1));

  const res = await request(app)
    .get("/api/enrollments/admin/users/student-1")
    .set("Authorization", authHeader({ role: "admin" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.enrollments.length, 1);
});

test("GET /admin/all requires an admin role", async () => {
  const res = await request(app)
    .get("/api/enrollments/admin/all")
    .set("Authorization", authHeader({ role: "user" }));
  assert.equal(res.status, 403);
});

test("GET /admin/all lists enrollments scoped to the instructor's own courses", async (t) => {
  t.after(
    stub(Enrollment, "findAll", async () => [
      { id: "enr-1", createdAt: new Date(), isCompleted: false, completedAt: null, courseId: "course-1", User: { id: "s1" }, Course: { id: "course-1", title: "C1" } },
    ]),
  );
  t.after(stub(Lesson, "count", async () => 2));
  t.after(stub(LessonProgress, "count", async () => 1));

  const res = await request(app)
    .get("/api/enrollments/admin/all")
    .set("Authorization", authHeader({ id: "instructor-1", role: "admin" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
});

test("GET /admin/stats returns platform totals for a super-admin", async (t) => {
  t.after(stub(Course, "findAll", async () => [{ id: "course-1" }]));
  t.after(stub(User, "count", async () => 10));
  t.after(stub(Course, "count", async () => 3));
  let enrollmentCountCalls = 0;
  t.after(
    stub(Enrollment, "count", async () => {
      enrollmentCountCalls += 1;
      return enrollmentCountCalls === 1 ? 20 : 8; // total, then completed
    }),
  );
  t.after(
    stub(Enrollment, "findAll", async () => [
      { courseId: "course-1", Course: { title: "Course 1" }, dataValues: { enrollmentCount: "20" } },
    ]),
  );

  const res = await request(app)
    .get("/api/enrollments/admin/stats")
    .set("Authorization", authHeader({ role: "super-admin" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.totalUsers, 10);
  assert.equal(res.body.totalEnrollments, 20);
  assert.equal(res.body.totalCompleted, 8);
  assert.equal(res.body.completionRate, 40);
  assert.equal(res.body.topCourses[0].title, "Course 1");
});
