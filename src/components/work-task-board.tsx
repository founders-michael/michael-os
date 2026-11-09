"use client";

import Link from "next/link";
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import { PointerSensor, PointerActivationConstraints } from "@dnd-kit/dom";
import { GripVertical } from "lucide-react";
import { getWorkTaskDrop, statusFromWorkTaskDropId, workTaskBoardDropId, workTaskBoardStatuses, type WorkTaskBoardStatus } from "@/lib/work-task-board-dnd";

export type BoardTask = {
  id: string;
  title: string;
  status: WorkTaskBoardStatus;
  dueDate: string | null;
  archivedAt: string | null;
  project: { name: string } | null;
  team: { name: string } | null;
  permissions?: { canManage?: boolean; canUpdateOwnStatus?: boolean };
};
const labels: Record<WorkTaskBoardStatus, string> = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", BLOCKED: "Blocked", DONE: "Done" };

export function WorkTaskBoard<T extends BoardTask>({ organizationId, tasks, busyIds, onMove, onChooseStatus, dateLabel }: {
  organizationId: string;
  tasks: T[];
  busyIds: ReadonlySet<string>;
  onMove: (task: T, status: WorkTaskBoardStatus) => void;
  onChooseStatus: (task: T, status: WorkTaskBoardStatus) => void;
  dateLabel: (date: string | null) => string;
}) {
  return <DragDropProvider
    sensors={(defaults) => defaults.map((sensor) => sensor === PointerSensor
      ? PointerSensor.configure({ activationConstraints: (event) => event.pointerType === "touch"
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
        : [new PointerActivationConstraints.Distance({ value: 6 })] })
      : sensor)}
    onDragEnd={(event) => {
      const id = event.operation.source?.id;
      const droppedStatus = statusFromWorkTaskDropId(event.operation.target?.id);
      const targetStatus = droppedStatus ? getWorkTaskDrop(droppedStatus, event.canceled) : null;
      if (typeof id !== "string" || !targetStatus) return;
      const task = tasks.find((candidate) => candidate.id === id);
      if (!task || task.status === targetStatus || task.archivedAt || busyIds.has(task.id)) return;
      if (!task.permissions?.canManage && !task.permissions?.canUpdateOwnStatus) return;
      onMove(task, targetStatus);
    }}>
    <div className="work-task-board" aria-label="Work task board">
      {workTaskBoardStatuses.map((status) => <WorkTaskBoardColumn key={status} status={status} tasks={tasks.filter((task) => task.status === status)} busyIds={busyIds} organizationId={organizationId} dateLabel={dateLabel} onChooseStatus={onChooseStatus} />)}
    </div>
  </DragDropProvider>;
}

function WorkTaskBoardColumn<T extends BoardTask>({ status, tasks, busyIds, organizationId, dateLabel, onChooseStatus }: {
  status: WorkTaskBoardStatus;
  tasks: T[];
  busyIds: ReadonlySet<string>;
  organizationId: string;
  dateLabel: (date: string | null) => string;
  onChooseStatus: (task: T, status: WorkTaskBoardStatus) => void;
}) {
  const { ref, isDropTarget } = useDroppable({ id: workTaskBoardDropId(status) });
  return <section ref={ref} className={`work-task-board-column${isDropTarget ? " work-task-board-column-over" : ""}`} aria-label={`${labels[status]} tasks`}>
    <h3>{labels[status]} <span aria-label={`${tasks.length} tasks`}>{tasks.length}</span></h3>
    {tasks.length === 0 ? <p className="work-task-board-empty">Drop a task here</p> : tasks.map((task) => <WorkTaskBoardCard key={task.id} task={task} busy={busyIds.has(task.id)} organizationId={organizationId} dateLabel={dateLabel} onChooseStatus={onChooseStatus} />)}
  </section>;
}

function WorkTaskBoardCard<T extends BoardTask>({ task, busy, organizationId, dateLabel, onChooseStatus }: {
  task: T;
  busy: boolean;
  organizationId: string;
  dateLabel: (date: string | null) => string;
  onChooseStatus: (task: T, status: WorkTaskBoardStatus) => void;
}) {
  const canMove = !task.archivedAt && Boolean(task.permissions?.canManage || task.permissions?.canUpdateOwnStatus);
  const { ref, handleRef, isDragging } = useDraggable({ id: task.id, disabled: !canMove || busy });
  return <article ref={ref} className={`work-task-board-card${isDragging ? " work-task-board-card-dragging" : ""}`}>
    <div className="work-task-board-card-heading">
      <button ref={handleRef} type="button" className="work-task-drag-handle" aria-label={`Drag ${task.title} to another status`} aria-describedby={`work-task-drag-help-${task.id}`} disabled={!canMove || busy}><GripVertical size={17} /></button>
      <Link href={`/work/${organizationId}/tasks/${task.id}`}><strong>{task.title}</strong></Link>
    </div>
    <span id={`work-task-drag-help-${task.id}`} className="sr-only">Use Space or Enter to pick up, arrow keys to move between status columns, then Space or Enter to drop. Escape cancels.</span>
    <p>{task.project?.name ?? task.team?.name ?? "Organization task"}</p>
    <small>{task.dueDate ? `Due ${dateLabel(task.dueDate)}` : "No due date"}</small>
    <label className="sr-only" htmlFor={`task-status-${task.id}`}>Change status for {task.title}</label>
    <select id={`task-status-${task.id}`} aria-label={`Change status for ${task.title}`} value={task.status} disabled={!canMove || busy} onChange={(event) => onChooseStatus(task, event.target.value as WorkTaskBoardStatus)}>{workTaskBoardStatuses.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select>
  </article>;
}
