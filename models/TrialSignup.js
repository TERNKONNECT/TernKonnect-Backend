import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const TrialSignup = sequelize.define(
  "TrialSignup",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    website: { type: DataTypes.STRING, allowNull: false },
    plan: {
      type: DataTypes.ENUM("trial", "standard", "premium"),
      allowNull: false,
      defaultValue: "trial",
    },
  },
  { tableName: "trial_signups", timestamps: true },
);

export default TrialSignup;
