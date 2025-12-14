import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { runAgentLoop, poll, messageHistory } from './agent_loop';
import { anthropic } from '@ai-sdk/anthropic';
import { cerebras } from '@ai-sdk/cerebras';
import { generateText } from 'ai';

const app = express();
const PORT = process.env.PORT || 3000;

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
      health: '/health',
      agentRun: '/agent/run (POST)',
      agentPoll: '/agent/poll (GET)',
      agentSummarize: '/agent/summarize (POST)',
      agentFeedback: '/agent/feedback (POST)'
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
  const { transcript } = req.body;

  // log that we received the request
  console.log('Received request to run agent loop:', req.body)
  
  if (!transcript) {
    return res.status(400).json({ error: 'Missing required fields: transcript' });
  }
  
  runAgentLoop(transcript);
  res.status(200).json({ message: 'Agent loop started' });
});

app.get('/agent/poll', (req: Request, res: Response) => {
  const result = poll();
  if (result) {
    console.log("Polled: ", result);
  }
  res.status(200).json({ result });
});

// Action items summarization endpoint - triggered when wrap-up phrases are detected
app.post('/agent/summarize', async (req: Request, res: Response) => {
  try {
    const { transcripts } = req.body;
    
    if (!transcripts || !Array.isArray(transcripts) || transcripts.length === 0) {
      return res.status(400).json({ 
        error: 'Missing or empty transcripts array' 
      });
    }

    console.log('📋 [Summarize] Generating action items from', transcripts.length, 'transcripts...');

    const summarizePrompt = `You are extracting action items from a procurement negotiation that is wrapping up.

Conversation transcripts:
${transcripts.map((t, i) => `[${i + 1}] ${t}`).join('\n')}

Extract ONLY explicitly mentioned items. Do NOT infer or assume anything that wasn't said.

Respond with a brief, actionable summary in this exact format:

**Agreed Terms:**
• [List any prices, terms, or conditions that were agreed upon, or "None explicitly agreed"]

**Open Items:**
• [List any unresolved questions or items needing follow-up, or "None mentioned"]

**Next Steps:**
• [List any mentioned follow-up actions with who/what/when if stated, or "None mentioned"]

Be concise. Only include items that were explicitly stated in the conversation.`;

    const result = await generateText({
      model: cerebras('gpt-oss-120b'),
      prompt: summarizePrompt,
    });

    console.log('✅ [Summarize] Action items generated successfully');
    
    res.status(200).json({ 
      actionItems: result.text,
      transcriptCount: transcripts.length 
    });
  } catch (error) {
    console.error('❌ [Summarize] Error generating action items:', error);
    res.status(500).json({ 
      error: 'Failed to generate action items',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Feedback endpoint - sends conversation to Claude Opus 4.5 for procurement negotiation feedback
app.post('/agent/feedback', async (req: Request, res: Response) => {
  try {
    console.log('📝 [Feedback] Generating negotiation feedback...');
    
    // Filter out assistant messages - only include the actual conversation transcripts
    const conversationHistory = messageHistory.filter(m => m.role === 'user');
    
    if (conversationHistory.length === 0) {
      return res.status(400).json({ 
        error: 'No conversation history available. Start a negotiation first.' 
      });
    }

    const feedbackPrompt = `You are an expert procurement negotiation coach. Analyze the following negotiation conversation and provide constructive feedback.

The conversation is between a procurement buyer and a vendor. The "user" messages contain procurement buyer and vendor statements/transcripts. Use context to understand which party is speaking.

Conversation History:
${conversationHistory.map(m => m.content).join('\n\n')}

Please provide feedback on:
1. **Negotiation Tactics Used**: What tactics did the buyer's AI assistant identify and counter effectively?
2. **Missed Opportunities**: Were there any vendor claims that could have been challenged more effectively?
3. **Data Utilization**: How well was factual data (market rates, budgets, benchmarks) used to support the buyer's position?
4. **Communication Style**: Was the tone appropriate for maintaining a professional relationship while being assertive?
5. **Overall Score**: Rate the negotiation performance from 1-10 with justification.
6. **Key Recommendations**: Top 3 actionable tips for improving future negotiations.

Do not use markdown tables for formatting.
Provide your feedback in a clear, structured, but concise format.`;

    const result = await generateText({
      model: cerebras('gpt-oss-120b'),
      prompt: feedbackPrompt,
    });

    console.log('✅ [Feedback] Feedback generated successfully');
    
    res.status(200).json({ 
      feedback: result.text,
      conversationLength: messageHistory.length 
    });
  } catch (error) {
    console.error('❌ [Feedback] Error generating feedback:', error);
    res.status(500).json({ 
      error: 'Failed to generate feedback',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

