import pg from "pg";
import { Sequelize } from "sequelize";

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  dialectModule: pg,
  logging: false,
  pool: { max: 2, min: 0, acquire: 30000, idle: 10000 },
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    isConnected = true;
    console.log("PostgreSQL connected");
  } catch (err) {
    console.error("PostgreSQL connection failed:", err.message);
    throw err;
  }
}

export default sequelize;
