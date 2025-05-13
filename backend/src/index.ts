import express, { Express } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { analysisPool } from "./config/db";
import { initTable } from "./services/dbService";
import routes from "./routes";

dotenv.config();

const app: Express = express();
app.use(cors());
app.use(express.json());

async function testDbConnection() {
  let client;
  try {
    client = await analysisPool.connect();
    console.log("Database connection successful");
    const res = await client.query("SELECT NOW()");
    console.log("Test query result:", res.rows[0]);
  } catch (err: any) {
    console.error(`Database connection failed: ${err.message}\nStack: ${err.stack}`);
    process.exit(1);
  } finally {
    if (client) client.release();
  }
}

const port = process.env.PORT || 3000;
testDbConnection()
  .then(() => {
    initTable()
      .then(() => {
        app.use("/", routes);
        app.listen(port, () => {
          console.log(`Backend running on http://localhost:${port}`);
        });
      })
      .catch((err) => {
        console.error("Failed to initialize table:", err.message);
        process.exit(1);
      });
  })
  .catch((err) => {
    console.error("Failed to connect to database:", err.message);
    process.exit(1);
  });