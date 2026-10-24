import React, { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperclip, faPlus } from '@fortawesome/free-solid-svg-icons';
import { Avatar, Badge, Button, EmptyState, StatusBadge } from '../../components/ui';
import { STATUS } from '../../utils/constants';
import { daysUntil, dueLabel } from '../../utils/format';
import TaskDrawer from './TaskDrawer';
import TaskFormModal from './TaskFormModal';
import styles from './Workspace.module.css';

const GROUPS = [
  { status: STATUS.SUBMITTED, title: 'Awaiting review', empty: null },
  { status: STATUS.IN_PROGRESS, title: 'In progress', empty: 'Nothing in progress.' },
  { status: STATUS.APPROVED, title: 'Approved', empty: null },
];

function DueBadge({ task }) {
  if (task.status === STATUS.APPROVED) return null;
  const days = daysUntil(task.due_date);
  const tone = task.status === STATUS.IN_PROGRESS && days < 0 ? 'rose' : task.status === STATUS.IN_PROGRESS && days <= 2 ? 'amber' : 'neutral';
  return <Badge tone={tone}>{dueLabel(task.due_date)}</Badge>;
}

function TaskRow({ task, me, onOpen }) {
  const mine = task.assignees.some((a) => a.email === me);
  return (
    <li>
      <button className={styles.taskRow} onClick={() => onOpen(task.id)}>
        <span className={styles.taskMain}>
          <span className={styles.taskName}>
            {task.name}
            {mine && <span className={styles.youTag}>You</span>}
          </span>
          {task.description && <span className={styles.taskDesc}>{task.description}</span>}
        </span>
        <span className={styles.taskPeople} aria-label={`Assigned to ${task.assignees.map((a) => a.name).join(', ') || 'nobody'}`}>
          {task.assignees.length === 0 ? (
            <span className={styles.muted}>Unassigned</span>
          ) : (
            task.assignees.slice(0, 3).map((a) => <Avatar key={a.email} name={a.name} size="sm" />)
          )}
          {task.assignees.length > 3 && <span className={styles.muted}>+{task.assignees.length - 3}</span>}
        </span>
        <span className={styles.taskMeta}>
          {task.priority === 'High' && task.status !== STATUS.APPROVED && <Badge tone="rose">High priority</Badge>}
          {task.documents.length > 0 && (
            <span className={styles.docCount} aria-label={`${task.documents.length} documents`}>
              <FontAwesomeIcon icon={faPaperclip} /> {task.documents.length}
            </span>
          )}
          <DueBadge task={task} />
          <StatusBadge status={task.status} />
        </span>
      </button>
    </li>
  );
}

export default function TasksTab({ data, reload }) {
  const { permissions, me } = data;
  const [scope, setScope] = useState(permissions.can_manage_tasks ? 'all' : 'mine');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    const list = scope === 'mine' ? data.tasks.filter((t) => t.assignees.some((a) => a.email === me)) : data.tasks;
    return [...list].sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [data.tasks, scope, me]);

  const openTask = data.tasks.find((t) => t.id === openId);
  const mineCount = data.tasks.filter((t) => t.assignees.some((a) => a.email === me)).length;

  return (
    <div className={styles.tasks}>
      <div className={styles.toolbar}>
        <div className={styles.segmented} role="group" aria-label="Which tasks">
          <button aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>
            Assigned to me ({mineCount})
          </button>
          <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
            Everyone ({data.tasks.length})
          </button>
        </div>
        {permissions.can_manage_tasks && (
          <Button variant="primary" icon={faPlus} onClick={() => setCreating(true)}>
            New task
          </Button>
        )}
      </div>

      {data.tasks.length === 0 ? (
        <div className={styles.card}>
          <EmptyState
            title="No tasks yet"
            action={
              permissions.can_manage_tasks && (
                <Button variant="primary" icon={faPlus} onClick={() => setCreating(true)}>
                  Create the first task
                </Button>
              )
            }
          >
            {permissions.can_manage_tasks
              ? 'Split the project into pieces of work and assign each one to a teammate.'
              : 'Your group leader has not created any tasks yet.'}
          </EmptyState>
        </div>
      ) : visible.length === 0 ? (
        <div className={styles.card}>
          <EmptyState title="Nothing assigned to you">Switch to Everyone to see the rest of the team's tasks.</EmptyState>
        </div>
      ) : (
        GROUPS.map((group) => {
          const tasks = visible.filter((t) => t.status === group.status);
          if (!tasks.length && !group.empty) return null;
          const reviewing = group.status === STATUS.SUBMITTED && permissions.can_review;
          return (
            <section key={group.status} className={`${styles.taskGroup} ${reviewing ? styles.taskGroupReview : ''}`}>
              <h3 className={styles.groupTitle}>
                {reviewing ? 'Waiting for your review' : group.title}
                <span className={styles.groupCount}>{tasks.length}</span>
              </h3>
              {tasks.length === 0 ? (
                <p className={styles.groupEmpty}>{group.empty}</p>
              ) : (
                <ul className={styles.taskList}>
                  {tasks.map((task) => (
                    <TaskRow key={task.id} task={task} me={me} onOpen={setOpenId} />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}

      {openTask && <TaskDrawer task={openTask} data={data} reload={reload} onClose={() => setOpenId(null)} />}
      {creating && <TaskFormModal data={data} onClose={() => setCreating(false)} onSaved={reload} />}
    </div>
  );
}
