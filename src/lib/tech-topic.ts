export function isNonTechnologyTopicError(error: string, code?: string) {
  return (
    code === "NON_TECH_TOPIC" ||
    /technology (?:courses?|quizzes?) only|technology-related topic|technology course requirement/i.test(
      error,
    )
  );
}
