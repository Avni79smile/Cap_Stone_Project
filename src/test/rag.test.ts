import { describe, expect, it, vi } from "vitest";

import { generateText } from "@/lib/ai.server";
import { buildRecommendationsForCourse, getRelevantKnowledge } from "@/lib/rag";

describe("RAG knowledge and recommendations", () => {
  it("returns relevant local knowledge for technology topics", () => {
    const results = getRelevantKnowledge("machine learning", "build a practical foundation", "beginner");

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((item) => item.topic.toLowerCase().includes("machine") || item.title.toLowerCase().includes("machine"))).toBe(true);
  });

  it("builds learning recommendations from progress", () => {
    const recommendations = buildRecommendationsForCourse(
      {
        title: "Machine Learning Fundamentals",
        knowledge: [
          {
            id: "ml-1",
            topic: "machine learning",
            title: "Model evaluation",
            content: "Use validation and confusion matrices to measure model quality.",
            source: "local-corpus",
            tags: ["evaluation"],
          },
        ],
      },
      {
        lessons: {
          "0-0": { done: true },
          "0-1": { done: true },
        },
        assignments: { "0": { passed: true } },
      },
    );

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.join(" ").toLowerCase()).toContain("next");
  });

  it("never calls fetch when the local-only RAG fallback is used", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await generateText(
      "Create module 1 of 3 for a course on machine learning at beginner level.",
      "Create module 1 of 3 for a course on machine learning at beginner level. Return only compact JSON.",
      1024,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.toLowerCase()).toContain("machine");

    vi.unstubAllGlobals();
  });
});
