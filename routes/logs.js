import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Получение логов
router.get("/", (req, res) => {
  try {
    const logPath = path.join(__dirname, "../app.log");
    const logs = fs.readFileSync(logPath, "utf8");
    const allLogs = logs
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return { message: line };
        }
      });

    // Возвращаем только последние 1000 записей в обратном порядке (новые сверху)
    const last500Logs = allLogs.slice(-1000).reverse();

    res.json({
      success: true,
      logs: last500Logs,
      total: allLogs.length,
      shown: last500Logs.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Ошибка при чтении логов",
      details: error.message,
    });
  }
});

export default router;
