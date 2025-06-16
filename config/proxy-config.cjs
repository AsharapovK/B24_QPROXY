module.exports = {
  // IP и порт на котором запускается сервер
  SERVER_IP: "127.0.0.1",
  PROXY_PORT: 3000,

  // IP на который отправляются запросы из очереди
  TARGET_BASE_URL: "https://script.google.com/macros/s/AKfycbzu-3bcJI4L8gXdgYSqPhnp2HrtYO9S8MGZUPV18v4OEBf5pAYHRyCaSeUBWN6TJFR_/exec",
  TARGET_BASE_URL_INVOICE: "https://script.google.com/macros/s/AKfycbzT5dxFweKhN-dGEJ9CYzp42yziok0EL7xRjFFzAbyQlhmnDBzY0FArON1wUIW4bXrrMw/exec",

  // Таймаут запроса
  REQUEST_TIMEOUT: 70000,

  // Максимальное количество попыток запроса
  MAX_RETRIES: 3,

  // Максимальное количество запросов в очереди
  MAX_CONCURRENCY: 1,
};
