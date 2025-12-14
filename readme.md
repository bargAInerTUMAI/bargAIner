# 🤝 BargAIner

**AI-Powered Real-Time Procurement Negotiation Assistant**

BargAIner is a desktop application that provides real-time AI assistance during procurement negotiations, specifically designed for Software Migration & Cloud Modernization deals. It listens to vendor conversations, detects claims that may negatively impact the buyer, and provides instant counter-arguments backed by data.

![Electron](https://img.shields.io/badge/Electron-39.x-47848F?logo=electron)
![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js)

---

## ✨ Features

### 🎙️ Real-Time Speech-to-Text
- **ElevenLabs Scribe Integration**: Converts live audio to text in real-time
- **Voice Activity Detection (VAD)**: Automatically segments speech for natural conversation flow
- **Microphone + System Audio Capture**: Captures both sides of the conversation

### 🤖 AI-Powered Analysis
- **Claim Detection**: Identifies vendor claims about pricing, timelines, and scope
- **Fact Verification**: Cross-references claims against:
  - Internal knowledge base (budgets, prior contracts, requirements)
  - Real-time web search (market rates, industry benchmarks)
- **Counter-Argument Generation**: Provides data-backed responses in real-time

### 📋 Action Items & Wrap-Up Detection
- **Automatic Detection**: Recognizes wrap-up phrases ("to summarize", "in conclusion", etc.)
- **Action Item Extraction**: Summarizes agreed terms, open items, and next steps
- **PDF Export**: Export action items as a formatted PDF document

### 📊 Negotiation Feedback
- **Post-Negotiation Analysis**: AI-powered review of the entire conversation
- **Performance Scoring**: Rates negotiation performance with actionable recommendations
- **Tactics Assessment**: Identifies effective tactics and missed opportunities

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Electron)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Audio       │  │ ElevenLabs   │  │ React UI                │ │
│  │ Capture     │──│ WebSocket    │──│ - Real-time transcripts │ │
│  │ (Mic+System)│  │ (STT)        │  │ - AI suggestions        │ │
│  └─────────────┘  └──────────────┘  │ - Action items          │ │
│                                      │ - Feedback panel        │ │
│                                      └─────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (Express)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Agent Loop  │  │ Knowledge    │  │ External APIs           │ │
│  │ (Cerebras)  │──│ Base         │──│ - Tavily (Web Search)   │ │
│  │             │  │ (Local Files)│  │ - ElevenLabs (Tokens)   │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20.x or higher
- **pnpm** (for backend)
- **npm** (for frontend)
- **API Keys**:
  - ElevenLabs API Key
  - Cerebras API Key
  - Tavily API Key (for web search)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/bargAInerTUMAI/bargAIner.git
   cd bargAIner
   ```

2. **Install Backend Dependencies**
   ```bash
   cd be
   pnpm install
   ```

3. **Install Frontend Dependencies**
   ```bash
   cd ../fe
   npm install
   ```

4. **Configure Environment Variables**
   
   Create `be/.env`:
   ```env
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   CEREBRAS_API_KEY=your_cerebras_api_key
   TAVILY_API_KEY=your_tavily_api_key
   PORT=3000
   ```

### Running the Application

1. **Start the Backend**
   ```bash
   cd be
   pnpm dev
   ```

2. **Start the Frontend** (in a new terminal)
   ```bash
   cd fe
   npm run dev
   ```

The Electron app will launch automatically.

---

## 📁 Project Structure

```
bargAIner/
├── be/                          # Backend (Express + AI)
│   ├── src/
│   │   ├── index.ts            # API routes
│   │   ├── agent_loop.ts       # AI agent logic
│   │   └── knowledge_base/     # Internal documents
│   │       ├── budget_plan.txt
│   │       ├── must_have_services_for_migration.txt
│   │       └── price_info_prior_contracts.txt
│   └── package.json
│
├── fe/                          # Frontend (Electron + React)
│   ├── src/
│   │   ├── main/               # Electron main process
│   │   ├── preload/            # Electron preload scripts
│   │   └── renderer/           # React application
│   │       └── src/
│   │           ├── App.tsx     # Main component
│   │           ├── services/
│   │           │   ├── audioCapture.ts
│   │           │   └── elevenLabsWebSocket.ts
│   │           └── assets/
│   │               └── main.css
│   └── package.json
│
└── README.md
```

---

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/scribe-token` | GET | Generate ElevenLabs single-use token |
| `/agent/run` | POST | Process transcript and get AI suggestion |
| `/agent/poll` | GET | Poll for AI response |
| `/agent/summarize` | POST | Generate action items from transcripts |
| `/agent/feedback` | POST | Generate negotiation feedback |

---

## 🧠 AI Capabilities

### Trigger Detection
The AI agent detects specific vendor claims:

| Trigger | Keywords | Action |
|---------|----------|--------|
| Scope Exclusions | "not included", "out of scope" | Check internal requirements |
| Timeline Estimates | "months", "go-live date" | Search industry benchmarks |
| Staffing Rates | "per hour", "daily rate" | Search market rate data |
| Budget/Pricing | "total cost", "final price" | Check budget documents |

### Data Synthesis
- **Vendor Time > Market Average** → Flag as "bloated timeline"
- **Vendor Rate > Market Rate** → Flag as "price gouging"
- **Vendor Cost > Budget Cap** → Flag as "budget overrun"
- **Vendor Scope < Requirements** → Flag as "compliance gap"

---

## 🛠️ Development

### Backend Development
```bash
cd be
pnpm dev          # Start with hot reload
pnpm build        # Build for production
pnpm type-check   # TypeScript validation
```

### Frontend Development
```bash
cd fe
npm run dev       # Start Electron with hot reload
npm run build     # Build for production
npm run lint      # Run ESLint
npm run typecheck # TypeScript validation
```

### Building for Distribution
```bash
cd fe
npm run build:mac    # macOS
npm run build:win    # Windows
npm run build:linux  # Linux
```

---

## 🔐 Security Notes

- API keys are stored in `.env` files (not committed to git)
- ElevenLabs uses single-use tokens (expire after 15 minutes)
- Backend validates all incoming requests
- Electron app uses Content Security Policy (CSP)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the ISC License.

---

## 🙏 Acknowledgments

- [ElevenLabs](https://elevenlabs.io/) - Real-time speech-to-text
- [Cerebras](https://cerebras.ai/) - Fast AI inference
- [Tavily](https://tavily.com/) - AI-powered web search
- [Electron](https://www.electronjs.org/) - Desktop application framework
- [Vercel AI SDK](https://sdk.vercel.ai/) - AI agent framework

---

<p align="center">
  Built with ❤️ for smarter procurement negotiations
</p>
