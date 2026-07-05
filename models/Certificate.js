import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";
import User from "./User.js";
import Course from "./Course.js";
import Enrollment from "./Enrollment.js";

const Certificate = sequelize.define(
  "Certificate",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    certificateId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    courseId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "courses", key: "id" },
    },
    enrollmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "enrollments", key: "id" },
    },
    issuedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "certificates",
    timestamps: true,
  }
);

User.hasMany(Certificate, { foreignKey: "userId", onDelete: "CASCADE" });
Certificate.belongsTo(User, { foreignKey: "userId" });

Course.hasMany(Certificate, { foreignKey: "courseId", onDelete: "CASCADE" });
Certificate.belongsTo(Course, { foreignKey: "courseId" });

Enrollment.hasOne(Certificate, { foreignKey: "enrollmentId", onDelete: "CASCADE" });
Certificate.belongsTo(Enrollment, { foreignKey: "enrollmentId" });

export default Certificate;
