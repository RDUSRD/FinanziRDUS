/**
 * Credential policy mirrored from the backend.
 *
 * The single source of truth is `validate_password` in `backend/app/domain.py`:
 * the form checks the length here only to answer immediately, the server is
 * still the one that decides.
 */
export const MIN_PASSWORD_LEN = 10;
