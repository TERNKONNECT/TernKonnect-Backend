import express from "express";
import Quiz from "../models/Quiz.js";
import { protect, adminOnly } from "../middleware/auth.js";

import Module from "../models/Module.js";
import Course from "../models/Course.js";

const router = express.Router();

// GET all quizzes
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const quizzes = await Quiz.findAll({
      include: [
        {
          model: Module,
          attributes: ["id", "title", "courseId"],
        },
      ],
    });
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

// POST submit quiz
router.post("/:id/submit", protect, async (req, res) => {
  try {
    const quiz = await Quiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const { answers } = req.body;
    let score = 0;
    
    quiz.questions.forEach((q, i) => {
      if (answers[i] === q.correctIndex) {
        score++;
      }
    });

    const percentage = Math.round((score / quiz.questions.length) * 100);

    res.json({ score, percentage, total: quiz.questions.length });
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
