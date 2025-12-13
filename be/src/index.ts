import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;
import { runAgentLoop } from './agent_loop';

import { jobStore } from './agent_loop';

// Middleware
app.use(cors());
app.use(express.json());

// Healthcheck endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'bargainer-backend'
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'BargAIner API',
    version: '1.0.0',
    endpoints: {
      health: '/health'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📊 Healthcheck available at http://localhost:${PORT}/health`);
});


app.post('/agent/run', async (req: Request, res: Response) => {
  const { counter, transcript } = req.body;
  runAgentLoop(counter, transcript);
  res.status(200).json({ message: 'Agent loop started' });
});