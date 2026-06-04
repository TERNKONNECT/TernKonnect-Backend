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

// Ensure associations are initialized before syncing
setupCourseAssociations(User);

async function syncDB() {
  try {
    console.log("Connecting to the database for schema sync...");
    await sequelize.authenticate();
    console.log("Database connection established.");

    // Sync all model definitions dynamically
    await sequelize.sync({ alter: true });
    console.log("Database schema synced successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Database sync failed:", error);
    process.exit(1);
  }
}

syncDB();
