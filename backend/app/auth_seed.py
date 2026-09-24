"""Create or recover the administrator credential from the environment.

Runs on startup (``python -m app.auth_seed``), independently of ``SEED_ON_START``
(that one is sample data, this one is the way in).

* No administrator yet and ``ADMIN_USERNAME`` / ``ADMIN_PASSWORD`` set -> it is
  created, flagged so the first login must pick a new password.
* An administrator already exists -> nothing happens: the env vars are a
  bootstrap, never a way to overwrite a live credential.

``--reset-password`` is the recovery path (forgotten password, or locked out): it
sets the password from ``ADMIN_PASSWORD``, forces a change on the next login,
clears the failed attempts and closes every open session.
"""

from __future__ import annotations

import argparse

from sqlalchemy import delete, func, select

from .config import get_settings
from .db import SessionLocal
from .domain import DomainError, validate_password, validate_username
from .models import AdminUser, LoginAttempt
from .security import hash_password, revoke_all_sessions


def _credentials(username: str, password: str) -> tuple[str, str]:
    """Validate the bootstrap pair, aborting the process on a weak credential."""
    try:
        clean_username = validate_username(username)
        clean_password = validate_password(password, clean_username)
    except DomainError as exc:
        # Fail closed: a misconfigured bootstrap must not create a weak way in.
        raise SystemExit(f"[auth_seed] ERROR: {exc}") from exc
    return clean_username, clean_password


def bootstrap() -> dict:
    """Create the administrator if there is none yet. Never overwrites one."""
    settings = get_settings()
    with SessionLocal() as db:
        existing = db.scalar(select(func.count()).select_from(AdminUser)) or 0
        if existing:
            return {"created": False, "reason": "already_exists"}
        if not settings.admin_username or not settings.admin_password:
            return {"created": False, "reason": "missing_credentials"}

        username, password = _credentials(settings.admin_username, settings.admin_password)
        db.add(
            AdminUser(
                username=username,
                password_hash=hash_password(password),
                must_change_password=True,
            )
        )
        db.commit()
        return {"created": True, "username": username}


def reset_password() -> dict:
    """Set a new password for the existing administrator and reset its state."""
    settings = get_settings()
    with SessionLocal() as db:
        user = db.scalar(select(AdminUser).order_by(AdminUser.id))
        if user is None:
            return {"reset": False, "reason": "no_admin"}
        if not settings.admin_password:
            return {"reset": False, "reason": "missing_credentials"}

        _, password = _credentials(user.username, settings.admin_password)
        user.password_hash = hash_password(password)
        user.must_change_password = True
        # Recovery means starting clean: no pending lockout, no open session.
        db.execute(delete(LoginAttempt))
        db.commit()
        revoke_all_sessions(db, user.id)
        return {"reset": True, "username": user.username}


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap the FinanciRDUS administrator.")
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Set the password from ADMIN_PASSWORD and force a change on the next login.",
    )
    args = parser.parse_args()

    if args.reset_password:
        result = reset_password()
        if result.get("reset"):
            print("[auth_seed] Contraseña restablecida: se pedirá cambiarla al entrar.")
        else:
            print(f"[auth_seed] No se restableció ninguna contraseña ({result['reason']}).")
        return

    result = bootstrap()
    if result.get("created"):
        print("[auth_seed] Administrador creado: se pedirá cambiar la contraseña al entrar.")
    elif result["reason"] == "already_exists":
        print("[auth_seed] Ya existe un administrador: no se toca la credencial.")
    else:
        print(
            "[auth_seed] Sin ADMIN_USERNAME/ADMIN_PASSWORD: no se creó ninguna credencial."
        )


if __name__ == "__main__":
    main()
