export type TaskStatus = "inbox" | "planned" | "doing" | "waiting" | "done";

export const TASK_STATUSES: TaskStatus[] = ["inbox", "planned", "doing", "waiting", "done"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: "Inbox",
  planned: "Planned",
  doing: "Doing",
  waiting: "Waiting",
  done: "Done",
};

export type GoalStatus = "active" | "paused" | "done" | "dropped";
export type ProjectStatus = "planned" | "active" | "paused" | "done";
export type NoteKind = "quick" | "daily" | "meeting" | "project" | "template";

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  quick: "Quick note",
  daily: "Daily note",
  meeting: "Meeting",
  project: "Project note",
  template: "Template",
};

export interface Area {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Vision {
  id: string;
  title: string;
  description: string | null;
  horizon: string | null;
  position: number;
  archived: number;
  created_at: string;
}

export interface Goal {
  id: string;
  vision_id: string | null;
  area_id: string | null;
  title: string;
  description: string | null;
  metric: string | null;
  start_date: string | null;
  target_date: string | null;
  status: GoalStatus;
  position: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface GoalView extends Goal {
  vision_title: string | null;
  area_name: string | null;
  area_color: string | null;
  task_total: number;
  task_done: number;
  project_total: number;
  minutes_logged: number;
}

export interface Strategy {
  id: string;
  goal_id: string | null;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  position: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  strategy_id: string | null;
  goal_id: string | null;
  area_id: string | null;
  title: string;
  description: string | null;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  color: string;
  position: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectView extends Project {
  goal_title: string | null;
  strategy_title: string | null;
  task_total: number;
  task_done: number;
  last_activity: string | null;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  date: string | null;
  done: number;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  short_term_outcome: string | null;
  long_term_contribution: string | null;
  next_action: string | null;
  goal_id: string | null;
  project_id: string | null;
  area_id: string | null;
  parent_id: string | null;
  status: TaskStatus;
  important: number;
  urgent: number;
  estimate_minutes: number | null;
  due_date: string | null;
  scheduled_date: string | null;
  start_min: number | null;
  end_min: number | null;
  waiting_on: string | null;
  recurrence: string | null;
  recurrence_until: string | null;
  series_id: string | null;
  completed_at: string | null;
  postponed_count: number;
  archived: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TaskView extends Task {
  project_title: string | null;
  project_color: string | null;
  effective_goal_id: string | null;
  goal_title: string | null;
  area_name: string | null;
  area_color: string | null;
  subtask_total: number;
  subtask_done: number;
  blocked_by: number;
  is_focus: number;
  tags: Tag[];
}

export interface Note {
  id: string;
  title: string;
  content: string;
  kind: NoteKind;
  date: string | null;
  project_id: string | null;
  goal_id: string | null;
  task_id: string | null;
  pinned: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface NoteView extends Note {
  project_title: string | null;
  goal_title: string | null;
  tags: Tag[];
}

export interface TaskEvent {
  id: string;
  task_id: string;
  kind: string;
  detail: string | null;
  created_at: string;
}

export interface TimeLog {
  id: string;
  task_id: string;
  date: string;
  minutes: number;
  note: string | null;
  created_at: string;
}

export interface Reflection {
  id: string;
  task_id: string;
  met_expectation: string | null;
  contributed: string | null;
  next_step: string | null;
  created_at: string;
}

export interface Settings {
  day_start_min: number;
  day_end_min: number;
  daily_capacity_min: number;
  week_starts_on: number;
}

export interface ReviewRecord {
  id: string;
  kind: "daily" | "weekly" | "monthly";
  period_key: string;
  data: Record<string, string>;
  created_at: string;
  updated_at: string;
}
