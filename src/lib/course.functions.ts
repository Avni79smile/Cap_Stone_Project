import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth, LOCAL_DEV_USER_ID } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { unwrapServerFnInput } from "@/lib/server-input";
import type { CourseContent, Module, QuizQ, Assessment } from "./course-types";
import { pickProblems, problemCatalogText } from "./leetcode";
import { buildCourseKnowledgeContext } from "./rag";
import { retrieveCourseSources } from "./retrieval";

function cleanQuiz(qs: unknown, max = 50): QuizQ[] {
  if (!Array.isArray(qs)) return [];
  const seen = new Set<string>();
  const out: QuizQ[] = [];
  for (const q of qs as Record<string, unknown>[]) {
    const question = String(q?.["question"] ?? "").trim();
    const options = Array.isArray(q?.["options"])
      ? (q["options"] as unknown[]).map((o) => String(o).trim())
      : [];
    const answer = Number(q?.["answer"]);
    if (
      !question ||
      options.length !== 4 ||
      new Set(options).size !== 4 ||
      !Number.isInteger(answer) ||
      answer < 0 ||
      answer > 3
    )
      continue;
    if (seen.has(question.toLowerCase())) continue;
    seen.add(question.toLowerCase());
    const correct = options[answer]!;
    const shuffled = [...options].sort(() => Math.random() - 0.5);
    out.push({
      question,
      options: shuffled,
      answer: shuffled.indexOf(correct),
      explanation: String(q?.["explanation"] ?? ""),
    });
    if (out.length >= max) break;
  }
  return out;
}

