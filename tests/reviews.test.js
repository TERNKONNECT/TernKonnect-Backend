import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import reviewRoutes from "../routes/reviews.js";
import Review from "../models/Review.js";
import Enrollment from "../models/Enrollment.js";
import Course from "../models/Course.js";
import { buildApp } from "./helpers/testApp.js";
import { stub } from "./helpers/stub.js";
import { authHeader } from "./helpers/token.js";

const app = buildApp({ path: "/api/reviews", router: reviewRoutes });

test("POST /api/reviews/:courseId rejects an out-of-range rating", async () => {
  const res = await request(app)
    .post("/api/reviews/course-1")
    .set("Authorization", authHeader({ role: "user" }))
    .send({ rating: 6 });
  assert.equal(res.status, 400);
});

test("POST /api/reviews/:courseId requires the course to be completed first", async (t) => {
  t.after(stub(Enrollment, "findOne", async () => null));

  const res = await request(app)
    .post("/api/reviews/course-1")
    .set("Authorization", authHeader({ id: "student-1", role: "user" }))
    .send({ rating: 5, comment: "Great course" });

  assert.equal(res.status, 403);
  assert.match(res.body.error, /complete the course/i);
});

test("POST /api/reviews/:courseId creates a new review for a first-time reviewer", async (t) => {
  t.after(stub(Enrollment, "findOne", async () => ({ id: "enr-1", isCompleted: true })));
  t.after(
    stub(Review, "findOrCreate", async ({ defaults }) => [
      { id: "review-1", ...defaults, update: async () => {} },
      true,
    ]),
  );

  const res = await request(app)
    .post("/api/reviews/course-1")
    .set("Authorization", authHeader({ id: "student-1", role: "user" }))
    .send({ rating: 5, comment: "Loved it" });

  assert.equal(res.status, 201);
  assert.equal(res.body.rating, 5);
});

test("POST /api/reviews/:courseId updates an existing review instead of duplicating it", async (t) => {
  t.after(stub(Enrollment, "findOne", async () => ({ id: "enr-1", isCompleted: true })));
  let updateArgs;
  const existing = {
    id: "review-1",
    rating: 3,
    comment: "It was okay",
    update: async (fields) => {
      updateArgs = fields;
      Object.assign(existing, fields);
    },
  };
  t.after(stub(Review, "findOrCreate", async () => [existing, false]));

  const res = await request(app)
    .post("/api/reviews/course-1")
    .set("Authorization", authHeader({ id: "student-1", role: "user" }))
    .send({ rating: 5, comment: "Changed my mind, it's great" });

  assert.equal(res.status, 200);
  assert.equal(updateArgs.rating, 5);
  assert.equal(res.body.rating, 5);
});

test("GET /api/reviews/:courseId computes the average rating (public, no auth)", async (t) => {
  t.after(
    stub(Review, "findAll", async () => [
      { rating: 5 },
      { rating: 4 },
      { rating: 3 },
    ]),
  );

  const res = await request(app).get("/api/reviews/course-1");

  assert.equal(res.status, 200);
  assert.equal(res.body.totalReviews, 3);
  assert.equal(res.body.avgRating, 4); // (5+4+3)/3 = 4
});

test("GET /api/reviews/:courseId returns 0 average when there are no reviews yet", async (t) => {
  t.after(stub(Review, "findAll", async () => []));

  const res = await request(app).get("/api/reviews/course-1");

  assert.equal(res.status, 200);
  assert.equal(res.body.avgRating, 0);
  assert.equal(res.body.totalReviews, 0);
});

test("GET /api/reviews/:courseId/admin 404s for a missing course", async (t) => {
  t.after(stub(Course, "findByPk", async () => null));

  const res = await request(app)
    .get("/api/reviews/course-1/admin")
    .set("Authorization", authHeader({ role: "admin" }));

  assert.equal(res.status, 404);
});

test("GET /api/reviews/:courseId/admin forbids an instructor viewing another instructor's course", async (t) => {
  t.after(stub(Course, "findByPk", async () => ({ id: "course-1", createdBy: "someone-else" })));

  const res = await request(app)
    .get("/api/reviews/course-1/admin")
    .set("Authorization", authHeader({ id: "instructor-1", role: "admin" }));

  assert.equal(res.status, 403);
});

test("GET /api/reviews/:courseId/admin returns reviews for the owning instructor", async (t) => {
  t.after(stub(Course, "findByPk", async () => ({ id: "course-1", createdBy: "instructor-1" })));
  t.after(stub(Review, "findAll", async () => [{ rating: 5 }]));

  const res = await request(app)
    .get("/api/reviews/course-1/admin")
    .set("Authorization", authHeader({ id: "instructor-1", role: "admin" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.totalReviews, 1);
});
