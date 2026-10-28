export type KnowledgeItem = {
  id: string;
  topic: string;
  title: string;
  content: string;
  source: "local-corpus" | "web-fallback";
  tags: string[];
};

const KNOWLEDGE_BASE: KnowledgeItem[] = [
  {
    id: "ml-foundations",
    topic: "machine learning",
    title: "Machine learning foundations",
    content:
      "Start with supervised learning, feature engineering, evaluation metrics, and validation. A reliable ML workflow measures performance with train/validation/test splits and tracks bias, variance, and overfitting.",
    source: "local-corpus",
    tags: ["ml", "data", "modeling", "evaluation", "ai"],
  },
  {
    id: "ml-projects",
    topic: "machine learning",
    title: "Practical ML workflow",
    content:
      "Build a small ML project by preparing data, selecting a model, tuning hyperparameters, and validating the result against clear business criteria.",
    source: "local-corpus",
    tags: ["workflow", "project", "validation", "deployment"],
  },
  {
    id: "react-hooks",
    topic: "react hooks",
    title: "React state and effects",
    content:
      "Use state for local UI data, effects for side effects, and memoization for expensive work. Keep render logic predictable and avoid unnecessary state duplication.",
    source: "local-corpus",
    tags: ["frontend", "hooks", "react", "state"],
  },
  {
    id: "sql-core",
    topic: "sql",
    title: "SQL joins and filtering",
    content:
      "SQL joins connect rows across tables while WHERE clauses and aggregations narrow the result set. Learn join types, groupings, and filtering to answer business questions accurately.",
    source: "local-corpus",
    tags: ["database", "queries", "joins", "analytics"],
  },
  {
    id: "cybersecurity",
    topic: "cybersecurity",
    title: "Cybersecurity basics",
    content:
      "Security starts with access control, least privilege, encryption, monitoring, and basic incident response. Small controls reduce risk far more than a single large security tool.",
    source: "local-corpus",
    tags: ["security", "networking", "threats", "best-practices"],
  },
  {
    id: "python-data",
    topic: "python",
    title: "Python for data work",
    content:
      "Python is effective for data transformation, scripting, analysis, and AI workflows when paired with clear functions, testing, and reproducible pipelines.",
    source: "local-corpus",
    tags: ["python", "data", "automation", "analysis"],
  },
  {
    id: "devops",
    topic: "devops",
    title: "DevOps fundamentals",
    content:
      "Reliable delivery combines version control, automated testing, deployment pipelines, observability, and safe rollbacks.",
    source: "local-corpus",
    tags: ["ci-cd", "deployment", "reliability", "ops"],
  },
  {
    id: "system-design",
    topic: "system design",
    title: "System design essentials",
    content:
      "Good system design balances reliability, scalability, latency, and operational cost. Decompose the problem into data flow, interfaces, storage, and failure handling.",
    source: "local-corpus",
    tags: ["architecture", "scalability", "systems", "design"],
  },
  {
    id: "ai-ethics",
    topic: "ai",
    title: "AI readiness and responsible use",
    content:
      "The strongest AI workflows combine clear business context, strong evaluation, guardrails, and human review. Responsible use keeps the system trustworthy and measurable.",
    source: "local-corpus",
    tags: ["ai", "ethics", "evaluation", "governance"],
  },
];

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => token.length > 2),
  );
}

function similarityScore(topic: string, goal: string, level: string, item: KnowledgeItem): number {
  const topicTokens = tokenSet(topic);
  const goalTokens = tokenSet(goal);
  const itemTokens = tokenSet(`${item.topic} ${item.title} ${item.content} ${item.tags.join(" ")}`);
  const overlap = [...topicTokens].filter((token) => itemTokens.has(token)).length;
  const goalOverlap = [...goalTokens].filter((token) => itemTokens.has(token)).length;
  const topicBonus = topicTokens.has(item.topic.toLowerCase()) ? 4 : 0;
  const levelBonus = level === "advanced" && item.tags.some((tag) => ["architecture", "design", "deployment", "evaluation"].includes(tag)) ? 2 : 0;
  return overlap * 4 + goalOverlap * 3 + topicBonus + levelBonus;
}

