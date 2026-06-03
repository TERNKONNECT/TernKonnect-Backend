import express from "express";
import TrialSignup from "../models/TrialSignup.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { name, email, website, plan } = req.body;
    if (!name || !email || !website || !plan)
      return res.status(400).json({ error: "All fields are required" });

    const signup = await TrialSignup.create({ name, email, website, plan });
    res.status(201).json({ success: true, id: signup.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
