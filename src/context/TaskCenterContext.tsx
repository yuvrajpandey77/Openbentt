import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

/**
 * Phase 9 — one global background-task surface (model downloads, Ollama
 * setup, connector sync, exports, document processing). Real state only:
 * tasks are created/updated from actual provider events, never simulated.
 */

export type TaskState = "running" | "done" | "failed" | "cancelled";
export type TaskKind = "model-download" | "ollama-setup" | "sync" | "export" | "processing";

export interface Task {
  id: string;
  kind: TaskKind;
  title: string;
  detail: string | null;
  percent: number | null;
  state: TaskState;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  onCancel?: () => void;
  onRetry?: () => void;
  onOpen?: () => void;
}

interface TaskCenterContextValue {
  tasks: Task[];
  activeTasks: Task[];
  upsertTask: (task: Omit<Task, "createdAt" | "updatedAt"> & Partial<Pick<Task, "createdAt">>) => void;
  removeTask: (id: string) => void;
  dismissFinished: () => void;
}

const TaskCenterContext = createContext<TaskCenterContextValue>({
  tasks: [],
  activeTasks: [],
  upsertTask: () => {},
  removeTask: () => {},
  dismissFinished: () => {},
});

let taskSeq = 0;

export function TaskCenterProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;

  const upsertTask = useCallback<TaskCenterContextValue["upsertTask"]>((incoming) => {
    const now = Date.now();
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === incoming.id);
      if (idx === -1) {
        void taskSeq;
        const task: Task = {
          ...incoming,
          createdAt: incoming.createdAt ?? now,
          updatedAt: now,
        };
        return [...prev.slice(-9), task];
      }
      const next = prev.slice();
      next[idx] = { ...next[idx], ...incoming, updatedAt: now };
      return next;
    });
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissFinished = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.state === "running"));
  }, []);

  const value = useMemo<TaskCenterContextValue>(
    () => ({
      tasks,
      activeTasks: tasks.filter((t) => t.state === "running"),
      upsertTask,
      removeTask,
      dismissFinished,
    }),
    [tasks, upsertTask, removeTask, dismissFinished]
  );

  return <TaskCenterContext.Provider value={value}>{children}</TaskCenterContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTaskCenter(): TaskCenterContextValue {
  return useContext(TaskCenterContext);
}

// eslint-disable-next-line react-refresh/only-export-components
export function nextTaskId(prefix: string): string {
  taskSeq += 1;
  return `${prefix}-${Date.now()}-${taskSeq}`;
}
