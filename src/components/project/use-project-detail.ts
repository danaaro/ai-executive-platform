"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectDetail } from "@/components/board/stage-types";

/**
 * Loads one role (project) with its derived stages; `reload` after changes.
 *
 * Next.js keeps the page mounted when the URL moves from one role to another,
 * so a response is only applied while its role is still the one on screen,
 * and switching roles clears the previous role first (spec §5 test 5).
 */
export function useProjectDetail(projectId: string) {
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(projectId);
  current.current = projectId;

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const d = await res.json();
      if (current.current !== projectId) return;
      if (!res.ok) throw new Error(d.error ?? "Could not load this role");
      setData(d);
    } catch (e) {
      if (current.current !== projectId) return;
      setError(e instanceof Error ? e.message : "Could not load this role");
    }
  }, [projectId]);

  useEffect(() => {
    setData(null);
    setError(null);
    void reload();
  }, [reload]);

  return { data, error, reload };
}
