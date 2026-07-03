// Replaces obj[method] with impl and returns a restore function. Intended to
// be used with `t.after(restore)` inside a node:test `test(name, (t) => {...})`
// callback so every stub is undone even if the test throws.
//
// We stub Sequelize model statics (Model.findAll, Model.create, ...) directly
// rather than hitting a real database — these are plain writable/configurable
// properties on the model class, so reassignment is safe and needs no mocking
// library.
export function stub(obj, method, impl) {
  const original = obj[method];
  obj[method] = impl;
  return () => {
    obj[method] = original;
  };
}

// Convenience for stubbing global.fetch (used by config/email.js to call the
// Resend API). Returns the restore function and a `calls` array you can
// inspect in assertions.
export function stubFetch(responder) {
  const calls = [];
  const restore = stub(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return responder(url, options);
  });
  return { restore, calls };
}

export function fetchOk(body = { id: "email_mock_id" }) {
  return async () => ({
    ok: true,
    json: async () => body,
  });
}
