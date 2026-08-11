import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;
  // MEDIUM #1: Body size limit — DoS defense; 1mb is generous for chat requests (<50kb typical).
  app.use(express.json({ limit: '1mb' }));

  // MEDIUM #2: Origin allowlist — DNS rebinding defense-in-depth.
  // Server already binds 127.0.0.1 (audit acknowledged); this guards against
  // browser-driven DNS rebinding when an attacker resolves localhost to a
  // public IP and posts from a malicious page.
  const ALLOWED_ORIGINS = new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'tauri://localhost',
    'https://tauri.localhost',
  ]);
  app.use((req, res, next) => {
    // Only enforce on /api/chat POST; Vite HMR + static fallback untouched.
    if (req.path !== '/api/chat' || req.method !== 'POST') return next();
    const origin = req.headers.origin;
    // No Origin header = non-browser client (curl/postman) — allow through,
    // DNS rebinding is a browser-vector attack.
    if (!origin) return next();
    if (ALLOWED_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      return next();
    }
    return res.status(403).json({ error: 'Origin not allowed' });
  });

  // Phase 9 universal chat proxy. Desktop uses the Tauri `chat` command;
  // this endpoint is the web-mode fallback and currently supports Gemini.
  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, tools = [], systemPrompt = '', provider } = req.body ?? {};
      if (!Array.isArray(messages) || typeof systemPrompt !== 'string') {
        return res.status(400).json({ error: 'messages and systemPrompt are required' });
      }
      if (provider !== 'gemini') {
        return res.status(400).json({ error: `Provider "${provider}" not supported in web mode. Use desktop app.` });
      }
      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({ error: 'GEMINI_API_KEY not set in .env' });
      }

      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContentStream({
        model: 'gemini-3.6-flash',
        contents: messages.map((message: { role: string; content: string }) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
        config: {
          systemInstruction: systemPrompt,
          tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
        },
      });
      for await (const chunk of response) {
        const text = chunk.text;
        if (text) res.write(JSON.stringify({ kind: 'token', data: { text } }) + '\n');
        const functionCall = chunk.functionCalls?.[0];
        if (functionCall?.name) {
          res.write(JSON.stringify({ kind: 'tool_call', data: {
            name: functionCall.name,
            arguments: functionCall.args,
          } }) + '\n');
        }
      }
      res.write(JSON.stringify({ kind: 'done' }) + '\n');
      res.end();
    } catch (error) {
      // MEDIUM #3: Sanitize — provider error.message may include API key fragments.
      // Log name + truncated/redacted message; client gets generic text.
      const errName = error instanceof Error ? error.name : 'UnknownError';
      let rawMessage = error instanceof Error ? error.message : String(error);
      rawMessage = rawMessage.replace(/AIza[0-9A-Za-z_-]{35}/g, '[REDACTED_KEY]');
      rawMessage = rawMessage.replace(/key=[^\s&]+/gi, 'key=[REDACTED]');
      rawMessage = rawMessage.slice(0, 200);
      console.error(`Chat proxy error: ${errName} — ${rawMessage}`);
      const safeClientMessage = 'Chat proxy error';
      if (!res.headersSent) return res.status(500).json({ error: safeClientMessage });
      res.write(JSON.stringify({ kind: 'error', data: { message: safeClientMessage } }) + '\n');
      res.end();
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Dev-only server running at http://127.0.0.1:${PORT} (not for production)`);
  });
}

startServer();
