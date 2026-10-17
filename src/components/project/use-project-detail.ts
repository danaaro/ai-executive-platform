"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProjectDetail } from "@/components/board/stage-types";

/** Loads one role (project) with its derived stages; `reload` after changes. */
export function useProjectDetail(projectId: string) {
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not load this role");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this role");
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}
