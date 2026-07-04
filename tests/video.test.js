import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import videoRoutes from "../routes/video.js";
import Video from "../models/Video.js";
import Course from "../models/Course.js";
import { buildApp } from "./helpers/testApp.js";
import { stub } from "./helpers/stub.js";
import { authHeader } from "./helpers/token.js";

// video.js is mounted with mergeParams at .../courses/:courseId/videos in server.js.
const app = buildApp({ path: "/api/courses/:courseId/videos", router: videoRoutes });
const COURSE_ID = "course-1";

test("GET .../videos lists videos for the course", async (t) => {
  t.after(stub(Video, "findAll", async () => [{ id: "vid-1", title: "Intro" }]));

  const res = await request(app).get(`/api/courses/${COURSE_ID}/videos`);

  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
});

test("GET .../videos/:id 404s for a missing video", async (t) => {
  t.after(stub(Video, "findOne", async () => null));
  const res = await request(app).get(`/api/courses/${COURSE_ID}/videos/does-not-exist`);
  assert.equal(res.status, 404);
});

test("POST .../videos requires authentication", async () => {
  const res = await request(app)
    .post(`/api/courses/${COURSE_ID}/videos`)
    .send({ title: "New video", youtubeUrl: "https://youtube.com/watch?v=abc" });
  assert.equal(res.status, 401);
});

test("POST .../videos 404s when the course doesn't exist", async (t) => {
  t.after(stub(Course, "findByPk", async () => null));

  const res = await request(app)
    .post(`/api/courses/${COURSE_ID}/videos`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "New video", youtubeUrl: "https://youtube.com/watch?v=abc" });

  assert.equal(res.status, 404);
});

test("POST .../videos rejects a request with neither a file nor a YouTube URL", async (t) => {
  t.after(stub(Course, "findByPk", async () => ({ id: COURSE_ID })));

  const res = await request(app)
    .post(`/api/courses/${COURSE_ID}/videos`)
    .set("Authorization", authHeader({ role: "admin" }))
    .field("title", "New video");

  assert.equal(res.status, 400);
});

test("POST .../videos creates a video from a YouTube URL without touching Cloudinary", async (t) => {
  t.after(stub(Course, "findByPk", async () => ({ id: COURSE_ID })));
  let createArgs;
  t.after(
    stub(Video, "create", async (attrs) => {
      createArgs = attrs;
      return { id: "vid-9", ...attrs };
    }),
  );

  const res = await request(app)
    .post(`/api/courses/${COURSE_ID}/videos`)
    .set("Authorization", authHeader({ role: "admin" }))
    .field("title", "New video")
    .field("youtubeUrl", "https://youtube.com/watch?v=abc");

  assert.equal(res.status, 201);
  assert.equal(createArgs.courseId, COURSE_ID);
  assert.equal(createArgs.url, "https://youtube.com/watch?v=abc");
  assert.equal(createArgs.cloudinaryId, "");
});

test("PUT .../videos/:id 404s for a missing video", async (t) => {
  t.after(stub(Video, "findOne", async () => null));

  const res = await request(app)
    .put(`/api/courses/${COURSE_ID}/videos/does-not-exist`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "Renamed" });

  assert.equal(res.status, 404);
});

test("PUT .../videos/:id updates video metadata", async (t) => {
  let updateArgs;
  const video = {
    id: "vid-1",
    title: "Old title",
    update: async (fields) => {
      updateArgs = fields;
      Object.assign(video, fields);
    },
  };
  t.after(stub(Video, "findOne", async () => video));

  const res = await request(app)
    .put(`/api/courses/${COURSE_ID}/videos/vid-1`)
    .set("Authorization", authHeader({ role: "admin" }))
    .send({ title: "New title", duration: "5:00" });

  assert.equal(res.status, 200);
  assert.equal(updateArgs.title, "New title");
});

test("DELETE .../videos/:id 404s for a missing video", async (t) => {
  t.after(stub(Video, "findOne", async () => null));

  const res = await request(app)
    .delete(`/api/courses/${COURSE_ID}/videos/does-not-exist`)
    .set("Authorization", authHeader({ role: "admin" }));

  assert.equal(res.status, 404);
});

test("DELETE .../videos/:id destroys a video with no stored file (skips Cloudinary)", async (t) => {
  let destroyed = false;
  t.after(
    stub(Video, "findOne", async () => ({
      id: "vid-1",
      cloudinaryId: "",
      destroy: async () => {
        destroyed = true;
      },
    })),
  );

  const res = await request(app)
    .delete(`/api/courses/${COURSE_ID}/videos/vid-1`)
    .set("Authorization", authHeader({ role: "admin" }));

  assert.equal(res.status, 200);
  assert.equal(destroyed, true);
});
