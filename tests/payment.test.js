import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import request from "supertest";

import paymentRoutes from "../routes/payment.js";
import Course from "../models/Course.js";
import User from "../models/User.js";
import Enrollment from "../models/Enrollment.js";
import Payment from "../models/Payment.js";
import { buildApp } from "./helpers/testApp.js";
import { stub, stubFetch } from "./helpers/stub.js";
import { authHeader } from "./helpers/token.js";

// The webhook route needs the exact raw request bytes to verify its HMAC
// signature, same as server.js's express.json({ verify }) setup.
const app = buildApp({ path: "/api/payments", router: paymentRoutes }, { captureRawBody: true });

function routeFetch(url, { init, verify, resend } = {}) {
  return async (rawUrl) => {
    const target = String(rawUrl);
    if (target.includes("/transaction/initialize")) {
      return { ok: true, json: async () => init ?? { status: true, data: {} } };
    }
    if (target.includes("/transaction/verify/")) {
      return { ok: true, json: async () => verify ?? { status: true, data: {} } };
    }
    if (target.includes("resend.com")) {
      return { ok: true, json: async () => resend ?? { id: "email_mock" } };
    }
    throw new Error(`Unexpected fetch call in test: ${target}`);
  };
}

function courseFixture(overrides = {}) {
  return {
    id: "course-1",
    title: "Paid Course",
    status: "published",
    pricingType: "paid",
    price: 1000,
    currency: "NGN",
    createdBy: "instructor-1",
    ...overrides,
  };
}

function paymentFixture(overrides = {}) {
  const payment = {
    id: "pay-1",
    userId: "student-1",
    courseId: "course-1",
    reference: "dws-course123-student1-1700000000000",
    amount: 1050,
    currency: "NGN",
    status: "pending",
    channel: "",
    gatewayResponse: "",
    paystackTransactionId: "",
    metadata: {},
    Course: courseFixture(),
    ...overrides,
  };
  payment.update =
    overrides.update ||
    (async function update(fields) {
      Object.assign(this, fields);
      return this;
    });
  return payment;
}

// ── Initialize: guard rails before money moves ──────────────────────────────

test("POST /initialize requires authentication", async () => {
  const res = await request(app).post("/api/payments/initialize").send({ courseId: "course-1" });
  assert.equal(res.status, 401);
});

test("POST /initialize rejects a missing courseId", async () => {
  const res = await request(app)
    .post("/api/payments/initialize")
    .set("Authorization", authHeader({ role: "user" }))
    .send({});
  assert.equal(res.status, 400);
});

test("POST /initialize 404s for an unknown course", async (t) => {
  t.after(stub(Course, "findByPk", async () => null));
  t.after(stub(User, "findByPk", async () => ({ id: "student-1" })));

  const res = await request(app)
    .post("/api/payments/initialize")
    .set("Authorization", authHeader({ id: "student-1", role: "user" }))
    .send({ courseId: "course-1" });

  assert.equal(res.status, 404);
});

