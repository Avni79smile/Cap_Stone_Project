import { describe, expect, it } from "vitest";
import { buildCoursePlan } from "../lib/course.functions";

describe("buildCoursePlan", () => {
  it("creates more than three modules for a real topic-specific learning path", () => {
    const plan = buildCoursePlan(
      "react hooks",
      "Build an interview-ready dashboard with reusable state patterns",
      "intermediate",
    );

    expect(plan.moduleCount).toBeGreaterThan(3);
    expect(plan.moduleCount).toBeLessThanOrEqual(6);
    expect(plan.moduleTitles.length).toBe(plan.moduleCount);
    expect(plan.moduleTitles.every((title) => title.length > 0)).toBe(true);
  });
});
