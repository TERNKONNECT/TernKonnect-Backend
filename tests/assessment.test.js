import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import quizRoutes from "../routes/quizzes.js";
import allQuizzesRoutes from "../routes/allQuizzes.js";
import enrollmentRoutes from "../routes/enrollment.js";
import Quiz from "../models/Quiz.js";
import Module from "../models/Module.js";
import Enrollment from "../models/Enrollment.js";
import { buildApp } from "./helpers/testApp.js";
import { stub } from "./helpers/stub.js";
import { authHeader } from "./helpers/token.js";

// quizzes.js is mounted with mergeParams at .../modules/:moduleId/quiz in server.js.
const moduleQuizApp = buildApp({
  path: "/api/courses/:courseId/modules/:moduleId/quiz",
  router: quizRoutes,
});
const allQuizzesApp = buildApp({ path: "/api/quizzes", router: allQuizzesRoutes });
const enrollmentApp = buildApp({ path: "/api/enrollments", router: enrollmentRoutes });

const COURSE_ID = "course-1";
const MODULE_ID = "module-1";

// ── Authoring a module quiz ─────────────────────────────────────────────────

test("POST .../quiz requires authentication", async () => {
  const res = await request(moduleQuizApp)
    .post(`/api/courses/${COURSE_ID}/modules/${MODULE_ID}/quiz`)
    .send({ title: "Quiz 1", questions: [{ correctIndex: 0 }] });
  assert.equal(res.status, 401);
});

test("POST .../quiz 404s when the module doesn't exist", async (t) => {
  t.after(stub(Module, "findByPk", async () => null));

  const res = await request(moduleQuizApp)
    .post(`/api/courses/${COURSE_ID}/modules/${MODULE_ID}/quiz`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "Quiz 1", questions: [{ correctIndex: 0 }] });

  assert.equal(res.status, 404);
});

test("POST .../quiz rejects a quiz with no questions", async (t) => {
  t.after(stub(Module, "findByPk", async () => ({ id: MODULE_ID })));
  t.after(stub(Quiz, "findOne", async () => null));

  const res = await request(moduleQuizApp)
    .post(`/api/courses/${COURSE_ID}/modules/${MODULE_ID}/quiz`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "Quiz 1", questions: [] });

  assert.equal(res.status, 400);
});

test("POST .../quiz refuses to create a second quiz for the same module", async (t) => {
  t.after(stub(Module, "findByPk", async () => ({ id: MODULE_ID })));
  t.after(stub(Quiz, "findOne", async () => ({ id: "existing-quiz" })));

  const res = await request(moduleQuizApp)
    .post(`/api/courses/${COURSE_ID}/modules/${MODULE_ID}/quiz`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "Quiz 1", questions: [{ correctIndex: 0 }] });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /already has a quiz/i);
});

test("POST .../quiz creates the quiz for a fresh module", async (t) => {
  t.after(stub(Module, "findByPk", async () => ({ id: MODULE_ID })));
  t.after(stub(Quiz, "findOne", async () => null));
  let createArgs;
  t.after(
    stub(Quiz, "create", async (attrs) => {
      createArgs = attrs;
      return { id: "quiz-1", ...attrs };
    }),
  );

  const res = await request(moduleQuizApp)
    .post(`/api/courses/${COURSE_ID}/modules/${MODULE_ID}/quiz`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "Quiz 1", questions: [{ question: "2+2?", correctIndex: 1 }] });

  assert.equal(res.status, 201);
  assert.equal(createArgs.moduleId, MODULE_ID);
  assert.equal(res.body.id, "quiz-1");
});

test("GET .../quiz 404s when the module has no quiz yet", async (t) => {
  t.after(stub(Quiz, "findOne", async () => null));
  const res = await request(moduleQuizApp).get(
    `/api/courses/${COURSE_ID}/modules/${MODULE_ID}/quiz`,
  );
  assert.equal(res.status, 404);
});

// ── Taking the assessment: scoring a submission ─────────────────────────────

const QUIZ = {
  id: "quiz-1",
  questions: [
    { question: "1+1", correctIndex: 1 },
    { question: "2+2", correctIndex: 3 },
    { question: "3+3", correctIndex: 0 },
  ],
};

