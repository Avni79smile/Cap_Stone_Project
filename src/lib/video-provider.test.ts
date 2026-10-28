import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestLessonVideo } from "./video-provider";

describe("requestLessonVideo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a movie project and polls for the rendered MP4 URL using the JSON2Video API contract", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, project: { id: "project-123" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          movie: {
            status: "done",
            url: "https://example.com/rendered-video.mp4",
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock as typeof fetch);
    vi.stubEnv("JSON2VIDEO_API_KEY", "test-key");
    vi.stubEnv("JSON2VIDEO_API_URL", "https://api.json2video.com/v2/movies");

    const result = await requestLessonVideo("React Fundamentals", [
      {
        heading: "Component basics",
        narration: "Components are reusable building blocks.",
        bullets: ["Build small components", "Reuse them safely"],
        emoji: "⚛️",
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.json2video.com/v2/movies");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "test-key",
      },
    });
    expect(result).toEqual({
      url: "https://example.com/rendered-video.mp4",
      provider: "json2video",
    });
  });
});
