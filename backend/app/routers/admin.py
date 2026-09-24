"""Admin endpoints: the live sessions of the administrator and closing them.

The panel is deliberately small. It answers "where am I signed in?" and lets the
user cut access from anywhere, which is what makes server-side sessions worth
their cost over a stateless token.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AdminSession
from ..schemas import SessionsOut
from ..security import (
    AuthContext,
    clear_session_cookie,
    require_session,
    revoke_all_sessions,
    revoke_session,
)
from . import session_out

router = APIRouter(prefix="/api/admin", tags=["admin"])

SESSION_NOT_FOUND_DETAIL = "La sesión no existe."


def _no_content() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions", response_model=SessionsOut)
def list_sessions(
    auth: AuthContext = Depends(require_session),
    db: Session = Depends(get_db),
) -> dict:
    """Every live session of the administrator, most recently used first.

    Sessions that are revoked, idle-expired or past their absolute cap are
    skipped: the panel lists what is actually still usable.
    """
    now = datetime.now(UTC)
    stmt = (
        select(AdminSession)
        .where(
            AdminSession.user_id == auth.user.id,
            AdminSession.revoked_at.is_(None),
            AdminSession.expires_at > now,
            AdminSession.absolute_expires_at > now,
        )
        .order_by(AdminSession.last_seen_at.desc(), AdminSession.id.desc())
    )
    sessions = db.execute(stmt).scalars().all()
    return {"items": [session_out(item, auth.session.id) for item in sessions]}


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_one(
    session_id: int,
    auth: AuthContext = Depends(require_session),
    db: Session = Depends(get_db),
) -> Response:
    """Close one session; closing the current one also drops its cookie."""
    session = db.get(AdminSession, session_id)
    if session is None or session.user_id != auth.user.id:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND_DETAIL)

    current = session.id == auth.session.id
    revoke_session(db, session)

    response = _no_content()
    if current:
        clear_session_cookie(response)
    return response


@router.post("/sessions/revoke-all", status_code=status.HTTP_204_NO_CONTENT)
def revoke_everything(
    auth: AuthContext = Depends(require_session),
    db: Session = Depends(get_db),
) -> Response:
    """Close every session of the administrator, the current one included."""
    revoke_all_sessions(db, auth.user.id)

    response = _no_content()
    clear_session_cookie(response)
    return response
