import { describe, expect, it } from "vitest";

import { buildOfflineFallbackText } from "@/lib/ai.server";
import { unwrapServerFnInput } from "@/lib/server-input";
import { isLocalDevAuthBypass, LOCAL_DEV_USER_ID } from "@/integrations/supabase/auth-middleware";

describe("server function input compatibility", () => {
  it("unwraps the legacy { data: ... } payload shape", () => {
    const input = { data: { topic: "React hooks", level: "beginner", goal: "job-ready" } };

    expect(unwrapServerFnInput(input)).toEqual({
      topic: "React hooks",
      level: "beginner",
      goal: "job-ready",
    });
  });

  it("keeps plain payload objects unchanged", () => {
    const input = { topic: "React hooks", level: "beginner", goal: "job-ready" };

    expect(unwrapServerFnInput(input)).toEqual(input);
  });

  it("builds a different fallback module for each chapter using the retrieval corpus", () => {
    const moduleOne = buildOfflineFallbackText(
      "Return ONLY compact JSON (no markdown fences) with this shape: {\"title\":\"string\",\"description\":\"string\",\"module\":{\"title\":\"string\",\"lessons\":[{\"title\":\"string\",\"summary\":\"string\",\"scenes\":[{\"heading\":\"string\",\"narration\":\"string\",\"bullets\":[\"string\",\"string\"],\"emoji\":\"string\"}],\"quiz\":[{\"question\":\"string\",\"options\":[\"string\",\"string\",\"string\",\"string\"],\"answer\":0,\"explanation\":\"string\"}]}]},\"leetcode\":[\"string\",\"string\",\"string\"]}",
      "Create module 1 of 3 for a course on machine learning at beginner level. Learner goal: build a real project. Retrieve the local course knowledge and generate the module.",
    );
    const moduleTwo = buildOfflineFallbackText(
      "Return ONLY compact JSON (no markdown fences) with this shape: {\"title\":\"string\",\"description\":\"string\",\"module\":{\"title\":\"string\",\"lessons\":[{\"title\":\"string\",\"summary\":\"string\",\"scenes\":[{\"heading\":\"string\",\"narration\":\"string\",\"bullets\":[\"string\",\"string\"],\"emoji\":\"string\"}],\"quiz\":[{\"question\":\"string\",\"options\":[\"string\",\"string\",\"string\",\"string\"],\"answer\":0,\"explanation\":\"string\"}]}]},\"leetcode\":[\"string\",\"string\",\"string\"]}",
      "Create module 2 of 3 for a course on machine learning at beginner level. Learner goal: build a real project. Retrieve the local course knowledge and generate the module.",
    );

    const moduleOneData = JSON.parse(moduleOne.slice(moduleOne.indexOf("{"), moduleOne.lastIndexOf("}") + 1));
    const moduleTwoData = JSON.parse(moduleTwo.slice(moduleTwo.indexOf("{"), moduleTwo.lastIndexOf("}") + 1));

    expect(moduleOneData.module.lessons[0].title).not.toEqual(moduleTwoData.module.lessons[0].title);
    expect(moduleOneData.module.lessons[1].title).not.toEqual(moduleTwoData.module.lessons[1].title);
    expect(moduleOneData.module.lessons[0].scenes[0].heading).not.toEqual(moduleTwoData.module.lessons[0].scenes[0].heading);
  });

  it("keeps the fallback module content anchored to the requested topic instead of reusing a generic chapter template", () => {
    const module = buildOfflineFallbackText(
      "Return ONLY compact JSON (no markdown fences) with this shape: {\"title\":\"string\",\"description\":\"string\",\"module\":{\"title\":\"string\",\"lessons\":[{\"title\":\"string\",\"summary\":\"string\",\"scenes\":[{\"heading\":\"string\",\"narration\":\"string\",\"bullets\":[\"string\",\"string\"],\"emoji\":\"string\"}],\"quiz\":[{\"question\":\"string\",\"options\":[\"string\",\"string\",\"string\",\"string\"],\"answer\":0,\"explanation\":\"string\"}]}]},\"leetcode\":[\"string\",\"string\",\"string\"]}",
      "Create module 3 of 4 for a course on React hooks at beginner level. Learner goal: build a real UI. Retrieve the local course knowledge and generate the module.",
    );

    const parsed = JSON.parse(module.slice(module.indexOf("{"), module.lastIndexOf("}") + 1));
    const text = JSON.stringify(parsed).toLowerCase();

    expect(text).toContain("react");
    expect(text).toContain("hook");
    expect(parsed.module.title).not.toContain("overview");
    expect(parsed.module.lessons[0].summary.toLowerCase()).not.toContain("we need to learn");
    expect(parsed.module.lessons[0].scenes[0].narration.toLowerCase()).toContain("react");
  });

  it("avoids generic pattern text in fallback lesson narration and scene headings", () => {
    const module = buildOfflineFallbackText(
      "Return ONLY compact JSON (no markdown fences) with this shape: {\"title\":\"string\",\"description\":\"string\",\"module\":{\"title\":\"string\",\"lessons\":[{\"title\":\"string\",\"summary\":\"string\",\"scenes\":[{\"heading\":\"string\",\"narration\":\"string\",\"bullets\":[\"string\",\"string\"],\"emoji\":\"string\"}],\"quiz\":[{\"question\":\"string\",\"options\":[\"string\",\"string\",\"string\",\"string\"],\"answer\":0,\"explanation\":\"string\"}]}]},\"leetcode\":[\"string\",\"string\",\"string\"]}",
      "Create module 1 of 4 for a course on React hooks at beginner level. Learner goal: build a real UI. Retrieve the local course knowledge and generate the module.",
    );

    const parsed = JSON.parse(module.slice(module.indexOf("{"), module.lastIndexOf("}") + 1));
    const fullText = JSON.stringify(parsed).toLowerCase();

    expect(fullText).toContain("react");
    expect(fullText).not.toContain("this is a real time");
    expect(fullText).not.toContain("workflow set up");
    expect(parsed.module.lessons[0].scenes[0].heading).not.toContain("overview");
    expect(parsed.module.lessons[0].summary.toLowerCase()).toContain("react");
  });

  it("treats the local-dev auth token as a valid bypass for server-side function access", () => {
    const headers = new Headers({ Authorization: "Bearer local-dev-user" });
    expect(isLocalDevAuthBypass(headers)).toBe(true);
    expect(isLocalDevAuthBypass(new Headers({ Authorization: "Bearer real-token" }))).toBe(false);
    expect(LOCAL_DEV_USER_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
