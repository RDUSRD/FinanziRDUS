import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { ImportMode } from '../api/types';
import { readableError } from '../api/client';
import { Window } from './Window';

/** API limit for the import body (5 MB): validated here for a clear message. */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

interface ImportWindowProps {
  open: boolean;
  onClose: () => void;
  /** Runs the import for the chosen file + mode (App owns the mutation). */
  onImport: (file: File, mode: ImportMode) => void | Promise<void>;
  /** Voiced through the app's single live region when an error is shown here. */
  onError?: (message: string) => void;
  busy: boolean;
}

/**
 * The import flow as a window: the two modes as a radiogroup, the file input,
 * the 5 MB and JSON-parse pre-checks, and — for `replace` — a destructive
 * confirmation step inside the same window.
 */
export function ImportWindow({ open, onClose, onImport, onError, busy }: ImportWindowProps) {
  const [mode, setMode] = useState<ImportMode>('merge');
  const [error, setError] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Start clean every time the window opens.
  useEffect(() => {
    if (!open) return;
    setMode('merge');
    setError('');
    setPendingFile(null);
    setConfirming(false);
    if (fileRef.current) fileRef.current.value = '';
  }, [open]);

  /** Paint the inline error and voice it through the app's live region. */
  function showError(message: string) {
    setError(message);
    onError?.(message);
  }

  function selectMode(next: ImportMode) {
    setMode(next);
    setError('');
    setPendingFile(null);
    setConfirming(false);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;

    setError('');
    setPendingFile(null);
    setConfirming(false);

    if (file.size > MAX_IMPORT_BYTES) {
      showError('El archivo es demasiado grande (máximo 5 MB).');
      return;
    }

    try {
      JSON.parse(await file.text());
    } catch {
      showError('El archivo no es un JSON válido.');
      return;
    }

    if (mode === 'replace') {
      setPendingFile(file);
      setConfirming(true);
      return;
    }

    try {
      await onImport(file, 'merge');
    } catch (error) {
      showError(readableError(error));
    }
  }

  async function confirmReplace() {
    if (!pendingFile) return;
    setConfirming(false);
    try {
      await onImport(pendingFile, 'replace');
    } catch (error) {
      showError(readableError(error));
    }
  }

  function cancelConfirm() {
    setConfirming(false);
    setPendingFile(null);
  }

  return (
    <Window
      open={open}
      title="Importar datos"
      onClose={onClose}
      busy={busy}
      initialFocusRef={fileRef}
      footer={
        confirming ? (
          <>
            <button type="button" className="plate" onClick={confirmReplace} disabled={busy}>
              Reemplazar todo
            </button>
            <button type="button" className="linkb" onClick={cancelConfirm} disabled={busy}>
              Cancelar
            </button>
          </>
        ) : (
          <p className="hint">
            {busy ? 'Importando…' : 'El archivo debe ser un JSON exportado por esta app.'}
          </p>
        )
      }
    >
      <p className="wsub">
        Elegí el modo, elegí el archivo JSON exportado por esta app y confirmá.
      </p>

      <div className="field">
        <label id="import-mode-label">Modo</label>
        <div className="seg" role="radiogroup" aria-labelledby="import-mode-label">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'merge'}
            onClick={() => selectMode('merge')}
            disabled={busy}
          >
            Fusionar
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'replace'}
            onClick={() => selectMode('replace')}
            disabled={busy}
          >
            Reemplazar
          </button>
        </div>
      </div>

      <p className="notice">
        {mode === 'merge'
          ? 'Fusionar agrega el archivo a lo que ya tenés.'
          : 'Reemplazar borra todo lo actual y deja sólo lo que trae el archivo.'}
      </p>

      <div className="field">
        <label htmlFor="import-file">Archivo JSON a importar</label>
        <input
          ref={fileRef}
          id="import-file"
          type="file"
          accept="application/json,.json"
          aria-describedby="import-error"
          onChange={handleFile}
          disabled={busy}
        />
      </div>

      <p className="error-msg" id="import-error">
        {error}
      </p>

      {confirming ? (
        <div className="strip action">
          <p>
            ¿Reemplazar TODOS los datos actuales con el archivo importado? Esta acción no se puede deshacer.
          </p>
        </div>
      ) : null}
    </Window>
  );
}
