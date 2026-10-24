import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpFromBracket, faDownload, faFileLines, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { api, downloadDocument, errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastProvider';
import { ConfirmDialog, IconButton } from '../../components/ui';
import { ACCEPTED_FILES, MAX_UPLOAD_MB } from '../../utils/constants';
import { formatSize, relativeTime } from '../../utils/format';
import styles from './Workspace.module.css';

/** List of documents with download, and optional remove and upload. */
export default function Documents({ taskId, documents, canUpload, canRemove, onChange, emptyText = 'No documents yet.' }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(null);

  const upload = async (files) => {
    const list = [...files];
    if (!list.length) return;
    const tooBig = list.find((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024);
    if (tooBig) {
      toast.error(`"${tooBig.name}" is larger than ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setUploading(true);
    try {
      for (const file of list) {
        const body = new FormData();
        body.append('file', file);
        await api.post(`/tasks/${taskId}/documents/`, body);
      }
      toast.success(list.length === 1 ? `Uploaded "${list[0].name}".` : `Uploaded ${list.length} files.`);
      await onChange();
    } catch (err) {
      toast.error(errorMessage(err, 'The upload failed. Please try again.'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const download = async (doc) => {
    try {
      await downloadDocument(doc);
    } catch (err) {
      toast.error(errorMessage(err, 'The download failed. Please try again.'));
    }
  };

  return (
    <div className={styles.documents}>
      {documents.length === 0 ? (
        <p className={styles.muted}>{emptyText}</p>
      ) : (
        <ul className={styles.docList}>
          {documents.map((doc) => (
            <li key={doc.id} className={styles.docItem}>
              <FontAwesomeIcon icon={faFileLines} className={styles.docIcon} />
              <div className={styles.docText}>
                <span className={styles.docTitle}>{doc.title}</span>
                <span className={styles.muted}>
                  {doc.uploaded_by.name}, {relativeTime(doc.uploaded_at)}
                  {doc.size != null && `, ${formatSize(doc.size)}`}
                </span>
              </div>
              <IconButton icon={faDownload} label={`Download ${doc.title}`} onClick={() => download(doc)} />
              {canRemove?.(doc) && (
                <IconButton icon={faTrashCan} label={`Remove ${doc.title}`} onClick={() => setRemoving(doc)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <label
          className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILES}
            className="visually-hidden"
            disabled={uploading}
            onChange={(e) => upload(e.target.files)}
          />
          <FontAwesomeIcon icon={faArrowUpFromBracket} />
          <span>
            {uploading ? 'Uploading...' : <><strong>Choose files</strong> or drop them here</>}
          </span>
          <span className={styles.muted}>PDF, Word, PowerPoint, Excel, images or ZIP, up to {MAX_UPLOAD_MB} MB each</span>
        </label>
      )}

      {removing && (
        <ConfirmDialog
          title="Remove this document?"
          confirmLabel="Remove document"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await api.delete(`/documents/${removing.id}/`);
            toast.success('Document removed.');
            await onChange();
          }}
        >
          <p>
            <strong>{removing.title}</strong> will be deleted from the task.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
