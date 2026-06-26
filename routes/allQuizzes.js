import express from "express";
import Quiz from "../models/Quiz.js";
import { protect, adminOnly } from "../middleware/auth.js";

const router = express.Router();

// GET all quizzes
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const quizzes = await Quiz.findAll();
    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET quiz by ID (public — used by the Quiz page to fetch quiz data directly)
router.get("/:id", async (req, res) => {
  try {
    const quiz = await Quiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE quiz by ID
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const quiz = await Quiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    await quiz.destroy();
    res.json({ message: "Quiz deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
