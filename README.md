![Node.js](https://img.shields.io/badge/Node.js-v18+-green) ![Express](https://img.shields.io/badge/Express-v4.x-blue) ![Swagger](https://img.shields.io/badge/Swagger-OpenAPI-85EA2D) ![License](https://img.shields.io/badge/License-MIT-yellow)

Прокси-сервер для обработки и маршрутизации запросов с интеграцией в Bitrix24. Обеспечивает управление очередью запросов, логирование и защиту от перегрузки API.

## 📚 Оглавление

- [Быстрый старт](#-быстрый-старт)
- [Установка](#-установка)
- [Конфигурация](#-конфигурация)
- [API Документация](#-api-документация)
- [Примеры использования](#-примеры-использования)
- [Развертывание](#-развертывание)
- [Лицензия](#-лицензия)

---

## 📌 Основные возможности

- **Очередь запросов** с ограничением скорости (на базе `p-queue`)
- **Автоматические повторы** при ошибках (настраиваемое количество попыток)
- **Подробное логирование** (через `winston` с выводом в файл `app.log`)
- **Веб-интерфейс** для просмотра логов (`/logs`)
- **Полная документация API** через Swagger UI (`/api-docs`)
- **Гибкая конфигурация** через переменные окружения
- **Мониторинг** состояния очереди и статистики запросов

---

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
# Клонируйте репозиторий
git clone https://github.com/yourusername/b24-queue-proxy.git
cd b24-queue-proxy

# Установите зависимости
npm install

# Запустите сервер в режиме разработки
npm run dev

# Или для продакшена
npm start
```

## ⚙️ Конфигурация

Создайте файл `.env` в корне проекта со следующими параметрами:

```env
# Основные настройки
NODE_ENV=development
PROXY_PORT=3000
SERVER_IP=127.0.0.1

# URL целевых API
TARGET_BASE_URL="https://script.google.com/..."
TARGET_BASE_URL_INVOICE="https://script.google.com/..."

# Настройки очереди
MAX_CONCURRENCY=1
MAX_RETRIES=3
REQUEST_TIMEOUT=70000

# Настройки логирования
LOG_LEVEL=info
LOG_FILE=app.log

# Настройки безопасности
RATE_LIMIT_WINDOW_MS=900000  # 15 минут
RATE_LIMIT_MAX_REQUESTS=100  # Максимальное количество запросов за окно
```

## 📚 API Документация

### Основные эндпоинты

#### 1. Отправка запроса в очередь

```http
POST /proxy?DealID=123&param1=value1
```

**Параметры запроса:**
- `DealID` (обязательный) - ID сделки в Bitrix24
- Дополнительные параметры будут переданы в целевой API

**Пример ответа:**
```json
{
  "success": true,
  "message": "Запрос добавлен в очередь",
  "dealId": "123",
  "queuePosition": 1,
  "timestamp": "2025-06-18T00:00:00.000Z"
}
```

#### 2. Получение статистики очереди

```http
GET /api/queue
```

**Пример ответа:**
```json
{
  "success": true,
  "stats": {
    "pending": 5,
    "active": 1,
    "completed": 42,
    "failed": 2,
    "concurrency": 1
  }
}
```

#### 3. Просмотр логов

```http
GET /api/logs
```

**Параметры запроса:**
- `limit` - количество записей (по умолчанию 100)
- `level` - уровень логирования (error, warn, info, debug)
- `search` - поиск по сообщению

### 3. Запуск сервера

- Для production:
  ```bash
  npm start
  ```
- Для разработки (с автоматической перезагрузкой):
  ```bash
  npm run dev
  ```

---

## 🔧 API

### Добавление запроса в очередь

```bash
POST /proxy?DealID=123 и др. параметры
```

**Ответ:**

```json
{
  "success": true,
  "message": "Запрос добавлен в очередь",
  "dealId": "123",
  "queuePosition": 1,
  "activeRequests": 0
}
```

### Проверка состояния очереди

```bash
GET /api/queue
```

**Ответ:**

```json
{
  "success": true,
  "size": 5,
  "pending": 1,
  "queue": [{ "id": "123", "status": "pending" }]
}
```

### Просмотр логов

Откройте в браузере:  
`http://localhost:3000/logs`

---

## 🚀 Развертывание

### Требования

- Node.js 18+
- npm 9+
- Доступ к Bitrix24 API

### Процесс развертывания

1. **Подготовка сервера**

   ```bash
   # Установите Node.js и npm
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Установите PM2 для управления процессами
   sudo npm install -g pm2
   ```

2. **Развертывание приложения**

   ```bash
   # Склонируйте репозиторий
   git clone https://github.com/yourusername/b24-queue-proxy.git
   cd b24-queue-proxy
   
   # Установите зависимости
   npm install --production
   
   # Настройте переменные окружения
   cp .env.example .env
   nano .env
   
   # Запустите приложение через PM2
   pm2 start npm --name "b24-queue-proxy" -- start
   
   # Настройте автозапуск при загрузке сервера
   pm2 startup
   pm2 save
   ```

3. **Настройка Nginx (опционально)**

   ```nginx
   server {
       listen 80;
       server_name proxy.yourdomain.com;
    
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

4. **Настройка HTTPS (рекомендуется)**

   Установите сертификат Let's Encrypt с помощью Certbot:
   
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d proxy.yourdomain.com
   ```

### Мониторинг и логи

- Логи приложения: `pm2 logs b24-queue-proxy`
- Файл логов: `/var/log/b24-queue-proxy/app.log`
- Мониторинг: `pm2 monit`

## 🔄 Интеграция с Bitrix24

1. **Настройка вебхуков в Bitrix24**
   - Перейдите в настройки приложения Bitrix24
   - Создайте новый вебхук с правами на нужные методы API
   - Укажите URL вашего прокси-сервера: `https://ваш-домен/proxy`

2. **Пример кода для отправки запроса**

   ```javascript
   // Отправка запроса в очередь
   const response = await fetch('https://ваш-домен/proxy', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': 'Bearer ваш_токен'
     },
     body: JSON.stringify({
       DealID: 12345,
       // другие параметры
     })
   });
   
   const result = await response.json();
   console.log(result);
   ```

3. **Обработка ответов**
   - Все ответы содержат статус операции и дополнительную информацию
   - Ошибки логируются и могут быть просмотрены через веб-интерфейс

## 🛠 Технические детали

### Архитектура

```
┌─────────────┐    ┌────────────────┐    ┌─────────────────┐
│  Bitrix24   │───▶│  Прокси-сервер  │───▶│  Целевое API    │
└─────────────┘    └────────────────┘    └─────────────────┘
                        │
                        ▼
                ┌───────────────┐
                │  Очередь     │
                │  (p-queue)   │
                └───────────────┘
                        │
                        ▼
                ┌───────────────┐
                │  Логирование  │
                │  (winston)    │
                └───────────────┘
```

### Очередь запросов

- Используется библиотека `p-queue`
- Настраиваемая конкуренция (по умолчанию: 1 запрос за раз)
- Автоматические повторы при ошибках
- Таймауты для предотвращения зависаний

### Безопасность

- Валидация входящих запросов
- Ограничение размера тела запроса
- Rate limiting для предотвращения злоупотреблений
- Поддержка HTTPS (рекомендуется)

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. См. файл [LICENSE](LICENSE) для дополнительной информации.

<div align="center">
  <p>Создано с ❤️ для эффективной работы с Bitrix24</p>
  <p>Если у вас есть вопросы или предложения, создайте issue или отправьте pull request</p>
</div>

## 🙏 Благодарности

- Разработчикам [Express](https://expressjs.com/)
- Команде [p-queue](https://github.com/sindresorhus/p-queue)
- Всем контрибьюторам проекта
   ```
2. Сервер их ставит в очередь и по одному отправляет на расчет:
   ```bash
   POST TARGET_BASE_URL?DealID=123
   ```

---

## 📜 Лицензия

MIT

---

**Автор:** Asharapov Kirill  
**Версия:** 1.0.0  
**Дата:** 2025-06-05
