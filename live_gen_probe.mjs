import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env');
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    env[key] = value.replace(/^['"]|['"]$/g, '');
  }
}

const apiKey = env.GROQ_API_KEY || env.GEMINI_API_KEY;
const provider = env.AI_PROVIDER || 'groq';
const model = env.GROQ_MODEL || 'qwen/qwen3.8-27b';

const prompt = `Topic: React hooks\nGoal: build confident frontend logic\nGenerate a short course outline with 3 modules and a concrete explanation for each, in valid JSON with keys: title, description, modules.`;
const body = {
  model,
  messages: [
    { role: 'system', content: 'You are a precise technical curriculum designer. Respond in valid JSON only.' },
    { role: 'user', content: prompt }
  ],
  temperature: 0.4,
  max_tokens: 1200,
};

const resultPath = path.join(root, 'live_gen_probe_result.txt');
const write = (text) => fs.writeFileSync(resultPath, text, 'utf8');

if (!apiKey) {
  write('NO_API_KEY_FOUND\n');
  process.exit(0);
}

try {
  const url = provider === 'gemini'
    ? 'https://generativelanguage.googleapis.com/v1beta/models/' + (env.GEMINI_MODEL || 'gemini-2.5-flash') + ':generateContent?key=' + env.GEMINI_API_KEY
    : 'https://api.groq.com/openai/v1/chat/completions';

  const headers = { 'Content-Type': 'application/json' };
  const payload = provider === 'gemini'
    ? { contents: [{ parts: [{ text: prompt }] }] }
    : { ...body };

  if (provider !== 'gemini') headers.Authorization = `Bearer ${env.GROQ_API_KEY}`;

  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  const text = await response.text();
  const statusLine = `STATUS:${response.status} ${response.statusText}\n`;
  const preview = text.slice(0, 1200);
  write(statusLine + preview + '\n');
  console.log(statusLine + preview);
} catch (error) {
  write(`ERROR:${String(error)}`);
  console.error(error);
  process.exit(1);
}
