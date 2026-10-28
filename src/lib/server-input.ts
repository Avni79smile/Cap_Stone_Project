export function unwrapServerFnInput<T>(input: T | { data: T }): T {
  if (input && typeof input === "object" && "data" in input && Object.keys(input).length === 1) {
    return (input as { data: T }).data;
  }

  return input as T;
}
