import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unwrapServerFnInput } from "@/lib/server-input";

export type InterviewRound = "hr" | "technical";
export type InterviewTurn = { question: string; answer: string };
export type InterviewReport = {
  score: number;
  verdict: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  perQuestion: { question: string; score: number; comment: string; idealAnswer: string }[];
};

const turnSchema = z.object({ question: z.string().max(1500), answer: z.string().max(5000) });
const baseSchema = z.object({
  topic: z.string().trim().min(2).max(200),
  round: z.enum(["hr", "technical"]),
  level: z.enum(["fresher", "mid", "senior"]),
  total: z.number().int().min(3).max(12),
  history: z.array(turnSchema).max(12),
});

function persona(round: InterviewRound, topic: string, level: string) {
  return round === "hr"
    ? `You are Maya, an experienced, warm but perceptive HR interviewer at a technology company. You are interviewing a ${level} candidate for the ${topic} role. Conduct a realistic live HR screen: focus on motivation and role fit, communication, collaboration, ownership, handling setbacks, and career goals. Ask only questions an HR interviewer would normally ask; do not test technical knowledge. Adapt each question to the candidate's previous answer and the ${topic} role.`
    : `You are Arjun, an experienced senior engineer conducting a realistic technical interview for a ${level} candidate interviewing for a ${topic} role. Ask practical, job-relevant questions that assess real engineering ability: fundamentals, applying concepts, debugging, trade-offs, and (when appropriate for the level and role) system or code reasoning. Keep questions answerable verbally in an interview; do not request a long implementation or ask unrelated trivia.`;
}

const parse = (raw: string) => JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));

export const nextInterviewQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => baseSchema.parse(unwrapServerFnInput(d)))
  .handler(async ({ data }) => {
    const { generateText, AiError } = await import("./ai.server");
    const n = data.history.length + 1;
    const instructions = `${persona(data.round, data.topic, data.level)}
Run this as a genuine interview conversation, not a quiz or a list of canned prompts. Ask one concise question at a time, never number questions, and never repeat a question from the transcript. Keep a professional, natural video-call tone; do not claim knowledge about a specific company or the candidate's background that was not provided.

Pace the interview across its ${data.total} questions:
- HR: begin with a brief introduction and a natural opening question about the candidate's background or interest in the ${data.topic} role. Then explore motivation and role fit, followed by varied behavioural examples (teamwork, conflict, ownership, challenge, or feedback) using realistic "what was the situation / what did you do / what happened" probes. Avoid asking every item mechanically; select relevant areas and follow the candidate's answers. Use the final question for a role-relevant closing topic or what the candidate would like to ask.
- Technical: start with a role-relevant core concept, then progress toward applying it in a realistic work scenario, troubleshooting or trade-offs, and (for mid/senior candidates where appropriate) design or deeper technical reasoning. For fresher candidates, emphasize fundamentals and learning/problem-solving rather than senior-level architecture. Use the final question for a practical wrap-up or a deeper follow-up on an area already discussed.

Use the transcript to avoid repetition and choose sensible coverage. A follow-up is appropriate when an answer is interesting, unclear, or missing useful detail, but do not force one after every answer. If the candidate did not answer, rephrase or move on supportively instead of scolding them. Do not bundle multiple questions into one.
For question 1, briefly greet the candidate and introduce yourself in "reaction". For later turns, "reaction" should be a short, specific acknowledgment of their previous answer, without grading or revealing the ideal answer.
Return ONLY JSON: {"reaction":string,"question":string}. "reaction" may be "" for the first question. Keep "question" under 60 words.`;
    const transcript = data.history
      .map((t, i) => `Q${i + 1}: ${t.question}\nCandidate: ${t.answer || "(no answer)"}`)
      .join("\n\n");
    try {
      const raw = await generateText(
        instructions,
        `This is question ${n} of ${data.total}.${n === data.total ? " It is the final question." : ""}\n\nTranscript so far:\n${transcript || "(interview just started)"}`,
      );
      const r = parse(raw);
      const question = String(r.question ?? "").trim();
      if (!question)
        return { error: "The interviewer lost their train of thought. Please try again." };
      return { reaction: String(r.reaction ?? "").trim(), question };
    } catch (e) {
      if (e instanceof AiError) return { error: e.message };
      return { error: "The interviewer could not respond. Please try again." };
    }
  });

export const evaluateInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    baseSchema.extend({ history: z.array(turnSchema).min(1).max(12) }).parse(unwrapServerFnInput(d)),
  )
  .handler(async ({ data }) => {
    const { generateText, AiError } = await import("./ai.server");
    const rubric =
      data.round === "hr"
        ? "Evaluate communication, motivation, role fit, self-awareness, and the specificity of behavioural examples. Reward clear ownership and outcomes; do not penalize a candidate for not having a particular job title or company experience."
        : `Evaluate technical correctness, clarity of reasoning, practical judgment, and level-appropriate depth for the ${data.topic} role. Give partial credit for a sound approach even if the candidate does not know a detail; do not require memorized trivia.`;
    const instructions = `You are an expert ${data.round === "hr" ? "HR" : "technical"} interview coach evaluating a ${data.level} candidate's ${data.topic} interview. Be honest, specific, encouraging, and consistent with a realistic interview evaluation. ${rubric} Return ONLY JSON:
{"score":number,"verdict":"Strong hire"|"Hire"|"Borderline"|"Needs practice","summary":string,"strengths":[string],"improvements":[string],"perQuestion":[{"question":string,"score":number,"comment":string,"idealAnswer":string}]}
score is 0-100 overall; per-question score 0-10. summary 2-3 sentences. 2-4 strengths and 2-4 improvements. comment 1-2 sentences. idealAnswer is a concise model answer (2-4 sentences). Empty or "(no answer)" answers score 0.`;
    const transcript = data.history
      .map((t, i) => `Q${i + 1}: ${t.question}\nCandidate: ${t.answer || "(no answer)"}`)
      .join("\n\n");
    try {
      const r = parse(await generateText(instructions, transcript));
      const report: InterviewReport = {
        score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))),
        verdict: String(r.verdict ?? "Needs practice"),
        summary: String(r.summary ?? ""),
        strengths: Array.isArray(r.strengths) ? r.strengths.slice(0, 4).map(String) : [],
        improvements: Array.isArray(r.improvements) ? r.improvements.slice(0, 4).map(String) : [],
        perQuestion: (Array.isArray(r.perQuestion) ? r.perQuestion : [])
          .slice(0, 12)
          .map((p: Record<string, unknown>, i: number) => ({
            question: String(p["question"] ?? data.history[i]?.question ?? ""),
            score: Math.max(0, Math.min(10, Math.round(Number(p["score"]) || 0))),
            comment: String(p["comment"] ?? ""),
            idealAnswer: String(p["idealAnswer"] ?? ""),
          })),
      };
      return { report };
    } catch (e) {
      if (e instanceof AiError) return { error: e.message };
      return { error: "Could not score the interview. Please try again." };
    }
  });
