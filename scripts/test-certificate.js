import "dotenv/config";
import sequelize from "../config/db.js";
import User from "../models/User.js";
import Course, { setupCourseAssociations } from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import Certificate from "../models/Certificate.js";
import crypto from "crypto";
import "../models/Payment.js";
import "../models/Review.js";

setupCourseAssociations(User);

async function run() {
  try {
    await sequelize.authenticate();
    console.log("Connected to DB...");

    // 1. Create or find User
    const [user] = await User.findOrCreate({
      where: { email: "sunday.ajayi@example.com" },
      defaults: {
        name: "SUNDAY AJAYI",
        email: "sunday.ajayi@example.com",
        password: "password123",
      },
    });

    // 2. Create or find Course
    const [course] = await Course.findOrCreate({
      where: { title: "DATA SCIENCE" },
      defaults: {
        title: "DATA SCIENCE",
        description: "Complete Data Science Bootcamp",
        pricingType: "free",
        createdBy: user.id, // For simplicity
      },
    });

    // 3. Create or find Enrollment
    const [enrollment] = await Enrollment.findOrCreate({
      where: { userId: user.id, courseId: course.id },
      defaults: {
        userId: user.id,
        courseId: course.id,
        isCompleted: true,
        completedAt: new Date(),
      },
    });

    // 4. Generate Certificate
    let cert = await Certificate.findOne({ where: { enrollmentId: enrollment.id } });
    if (!cert) {
      const certId = "TK-" + crypto.randomBytes(4).toString("hex").toUpperCase();
      cert = await Certificate.create({
        certificateId: certId,
        userId: user.id,
        courseId: course.id,
        enrollmentId: enrollment.id,
      });
    }

    console.log("\n✅ Certificate Generated Successfully!");
    console.log("-------------------------------------------------");
    console.log(`Student: ${user.name}`);
    console.log(`Course: ${course.title}`);
    console.log(`Certificate ID: ${cert.certificateId}`);
    console.log(`Issued On: ${cert.issuedAt.toDateString()}`);
    console.log("-------------------------------------------------");
    console.log(`Verification API Endpoint: http://localhost:9000/api/certificates/verify/${cert.certificateId}`);
    
    process.exit(0);
  } catch (error) {
    console.error("Error generating certificate:", error);
    process.exit(1);
  }
}

run();