function stripPromptLeakage(value: string): string {
  return value
    .replace(/\s*learner goal[^\n.]*\.?/gi, "")
    .replace(/\s*this is a real[- ]time[^\n.]*\.?/gi, "")
    .replace(/\s*topic-specific curriculum[^\n.]*\.?/gi, "")
    .replace(/\s*must explain the concept in a way that matches the user's goal and current stage\.?/gi, "")
    .replace(/\s*at beginner level\.?/gi, "")
    .replace(/\s*at intermediate level\.?/gi, "")
    .replace(/\s*at advanced level\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

export function buildCoursePlan(topic: string, goal = "", level = "beginner") {
  const safeTopic = (topic || "technology").trim();
  const subject = safeTopic.replace(/\s+/g, " ");
  const includesInterview = /interview|job|career|resume|hire|recruit/i.test(`${subject} ${goal}`);
  const includesProject = /project|build|app|dashboard|api|website|system/i.test(`${subject} ${goal}`);
  const moduleBoost = includesInterview || includesProject ? 1 : 0;
  const levelBoost = level === "advanced" ? 1 : 0;
  const moduleCount = Math.min(6, Math.max(4, 4 + moduleBoost + levelBoost));

  const baseTitles = [
    `${subject} fundamentals`,
    `${subject} data flow and execution`,
    `${subject} real-world patterns`,
    `${subject} debugging and validation`,
    includesInterview ? `${subject} interview-ready problem solving` : `${subject} workflow optimization`,
    level === "advanced" ? `${subject} advanced architecture and trade-offs` : `${subject} capstone review`,
  ];

  const titles = Array.from(new Set(baseTitles)).slice(0, moduleCount);

  return {
    moduleCount: titles.length || moduleCount,
    moduleTitles: titles.length ? titles : baseTitles.slice(0, moduleCount),
    topic: subject,
    level,
    goal,
  };
}

const MODULE_INSTRUCTIONS = `You are Pathway-SI, an expert course designer. Return ONLY compact JSON (no markdown fences) with this shape:
{"title":string,"description":string,"module":{"title":string,"lessons":[{"title":string,"summary":string,"scenes":[{"heading":string,"narration":string,"bullets":[string,string],"emoji":string}],"quiz":[{"question":string,"options":[string,string,string,string],"answer":number,"explanation":string}]}]},"leetcode":[string,string,string]}
Generate one module with exactly 2 lessons. The course must be specific to the requested topic and the retrieval context. Teach real concepts and working patterns, not generic meta-talk or repeated setup instructions.
Each lesson must have a different, concrete subtopic. Use real explanations: what the concept is, why it matters, how it works, where it is used, and one common mistake to avoid.
Each lesson must have exactly 4 scenes and 3 quiz questions. Scene headings must be real nouns or technical concepts, not placeholders like "Overview", "Lesson", or "Workflow". Each narration must explain the concept in 2 short sentences with clear steps. Each scene must contain exactly 2 short bullets that are concrete and tied to the topic.
Quiz questions must be accurate and relevant, with exactly one correct option and plausible distractors; never use "all of the above" or "none of the above". "answer" is the 0-based correct option index.
Adapt to the requested level: beginner = core ideas and simple examples; intermediate = trade-offs and implementation patterns; advanced = edge cases, architecture decisions, and validation strategy.
If the user asks for interview prep, include interview-focused examples and questions in the lesson summary and quiz set.
"title" and "description" should describe the whole course in a natural way using the actual topic and goal, not generic filler.
For module 1 only, "leetcode" must list 3 matching slugs from the problem bank below: one Easy, one Medium, and one Hard. For other modules, "leetcode" may be an empty array.`;

type AuthenticatedServerContext = {
  userId: string;
  supabase: typeof supabaseAdmin;
};

type CourseGenerationResult = {
  id?: string;
  error?: string;
  code?: "TOPIC_CHECK_FAILED" | "NON_TECH_TOPIC";
  localCourse?: {
    id: string;
    topic: string;
    level: "beginner" | "intermediate" | "advanced";
    title: string;
    created_at: string;
    completed_at: null;
    content: CourseContent;
    progress: Record<string, never>;
  };
};

class CourseModuleParseError extends Error {}

function parseCourseModule(raw: string): {
  title: string;
  description: string;
  module: CourseContent["modules"][number];
  leetcode?: unknown;
} {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new CourseModuleParseError("AI response did not contain complete JSON.");
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CourseModuleParseError("AI response contained invalid JSON.");
    }
    throw error;
  }
}

export const generateCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        topic: z.string().trim().min(2).max(200),
        level: z.enum(["beginner", "intermediate", "advanced"]),
        goal: z.string().max(300).optional(),
        outline: z.array(z.string().max(120)).max(3).optional(),
      })
      .parse(unwrapServerFnInput(d)),
  )
  .handler(async ({ data, context }): Promise<CourseGenerationResult> => {
    const { generateText, isTechnologyCourseRequest, AiError } = await import("./ai.server");
    const modules: CourseContent["modules"] = [];
    const currentContext = context as AuthenticatedServerContext | undefined;
    if (!currentContext) {
      return { error: "Authentication context is missing. Please sign in again." };
    }
    let title = "";
    let description = "";
    let leetcode: unknown;
    let technologyRelated: boolean;
    try {
      const validationInput: { topic: string; goal?: string; outline?: string[] } = { topic: data.topic };
      if (data.goal) validationInput.goal = data.goal;
      if (data.outline && data.outline.length > 0) validationInput.outline = data.outline;
      technologyRelated = await isTechnologyCourseRequest(validationInput);
    } catch (error) {
      if (error instanceof AiError) return { error: error.message, code: "TOPIC_CHECK_FAILED" };
      console.error("Course topic validation failed:", error);
      return {
        error: "We could not verify that topic right now. Please try again.",
        code: "TOPIC_CHECK_FAILED",
      };
    }
    if (!technologyRelated) {
      return {
        error:
          "Pathway-SI currently creates IT and technology courses only. Please choose a technology-related topic.",
        code: "NON_TECH_TOPIC",
      };
    }
    try {
      const retrievalSources = await retrieveCourseSources(data.topic, data.goal ?? "", data.level);
      const plan = buildCoursePlan(data.topic, data.goal ?? "", data.level);
      const sourceSummary = retrievalSources
        .slice(0, 5)
        .map((source, index) => `[${index + 1}] ${source.title}: ${source.snippet}`)
        .join("\n");

      for (let index = 0; index < plan.moduleCount; index++) {
        const moduleNumber = index + 1;
        const outlineTitle = data.outline?.[index] ?? plan.moduleTitles[index];
        const conceptFocus = [
          `This module must stay strictly inside the ${data.topic} domain.`,
          `Do not switch to unrelated topics.`,
          `The concept order is: ${plan.moduleTitles.join(" -> ")}.`,
          `Current module focus: ${outlineTitle}.`,
          `Only explain material relevant to ${data.topic} and the user's goal: ${data.goal || "general mastery"}.`,
          `The module title must explicitly contain the topic name or a precise subtopic in ${data.topic}, not generic filler like "overview" or "introduction".`,
        ].join(" ");
        const modulePrompt = `Create module ${moduleNumber} of ${plan.moduleCount} for a course on ${data.topic} at ${data.level} level. Learner goal: ${data.goal || "general mastery"}.
${outlineTitle ? `Use this exact module title: ${outlineTitle}.` : ""}
${conceptFocus}
Retrieval context for grounding (live web sources, not a local template):
${sourceSummary}
Write the course title and description in a natural way that matches the real topic and learner goal. Keep module content topic-specific and concrete. Do not include repeated meta phrases, generic filler, or boilerplate instructions in the final text. Include three LeetCode slugs (one Easy, one Medium, one Hard) only for module 1; choose from this bank:
${moduleNumber === 1 ? problemCatalogText() : "Return an empty leetcode array."}`;
        let result: ReturnType<typeof parseCourseModule> | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          const retryReminder =
            attempt === 0
              ? ""
              : "\nThe previous response was not valid JSON. Regenerate it from scratch as syntactically valid compact JSON, escaping quotes and special characters inside strings.";
          const raw = await generateText(
            MODULE_INSTRUCTIONS,
            `${modulePrompt}${retryReminder}`,
            8192,
          );
          try {
            result = parseCourseModule(raw);
            break;
          } catch (error) {
            if (!(error instanceof CourseModuleParseError) || attempt === 1) throw error;
            console.warn(`Module ${moduleNumber} returned invalid JSON; retrying once.`);
          }
        }
        if (!result) throw new Error(`Module ${moduleNumber} could not be generated.`);
        const sanitizedTitle = stripPromptLeakage(String(result.title ?? "")).trim();
        const sanitizedDescription = stripPromptLeakage(String(result.description ?? "")).trim();
        const rawModule = (result.module ?? { title: "", lessons: [] }) as {
          title?: string;
          lessons?: Array<Record<string, unknown>>;
        };
        const sanitizedModule: Module = {
          title: stripPromptLeakage(String(rawModule.title ?? "")).trim(),
          lessons: (Array.isArray(rawModule.lessons) ? rawModule.lessons : []).map((lesson) => {
            const lessonRecord = lesson as Record<string, unknown>;
            const lessonScenes = Array.isArray(lessonRecord["scenes"]) ? (lessonRecord["scenes"] as Record<string, unknown>[]) : [];
            const lessonQuiz = cleanQuiz(lessonRecord["quiz"], 3);
            return {
              title: stripPromptLeakage(String(lessonRecord["title"] ?? "")).trim(),
              summary: stripPromptLeakage(String(lessonRecord["summary"] ?? "")).trim(),
              scenes: lessonScenes.map((scene) => {
                const sceneRecord = scene as Record<string, unknown>;
                return {
                  heading: stripPromptLeakage(String(sceneRecord["heading"] ?? "")).trim(),
                  narration: stripPromptLeakage(String(sceneRecord["narration"] ?? "")).trim(),
                  bullets: Array.isArray(sceneRecord["bullets"])
                    ? (sceneRecord["bullets"] as unknown[]).map((bullet) => stripPromptLeakage(String(bullet)).trim()).filter(Boolean)
                    : [],
                  emoji: String(sceneRecord["emoji"] ?? "🎯").trim() || "🎯",
                };
              }),
              quiz: lessonQuiz,
            };
          }),
        };
        const module = sanitizedModule;
        if (!module?.title || !Array.isArray(module.lessons) || module.lessons.length !== 2) {
          throw new Error(`Module ${moduleNumber} did not contain exactly two lessons.`);
        }
        for (const lesson of module.lessons) {
          if (
            !lesson.title ||
            !lesson.summary ||
            !Array.isArray(lesson.scenes) ||
            lesson.scenes.length !== 4 ||
            !lesson.scenes.every(
              (scene) =>
                scene.heading &&
                scene.narration &&
                scene.emoji &&
                Array.isArray(scene.bullets) &&
                scene.bullets.length >= 2,
            )
          ) {
            throw new Error(`Module ${moduleNumber} contained an incomplete lesson.`);
          }
          lesson.quiz = cleanQuiz(lesson.quiz, 3);
          if (lesson.quiz.length !== 3) {
            throw new Error(
              `Module ${moduleNumber} did not contain three valid quiz questions per lesson.`,
            );
          }
        }
        if (moduleNumber === 1) {
          title = sanitizedTitle;
          description = sanitizedDescription;
          leetcode = result.leetcode;
        }
        modules.push(module);
      }
      const generatedCourseIsTechnologyRelated = await isTechnologyCourseRequest({
        topic: title || `${data.topic} Course`,
        goal: description,
        outline: modules.flatMap((module) => [
          module.title,
          ...module.lessons.flatMap((lesson) => [lesson.title, lesson.summary]),
        ]),
      });
      if (!generatedCourseIsTechnologyRelated) {
        return {
          error:
            "The generated content did not meet the IT and technology course requirement. Please try another technology topic.",
          code: "NON_TECH_TOPIC",
        };
      }
    } catch (e) {
      if (e instanceof AiError) return { error: e.message };
      console.error("Course module generation failed:", e);
      return { error: "The AI returned an incomplete course module. Please try again." };
    }
    const assignments = pickProblems(leetcode);
    const content: CourseContent = {
      title: title || `${data.topic} Course`,
      description,
      modules,
      assignments,
      assessment: assignments[0]!,
    };
    const shouldUseAdminClient =
      (process.env['ALLOW_LOCAL_DEV_AUTH'] === 'true' || process.env['VITE_ALLOW_LOCAL_DEV_AUTH'] === 'true') &&
      currentContext.userId === LOCAL_DEV_USER_ID &&
      !!process.env['SUPABASE_SERVICE_ROLE_KEY'];

    const writeClient = shouldUseAdminClient ? supabaseAdmin : currentContext.supabase;

    const { data: row, error } = await writeClient
      .from("courses")
      .insert({
        user_id: currentContext.userId,
        topic: data.topic,
        level: data.level,
        title: content.title,
        content: content as never,
      })
      .select("id")
      .single();
    if (error) {
      if (currentContext.userId === LOCAL_DEV_USER_ID && (process.env['ALLOW_LOCAL_DEV_AUTH'] === 'true' || process.env['VITE_ALLOW_LOCAL_DEV_AUTH'] === 'true')) {
        const localId = crypto.randomUUID();
        return {
          id: localId,
          localCourse: {
            id: localId,
            topic: data.topic,
            level: data.level,
            title: content.title,
            created_at: new Date().toISOString(),
            completed_at: null,
            content,
            progress: {},
          },
        };
      }
      return { error: error.message };
    }
    return { id: row.id as string };
  });

