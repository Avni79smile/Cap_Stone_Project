import type { Scene } from "@/lib/course-types";

export type ExternalLessonVideo = {
  url: string;
  provider: "magic-hour" | "json2video";
};

function readConfigValue(...names: string[]) {
  for (const name of names) {
    const value = (typeof window !== "undefined"
      ? (import.meta.env?.[name] as string | undefined)
      : undefined) ?? process.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function buildUniqueLessonPrompt(title: string, scenes: Scene[]) {
  const headline = scenes[0]?.heading ?? title;
  const script = scenes
    .map((scene) => `${scene.heading}: ${scene.narration}`)
    .join(" ")
    .slice(0, 2000);

  return [
    "Create a polished Udemy-style educational explainer video.",
    `Topic: ${title}.`,
    `Primary concept: ${headline}.`,
    `Narration script: ${script}`,
    "Explain the concept in plain language, with concrete examples, short teaching moments, and practical takeaways. Use a confident teacher voice, clean motion graphics, and scenes that teach the concept itself rather than repeating meta commentary or generic 'workflow setup' language.",
    "The video should sound like a real instructor teaching a specific technical concept, not filler text, not boilerplate slides, not repeated phrases.",
  ].join(" ");
}

function buildJson2VideoScenes(scenes: Scene[]) {
  return scenes.map((scene) => {
    const narrationText = scene.narration.trim();
    const duration = Math.min(10, Math.max(4, Math.ceil((narrationText.split(/\s+/).length || 1) / 18)));

    return {
      duration,
      elements: [
        { type: "text", text: scene.heading, style: "001" },
        {
          type: "text",
          text: narrationText.slice(0, 220),
          style: "002",
          x: 0.08,
          y: 0.72,
        },
      ],
    };
  });
}

async function tryMagicHourVideo(prompt: string, apiKey: string): Promise<ExternalLessonVideo | null> {
  const endpoints = [
    "https://api.magichour.ai/v1/text-to-video",
    "https://api.magichour.ai/v1/video/text-to-video",
    "https://magichour.ai/api/v1/text-to-video",
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          prompt,
          duration: 18,
          resolution: "720p",
          aspect_ratio: "16:9",
          model: "gen3",
          wait_for_completion: true,
          output_format: "mp4",
        }),
      });

      if (!response.ok) continue;

      const data = (await response.json()) as {
        url?: string;
        video_url?: string;
        output?: { url?: string };
        result?: { url?: string };
        data?: { url?: string };
        video?: { url?: string };
        id?: string;
      };

      const mediaUrl =
        data.url ??
        data.video_url ??
        data.output?.url ??
        data.result?.url ??
        data.data?.url ??
        data.video?.url ??
        "";

      if (mediaUrl) return { url: mediaUrl, provider: "magic-hour" };
    } catch {
      // fall through to the next candidate endpoint
    }
  }

  return null;
}

async function tryJson2Video(title: string, scenes: Scene[], apiKey: string, rawApiUrl: string): Promise<ExternalLessonVideo | null> {
  if (!apiKey || !rawApiUrl) return null;

  const movieEndpoint = rawApiUrl.includes("/v2/movies") ? rawApiUrl : `${rawApiUrl.replace(/\/+$/, "")}/v2/movies`;

  try {
    const createResponse = await fetch(movieEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        resolution: "full-hd",
        title,
        scenes: buildJson2VideoScenes(scenes),
      }),
    });

    const createData = (await createResponse.json()) as {
      success?: boolean;
      project?: { id?: string; status?: string };
      movie?: { status?: string; url?: string };
    };

    const projectId = createData.project?.id;
    if (!createResponse.ok || !createData.success || !projectId) return null;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const pollResponse = await fetch(`${movieEndpoint}?project=${encodeURIComponent(projectId)}`, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
        },
      });

      const pollData = (await pollResponse.json()) as {
        success?: boolean;
        movie?: { status?: string; url?: string };
      };

      const movie = pollData.movie;
      if (movie?.status === "done" && movie.url) {
        return { url: movie.url, provider: "json2video" };
      }

      if (movie?.status === "error") {
        return null;
      }
    }
  } catch {
    // fall through to null
  }

  return null;
}

export async function requestLessonVideo(
  title: string,
  scenes: Scene[],
): Promise<ExternalLessonVideo | null> {
  const magicHourKey = readConfigValue("MAGIC_HOUR_API_KEY", "VITE_MAGIC_HOUR_API_KEY", "MAGIC_HOUR_KEY");
  const json2videoKey = readConfigValue("JSON2VIDEO_API_KEY", "VITE_JSON2VIDEO_API_KEY");
  const json2videoUrl = readConfigValue("JSON2VIDEO_API_URL", "VITE_JSON2VIDEO_API_URL");

  const prompt = buildUniqueLessonPrompt(title, scenes);

  if (magicHourKey) {
    const video = await tryMagicHourVideo(prompt, magicHourKey);
    if (video) return video;
  }

  if (json2videoKey && json2videoUrl) {
    const video = await tryJson2Video(title, scenes, json2videoKey, json2videoUrl);
    if (video) return video;
  }

  return null;
}