test("POST /initialize refuses to charge for a free course", async (t) => {
  t.after(stub(Course, "findByPk", async () => courseFixture({ pricingType: "free", price: 0 })));
  t.after(stub(User, "findByPk", async () => ({ id: "student-1" })));

  const res = await request(app)
    .post("/api/payments/initialize")
    .set("Authorization", authHeader({ id: "student-1", role: "user" }))
    .send({ courseId: "course-1" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /free/i);
});

test("POST /initialize refuses a student who already has access", async (t) => {
  t.after(stub(Course, "findByPk", async () => courseFixture()));
  t.after(stub(User, "findByPk", async () => ({ id: "student-1", email: "s@example.com" })));
  t.after(stub(Enrollment, "findOne", async () => ({ id: "enr-1" })));

  const res = await request(app)
    .post("/api/payments/initialize")
    .set("Authorization", authHeader({ id: "student-1", role: "user" }))
    .send({ courseId: "course-1" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /already have access/i);
});

test("POST /initialize refuses to double-charge a course already paid for", async (t) => {
  t.after(stub(Course, "findByPk", async () => courseFixture()));
  t.after(stub(User, "findByPk", async () => ({ id: "student-1", email: "s@example.com" })));
  t.after(stub(Enrollment, "findOne", async () => null));
  t.after(stub(Payment, "findOne", async () => paymentFixture({ status: "success" })));

  const res = await request(app)
    .post("/api/payments/initialize")
    .set("Authorization", authHeader({ id: "student-1", role: "user" }))
    .send({ courseId: "course-1" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /already completed/i);
});

test("POST /initialize computes the service fee and creates a pending payment", async (t) => {
  t.after(stub(Course, "findByPk", async () => courseFixture({ price: 1000 })));
  t.after(stub(User, "findByPk", async () => ({ id: "student-1", email: "s@example.com" })));
  t.after(stub(Enrollment, "findOne", async () => null));
  t.after(stub(Payment, "findOne", async () => null));

  const { restore } = stubFetch(
    routeFetch(null, {
      init: {
        status: true,
        data: { authorization_url: "https://paystack.com/pay/abc", access_code: "code123" },
      },
    }),
  );
  t.after(restore);

  let createArgs;
  t.after(
    stub(Payment, "create", async (attrs) => {
      createArgs = attrs;
      return paymentFixture(attrs);
    }),
  );

  const res = await request(app)
    .post("/api/payments/initialize")
    .set("Authorization", authHeader({ id: "student-1", role: "user" }))
    .send({ courseId: "course-1" });

  assert.equal(res.status, 201);
  // course price 1000 + 5% service fee (SERVICE_FEE_PERCENTAGE in .env.test) = 1050
  assert.equal(createArgs.amount, 1050);
  assert.equal(createArgs.status, "pending");
  assert.equal(res.body.authorizationUrl, "https://paystack.com/pay/abc");
});

// ── Verify: only grant access on a confirmed, matching payment ─────────────

test("GET /verify/:reference requires authentication", async () => {
  const res = await request(app).get("/api/payments/verify/some-ref");
  assert.equal(res.status, 401);
});

test("GET /verify/:reference 404s when the payment doesn't belong to the caller", async (t) => {
  t.after(stub(Payment, "findOne", async () => null));

  const res = await request(app)
    .get("/api/payments/verify/unknown-ref")
    .set("Authorization", authHeader({ id: "student-1", role: "user" }));

  assert.equal(res.status, 404);
});

test("GET /verify/:reference grants access once Paystack confirms success", async (t) => {
  const payment = paymentFixture({ status: "pending" });
  t.after(stub(Payment, "findOne", async () => payment));
  t.after(stub(User, "findByPk", async () => ({ id: "student-1", email: "s@example.com", name: "Jane" })));
  t.after(stub(Course, "findByPk", async () => courseFixture()));

  let enrollArgs;
  t.after(
    stub(Enrollment, "findOrCreate", async (opts) => {
      enrollArgs = opts;
      return [{ id: "enr-1" }, true];
    }),
  );

  const { restore } = stubFetch(
    routeFetch(null, {
      verify: {
        status: true,
        data: {
          status: "success",
          reference: payment.reference,
          amount: 105000, // kobo, matches 1050 * 100
          currency: "NGN",
          metadata: {},
        },
      },
    }),
  );
  t.after(restore);

  const res = await request(app)
    .get(`/api/payments/verify/${payment.reference}`)
    .set("Authorization", authHeader({ id: "student-1", role: "user" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "success");
  assert.equal(payment.status, "success");
  assert.equal(enrollArgs.where.userId, "student-1");
  assert.equal(enrollArgs.where.courseId, "course-1");
});

test("GET /verify/:reference reports still-pending without granting access", async (t) => {
  const payment = paymentFixture({ status: "pending" });
  t.after(stub(Payment, "findOne", async () => payment));

  const { restore } = stubFetch(
    routeFetch(null, {
      verify: { status: true, data: { status: "pending", gateway_response: "Pending" } },
    }),
  );
  t.after(restore);

  const res = await request(app)
    .get(`/api/payments/verify/${payment.reference}`)
    .set("Authorization", authHeader({ id: "student-1", role: "user" }));

  assert.equal(res.status, 202);
  assert.equal(payment.status, "pending");
});

test("GET /verify/:reference refuses to grant access when the confirmed amount is lower than expected", async (t) => {
  // Guards against a tampered/short payment being reported as "success" —
  // this must never silently grant course access.
  const payment = paymentFixture({ status: "pending", amount: 1050 });
  t.after(stub(Payment, "findOne", async () => payment));

  let enrollCalled = false;
  t.after(
    stub(Enrollment, "findOrCreate", async () => {
      enrollCalled = true;
      return [{ id: "enr-1" }, true];
    }),
  );

  const { restore } = stubFetch(
    routeFetch(null, {
      verify: {
        status: true,
        data: {
          status: "success",
          reference: payment.reference,
          amount: 50000, // way below the 105000 kobo expected
          currency: "NGN",
        },
      },
    }),
  );
  t.after(restore);

  const res = await request(app)
    .get(`/api/payments/verify/${payment.reference}`)
    .set("Authorization", authHeader({ id: "student-1", role: "user" }));

  assert.equal(res.status, 500);
  assert.match(res.body.error, /amount too low/i);
  assert.equal(enrollCalled, false, "must not grant access on a mismatched amount");
  assert.equal(payment.status, "pending", "payment record must not be flipped to success");
});

// ── Webhook: HMAC-authenticated, idempotent access grant ───────────────────

function signBody(body) {
  const raw = Buffer.from(JSON.stringify(body));
  const signature = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(raw)
    .digest("hex");
  return { raw, signature };
}

test("POST /webhook rejects a request with no/invalid signature", async () => {
  const res = await request(app)
    .post("/api/payments/webhook")
    .set("x-paystack-signature", "not-the-right-signature")
    .send({ event: "charge.success", data: { reference: "some-ref" } });

  assert.equal(res.status, 401);
});

test("POST /webhook grants access on a correctly-signed charge.success event", async (t) => {
  const payment = paymentFixture({ status: "pending" });
  t.after(stub(Payment, "findOne", async () => payment));
  t.after(stub(User, "findByPk", async () => ({ id: "student-1", email: "s@example.com", name: "Jane" })));
  t.after(stub(Course, "findByPk", async () => courseFixture()));
  let enrollCalled = false;
  t.after(
    stub(Enrollment, "findOrCreate", async () => {
      enrollCalled = true;
      return [{ id: "enr-1" }, true];
    }),
  );

  const { restore } = stubFetch(
    routeFetch(null, {
      verify: {
        status: true,
        data: {
          status: "success",
          reference: payment.reference,
          amount: 105000,
          currency: "NGN",
          metadata: {},
        },
      },
    }),
  );
  t.after(restore);

  const body = { event: "charge.success", data: { reference: payment.reference, id: 999 } };
  const { signature } = signBody(body);

  const res = await request(app)
    .post("/api/payments/webhook")
    .set("x-paystack-signature", signature)
    .send(body);

  assert.equal(res.status, 200);
  assert.equal(payment.status, "success");
  assert.equal(enrollCalled, true);
});

test("POST /webhook ignores events other than charge.success", async (t) => {
  let paystackCalled = false;
  const { restore } = stubFetch(async () => {
    paystackCalled = true;
    return { ok: true, json: async () => ({ status: true, data: {} }) };
  });
  t.after(restore);

  const body = { event: "charge.failed", data: { reference: "irrelevant" } };
  const { signature } = signBody(body);

  const res = await request(app)
    .post("/api/payments/webhook")
    .set("x-paystack-signature", signature)
    .send(body);

  assert.equal(res.status, 200);
  assert.equal(paystackCalled, false, "should not call Paystack for events it doesn't act on");
});

test("POST /webhook is a safe no-op when the reference doesn't match any local payment", async (t) => {
  t.after(stub(Payment, "findOne", async () => null));
  let enrollCalled = false;
  t.after(
    stub(Enrollment, "findOrCreate", async () => {
      enrollCalled = true;
      return [{ id: "enr-1" }, true];
    }),
  );

  const { restore } = stubFetch(
    routeFetch(null, {
      verify: { status: true, data: { status: "success", reference: "orphan-ref", amount: 100 } },
    }),
  );
  t.after(restore);

  const body = { event: "charge.success", data: { reference: "orphan-ref", id: 1 } };
  const { signature } = signBody(body);

  const res = await request(app)
    .post("/api/payments/webhook")
    .set("x-paystack-signature", signature)
    .send(body);

  assert.equal(res.status, 200);
  assert.equal(enrollCalled, false);
});

// ── Admin: re-verifying stuck payments is scoped correctly ─────────────────

test("GET /admin/courses/:courseId/pending forbids an instructor viewing another instructor's course", async (t) => {
  t.after(stub(Course, "findByPk", async () => courseFixture({ createdBy: "someone-else" })));

  const res = await request(app)
    .get("/api/payments/admin/courses/course-1/pending")
    .set("Authorization", authHeader({ id: "instructor-1", role: "admin" }));

  assert.equal(res.status, 403);
});

test("POST /admin/verify-bulk re-verifies pending payments and summarizes outcomes", async (t) => {
  const stuckSuccess = paymentFixture({ id: "pay-a", reference: "ref-a", status: "pending" });
  const stuckPending = paymentFixture({ id: "pay-b", reference: "ref-b", status: "pending" });

  t.after(stub(Payment, "count", async () => 2));
  t.after(stub(Payment, "findAll", async () => [stuckSuccess, stuckPending]));
  t.after(stub(User, "findByPk", async () => ({ id: "student-1", email: "s@example.com", name: "Jane" })));
  t.after(stub(Course, "findByPk", async () => courseFixture()));
  t.after(stub(Enrollment, "findOrCreate", async () => [{ id: "enr-1" }, true]));

  const { restore } = stubFetch(async (rawUrl) => {
    const target = String(rawUrl);
    if (target.includes(`/transaction/verify/${stuckSuccess.reference}`)) {
      return {
        ok: true,
        json: async () => ({
          status: true,
          data: { status: "success", reference: stuckSuccess.reference, amount: 105000, currency: "NGN" },
        }),
      };
    }
    if (target.includes(`/transaction/verify/${stuckPending.reference}`)) {
      return { ok: true, json: async () => ({ status: true, data: { status: "pending" } }) };
    }
    if (target.includes("resend.com")) return { ok: true, json: async () => ({ id: "email_mock" }) };
    throw new Error(`Unexpected fetch: ${target}`);
  });
  t.after(restore);

  const res = await request(app)
    .post("/api/payments/admin/verify-bulk")
    .set("Authorization", authHeader({ id: "super-1", role: "super-admin" }))
    .send({});

  assert.equal(res.status, 200);
  assert.equal(res.body.processed, 2);
  assert.equal(res.body.summary.success, 1);
  assert.equal(res.body.summary.pending, 1);
  assert.equal(stuckSuccess.status, "success");
  assert.equal(stuckPending.status, "pending");
});
