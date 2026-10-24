import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastProvider';
import { Avatar, Button, EmptyState, Spinner } from '../../components/ui';
import { ROLES } from '../../utils/constants';
import { formatTime, toDayKey, todayKey, addDays, formatDate } from '../../utils/format';
import styles from './Workspace.module.css';

const POLL_MS = 5000;

function dayLabel(key) {
  const today = todayKey();
  if (key === today) return 'Today';
  if (key === toDayKey(addDays(new Date(), -1))) return 'Yesterday';
  return formatDate(key, { weekday: 'long', day: 'numeric', month: 'long' });
}

const ROLE_CLASS = {
  [ROLES.SUPERVISOR]: styles.roleSupervisor,
  [ROLES.LEADER]: styles.roleLeader,
};

export default function ChatTab({ data }) {
  const toast = useToast();
  const projectId = data.project.id;
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const lastId = useRef(0);
  const stickToBottom = useRef(true);

  const fetchMessages = useCallback(async () => {
    try {
      const params = lastId.current ? { after: lastId.current } : {};
      const { data: response } = await api.get(`/projects/${projectId}/chat/`, { params });
      const incoming = response.messages;
      if (incoming.length) lastId.current = incoming[incoming.length - 1].id;
      setMessages((current) => {
        const base = current || [];
        const known = new Set(base.map((m) => m.id));
        return [...base, ...incoming.filter((m) => !known.has(m.id))];
      });
    } catch (err) {
      setMessages((current) => current || []);
    }
  }, [projectId]);

  useEffect(() => {
    lastId.current = 0;
    setMessages(null);
    fetchMessages();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchMessages();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchMessages]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const list = listRef.current;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  };

  const send = async (event) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const { data: message } = await api.post(`/projects/${projectId}/chat/`, { content });
      stickToBottom.current = true;
      lastId.current = Math.max(lastId.current, message.id);
      setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]));
      setDraft('');
    } catch (err) {
      toast.error(errorMessage(err, 'Your message was not sent. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  if (messages === null) return <Spinner label="Loading messages" />;

  let previousDay = null;

  return (
    <div className={styles.chat}>
      <div className={styles.chatLog} ref={listRef} onScroll={onScroll} aria-live="polite" aria-label="Messages">
        {messages.length === 0 ? (
          <EmptyState title="No messages yet">
            Use this space to agree on plans and ask questions. Everyone in the project, including your supervisor, can read it.
          </EmptyState>
        ) : (
          messages.map((message) => {
            const day = toDayKey(new Date(message.sent_at));
            const separator = day !== previousDay ? (
              <div key={`day-${day}`} className={styles.chatDay}>
                <span>{dayLabel(day)}</span>
              </div>
            ) : null;
            previousDay = day;
            const own = message.sender.email === data.me;
            return (
              <React.Fragment key={message.id}>
                {separator}
                <div className={`${styles.message} ${own ? styles.messageOwn : ''}`}>
                  {!own && <Avatar name={message.sender.name} size="sm" />}
                  <div className={styles.messageBody}>
                    <div className={styles.messageHead}>
                      {!own && <span className={styles.messageName}>{message.sender.name}</span>}
                      {!own && message.role && <span className={`${styles.messageRole} ${ROLE_CLASS[message.role] || ''}`}>{message.role}</span>}
                      <time className={styles.messageTime} dateTime={message.sent_at}>
                        {formatTime(message.sent_at)}
                      </time>
                    </div>
                    <p className={styles.bubble}>{message.content}</p>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>

      {data.permissions.can_chat ? (
        <form className={styles.composer} onSubmit={send}>
          <label htmlFor="chat-input" className="visually-hidden">
            Message
          </label>
          <textarea
            id="chat-input"
            className={styles.composerInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) send(e);
            }}
            placeholder="Write a message. Press Enter to send, Shift+Enter for a new line."
            rows={2}
            maxLength={2000}
          />
          <Button type="submit" variant="primary" icon={faPaperPlane} loading={sending} disabled={!draft.trim()}>
            Send
          </Button>
        </form>
      ) : (
        <p className={styles.chatClosed}>The discussion is closed because the project has been graded.</p>
      )}
    </div>
  );
}
