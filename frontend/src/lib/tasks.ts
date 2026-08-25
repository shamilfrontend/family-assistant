export type TaskStatus = "OPEN" | "DONE";
export type TaskRecurrence = "NONE" | "DAILY" | "WEEKLY";

export type Task = {
  id: string;
  title: string;
  assigneeMemberId: string;
  createdByMemberId: string | null;
  dueAt: string;
  status: TaskStatus;
  recurrence: TaskRecurrence;
  seriesId: string;
  completedAt: string | null;
};

export const TASK_RECURRENCE: { value: TaskRecurrence; label: string }[] = [
  { value: "NONE", label: "без повтора" },
  { value: "DAILY", label: "ежедневно" },
  { value: "WEEKLY", label: "еженедельно" },
];

export function taskRecurrenceLabel(value: TaskRecurrence): string {
  return TASK_RECURRENCE.find((item) => item.value === value)?.label ?? value;
}
