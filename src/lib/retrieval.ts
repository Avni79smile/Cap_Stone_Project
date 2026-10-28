import { getRelevantKnowledge } from "./rag";

export type RetrievalSource = {
  title: string;
  snippet: string;
  url: string;
  source: "local" | "serpapi" | "google";
  score: number;
};

function normalizeTopic(value: string) {
  return (value || "technology").trim().toLowerCase();
}

function createLocalSources(topic: string, goal: string, level: string): RetrievalSource[] {
  const items = getRelevantKnowledge(topic, goal, level);
  return items.map((item, index) => ({
    title: item.title,
    snippet: item.content,
    url: "",
    source: "local",
    score: Math.max(1, items.length - index),
  }));
}

async function fetchSerpApi(topic: string, goal: string): Promise<RetrievalSource[]> {
  const apiKey = process.env["SERPAPI_API_KEY"]?.trim();
  if (!apiKey) return [];

  try {
    const query = `${topic} ${goal}`.trim() || topic;
    const googleAiModeUrl = new URL("https://serpapi.com/search.json");
    googleAiModeUrl.searchParams.set("engine", "google_ai_mode");
    googleAiModeUrl.searchParams.set("q", query);
    googleAiModeUrl.searchParams.set("api_key", apiKey);
    googleAiModeUrl.searchParams.set("num", "5");

    const googleAiModeResponse = await fetch(googleAiModeUrl.toString());
    if (googleAiModeResponse.ok) {
      const googleAiModeData = (await googleAiModeResponse.json()) as {
        text_blocks?: string[];
        answer_box?: { snippet?: string };
        organic_results?: Array<{ title?: string; snippet?: string; link?: string }>;
      };

      const textBlocks = (googleAiModeData.text_blocks ?? [])
        .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
        .map((entry, index) => ({
          title: `${topic} source ${index + 1}`,
          snippet: entry.trim(),
          url: googleAiModeData.organic_results?.[index]?.link ?? "",
          source: "serpapi" as const,
          score: 120 - index,
        }));

      const boxedAnswer = googleAiModeData.answer_box?.snippet;
      const mappedFromBox = boxedAnswer
        ? [{
            title: `${topic} overview`,
            snippet: boxedAnswer.trim(),
            url: googleAiModeData.organic_results?.[0]?.link ?? "",
            source: "serpapi" as const,
            score: 150,
          }]
        : [];

      if (textBlocks.length > 0 || mappedFromBox.length > 0) {
        return [...mappedFromBox, ...textBlocks].slice(0, 5);
      }
    }

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("num", "5");

    const response = await fetch(url.toString());
    if (!response.ok) return [];

    const data = (await response.json()) as {
      organic_results?: Array<{ title?: string; snippet?: string; link?: string }>;
    };

    return (data.organic_results ?? [])
      .filter((entry) => entry.title && entry.snippet)
      .slice(0, 5)
      .map((entry, index) => ({
        title: entry.title ?? "Search result",
        snippet: entry.snippet ?? "",
        url: entry.link ?? "",
        source: "serpapi",
        score: 100 - index,
      }));
  } catch {
    return [];
  }
}

async function fetchGoogleSearch(topic: string, goal: string): Promise<RetrievalSource[]> {
  const apiKey = process.env["GOOGLE_SEARCH_API_KEY"]?.trim();
  const cx = process.env["GOOGLE_SEARCH_ENGINE_ID"]?.trim();
  if (!apiKey || !cx) return [];

  try {
    const query = `${topic} ${goal}`.trim() || topic;
    const params = new URLSearchParams({
      q: query,
      key: apiKey,
      cx,
      num: "5",
    });

    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);
    if (!response.ok) return [];

    const data = (await response.json()) as {
      items?: Array<{ title?: string; snippet?: string; link?: string }>;
    };

    return (data.items ?? [])
      .filter((entry) => entry.title && entry.snippet)
      .slice(0, 5)
      .map((entry, index) => ({
        title: entry.title ?? "Google result",
        snippet: entry.snippet ?? "",
        url: entry.link ?? "",
        source: "google",
        score: 90 - index,
      }));
  } catch {
    return [];
  }
}

export async function retrieveCourseSources(
  topic: string,
  goal = "",
  level = "beginner",
): Promise<RetrievalSource[]> {
  const normalized = normalizeTopic(topic);
  const externalResults = [
    ...(await fetchSerpApi(normalized, goal)),
    ...(await fetchGoogleSearch(normalized, goal)),
  ];

  if (externalResults.length > 0) {
    return externalResults
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((source) => ({
        ...source,
        snippet: source.snippet.trim(),
      }));
  }

  return createLocalSources(normalized, goal, level);
}

export function buildDocumentVector(text: string): Record<string, number> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.trim());
  const vector: Record<string, number> = {};
  for (const token of tokens) {
    vector[token] = (vector[token] ?? 0) + 1;
  }
  return vector;
}

export function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let numerator = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const key of keys) {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    numerator += av * bv;
    magnitudeA += av * av;
    magnitudeB += bv * bv;
  }

  if (!magnitudeA || !magnitudeB) return 0;
  return numerator / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}
