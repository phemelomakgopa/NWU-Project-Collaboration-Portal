import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { faCalendarPlus, faLink, faTrashCan, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastProvider';
import { Button, ConfirmDialog, EmptyState, Field, IconButton, Input, Notice } from '../../components/ui';
import { ROLES, STATUS } from '../../utils/constants';
import { dueLabel, formatDate, formatDateTime } from '../../utils/format';
import MeetingModal from './MeetingModal';
import LinkModal from './LinkModal';
import styles from './Workspace.module.css';

/** The one thing this person should do next in this project. */
function NextStep({ data }) {
  const { project, permissions, tasks, my_role: role, me } = data;
  const base = `/projects/${project.id}`;
  const mine = tasks.filter((t) => t.assignees.some((a) => a.email === me));
  const myOpen = mine.filter((t) => t.status === STATUS.IN_PROGRESS);
  const toReview = tasks.filter((t) => t.status === STATUS.SUBMITTED);
  const allApproved = tasks.length > 0 && tasks.every((t) => t.status === STATUS.APPROVED);

  if (project.status === 'graded') {
    return (
      <Notice tone="success" title={`Graded: ${project.grade}%`}>
        <p className={styles.feedback}>{project.feedback}</p>
      </Notice>
    );
  }
  if (project.status === 'submitted') {
    return role === ROLES.SUPERVISOR ? (
      <Notice tone="info" title="Ready for grading" action={<Link className={styles.noticeLink} to={`${base}/submission`}>Review and grade</Link>}>
        The group leader has handed in the project.
      </Notice>
    ) : (
      <Notice tone="info" title="Handed in">
        The project is with your supervisor for grading. You'll get a notification when it's graded.
      </Notice>
    );
  }
  if (permissions.can_review && toReview.length) {
    return (
      <Notice
        tone="warning"
        title={`${toReview.length} ${toReview.length === 1 ? 'task is' : 'tasks are'} waiting for your review`}
        action={<Link className={styles.noticeLink} to={`${base}/tasks`}>Review tasks</Link>}
      >
        Approve the work or send it back with a note so the team knows what to change.
      </Notice>
    );
  }
  if (myOpen.length) {
    const next = [...myOpen].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    return (
      <Notice
        tone="info"
        title={`Next up: ${next.name}`}
        action={<Link className={styles.noticeLink} to={`${base}/tasks`}>Open my tasks</Link>}
      >
        {dueLabel(next.due_date)}. Upload your work to the task, then submit it for review.
        {myOpen.length > 1 && ` You have ${myOpen.length - 1} more open.`}
      </Notice>
    );
  }
  if (role === ROLES.LEADER && allApproved) {
    return (
      <Notice tone="success" title="Every task is approved" action={<Link className={styles.noticeLink} to={`${base}/submission`}>Hand in the project</Link>}>
        Upload the combined final document and hand it in for grading.
      </Notice>
    );
  }
  if (permissions.can_manage_tasks && tasks.length === 0) {
    return (
      <Notice tone="info" title="Plan the work" action={<Link className={styles.noticeLink} to={`${base}/tasks`}>Add tasks</Link>}>
        Break the project into tasks and assign them so everyone knows what they own.
      </Notice>
    );
  }
  return (
    <Notice tone="info" title="You're up to date">
      {mine.length ? 'Your tasks are submitted. Keep an eye on notifications for reviews.' : 'No tasks are assigned to you right now.'}
    </Notice>
  );
}

function DeleteProject({ project }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  return (
    <section className={styles.dangerZone}>
      <div>
        <h3 className={styles.cardTitle}>Delete project</h3>
        <p className={styles.muted}>Removes all tasks, documents, messages and meetings for everyone. This cannot be undone.</p>
      </div>
      <Button variant="quiet-danger" icon={faTrashCan} onClick={() => setOpen(true)}>
        Delete project
      </Button>
      {open && (
        <ConfirmDialog
          title="Delete this project?"
          confirmLabel="Delete project"
          onClose={() => {
            setOpen(false);
            setTyped('');
          }}
          onConfirm={async () => {
            if (typed !== project.name) throw new Error('Type the project name exactly to confirm.');
            await api.delete(`/projects/${project.id}/`);
            toast.success(`Deleted "${project.name}".`);
            navigate('/dashboard', { replace: true });
          }}
        >
          <p>
            Everything in <strong>{project.name}</strong> will be permanently deleted for all members.
          </p>
          <Field label="Type the project name to confirm">
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" onPaste={(e) => e.preventDefault()} />
          </Field>
        </ConfirmDialog>
      )}
    </section>
  );
}

export default function OverviewTab({ data, reload }) {
  const toast = useToast();
  const { project, permissions } = data;
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const now = Date.now();
  const upcoming = data.meetings.filter((m) => new Date(m.date_time).getTime() >= now);
  const past = data.meetings.filter((m) => new Date(m.date_time).getTime() < now);

  return (
    <div className={styles.overview}>
      <div className={styles.overviewMain}>
        <NextStep data={data} />
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>About this project</h3>
          {project.description ? (
            <p className={styles.description}>{project.description}</p>
          ) : (
            <p className={styles.muted}>No description yet.</p>
          )}
          <dl className={styles.facts}>
            <div>
              <dt>Due</dt>
              <dd>{formatDate(project.due_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(project.created_on)}</dd>
            </div>
            <div>
              <dt>Tasks</dt>
              <dd>
                {data.tasks.filter((t) => t.status === STATUS.APPROVED).length} of {data.tasks.length} approved
              </dd>
            </div>
            <div>
              <dt>Members</dt>
              <dd>{data.members.length}</dd>
            </div>
          </dl>
        </section>
        {permissions.can_delete_project && <DeleteProject project={project} />}
      </div>

      <aside className={styles.overviewSide}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>Meetings</h3>
            {permissions.can_schedule && (
              <Button size="sm" icon={faCalendarPlus} onClick={() => setMeetingOpen(true)}>
                Schedule
              </Button>
            )}
          </div>
          {upcoming.length === 0 ? (
            <p className={styles.muted}>No upcoming meetings.</p>
          ) : (
            <ul className={styles.simpleList}>
              {upcoming.map((m) => (
                <li key={m.id} className={styles.simpleItem}>
                  <div>
                    <p className={styles.itemStrong}>{m.title}</p>
                    <p className={styles.muted}>{formatDateTime(m.date_time)}</p>
                  </div>
                  {permissions.can_schedule && (
                    <IconButton
                      icon={faXmark}
                      label={`Cancel ${m.title}`}
                      onClick={() =>
                        setConfirm({
                          title: 'Cancel this meeting?',
                          body: `"${m.title}" will be removed and members will be notified.`,
                          label: 'Cancel meeting',
                          run: async () => {
                            await api.delete(`/meetings/${m.id}/`);
                            toast.success('Meeting cancelled.');
                            reload();
                          },
                        })
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <details className={styles.details}>
              <summary>Past meetings ({past.length})</summary>
              <ul className={styles.simpleList}>
                {past.map((m) => (
                  <li key={m.id} className={styles.simpleItem}>
                    <div>
                      <p>{m.title}</p>
                      <p className={styles.muted}>{formatDateTime(m.date_time)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>Useful links</h3>
            {permissions.can_schedule && (
              <Button size="sm" icon={faLink} onClick={() => setLinkOpen(true)}>
                Add link
              </Button>
            )}
          </div>
          {data.links.length === 0 ? (
            <EmptyState title="No links yet">
              {permissions.can_schedule ? 'Add the brief, a shared drive or the rubric so everyone can find it.' : 'Your group leader can add useful links here.'}
            </EmptyState>
          ) : (
            <ul className={styles.simpleList}>
              {data.links.map((link) => (
                <li key={link.id} className={styles.simpleItem}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className={styles.linkName}>
                    {link.name}
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                  {permissions.can_schedule && (
                    <IconButton
                      icon={faXmark}
                      label={`Remove ${link.name}`}
                      onClick={() =>
                        setConfirm({
                          title: 'Remove this link?',
                          body: `"${link.name}" will be removed for everyone.`,
                          label: 'Remove link',
                          run: async () => {
                            await api.delete(`/links/${link.id}/`);
                            toast.success('Link removed.');
                            reload();
                          },
                        })
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      {meetingOpen && <MeetingModal projectId={project.id} onClose={() => setMeetingOpen(false)} onSaved={reload} />}
      {linkOpen && <LinkModal projectId={project.id} onClose={() => setLinkOpen(false)} onSaved={reload} />}
      {confirm && (
        <ConfirmDialog title={confirm.title} confirmLabel={confirm.label} onConfirm={confirm.run} onClose={() => setConfirm(null)}>
          <p>{confirm.body}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
