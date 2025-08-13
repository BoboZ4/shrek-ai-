import express from 'express';
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getRelevantContext } from './retriever';

// Initialize Express
const app = express();
app.use(express.json());

// Read Gemini API key from environment variables
const apiKey = process.env.GEMINI_API_KEY;
let gemini: GoogleGenerativeAI | undefined;
if (apiKey) {
  gemini = new GoogleGenerativeAI(apiKey);
}

/**
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

/**
 * Ask endpoint: accepts a question in the request body and returns a streamed answer.
 * If the Gemini API key is not configured, returns a placeholder response.
 */
app.post('/ask', async (req, res) => {
  const { question } = req.body;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid question' });
  }

  // Set up Server-Sent Events (SSE) headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  (res as any).flushHeaders?.();

  // Retrieve context (documents) relevant to the question
  const contextDocs = await getRelevantContext(question, gemini);

  // If Gemini is not configured, send back a simple echo response
  if (!gemini) {
            res.write('data: ' + JSON.stringify({ answer: 'You asked: ' + question }) + '\n\n');
    return res.end();
  }

  try {
    // Concatenate context into a single prompt
    const contextString = contextDocs.join('\n\n');
    

    const prompt = contextString ? contextString + '\n\n' + question : question;
    const result = await model.generateContent(prompt);
    const answer = result.response?.text() ?? '';

    // Stream the answer by splitting into sentences
    const segments = answer.split(/\.\s+/);
    for (const segment of segments) {
      const trimmed = segment.trim();
      if (trimmed) {
        
              res.write('data: ' + JSON.stringify({ segment: trimmed }) + '\n\n');
    }
    res.end();
  } catch (err) {
    const message = (err as any)?.message || 'Unknown error';
        res.write('data: ' + JSON.stringify({ error: 'Failed to generate answer', details: message }) + '\n\n');
    res.end();
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
      console.log('shrek-ai server listening on port ' + port);
});
