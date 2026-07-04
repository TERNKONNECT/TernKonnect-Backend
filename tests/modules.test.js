import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import moduleRoutes from "../routes/modules.js";
import Module from "../models/Module.js";
import Lesson from "../models/Lesson.js";
import Quiz from "../models/Quiz.js";
import Course from "../models/Course.js";
import { buildApp } from "./helpers/testApp.js";
import { stub } from "./helpers/stub.js";
import { authHeader } from "./helpers/token.js";

// modules.js is mounted with mergeParams at .../courses/:courseId/modules in server.js.
const app = buildApp({ path: "/api/courses/:courseId/modules", router: moduleRoutes });
const COURSE_ID = "course-1";

test("GET .../modules assembles each module with its lessons and quiz", async (t) => {
  t.after(
    stub(Module, "findAll", async () => [
      { id: "mod-1", order: 1, toJSON: () => ({ id: "mod-1", title: "Module 1", order: 1 }) },
    ]),
  );
  t.after(stub(Lesson, "findAll", async () => [{ id: "lesson-1", title: "Intro" }]));
  t.after(stub(Quiz, "findOne", async () => ({ id: "quiz-1", title: "Module 1 quiz" })));

  const res = await request(app).get(`/api/courses/${COURSE_ID}/modules`);

  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].lessons.length, 1);
  assert.equal(res.body[0].quiz.id, "quiz-1");
});

test("GET .../modules/:id 404s for a missing module", async (t) => {
  t.after(stub(Module, "findOne", async () => null));
  const res = await request(app).get(`/api/courses/${COURSE_ID}/modules/does-not-exist`);
  assert.equal(res.status, 404);
});

test("GET .../modules/:id returns the module with lessons/quiz attached", async (t) => {
  t.after(
    stub(Module, "findOne", async () => ({
      id: "mod-1",
      toJSON: () => ({ id: "mod-1", title: "Module 1" }),
    })),
  );
  t.after(stub(Lesson, "findAll", async () => []));
  t.after(stub(Quiz, "findOne", async () => null));

  const res = await request(app).get(`/api/courses/${COURSE_ID}/modules/mod-1`);

  assert.equal(res.status, 200);
  assert.equal(res.body.id, "mod-1");
  assert.deepEqual(res.body.lessons, []);
});

test("POST .../modules requires authentication", async () => {
  const res = await request(app)
    .post(`/api/courses/${COURSE_ID}/modules`)
    .send({ title: "New module" });
  assert.equal(res.status, 401);
});

test("POST .../modules 404s when the course doesn't exist", async (t) => {
  t.after(stub(Course, "findByPk", async () => null));

  const res = await request(app)
    .post(`/api/courses/${COURSE_ID}/modules`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "New module" });

  assert.equal(res.status, 404);
});

test("POST .../modules rejects a missing title", async (t) => {
  t.after(stub(Course, "findByPk", async () => ({ id: COURSE_ID })));

  const res = await request(app)
    .post(`/api/courses/${COURSE_ID}/modules`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({});

  assert.equal(res.status, 400);
});

test("POST .../modules creates a module scoped to the course", async (t) => {
  t.after(stub(Course, "findByPk", async () => ({ id: COURSE_ID })));
  let createArgs;
  t.after(
    stub(Module, "create", async (attrs) => {
      createArgs = attrs;
      return { id: "mod-9", ...attrs };
    }),
  );

  const res = await request(app)
    .post(`/api/courses/${COURSE_ID}/modules`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "New module", order: 2 });

  assert.equal(res.status, 201);
  assert.equal(createArgs.courseId, COURSE_ID);
  assert.equal(createArgs.title, "New module");
});

test("PUT .../modules/:id 404s for a missing module", async (t) => {
  t.after(stub(Module, "findOne", async () => null));

  const res = await request(app)
    .put(`/api/courses/${COURSE_ID}/modules/does-not-exist`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "Renamed" });

  assert.equal(res.status, 404);
});

test("PUT .../modules/:id updates an existing module", async (t) => {
  let updateArgs;
  const mod = {
    id: "mod-1",
    title: "Old title",
    update: async (fields) => {
      updateArgs = fields;
      Object.assign(mod, fields);
    },
  };
  t.after(stub(Module, "findOne", async () => mod));

  const res = await request(app)
    .put(`/api/courses/${COURSE_ID}/modules/mod-1`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "New title" });

  assert.equal(res.status, 200);
  assert.equal(updateArgs.title, "New title");
});

test("DELETE .../modules/:id 404s for a missing module", async (t) => {
  t.after(stub(Module, "findOne", async () => null));

  const res = await request(app)
    .delete(`/api/courses/${COURSE_ID}/modules/does-not-exist`)
    .set("Authorization", authHeader({ role: "admin" }));

  assert.equal(res.status, 404);
});

test("DELETE .../modules/:id destroys the module", async (t) => {
  let destroyed = false;
  t.after(
    stub(Module, "findOne", async () => ({
      id: "mod-1",
      destroy: async () => {
        destroyed = true;
      },
    })),
  );

  const res = await request(app)
    .delete(`/api/courses/${COURSE_ID}/modules/mod-1`)
    .set("Authorization", authHeader({ role: "admin" }));

  assert.equal(res.status, 200);
  assert.equal(destroyed, true);
});
