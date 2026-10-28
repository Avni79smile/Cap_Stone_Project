import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LOCAL_DEV_USER_ID } from "@/integrations/supabase/auth-middleware";
import type { CourseContent, Progress } from "./course-types";

export type CourseRow = {
  id: string; topic: string; level: string; title: string; created_at: string; completed_at: string | null;
  content: CourseContent; progress: Progress;
};

const LOCAL_COURSES_KEY = "pathway-local-courses";

function hasLocalDevBypass() {
  return (
    typeof window !== "undefined" &&
    (window.localStorage.getItem("allowLocalDevAuth") === "1" ||
      (process.env["NODE_ENV"] !== "production" &&
        (process.env["ALLOW_LOCAL_DEV_AUTH"] === "true" || process.env["VITE_ALLOW_LOCAL_DEV_AUTH"] === "true"))))
  );
}

function getLocalCourses(): CourseRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_COURSES_KEY);
    return raw ? (JSON.parse(raw) as CourseRow[]) : [];
  } catch {
    return [];
  }
}

function setLocalCourses(courses: CourseRow[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_COURSES_KEY, JSON.stringify(courses));
}

export function upsertLocalCourse(course: CourseRow) {
  const courses = getLocalCourses();
  const next = [course, ...courses.filter((c) => c.id !== course.id)];
  setLocalCourses(next);
}

export const coursesQuery = queryOptions({
  queryKey: ["courses"],
  queryFn: async () => {
    if (hasLocalDevBypass()) {
      return getLocalCourses();
    }
    const { data, error } = await supabase.from("courses").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as CourseRow[];
  },
});

export const courseQuery = (id: string) =>
  queryOptions({
    queryKey: ["course", id],
    queryFn: async () => {
      if (hasLocalDevBypass()) {
        const local = getLocalCourses().find((course) => course.id === id);
        if (local) return local;
        return { id, topic: "Local-only", level: "beginner", title: "Course not yet available", created_at: new Date().toISOString(), completed_at: null, content: { title: "Course not yet available", description: "", modules: [], assessment: { title: "", difficulty: "beginner", description: "", functionName: "", starterCode: "", examples: [], tests: [] } }, progress: {} } as CourseRow;
      }
      const { data, error } = await supabase.from("courses").select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as CourseRow;
    },
  });

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id ?? LOCAL_DEV_USER_ID;
    if (hasLocalDevBypass()) {
      return { email: u.user?.email ?? "", display_name: "Learner", avatar: "a1", id: userId };
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    return { email: u.user?.email ?? "", display_name: data?.display_name ?? "Learner", avatar: data?.avatar ?? "a1", id: userId };
  },
});

export async function saveProgress(id: string, progress: Progress, completed: boolean) {
  if (hasLocalDevBypass()) {
    const courses = getLocalCourses();
    const idx = courses.findIndex((course) => course.id === id);
    if (idx >= 0) {
      courses[idx] = { ...courses[idx], progress, completed_at: completed ? new Date().toISOString() : null };
      setLocalCourses(courses);
      return;
    }
  }
  const { error } = await supabase
    .from("courses")
    .update({ progress: progress as never, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}
