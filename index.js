import express from "express";
import axios from "axios";
import PQueue from "p-queue";
import logger from "./config/logger.js";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import logsRouter from "./routes/logs.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PROXY_PORT, SERVER_IP, TARGET_BASE_URL, REQUEST_TIMEOUT, MAX_RETRIES, MAX_CONCURRENCY } = require("./config/proxy-config.cjs");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const IP = SERVER_IP;
const PORT = PROXY_PORT;

// Очередь с ограничением: 1 запрос за раз
const queue = new PQueue({ concurrency: MAX_CONCURRENCY });

// Делаем очередь доступной для импорта
export const requestQueue = queue;

// Функция с повторами и таймаутом
async function sendWithRetries(url, retries = MAX_RETRIES) {
  const urlObj = new URL(url);
  const dealId = urlObj.searchParams.get("DealID") || "неизвестен";

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(`Запрос с ID:${dealId} отправлен  | Попытка: ${attempt}`);

      const source = axios.CancelToken.source();

      const timeout = setTimeout(() => {
        source.cancel(`Timeout after ${REQUEST_TIMEOUT} seconds`);
      }, REQUEST_TIMEOUT);

      const response = await axios.post(
        url,
        {},
        {
          cancelToken: source.token,
        }
      );

      logger.info(`Запрос с ID:${dealId} вернулся   | Попытка: ${attempt} | Код:${response.status} ${JSON.stringify(response.data)}`);

      clearTimeout(timeout);

      if (response.status === 200) {
        logger.info(`Запрос с ID:${dealId} успешный   | Попытка: ${attempt} | Очередь: ${queue.size}`);
        logger.info("----------------------------------------------------------------------------------------");

        return;
      } else {
        logger.warn(`⚠️ Попытка запроса с ID:${dealId} #${attempt}. Очередь: ${queue.size}. Статус: ${response.status}`);
      }
    } catch (err) {
      logger.error(`⚠️  Ошибка запроса с ID:${dealId} | Попытка: ${attempt} | Статус: ${err.message}`);
    }
  }

  logger.error(`❌ Лимит запросов для ID:${dealId} превышен | Очередь: ${queue.size} | Запрос не будет отправлен`);
}

// Мидлвары
app.use(bodyParser.json());
app.use(express.static("public"));

// Импортируем маршруты
app.use("/api/logs", logsRouter);

// Маршрут для отображения страницы с логами
app.get("/logs", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "logs.html"));
});

// Пример маршрута для получения информации об очереди
app.get("/api/queue", (req, res) => {
  res.json({
    success: true,
    size: queue.size,
    pending: queue.pending,
    queue: Array.from(queue).map((job) => ({
      id: job.id || "unknown",
      status: job.status || "pending",
    })),
  });
});

// Обработка входящего запроса
app.post("/proxy", (req, res) => {
  const fullQuery = req.originalUrl.split("?")[1] || "";
  const targetUrl = `${TARGET_BASE_URL}?${fullQuery}`;

  const urlObj = new URL(targetUrl);
  const dealId = urlObj.searchParams.get("DealID") || "неизвестен";

  logger.info(`➕ Добавлен запрос с ID:${dealId} в очередь #${queue.size + 1}`);
  queue.add(() => sendWithRetries(targetUrl));

  res.status(202).json({
    success: true,
    message: "Запрос добавлен в очередь",
    dealId: dealId,
    queuePosition: queue.size,
    activeRequests: queue.pending,
  });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  logger.error("Ошибка сервера:", { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: "Внутренняя ошибка сервера",
  });
});

// Запуск сервера!
app.listen(PORT, IP, () => {
  logger.info(`Сервер запущен на ${IP}:${PORT}`);
  logger.info(`Для просмотра логов перейдите по адресу: http://${IP}:${PORT}/logs`);
});

export default app;
