import express from "express";
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import axios from "axios";
import PQueue from "p-queue";
import logger from "./config/logger.js";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import logsRouter from "./routes/logs.js";
import { createRequire } from "module";
import fs from "fs";
import { watch } from 'fs/promises';
// Обработка необработанных исключений
process.on("uncaughtException", (error) => {
  logger.error("Необработанное исключение:", { error });
  // В продакшене можно добавить отправку уведомления
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Необработанный промис:", { reason, promise });
});
const require = createRequire(import.meta.url);
const { PROXY_PORT, SERVER_IP, TARGET_BASE_URL, TARGET_BASE_URL_INVOICE, REQUEST_TIMEOUT, MAX_RETRIES, MAX_CONCURRENCY } = require("./config/proxy-config.cjs");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const IP = SERVER_IP;
const PORT = PROXY_PORT;

// Хранилище активных подключений
const clients = new Set();

// Обработка WebSocket подключений
wss.on('connection', (ws) => {
  clients.add(ws);
  
  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Функция для отправки уведомления всем клиентам
const notifyClients = () => {
  const message = JSON.stringify({ type: 'logs_updated', timestamp: new Date().toISOString() });
  clients.forEach(client => {
    if (client.readyState === 1) { // 1 = OPEN
      client.send(message);
    } else {
      clients.delete(client);
    }
  });
};

// Наблюдаем за изменениями в лог-файле
const logPath = path.join(__dirname, 'app.log');
let fileSize = 0;

const watchLogFile = async () => {
  try {
    const watcher = watch(logPath);
    
    // Получаем начальный размер файла
    try {
      const stats = await fs.promises.stat(logPath);
      fileSize = stats.size;
    } catch (err) {
      logger.error('Ошибка при получении размера файла логов:', err);
    }
    
    for await (const event of watcher) {
      if (event.eventType === 'change') {
        const stats = await fs.promises.stat(logPath);
        if (stats.size > fileSize) {
          // Файл увеличился - отправляем уведомление
          notifyClients();
        }
        fileSize = stats.size;
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.info('Наблюдение за файлом логов остановлено');
    } else {
      logger.error('Ошибка при наблюдении за файлом логов:', err);
    }
  }
};

// Запускаем наблюдение за файлом
watchLogFile().catch(err => {
  logger.error('Не удалось запустить наблюдение за файлом логов:', err);
});

// Очередь с ограничением: 1 запрос за раз
const queue = new PQueue({ concurrency: MAX_CONCURRENCY });

// Делаем очередь доступной для импорта
export const requestQueue = queue;

// Функция с повторами и таймаутом
async function sendWithRetries(url, retries = MAX_RETRIES) {
  const urlObj = new URL(url);
  const dealIdParam = urlObj.searchParams.get("DealID") || urlObj.searchParams.get("s5");
  const dealId = dealIdParam || "неизвестен";

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
        logger.warn(`Попытка запроса с ID:${dealId} #${attempt}. Очередь: ${queue.size}. Статус: ${response.status}`, { level: "warn" });
      }
    } catch (err) {
      logger.error(`Ошибка запроса с ID:${dealId} | Попытка: ${attempt} | Статус: ${err.message}`);
    }
  }

  logger.error(`Лимит запросов для ID:${dealId} превышен | Очередь: ${queue.size} | Запрос не будет отправлен`);
}

// Мидлвары
app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static("public"));

// API маршруты
app.use("/api/logs", logsRouter);

// Статические файлы
app.use(express.static("public"));

// Маршрут для отображения страницы с логами (корневой маршрут)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "logs.html"));
});

// Маршрут для страницы с графиком
app.get("/chart", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chart.html"));
});

// Резервный маршрут для /logs (на случай прямых ссылок)
app.get("/logs", (req, res) => {
  res.redirect("/");
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
  const urlObj = new URL(`http://dummy?${fullQuery}`);
  const s5Param = urlObj.searchParams.get("s5");
  const dealId = urlObj.searchParams.get("DealID") || s5Param || "неизвестен";

  // Выбираем целевой URL на основе параметров
  const baseUrl = s5Param ? TARGET_BASE_URL_INVOICE : TARGET_BASE_URL;
  const targetUrl = `${baseUrl}?${fullQuery}`;

  if (s5Param) {
    logger.warn(`Добавлен запрос СЧЕТА с ID:${dealId} в очередь #${queue.size + 1}`);
  } else {
    logger.warn(`Добавлен запрос СДЕЛКИ с ID:${dealId} в очередь #${queue.size + 1}`);
  }

  queue.add(() => sendWithRetries(targetUrl));

  res.status(202).json({
    success: true,
    message: "Запрос добавлен в очередь",
    dealId: dealId,
    queuePosition: queue.size,
    activeRequests: queue.pending,
    target: s5Param ? "invoice" : "default",
  });
});

