// Импорт необходимых зависимостей
import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";
import moment from "moment-timezone";

// Получение имени текущего файла и пути к директории
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Создание экземпляра логера Winston
const logger = winston.createLogger({
  // Установка уровня логирования по умолчанию
  level: "info",
  // Настройка формата логов
  format: winston.format.combine(
    // Добавление временной метки в формате DD.MM.YYYY HH:mm:ss
    winston.format.timestamp({
      format: () => moment().tz("Europe/Moscow").format("DD.MM.YYYY HH:mm:ss"),
    }),
    // Включение трассировки стека ошибок
    winston.format.errors({ stack: true }),
    // Интерполяция строк
    winston.format.splat(),
    // Вывод в формате JSON
    winston.format.json()
  ),
  // Добавление имени сервиса ко всем логам
  defaultMeta: { service: "proxy-server" },
  // Настройка транспортов логов (выводов)
  transports: [
    // Настройка транспорта для файлов
    new winston.transports.File({
      filename: path.join(__dirname, "../app.log"),
      level: "info",
      maxsize: 5242880, // 5МБ
      maxFiles: 5, // Максимум 5 файлов логов
    }),
    // Настройка транспорта для консоли
    new winston.transports.Console({
      format: winston.format.combine(
        // Добавление цветов в вывод консоли
        winston.format.colorize(),
        // Простой формат вывода для консоли
        winston.format.simple()
      ),
    }),
  ],
});

// Экспорт экземпляра логгера
export default logger;