const QUIZ_INSTRUCTIONS = `You are an expert examiner. Create a high-quality multiple-choice quiz on the given IT, computing, or technology topic. Keep every question within that topic. Return ONLY JSON (no fences): {"title":string,"questions":[{"question":string,"options":[string,string,string,string],"answer":number,"explanation":string}]}.
Rules: produce exactly the requested number of questions; every question is specifically about the topic and factually accurate (only well-established facts — if unsure, ask about something else); cover different sub-areas of the topic; match the requested difficulty (easy = core definitions, medium = application/understanding, hard = analysis, edge cases, multi-step reasoning); exactly ONE option is correct and the other three are plausible but clearly wrong; options are similar in length and style; never use "all of the above" / "none of the above"; no duplicated questions; "answer" is the 0-based index of the correct option; explanation is 1-2 sentences saying why the answer is right. The title is a short, specific quiz name.`;

export const generateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        topic: z.string().trim().min(2).max(300),
        count: z.number().int().min(3).max(20),
        difficulty: z.enum(["easy", "medium", "hard"]),
      })
      .parse(unwrapServerFnInput(d)),
  )
  .handler(async ({ data }) => {
    const { generateText, isTechnologyCourseRequest, AiError } = await import("./ai.server");
    try {
      const technologyRelated = await isTechnologyCourseRequest({ topic: data.topic });
      if (!technologyRelated) {
        return {
          error:
            "Pathway-SI currently creates quizzes about IT and technology only. Please choose a technology-related topic.",
          code: "NON_TECH_TOPIC",
        };
      }
      const knowledgeContext = buildCourseKnowledgeContext(data.topic, "", data.difficulty);
      const raw = await generateText(
        QUIZ_INSTRUCTIONS,
        `Topic: ${data.topic}\nNumber of questions: ${data.count}\nDifficulty: ${data.difficulty}\n\nRetrieval context:\n${knowledgeContext}`,
      );
      const q = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      const questions = cleanQuiz(q.questions, data.count);
      if (questions.length < Math.min(3, data.count))
        return { error: "The AI returned an incomplete quiz. Please try again." };
      const generatedQuizIsTechnologyRelated = await isTechnologyCourseRequest({
        topic: String(q.title ?? data.topic),
        outline: questions.map((question) => question.question),
      });
      if (!generatedQuizIsTechnologyRelated) {
        return {
          error:
            "The generated quiz did not meet the IT and technology requirement. Please try another technology topic.",
          code: "NON_TECH_TOPIC",
        };
      }
      return { title: String(q.title ?? data.topic), questions };
    } catch (e) {
      if (e instanceof AiError) return { error: e.message };
      return { error: "The AI returned an invalid quiz. Please try again." };
    }
  });

