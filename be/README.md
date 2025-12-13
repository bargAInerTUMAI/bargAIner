# BargAIner Backend

Express.js backend API for BargAIner application.

## Getting Started

### Installation

```bash
npm install
```

### Development

Run the development server with hot reload:

```bash
npm run dev
```

### Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

### Production

Run the compiled application:

```bash
npm start
```

## API Endpoints

### Healthcheck

**GET** `/health`

Returns the health status of the service.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-13T...",
  "uptime": 123.456,
  "service": "bargainer-backend"
}
```

### Root

**GET** `/`

Returns API information and available endpoints.

