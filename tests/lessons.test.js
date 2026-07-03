import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import lessonRoutes from "../routes/lessons.js";
import enrollmentRoutes from "../routes/enrollment.js";
import Lesson from "../models/Lesson.js";
import Module from "../models/Module.js";
import Enrollment from "../models/Enrollment.js";
import LessonProgress from "../models/LessonProgress.js";
import { buildApp } from "./helpers/testApp.js";
import { stub } from "./helpers/stub.js";
import { authHeader } from "./helpers/token.js";

// lessons.js is mounted with mergeParams in server.js — replicate that nesting.
const lessonsApp = buildApp({
  path: "/api/courses/:courseId/modules/:moduleId/lessons",
  router: lessonRoutes,
});
const enrollmentApp = buildApp({ path: "/api/enrollments", router: enrollmentRoutes });

const COURSE_ID = "course-1";
const MODULE_ID = "module-1";

// ── Authoring: text and video lessons ───────────────────────────────────────

test("POST .../lessons/text requires authentication", async () => {
  const res = await request(lessonsApp)
    .post(`/api/courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/text`)
    .send({ title: "Intro" });
  assert.equal(res.status, 401);
});

test("POST .../lessons/text rejects a missing title", async (t) => {
  t.after(stub(Module, "findByPk", async () => ({ id: MODULE_ID })));

  const res = await request(lessonsApp)
    .post(`/api/courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/text`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ content: "body with no title" });

  assert.equal(res.status, 400);
});

test("POST .../lessons/text 404s when the module doesn't exist", async (t) => {
  t.after(stub(Module, "findByPk", async () => null));

  const res = await request(lessonsApp)
    .post(`/api/courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/text`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "Intro" });

  assert.equal(res.status, 404);
});

test("POST .../lessons/video-url creates a playable video lesson from a hosted URL", async (t) => {
  t.after(stub(Module, "findByPk", async () => ({ id: MODULE_ID })));
  let createArgs;
  t.after(
    stub(Lesson, "create", async (attrs) => {
      createArgs = attrs;
      return { toJSON: () => ({ ...attrs, id: "lesson-9" }) };
    }),
  );

  const res = await request(lessonsApp)
    .post(`/api/courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/video-url`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "Welcome video", videoUrl: "https://cdn.example.com/welcome.mp4", duration: "3:45" });

  assert.equal(res.status, 201);
  assert.equal(res.body.type, "video");
  assert.equal(res.body.videoUrl, "https://cdn.example.com/welcome.mp4");
  assert.equal(createArgs.type, "video");
});

test("POST .../lessons/video-url rejects a missing videoUrl", async (t) => {
  t.after(stub(Module, "findByPk", async () => ({ id: MODULE_ID })));

  const res = await request(lessonsApp)
    .post(`/api/courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/video-url`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "Welcome video" });

  assert.equal(res.status, 400);
});

// ── Watching: marking a lesson (video) complete and tracking progress ──────

test("POST .../lessons/:lessonId/complete 404s when the student isn't enrolled", async (t) => {
  t.after(stub(Enrollment, "findOne", async () => null));

  const res = await request(enrollmentApp)
    .post(`/api/enrollments/${COURSE_ID}/lessons/lesson-1/complete`)
    .set("Authorization", authHeader({ id: "student-1", role: "user" }));

  assert.equal(res.status, 404);
});

test("POST .../lessons/:lessonId/complete lets an admin preview without an enrollment row", async (t) => {
  t.after(stub(Enrollment, "findOne", async () => null));

  const res = await request(enrollmentApp)
    .post(`/api/enrollments/${COURSE_ID}/lessons/lesson-1/complete`)
    .set("Authorization", authHeader({ id: "admin-1", role: "admin" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.preview, true);
});

test("POST .../lessons/:lessonId/complete records progress after a video finishes", async (t) => {
  t.after(stub(Enrollment, "findOne", async () => ({ id: "enr-1", isCompleted: false, update: async () => {} })));
  t.after(stub(Lesson, "findByPk", async () => ({ id: "lesson-1" })));
  t.after(stub(LessonProgress, "findOrCreate", async () => [{ id: "prog-1" }, true]));
  t.after(stub(Lesson, "count", async () => 4));
  t.after(stub(LessonProgress, "count", async () => 1));

  const res = await request(enrollmentApp)
    .post(`/api/enrollments/${COURSE_ID}/lessons/lesson-1/complete`)
    .set("Authorization", authHeader({ id: "student-1", role: "user" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.alreadyCompleted, false);
  assert.equal(res.body.totalLessons, 4);
  assert.equal(res.body.completedLessons, 1);
  assert.equal(res.body.progressPct, 25);
  assert.equal(res.body.courseCompleted, false);
});

test("POST .../lessons/:lessonId/complete marks the course completed once every video is watched", async (t) => {
  let updateArgs;
  const enrollment = {
    id: "enr-1",
    isCompleted: false,
    update: async (fields) => {
      updateArgs = fields;
      Object.assign(enrollment, fields);
    },
  };
  t.after(stub(Enrollment, "findOne", async () => enrollment));
  t.after(stub(Lesson, "findByPk", async () => ({ id: "lesson-4" })));
  t.after(stub(LessonProgress, "findOrCreate", async () => [{ id: "prog-4" }, true]));
  t.after(stub(Lesson, "count", async () => 4));
  t.after(stub(LessonProgress, "count", async () => 4));

  const res = await request(enrollmentApp)
    .post(`/api/enrollments/${COURSE_ID}/lessons/lesson-4/complete`)
    .set("Authorization", authHeader({ id: "student-1", role: "user" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.progressPct, 100);
  assert.equal(res.body.courseCompleted, true);
  assert.equal(updateArgs.isCompleted, true);
});

test("POST .../lessons/:lessonId/complete does not double-count an already-completed video", async (t) => {
  t.after(stub(Enrollment, "findOne", async () => ({ id: "enr-1", isCompleted: false, update: async () => {} })));
  t.after(stub(Lesson, "findByPk", async () => ({ id: "lesson-1" })));
  t.after(stub(LessonProgress, "findOrCreate", async () => [{ id: "prog-1" }, false]));
  t.after(stub(Lesson, "count", async () => 4));
  t.after(stub(LessonProgress, "count", async () => 1));

  const res = await request(enrollmentApp)
    .post(`/api/enrollments/${COURSE_ID}/lessons/lesson-1/complete`)
    .set("Authorization", authHeader({ id: "student-1", role: "user" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.alreadyCompleted, true);
});
