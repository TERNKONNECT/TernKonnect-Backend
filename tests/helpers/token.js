import jwt from "jsonwebtoken";

export function signToken({ id = "user-1", role = "user" } = {}) {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

export function authHeader(opts) {
  return `Bearer ${signToken(opts)}`;
}
