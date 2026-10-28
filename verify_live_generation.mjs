import { writeFileSync } from 'node:fs';
import { generateText } from './src/lib/ai.server.ts';

const prompt = `Topic: React hooks\nGoal: build confident frontend logic\nReturn a compact JSON object with fields title, description, modules. Include 3 modules, each module has 2 lessons, and each lesson has 4 scenes and 3 quiz questions. Keep content factual and relevant to React hooks.`;

const instructions = `You are a technical curriculum designer. Return only valid JSON in compact form with no markdown fences. The object must have title, description, and modules. Each module should be topic-specific and practical for React hooks.`;

try {
  const output = await generateText(instructions, prompt, 8000);
  writeFileSync('live_generation_output.txt', output.slice(0, 4000), 'utf8');
  console.log('OK');
} catch (error) {
  writeFileSync('live_generation_output.txt', `ERROR:${String(error)}`, 'utf8');
  console.error(error);
  process.exitCode = 1;
}
