import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import getStartedRoutes from "../routes/getStarted.js";
import TrialSignup from "../models/TrialSignup.js";
import { buildApp } from "./helpers/testApp.js";
import { stub, stubFetch, fetchOk } from "./helpers/stub.js";

// The `resend` SDK makes its HTTP call via global fetch under the hood, so
// stubbing fetch (rather than the SDK) keeps this fully offline — same
// approach used for config/email.js and config/paystack.js elsewhere.
const app = buildApp({ path: "/api/get-started", router: getStartedRoutes });

test("POST /api/get-started rejects missing fields", async () => {
  const res = await request(app).post("/api/get-started").send({ name: "Jane" });
  assert.equal(res.status, 400);
});

test("POST /api/get-started sends a welcome email for a trial plan", async (t) => {
  t.after(stub(TrialSignup, "create", async (attrs) => ({ id: "signup-1", ...attrs })));
  const { restore, calls } = stubFetch(fetchOk());
  t.after(restore);

  const res = await request(app).post("/api/get-started").send({
    name: "Jane",
    email: "jane@example.com",
    website: "https://example.com",
    plan: "trial",
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(calls.length, 1, "trial signups should trigger the welcome email");
});

test("POST /api/get-started does not email non-trial plans", async (t) => {
  t.after(stub(TrialSignup, "create", async (attrs) => ({ id: "signup-2", ...attrs })));
  const { restore, calls } = stubFetch(fetchOk());
  t.after(restore);

  const res = await request(app).post("/api/get-started").send({
    name: "Jane",
    email: "jane@example.com",
    website: "https://example.com",
    plan: "standard",
  });

  assert.equal(res.status, 201);
  assert.equal(calls.length, 0, "non-trial plans should not trigger an email");
});
