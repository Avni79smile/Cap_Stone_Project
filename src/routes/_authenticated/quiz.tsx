import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Shuffle, ListChecks, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Quiz } from "@/components/Quiz";
import { TechCourseRestrictionDialog } from "@/components/TechCourseRestrictionDialog";
import { generateQuiz } from "@/lib/course.functions";
import { coursesQuery } from "@/lib/data";
import { RANDOM_TOPICS } from "@/lib/topics";
import type { QuizQ } from "@/lib/course-types";
import { TUTOR } from "@/lib/avatars";
import { isNonTechnologyTopicError } from "@/lib/tech-topic";
import { getLearningGap } from "@/lib/rag";

const QUIZ_HISTORY_KEY = "pathway-quiz-history-v1";

type SavedQuizEntry = {
  id: string;
  topic: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  count: number;
  createdAt: string;
  attemptedAt?: string;
  score?: number;
  learningGap?: string;
  status: "created" | "attempted";
};

export const Route = createFileRoute("/_authenticated/quiz")({
  head: () => ({
    meta: [
      { title: "Quiz me — Pathway-SI" },
      { name: "description", content: "Generate an AI quiz on any topic or course." },
    ],
  }),
  component: QuizPage,
});

function QuizPage() {
  const fn = useServerFn(generateQuiz);
  const { data: courses = [] } = useQuery(coursesQuery);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [busy, setBusy] = useState(false);
  const [quiz, setQuiz] = useState<{ title: string; questions: QuizQ[] } | null>(null);
  const [round, setRound] = useState(0);
  const [restrictionOpen, setRestrictionOpen] = useState(false);
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedQuizEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(QUIZ_HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw) as SavedQuizEntry[]);
    } catch {
      // Ignore invalid local history.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const summary = useMemo(() => {
    const attempted = history.filter((entry) => entry.status === "attempted");
    const avg = attempted.length
      ? Math.round(attempted.reduce((sum, entry) => sum + (entry.score ?? 0), 0) / attempted.length)
      : 0;
    return {
      total: history.length,
      attempted: attempted.length,
      avg,
    };
  }, [history]);

  function persistQuizEntry(entry: SavedQuizEntry) {
    setHistory((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 8));
  }

  async function make(t = topic) {
    if (t.trim().length < 2) {
      toast.error("Enter a topic first");
      return;
    }
    setBusy(true);
    try {
      const r = await fn({ data: { topic: t, count, difficulty } });
      if ("error" in r && r.error) {
        if (isNonTechnologyTopicError(r.error, "code" in r ? r.code : undefined))
          setRestrictionOpen(true);
        else toast.error(r.error);
      } else if (r.questions && r.title) {
        const id = `${t.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
        const saved: SavedQuizEntry = {
          id,
          topic: t,
          title: r.title,
          difficulty,
          count,
          createdAt: new Date().toISOString(),
          status: "created",
        };
        setActiveQuizId(id);
        persistQuizEntry(saved);
        setQuiz({ title: r.title, questions: r.questions });
        setRound((x) => x + 1);
      }
    } catch {
      toast.error("Could not create the quiz. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleQuizDone(pct: number) {
    if (!activeQuizId) {
      toast(`You scored ${pct}%`);
      return;
    }

    const info = getLearningGap(topic || quiz?.title || "technology", pct, difficulty);
    const nextHistory = history.map((entry) =>
      entry.id === activeQuizId
        ? {
            ...entry,
            score: pct,
            attemptedAt: new Date().toISOString(),
            status: "attempted",
            learningGap: info.guidance,
          }
        : entry,
    );

    setHistory(nextHistory);
    toast(`You scored ${pct}% — ${info.label.toLowerCase()}`);
  }

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-4">
          <img src={TUTOR} alt="" className="size-20 rounded-2xl bg-secondary object-cover" />
          <div>
            <h1 className="text-4xl font-bold">Quiz me</h1>
            <p className="text-muted-foreground">
              Create a quiz about IT and technology, or quiz yourself on one of your courses.
            </p>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-5 rounded-3xl border bg-card p-6 shadow-soft">
            <div className="space-y-2">
              <Label htmlFor="qt">Topic</Label>
              <div className="flex gap-2">
                <Input
                  id="qt"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Big-O notation, SQL joins"
                  className="h-11"
                  maxLength={300}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-full"
                  disabled={busy}
                  onClick={() => {
                    const t = RANDOM_TOPICS[Math.floor(Math.random() * RANDOM_TOPICS.length)]!;
                    setTopic(t);
                    make(t);
                  }}
                >
                  <Shuffle /> Random
                </Button>
              </div>
              {courses.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {courses.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setTopic(c.content.title)}
                      className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground hover:bg-accent"
                    >
                      {c.content.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Questions: {count}</Label>
                <input
                  type="range"
                  min={3}
                  max={15}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["easy", "medium", "hard"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(d)}
                      className={`rounded-xl border-2 py-2 text-sm font-semibold capitalize ${difficulty === d ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Button
              variant="hero"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => make()}
            >
              <ListChecks /> {busy ? "Writing your quiz…" : "Generate quiz"}
            </Button>
          </div>

          <div className="rounded-3xl border bg-card p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Progress</h3>
              <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium">
                {summary.attempted}/{summary.total} attempted
              </span>
            </div>

            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Average score</span>
                <span className="font-semibold text-foreground">{summary.avg}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${summary.avg}%` }}
                />
              </div>
            </div>

            <div className="space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No quiz history yet. Generate your first quiz to start tracking progress.</p>
              ) : (
                history.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setTopic(entry.topic);
                      setDifficulty(entry.difficulty);
                      setCount(entry.count);
                      setActiveQuizId(entry.id);
                      const match = quiz && quiz.title === entry.title ? quiz : null;
                      if (match) {
                        setQuiz(match);
                      }
                    }}
                    className={`w-full rounded-2xl border p-3 text-left transition ${activeQuizId === entry.id ? "border-primary bg-primary/5" : "border-border bg-background/40 hover:bg-accent/20"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{entry.title}</p>
                        <p className="text-[11px] text-muted-foreground">{entry.topic}</p>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        {entry.status === "attempted" ? <CheckCircle2 className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                        {entry.status === "attempted" ? `${entry.score ?? 0}%` : "Created"}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="capitalize">{entry.difficulty}</span>
                      <span>{entry.count} Q</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-secondary">
                      <div
                        className={`h-1.5 rounded-full ${entry.score !== undefined && entry.score < 60 ? "bg-amber-500" : "bg-primary"}`}
                        style={{ width: `${entry.score ?? (entry.status === "attempted" ? 0 : 25)}%` }}
                      />
                    </div>
                    {entry.learningGap && (
                      <p className="mt-2 text-[10px] text-muted-foreground">Gap: {entry.learningGap}</p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {quiz && (
          <div className="animate-scene space-y-3">
            <h2 className="text-2xl font-bold">{quiz.title}</h2>
            <Quiz
              key={round}
              questions={quiz.questions}
              onDone={handleQuizDone}
            />
            <Button
              variant="outline"
              className="rounded-full"
              disabled={busy}
              onClick={() => make()}
            >
              New questions on this topic
            </Button>
          </div>
        )}
      </div>
      <TechCourseRestrictionDialog
        open={restrictionOpen}
        onOpenChange={setRestrictionOpen}
        kind="quiz"
      />
    </>
  );
}
