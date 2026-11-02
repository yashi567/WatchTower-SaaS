import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
export interface Result<T> {
  data: T;
  meta?: { page: number; pageSize: number; total?: number; unread?: number };
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
  workspace?: string,
): Promise<Result<T>> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(workspace ? { "X-Workspace-Id": workspace } : {}),
      ...options.headers,
    },
  });
  const result = (await response.json()) as Result<T> & {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new ApiError(
      result.error?.message ?? "Request failed",
      response.status,
    );
  return result;
}
export function useApi<T>(
  endpoint: string,
  demo: boolean,
  workspace?: string,
  enabled = true,
) {
  return useQuery<Result<T>>({
    queryKey: [demo ? "demo" : workspace, endpoint],
    queryFn: () =>
      request<T>(`/api${demo ? "/demo" : ""}${endpoint}`, {}, workspace),
    enabled: enabled && (demo || !!workspace),
    refetchInterval: 60000,
    retry: (count, error) =>
      error instanceof ApiError && [401, 403, 404, 503].includes(error.status)
        ? false
        : count < 1,
  });
}
export function useAction(demo: boolean, workspace?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      path,
      method = "POST",
      body = {},
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) => {
      if (demo)
        throw new ApiError(
          "This demo is read-only. Sign in to create your own workspace.",
          403,
        );
      return request<unknown>(
        `/api${path}`,
        { method, body: JSON.stringify(body) },
        workspace,
      );
    },
    onSuccess: () => {
      void client.invalidateQueries();
      toast.success("Changes saved");
    },
    onError: (error) => toast.error(error.message),
  });
}