const REVIEW_INSTRUCTIONS = `You are a strict code reviewer for a LeetCode-style judge. You receive a problem, the learner's solution (in any programming language), and sandbox test results. Decide if the solution is correct for ALL valid inputs (not just the given tests) and whether the outputs match what is expected. Return ONLY JSON: {"verdict":"Correct"|"Partially correct"|"Incorrect","score":number,"feedback":string,"hints":[string],"complexity":string}. score is 0-100. feedback is 2-4 sentences. hints: up to 3, never reveal the full solution.`;

export const reviewCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        problem: z.string().max(4000),
        code: z.string().max(12000),
        results: z.string().max(6000),
      })
      .parse(unwrapServerFnInput(d)),
  )
  .handler(async ({ data }) => {
    const { generateText, AiError } = await import("./ai.server");
    try {
      const raw = await generateText(
        REVIEW_INSTRUCTIONS,
        `PROBLEM:\n${data.problem}\n\nSOLUTION:\n${data.code}\n\nSANDBOX RESULTS:\n${data.results}`,
      );
      const r = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      return {
        verdict: String(r.verdict ?? "Incorrect"),
        score: Math.max(0, Math.min(100, Number(r.score) || 0)),
        feedback: String(r.feedback ?? ""),
        hints: Array.isArray(r.hints) ? r.hints.slice(0, 3).map(String) : [],
        complexity: String(r.complexity ?? ""),
      };
    } catch (e) {
      if (e instanceof AiError) return { error: e.message };
      return { error: "The AI review failed. Please try again." };
    }
  });

