import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { runAgentLoop, jobStore } from './agent_loop';

const app = express();
const PORT = process.env.PORT || 3000;
import { runAgentLoop, poll } from './agent_loop';

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

// ElevenLabs token generation endpoint
app.get('/scribe-token', async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({
        error: 'ELEVENLABS_API_KEY is not configured. Please set it in your .env file.'
      });
    }

    const response = await fetch(
      'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).json({
        error: 'Failed to generate token',
        details: errorData
      });
    }

    const data = await response.json() as { token: string };
    res.json({ token: data.token });
  } catch (error) {
    console.error('Error generating ElevenLabs token:', error);
    res.status(500).json({
      error: 'Internal server error while generating token'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📊 Healthcheck available at http://localhost:${PORT}/health`);
});


app.post('/agent/run', async (req: Request, res: Response) => {
  const { counter, transcript } = req.body;
  
  if (!counter || !transcript) {
    return res.status(400).json({ error: 'Missing required fields: counter and transcript' });
  }
  
  runAgentLoop(counter, transcript);
  res.status(200).json({ message: 'Agent loop started', counter });
});

app.get('/agent/result/:counter', (req: Request, res: Response) => {
  const counter = parseInt(req.params.counter, 10);
  
  if (isNaN(counter)) {
    return res.status(400).json({ error: 'Invalid counter parameter' });
  }
  
  const result = jobStore.get(counter);
  
  if (result === undefined) {
    return res.status(404).json({ error: 'Result not found for this counter', counter });
  }
  
  res.status(200).json({ counter, result });
});

app.get('/agent/poll', (req: Request, res: Response) => {
  const result = poll();
  res.status(200).json({ result });
});
