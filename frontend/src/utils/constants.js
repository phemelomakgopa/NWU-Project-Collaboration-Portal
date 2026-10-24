export const ROLES = {
  SUPERVISOR: 'Supervisor',
  LEADER: 'Group Leader',
  STUDENT: 'Student',
};

export const ROLE_OPTIONS = [ROLES.STUDENT, ROLES.LEADER, ROLES.SUPERVISOR];

export const ROLE_HINTS = {
  [ROLES.STUDENT]: 'Works on assigned tasks and uploads their work.',
  [ROLES.LEADER]: 'Creates tasks, reviews work and hands in the project.',
  [ROLES.SUPERVISOR]: 'Manages members and grades the final submission.',
};

// Stored task statuses and the words people see.
export const STATUS = {
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Completed',
  APPROVED: 'Finalized',
};

export const STATUS_LABELS = {
  [STATUS.IN_PROGRESS]: 'In progress',
  [STATUS.SUBMITTED]: 'Awaiting review',
  [STATUS.APPROVED]: 'Approved',
};

export const PRIORITIES = ['Low', 'Medium', 'High'];

export const ACCEPTED_FILES =
  '.pdf,.doc,.docx,.odt,.rtf,.txt,.md,.ppt,.pptx,.odp,.xls,.xlsx,.ods,.csv,.png,.jpg,.jpeg,.gif,.zip';

export const MAX_UPLOAD_MB = 20;