const JUDGE_INSTRUCTIONS = `You are a precise code-execution judge, like LeetCode's. You receive a programming language, the learner's code (LeetCode-style class/function), the function name, and a list of test inputs (each an array of arguments in JSON). Mentally compile and execute the code EXACTLY as written for each input — do not fix bugs, do not assume intent. If the code would not compile, every result is a compile error. Return ONLY JSON: {"results":[{"output":<JSON value or null>,"error":string|null}]} with one entry per input, in order. Output must be the JSON form of the returned value (arrays as JSON arrays, booleans as true/false). error is a short message like "Compile Error: ..." or "Runtime Error: ..." or null.`;

export const judgeCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        language: z.string().max(30),
        fn: z.string().max(80),
        code: z.string().max(12000),
        inputs: z.string().max(8000),
      })
      .parse(unwrapServerFnInput(d)),
  )
  .handler(async ({ data }) => {
    const { generateText, AiError } = await import("./ai.server");
    try {
      const raw = await generateText(
        JUDGE_INSTRUCTIONS,
        `LANGUAGE: ${data.language}\nFUNCTION: ${data.fn}\nCODE:\n${data.code}\n\nINPUTS:\n${data.inputs}`,
      );
      const r = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      const results = Array.isArray(r.results) ? r.results : [];
      return {
        results: JSON.stringify(
          results.map((x: { output?: unknown; error?: unknown }) =>
            x?.error ? { error: String(x.error) } : { got: x?.output ?? null },
          ),
        ),
      };
    } catch (e) {
      if (e instanceof AiError) return { error: e.message };
      return { error: "The judge could not evaluate this code. Please try again." };
    }
  });
