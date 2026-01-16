# Ramazan WhatsApp Service

WhatsApp microservice for By Ramazan appointment system.

## 🚀 Render Deployment

1. Create new Web Service on Render
2. Connect this GitHub repo
3. Set environment variables:
   - `MAIN_APP_URL` = Your main app URL
   - `API_SECRET_KEY` = A strong random key
4. Deploy!

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/status` | WhatsApp connection status |
| POST | `/pair` | Get pairing code |
| POST | `/send` | Send message |
| POST | `/logout` | Disconnect WhatsApp |

## 🔒 Authentication

All endpoints (except `/` and `/health`) require `x-api-key` header.

```javascript
fetch('https://your-wp-service.onrender.com/status', {
  headers: { 'x-api-key': 'your-secret-key' }
})
```

## 💾 Memory Optimization

Optimized for Render free tier (512MB RAM) with:
- Single process mode
- Disabled unnecessary Chrome features
- 256MB JS heap limit
