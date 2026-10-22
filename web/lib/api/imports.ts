"use client";

import type { components } from "@tekpas/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query-keys";
import { unwrap } from "./request";

export type ImportResponse = components["schemas"]["ImportResponse"];
export type ImportRowError = components["schemas"]["ImportRowError"];

/** An import is read in the background; the page asks again until it is DONE or FAILED. */
const RUNNING_POLL_MS = 1500;

export function isRunning(job: Pick<ImportResponse, "status">): boolean {
  return job.status === "QUEUED" || job.status === "RUNNING";
}

/** The company's latest imports, newest first (design v1.1 156); polled while one runs. */
export function useImports() {
  return useQuery({
    queryKey: queryKeys.imports.list,
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/imports", { signal })),
    refetchInterval: (query) => (query.state.data?.some(isRunning) ? RUNNING_POLL_MS : false),
  });
}

/** One import with its row errors; polled until it ends, then the product list is fetched again. */
export function useImport(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.imports.detail(id ?? ""),
    queryFn: async ({ signal }) => {
      const job = await unwrap(api.GET("/api/v1/imports/{id}", { params: { path: { id: id! } }, signal }));
      if (!isRunning(job)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.imports.list });
        if (job.createdRows > 0) void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      }
      return job;
    },
    enabled: !!id,
    refetchInterval: (query) => (query.state.data && isRunning(query.state.data) ? RUNNING_POLL_MS : false),
  });
}

/** Uploads a filled template; 400 with a file error (FileSize, FileType, FileMacro, FileUnsafe) before anything is queued. */
export function useStartImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      unwrap(
        api.POST("/api/v1/imports", {
          params: { query: { kind: "products" } },
          // The generated type says "binary string"; the browser sends the File itself as multipart.
          body: { file: file as unknown as string },
          bodySerializer: (body) => {
            const form = new FormData();
            form.append("file", body!.file as unknown as Blob);
            return form;
          },
        }),
      ),
    onSuccess: (job) => {
      queryClient.setQueryData(queryKeys.imports.detail(job.id), job);
      void queryClient.invalidateQueries({ queryKey: queryKeys.imports.list });
    },
  });
}

/** The template in the panel's language, saved under the server's name for it. */
export async function downloadTemplate(language: string): Promise<void> {
  const blob = await unwrap<Blob>(
    api.GET("/api/v1/imports/template", { params: { query: { kind: "products", lang: language } }, parseAs: "blob" }) as never,
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kozapass-products.xlsx";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
