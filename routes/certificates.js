import express from "express";
import Certificate from "../models/Certificate.js";
import User from "../models/User.js";
import Course from "../models/Course.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// GET /api/certificates/verify/:certificateId — public endpoint to verify a certificate
router.get("/verify/:certificateId", async (req, res) => {
  try {
    const cert = await Certificate.findOne({
      where: { certificateId: req.params.certificateId },
      include: [
        { model: User, attributes: ["name", "email"] },
        { model: Course, attributes: ["title"] },
      ],
    });

    if (!cert) {
      return res.status(404).json({ error: "Certificate not found or invalid" });
    }

    res.json({
      valid: true,
      certificateId: cert.certificateId,
      issuedAt: cert.issuedAt,
      user: {
        name: cert.User?.name,
      },
      course: {
        title: cert.Course?.title,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/certificates/:id — get details of a specific certificate (protected)
router.get("/:id", protect, async (req, res) => {
  try {
    const cert = await Certificate.findByPk(req.params.id, {
      include: [
        { model: User, attributes: ["name", "email"] },
        { model: Course, attributes: ["title"] },
      ],
    });

    if (!cert) return res.status(404).json({ error: "Certificate not found" });

    // Only allow the owner or an admin/super-admin to view it
    if (
      cert.userId !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "super-admin"
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    res.json(cert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