test("POST /api/quizzes/:id/submit 404s for an unknown quiz", async (t) => {
  t.after(stub(Quiz, "findByPk", async () => null));

  const res = await request(allQuizzesApp)
    .post("/api/quizzes/does-not-exist/submit")
    .set("Authorization", authHeader({ role: "user" }))
    .send({ answers: [] });

  assert.equal(res.status, 404);
});

test("POST /api/quizzes/:id/submit scores a perfect submission", async (t) => {
  t.after(stub(Quiz, "findByPk", async () => QUIZ));

  const res = await request(allQuizzesApp)
    .post("/api/quizzes/quiz-1/submit")
    .set("Authorization", authHeader({ role: "user" }))
    .send({ answers: [1, 3, 0] });

  assert.equal(res.status, 200);
  assert.equal(res.body.score, 3);
  assert.equal(res.body.percentage, 100);
  assert.equal(res.body.total, 3);
});

test("POST /api/quizzes/:id/submit scores a partial submission with rounded percentage", async (t) => {
  t.after(stub(Quiz, "findByPk", async () => QUIZ));

  const res = await request(allQuizzesApp)
    .post("/api/quizzes/quiz-1/submit")
    .set("Authorization", authHeader({ role: "user" }))
    .send({ answers: [1, 0, 0] }); // 2 of 3 correct

  assert.equal(res.status, 200);
  assert.equal(res.body.score, 2);
  assert.equal(res.body.percentage, 67); // Math.round(2/3 * 100)
});

test("DELETE /api/quizzes/:id forbids non-admins", async () => {
  const res = await request(allQuizzesApp)
    .delete("/api/quizzes/quiz-1")
    .set("Authorization", authHeader({ role: "user" }));
  assert.equal(res.status, 403);
});

// ── Recording a graded attempt against the student's enrollment ────────────

test("POST .../quiz-attempt 404s when the student isn't enrolled", async (t) => {
  t.after(stub(Enrollment, "findOne", async () => null));

  const res = await request(enrollmentApp)
    .post(`/api/enrollments/${COURSE_ID}/quiz-attempt`)
    .set("Authorization", authHeader({ id: "student-1", role: "user" }))
    .send({ quizId: "quiz-1", score: 2, totalQuestions: 3 });

  assert.equal(res.status, 404);
});

test("POST .../quiz-attempt lets an admin preview without persisting", async (t) => {
  t.after(stub(Enrollment, "findOne", async () => null));

  const res = await request(enrollmentApp)
    .post(`/api/enrollments/${COURSE_ID}/quiz-attempt`)
    .set("Authorization", authHeader({ id: "admin-1", role: "admin" }))
    .send({ quizId: "quiz-1", score: 2, totalQuestions: 3 });

  assert.equal(res.status, 200);
  assert.equal(res.body.preview, true);
});

test("POST .../quiz-attempt requires a quizId", async (t) => {
  t.after(stub(Enrollment, "findOne", async () => ({ quizAttempts: [], update: async () => {} })));

  const res = await request(enrollmentApp)
    .post(`/api/enrollments/${COURSE_ID}/quiz-attempt`)
    .set("Authorization", authHeader({ id: "student-1", role: "user" }))
    .send({ score: 2, totalQuestions: 3 });

  assert.equal(res.status, 400);
});

test("POST .../quiz-attempt appends the graded attempt to the enrollment", async (t) => {
  let updateArgs;
  const enrollment = {
    quizAttempts: [{ quizId: "old-quiz", score: 1, totalQuestions: 2 }],
    update: async (fields) => {
      updateArgs = fields;
    },
  };
  t.after(stub(Enrollment, "findOne", async () => enrollment));

  const res = await request(enrollmentApp)
    .post(`/api/enrollments/${COURSE_ID}/quiz-attempt`)
    .set("Authorization", authHeader({ id: "student-1", role: "user" }))
    .send({ quizId: "quiz-1", answers: [1, 3, 0], score: 3, totalQuestions: 3 });

  assert.equal(res.status, 200);
  assert.equal(updateArgs.quizAttempts.length, 2);
  assert.equal(updateArgs.quizAttempts[1].quizId, "quiz-1");
  assert.equal(updateArgs.quizAttempts[1].score, 3);
  assert.equal(res.body.attempt.score, 3);
});
