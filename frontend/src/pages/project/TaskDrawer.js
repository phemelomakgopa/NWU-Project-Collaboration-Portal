import React, { useState } from 'react';
import { faCheck, faPaperPlane, faPen, faRotateLeft, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastProvider';
import { Avatar, Badge, Button, ConfirmDialog, Field, FormError, Modal, Notice, StatusBadge, Textarea } from '../../components/ui';
import { ROLES, STATUS } from '../../utils/constants';
import { dueLabel, formatDate } from '../../utils/format';
import Documents from './Documents';
import TaskFormModal from './TaskFormModal';
import styles from './Workspace.module.css';

export default function TaskDrawer({ task, data, reload, onClose }) {
  const toast = useToast();
  const { permissions, me, my_role: role } = data;
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isAssignee = task.assignees.some((a) => a.email === me);
  const open = task.status === STATUS.IN_PROGRESS && !permissions.read_only;
  const canReview = permissions.can_review && task.status === STATUS.SUBMITTED;
  const canEdit = permissions.can_manage_tasks && task.status !== STATUS.APPROVED;
  const isManager = role === ROLES.LEADER || role === ROLES.SUPERVISOR;

  const act = async (request, message) => {
    setBusy(true);
    setError('');
    try {
      await request();
      toast.success(message);
      await reload();
      setRejecting(false);
      setNote('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitForReview = () => {
    const run = () => api.post(`/tasks/${task.id}/submit/`);
    if (task.documents.length === 0) {
      setConfirm({
        title: 'Submit without a document?',
        body: 'Reviewers usually need your work attached. You can still submit if this task has nothing to upload.',
        label: 'Submit anyway',
        tone: 'primary',
        run: async () => {
          await run();
          toast.success('Submitted for review.');
          await reload();
        },
      });
      return;
    }
    act(run, 'Submitted for review.');
  };

  return (
    <>
      <Modal title={task.name} variant="drawer" onClose={onClose} busy={busy}>
        <div className={styles.drawerBody}>
          <div className={styles.drawerMeta}>
            <StatusBadge status={task.status} />
            {task.status !== STATUS.APPROVED && <Badge tone="neutral">{dueLabel(task.due_date)}</Badge>}
            <Badge tone={task.priority === 'High' ? 'rose' : 'neutral'}>{task.priority} priority</Badge>
          </div>

          {task.status === STATUS.SUBMITTED && !canReview && isAssignee && (
            <Notice tone="warning" title="Waiting for review">
              A group leader will approve it or send it back with a note.
            </Notice>
          )}
          {task.status === STATUS.APPROVED && (
            <Notice tone="success" title="Approved">
              This task is done and locked.
            </Notice>
          )}

          <section className={styles.drawerSection}>
            <h3 className={styles.drawerHeading}>Description</h3>
            {task.description ? <p className={styles.description}>{task.description}</p> : <p className={styles.muted}>No description.</p>}
            <p className={styles.muted}>Due {formatDate(task.due_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </section>

          <section className={styles.drawerSection}>
            <h3 className={styles.drawerHeading}>Assigned to</h3>
            {task.assignees.length === 0 ? (
              <p className={styles.muted}>Nobody yet.</p>
            ) : (
              <ul className={styles.peopleList}>
                {task.assignees.map((a) => (
                  <li key={a.email}>
                    <Avatar name={a.name} size="sm" />
                    <span>
                      {a.name}
                      {a.email === me && <span className={styles.muted}> (you)</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.drawerSection}>
            <h3 className={styles.drawerHeading}>Work</h3>
            <Documents
              taskId={task.id}
              documents={task.documents}
              canUpload={open && isAssignee}
              canRemove={(doc) => open && (isAssignee || isManager) && (doc.uploaded_by.email === me || isManager)}
              onChange={reload}
              emptyText={isAssignee && open ? 'Upload your work here, then submit the task for review.' : 'No documents uploaded yet.'}
            />
          </section>

          <FormError>{error}</FormError>

          {rejecting && (
            <section className={styles.drawerSection}>
              <Field label="What needs to change?" hint="The assignees see this in their notification.">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus />
              </Field>
            </section>
          )}

          <div className={styles.drawerActions}>
            {open && isAssignee && (
              <Button variant="primary" icon={faPaperPlane} onClick={submitForReview} loading={busy}>
                Submit for review
              </Button>
            )}
            {canReview && !rejecting && (
              <>
                <Button
                  variant="primary"
                  icon={faCheck}
                  loading={busy}
                  onClick={() => act(() => api.post(`/tasks/${task.id}/review/`, { decision: 'approve' }), 'Task approved.')}
                >
                  Approve
                </Button>
                <Button icon={faRotateLeft} onClick={() => setRejecting(true)} disabled={busy}>
                  Request changes
                </Button>
              </>
            )}
            {canReview && rejecting && (
              <>
                <Button
                  variant="primary"
                  loading={busy}
                  disabled={!note.trim()}
                  onClick={() =>
                    act(() => api.post(`/tasks/${task.id}/review/`, { decision: 'reject', note }), 'Sent back with your note.')
                  }
                >
                  Send back
                </Button>
                <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                  Cancel
                </Button>
              </>
            )}
            {canEdit && (
              <span className={styles.drawerSecondary}>
                <Button variant="ghost" icon={faPen} onClick={() => setEditing(true)} disabled={busy}>
                  Edit
                </Button>
                <Button
                  variant="quiet-danger"
                  icon={faTrashCan}
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      title: 'Delete this task?',
                      body: `"${task.name}" and its documents will be deleted. Assigned members will be notified.`,
                      label: 'Delete task',
                      run: async () => {
                        await api.delete(`/tasks/${task.id}/`);
                        toast.success('Task deleted.');
                        onClose();
                        await reload();
                      },
                    })
                  }
                >
                  Delete
                </Button>
              </span>
            )}
          </div>
        </div>
      </Modal>
      {editing && <TaskFormModal data={data} task={task} onClose={() => setEditing(false)} onSaved={reload} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          confirmLabel={confirm.label}
          tone={confirm.tone}
          onConfirm={confirm.run}
          onClose={() => setConfirm(null)}
        >
          <p>{confirm.body}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
