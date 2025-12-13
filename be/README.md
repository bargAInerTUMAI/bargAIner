# BargAIner Backend

Express.js backend API for BargAIner application with AI-powered negotiation assistance using Vercel AI SDK.

## Getting Started

### Installation

```bash
pnpm install
```

### Environment Variables

Create a `.env` file in the `be` directory with the following variables:

```bash
# Anthropic API Key for Claude AI
# Get your API key from: https://console.anthropic.com/
ANTHROPIC_API_KEY=your_api_key_here

# Server Configuration
PORT=3000
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

### Agent Run

**POST** `/agent/run`

Triggers the AI agent loop to analyze a negotiation transcript and provide actionable advice.

**Request Body:**
```json
{
  "counter": 1,
  "transcript": "The seller is offering the product at $100 per unit..."
}
```

**Response:**
```json
{
  "message": "Agent loop started"
}
```

The agent uses:
- **Claude Sonnet 4** via Anthropic API
- **Knowledge base** tools to read internal contract data
- **Web search** tool (placeholder) for external market research
- **Automatic loop control** with max 15 steps for quick responses

The result is stored in `jobStore` and can be retrieved using the counter.

### Agent Result

**GET** `/agent/result/:counter`

Retrieves the result from a previously run agent loop.

**Response (Success):**
```json
{
  "counter": 1,
  "result": "• Competitor X offers similar units at $85 - mention this for leverage\n• Aluminum prices dropped 12% this quarter - their costs are lower\n• Ask for volume discount since you're buying 1000+ units"
}
```

**Response (Not Found):**
```json
{
  "error": "Result not found for this counter",
  "counter": 1
}
```