// Добавьте этот код в index.js после других маршрутов (например, после app.get("/api/queue", ...))
app.get("/api/request-stats", (req, res) => {
  const logPath = path.join(__dirname, "app.log");

  try {
    const logData = fs.readFileSync(logPath, "utf-8");
    const lines = logData.split("\n").filter((line) => line.trim());
    const hourlyCounts = Array(24).fill(0);

    lines.forEach((line) => {
      try {
        const logEntry = JSON.parse(line);
        const message = logEntry.message; // Текст сообщения из лога

        // Фильтруем только строки с "Добавлен запрос"
        if (message && message.includes("Добавлен запрос")) {
          const timestamp = logEntry.timestamp; // "DD.MM.YYYY HH:MM:SS"
          const timePart = timestamp.split(" ")[1]; // "HH:MM:SS"
          const hour = parseInt(timePart.split(":")[0], 10); // Число (0-23)
          hourlyCounts[hour]++;
        }
      } catch (e) {
        logger.warn(`Не удалось распарсить строку лога: ${line}`);
      }
    });

    const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, "0")}:00`);
    res.json({ success: true, hours, counts: hourlyCounts });
  } catch (error) {
    logger.error("Ошибка при обработке лога:", error);
    res.status(500).json({ success: false, error: "Не удалось обработать лог" });
  }
});

app.get("/api/request-stats-detailed", (req, res) => {
  const logPath = path.join(__dirname, "app.log");

  try {
    // Проверяем существование файла
    if (!fs.existsSync(logPath)) {
      return res.json({
        success: true,
        hours: Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, "0")}:00`),
        requests: Array(24).fill(0),
        errors: Array(24).fill(0),
      });
    }

    const logData = fs.readFileSync(logPath, "utf-8");
    const lines = logData.split("\n").filter((line) => line.trim());

    // Инициализируем массивы для каждого часа
    const hourlyStats = Array(24)
      .fill()
      .map(() => ({
        requests: 0,
        errors: 0,
      }));

    // Обработка дат фильтра
    let startDate, endDate;
    if (req.query.startDate) {
      startDate = new Date(req.query.startDate);
      startDate.setHours(0, 0, 0, 0);
    }
    if (req.query.endDate) {
      endDate = new Date(req.query.endDate);
      endDate.setHours(23, 59, 59, 999);
    }

    lines.forEach((line) => {
      try {
        const logEntry = JSON.parse(line);
        if (!logEntry.timestamp || !logEntry.message) return;

        let timestamp;
        try {
          // Пробуем разные форматы даты
          if (logEntry.timestamp.includes(".")) {
            // Формат DD.MM.YYYY HH:MM:SS
            const [date, time] = logEntry.timestamp.split(" ");
            const [day, month, year] = date.split(".");
            timestamp = new Date(`${year}-${month}-${day}T${time}`);
          } else {
            // Стандартный формат ISO
            timestamp = new Date(logEntry.timestamp);
          }
        } catch (e) {
          console.warn(`Не удалось распарсить дату: ${logEntry.timestamp}`);
          return;
        }

        if (isNaN(timestamp.getTime())) {
          console.warn(`Некорректная дата: ${logEntry.timestamp}`);
          return;
        }

        // Проверяем,      // Если запись попадает в выбранный период
        if ((!startDate || timestamp >= startDate) && (!endDate || timestamp <= endDate)) {
          const hour = timestamp.getHours();

          // Считаем запросы (если сообщение содержит "Добавлен запрос")
          if (logEntry.message.includes("Добавлен запрос")) {
            hourlyStats[hour].requests++;
          }

          // Считаем ошибки (если уровень логирования ERROR)
          if (logEntry.level === "error" || logEntry.message.includes("ERROR")) {
            hourlyStats[hour].errors++;
          }
        }
      } catch (e) {
        console.warn(`Не удалось обработать строку лога: ${line}`);
      }
    });

    const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, "0")}:00`);
    const requests = hourlyStats.map((stat) => stat.requests);
    const errors = hourlyStats.map((stat) => stat.errors);

    res.json({
      success: true,
      hours,
      requests,
      errors,
    });
  } catch (error) {
    console.error("Ошибка при обработке лога:", error);
    res.status(500).json({
      success: false,
      error: "Не удалось обработать лог",
      details: error.message,
    });
  }
});

// Обработка 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Ресурс не найден",
    path: req.path,
    method: req.method,
  });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === "production";

  logger.error("Ошибка:", {
    error: err.message,
    stack: isProduction ? undefined : err.stack,
    path: req.path,
    method: req.method,
    params: req.params,
    query: req.query,
    body: req.body,
  });

  res.status(statusCode).json({
    success: false,
    message: isProduction && statusCode === 500 ? "Внутренняя ошибка сервера" : err.message,
    ...(!isProduction && { stack: err.stack }),
  });
});

// Запуск сервера!
server.listen(PORT, IP, () => {
  logger.info(`Сервер запущен на ${IP}:${PORT}`);
  logger.info(`Для просмотра логов перейдите по адресу: http://${IP}:${PORT}/logs`);
});

export default app;