export function getRelevantKnowledge(topic: string, goal = "", level = "beginner"): KnowledgeItem[] {
  const safeTopic = (topic || "technology").trim();
  const expandedTopic = `${safeTopic} ${goal}`.toLowerCase();
  const results = KNOWLEDGE_BASE.map((item) => {
    const content = `${item.topic} ${item.title} ${item.content} ${item.tags.join(" ")}`.toLowerCase();
    const exactMatch = content.includes(expandedTopic.toLowerCase()) ? 2 : 0;
    const phraseMatch = (safeTopic.toLowerCase().includes(item.topic.toLowerCase()) || item.topic.toLowerCase().includes(safeTopic.toLowerCase())) ? 3 : 0;
    const score = similarityScore(safeTopic, goal, level, item) + exactMatch + phraseMatch;
    return { item, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
    .slice(0, 5);

  return results.length > 0 ? results : KNOWLEDGE_BASE.slice(0, 3);
}

export function buildCourseKnowledgeContext(topic: string, goal = "", level = "beginner") {
  const items = getRelevantKnowledge(topic, goal, level);
  const intro = `Local knowledge base for ${topic || "technology"}:`;
  const body = items
    .map(
      (item) =>
        `- ${item.title} (${item.topic}): ${item.content}${item.tags.length ? ` Tags: ${item.tags.join(", ")}` : ""}`,
    )
    .join("\n");
  return `${intro}\n${body}`;
}

export function buildRecommendationsForCourse(
  course: { title?: string; knowledge?: KnowledgeItem[] },
  progress: {
    lessons?: Record<string, { done?: boolean }>;
    assignments?: Record<string, { passed?: boolean }>;
  } = {},
): string[] {
  const knowledge = course.knowledge?.length ? course.knowledge : getRelevantKnowledge(course.title ?? "technology");
  const lessonCount = Object.keys(progress.lessons ?? {}).length;
  const assignmentCount = Object.keys(progress.assignments ?? {}).length;
  const completedLessons = Object.values(progress.lessons ?? {}).filter((entry) => entry.done).length;
  const completedAssignments = Object.values(progress.assignments ?? {}).filter((entry) => entry.passed).length;

  const suggestions = [
    `Next up: build a small project around ${course.title ?? "this topic"} and validate the outcome with a real example.`,
    `Next: deepen your understanding of ${knowledge[0]?.title ?? "core concepts"} by reviewing the key workflow, trade-offs, and common mistakes.`,
  ];

  if (lessonCount > 0 || assignmentCount > 0) {
    suggestions.push(
      completedAssignments > 0 || completedLessons > 0
        ? "Next: focus on the next weak spot and turn the concept into a repeatable practice routine."
        : "Next: complete the guided exercises and reinforce the strongest concept with a short hands-on task.",
    );
  }

  if (knowledge[1]) {
    suggestions.push(`Next: review ${knowledge[1].title} and connect it to a real workplace scenario.`);
  }

  return suggestions.slice(0, 4);
}

export function getLearningGap(topic: string, score = 0, difficulty: "easy" | "medium" | "hard" = "medium") {
  const relevant = getRelevantKnowledge(topic, "", difficulty);
  const conceptHints = relevant
    .slice(0, 3)
    .map((item) => item.tags[0])
    .filter(Boolean)
    .slice(0, 2);

  if (score >= 85) {
    return {
      label: "Strong grasp",
      gap: "low",
      guidance: `You are ahead on ${topic}. Move to deeper practice and harder cases around ${conceptHints.join(" and ") || "the main workflow"}.`,
    };
  }

  if (score >= 60) {
    return {
      label: "Minor gap",
      gap: "medium",
      guidance: `Practice a few targeted examples around ${conceptHints.join(" and ") || "the core concepts"} and re-try the topic with a slightly harder set.`,
    };
  }

  return {
    label: "Learning gap",
    gap: "high",
    guidance: `Focus on the fundamentals of ${topic}: review definitions, core workflows, and validation before trying advanced questions.`,
  };
}
