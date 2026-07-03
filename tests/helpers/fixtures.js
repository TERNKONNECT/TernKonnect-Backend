import crypto from "crypto";

// Mirrors the private hashValue() in routes/auth.js — duplicated here so
// tests can pre-compute a token/OTP hash to plant on a fixture user.
export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// A plain object standing in for a Sequelize User instance. Routes only ever
// call .save()/.update()/.comparePassword() on what they fetch, so a plain
// object with those methods is indistinguishable from the real model to the
// route handlers under test.
export function makeUser(overrides = {}) {
  const user = {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    role: "user",
    userType: "learner",
    emailVerified: true,
    isBlocked: false,
    deactivatedAt: null,
    passwordSetupRequired: false,
    emailVerificationToken: null,
    emailVerificationExpires: null,
    adminInviteToken: null,
    adminInviteExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    comparePassword: async () => true,
    ...overrides,
  };
  user.save = overrides.save || (async function save() { return this; });
  user.update = overrides.update || (async function update(fields) {
    Object.assign(this, fields);
    return this;
  });
  return user;
}
