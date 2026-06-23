import sequelize from "../config/db.js";
import User from "../models/User.js";
import Course, { setupCourseAssociations } from "../models/Course.js";
import Module from "../models/Module.js";
import Lesson from "../models/Lesson.js";
import Quiz from "../models/Quiz.js";
import Review from "../models/Review.js";
import Enrollment from "../models/Enrollment.js";
import LessonProgress from "../models/LessonProgress.js";
import TrialSignup from "../models/TrialSignup.js";
import Video from "../models/Video.js";
import "../models/Payment.js";
import "../models/Review.js";

// Ensure associations are initialized before syncing
setupCourseAssociations(User);

async function runSync() {
  try {
    console.log("Starting database sync...");
    await sequelize.authenticate();
    console.log("Database connection established.");
    await sequelize.sync({ alter: true });
    console.log("Database schema synced successfully via CI/CD!");



    process.exit(0);
  } catch (error) {
    console.error("Failed to sync database schema or create admin:", error);
    process.exit(1);
  }
}

runSync();
