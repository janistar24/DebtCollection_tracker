import json
import hashlib
import logging
import os
import re
import secrets
import subprocess
import uuid
from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone
from threading import Lock
from time import monotonic
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder

from pydantic import BaseModel
from pwdlib import PasswordHash
from DBHelper import DBHelper

from users import Users
from taxpayers import Taxpayers
from tax_assessments import Tax_assessments
from payments import Payments
from follow_up_logs import Follow_up_logs
from taxpayer_year_records import Taxpayer_year_records
from payment_allocations import Payment_allocations
from slip_ocr import read_slip
from auth_security import authenticated_user, create_access_token

is_production = os.getenv("ENVIRONMENT", "development").lower() == "production"

app = FastAPI(
    title="Tax Collection API",
    version="1.0.0",
    default_response_class=JSONResponse,
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
)

logger = logging.getLogger("tax_collection_api")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:8443,http://127.0.0.1:8443,http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

db = DBHelper()

users_service = Users()
taxpayers_service = Taxpayers()
tax_assessments_service = Tax_assessments()
payments_service = Payments()
follow_up_logs_service = Follow_up_logs()
taxpayer_year_records_service = Taxpayer_year_records()
payment_allocations_service = Payment_allocations()

password_hash = PasswordHash.recommended()

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

PUBLIC_PATHS = {
    "/", "/health", "/api/login", "/api/user-invitations/validate",
    "/api/user-invitations/accept", "/docs", "/openapi.json", "/redoc",
}
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_FAILURES = 10
login_failures: dict[str, deque[float]] = defaultdict(deque)
login_failures_lock = Lock()


@app.on_event("startup")
def ensure_user_invitation_schema() -> None:
    for migration_name in (
        "005_add_user_email_invitations.sql",
        "006_add_taxpayer_title.sql",
    ):
        migration_path = os.path.join(os.path.dirname(__file__), "migrations", migration_name)
        with open(migration_path, "r", encoding="utf-8") as migration_file:
            db.execute(migration_file.read())


def _clean_email(value: str | None, required: bool = False) -> str | None:
    email = (value or "").strip().lower()
    if not email and not required:
        return None
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=400, detail="รูปแบบอีเมลไม่ถูกต้อง")
    return email


def _invitation_url(token: str) -> str:
    frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if not frontend_url:
        raise RuntimeError("ยังไม่ได้กำหนด FRONTEND_URL")
    return f"{frontend_url}/#/accept-invite?token={token}"


def _invite_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode("utf-8")).hexdigest()


def _login_key(request: Request, username: str) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    client_ip = forwarded.split(",", 1)[0].strip() or (request.client.host if request.client else "unknown")
    return f"{client_ip}:{username.strip().lower()}"


def _check_login_rate_limit(key: str) -> None:
    now = monotonic()
    with login_failures_lock:
        failures = login_failures[key]
        while failures and now - failures[0] > LOGIN_WINDOW_SECONDS:
            failures.popleft()
        if len(failures) >= LOGIN_MAX_FAILURES:
            raise HTTPException(status_code=429, detail="เข้าสู่ระบบไม่สำเร็จหลายครั้ง กรุณารอ 15 นาที")


def _record_login_failure(key: str) -> None:
    with login_failures_lock:
        login_failures[key].append(monotonic())


def _clear_login_failures(key: str) -> None:
    with login_failures_lock:
        login_failures.pop(key, None)


def _actor(request: Request) -> dict:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="กรุณาเข้าสู่ระบบ")
    return user


def _actor_id(request: Request) -> int:
    return int(_actor(request)["sub"])


def _officer_group(request: Request) -> str | None:
    user = _actor(request)
    if user.get("role") != "OFFICER":
        return None
    group = user.get("group")
    if not group:
        raise HTTPException(status_code=403, detail="บัญชีเจ้าหน้าที่ยังไม่ได้กำหนดกลุ่มรับผิดชอบ")
    return str(group)


def _require_group(request: Request, group_code: str | None) -> None:
    expected = _officer_group(request)
    if expected is not None and group_code != expected:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์เข้าถึงข้อมูลของกลุ่มนี้")


def _require_permanent_delete_permission(request: Request) -> None:
    if _actor(request).get("role") not in {"DIRECTOR", "ADMIN"}:
        raise HTTPException(
            status_code=403,
            detail="การลบข้อมูลผู้เสียภาษีอย่างถาวรดำเนินการได้เฉพาะผู้บริหารหรือผู้ดูแลระบบเท่านั้น",
        )


def _require_admin_account_management(request: Request) -> None:
    if _actor(request).get("role") != "ADMIN":
        raise HTTPException(
            status_code=403,
            detail="การบริหารบัญชีผู้ใช้งานดำเนินการได้เฉพาะผู้ดูแลระบบเท่านั้น",
        )


def _taxpayer_group(taxpayer_id: int) -> str:
    row, columns = db.fetch_one(
        "SELECT group_code FROM public.taxpayers WHERE taxpayer_id=%s",
        (taxpayer_id,),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลผู้เสียภาษี")
    return dict(zip(columns, row))["group_code"]


def _year_record_group(year_record_id: int) -> str:
    row, columns = db.fetch_one(
        """SELECT t.group_code
           FROM public.taxpayer_year_records tyr
           JOIN public.taxpayers t ON t.taxpayer_id=tyr.taxpayer_id
           WHERE tyr.year_record_id=%s""",
        (year_record_id,),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลผู้เสียภาษีประจำปี")
    return dict(zip(columns, row))["group_code"]


def _assessment_group(assessment_id: int) -> str:
    row, columns = db.fetch_one(
        """SELECT t.group_code
           FROM public.tax_assessments ta
           JOIN public.taxpayer_year_records tyr ON tyr.year_record_id=ta.year_record_id
           JOIN public.taxpayers t ON t.taxpayer_id=tyr.taxpayer_id
           WHERE ta.assessment_id=%s""",
        (assessment_id,),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลการประเมินภาษี")
    return dict(zip(columns, row))["group_code"]


@app.exception_handler(HTTPException)
async def safe_http_exception_handler(request: Request, error: HTTPException):
    if error.status_code < 500:
        return JSONResponse(status_code=error.status_code, content={"detail": error.detail})
    request_id = uuid.uuid4().hex[:12]
    logger.exception("Request %s failed: %s %s", request_id, request.method, request.url.path)
    message = error.detail.get("message") if isinstance(error.detail, dict) else None
    return JSONResponse(
        status_code=error.status_code,
        content={"detail": message or "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง", "request_id": request_id},
    )


@app.exception_handler(Exception)
async def safe_unhandled_exception_handler(request: Request, error: Exception):
    request_id = uuid.uuid4().hex[:12]
    logger.exception("Unhandled request %s: %s %s", request_id, request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง", "request_id": request_id},
    )

@app.middleware("http")
async def enforce_authentication(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in PUBLIC_PATHS:
        return await call_next(request)
    if request.url.path.startswith("/api/"):
        try:
            token_user = authenticated_user(request)
            row, columns = db.fetch_one(
                """SELECT u.user_id,u.role,u.is_active,ra.group_code
                   FROM public.users u
                   LEFT JOIN public.responsibility_assignments ra
                     ON ra.user_id=u.user_id AND ra.is_active=TRUE
                   WHERE u.user_id=%s""",
                (int(token_user["sub"]),),
            )
            if row is None or not dict(zip(columns, row))["is_active"]:
                raise HTTPException(status_code=401, detail="บัญชีผู้ใช้งานไม่พร้อมใช้งาน กรุณาเข้าสู่ระบบใหม่")
            current_user = dict(zip(columns, row))
            user = {
                "sub": int(current_user["user_id"]),
                "role": str(current_user["role"]).upper(),
                "group": current_user["group_code"],
            }
            request.state.user = user
            if request.url.path == "/api/database-test" and user["role"] != "ADMIN":
                raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้")
            if request.url.path.startswith("/api/users") and request.method != "GET" and user["role"] != "ADMIN":
                raise HTTPException(status_code=403, detail="เฉพาะผู้ดูแลระบบเท่านั้น")
        except HTTPException as error:
            return JSONResponse(status_code=error.status_code, content={"detail": error.detail})
    return await call_next(request)

@app.middleware("http")
async def add_utf8_charset(request, call_next):
    response = await call_next(request)

    if response.headers.get("content-type", "").startswith("application/json"):
        response.headers["content-type"] = "application/json; charset=utf-8"

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"

    return response

@app.get("/")
def home():
    return {
        "message": "Tax Collection Backend Running"
    }


@app.get("/health")
def health_check():
    try:
        row, _ = db.fetch_one("SELECT 1 AS database_ready")
        if row is None or row[0] != 1:
            raise RuntimeError("database readiness check returned an invalid result")
        return {"status": "ok", "database": "connected"}
    except Exception:
        logger.exception("Database readiness check failed")
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "database": "disconnected"},
        )

@app.get("/api/database-test")
def database_test():
    try:
        data, columns = db.fetch(
            """
            SELECT
                current_database() AS database_name,
                current_user AS database_user,
                NOW() AS server_time
            """
        )

        result = dict(zip(columns, data[0]))

        return {
            "success": True,
            "message": "เชื่อมต่อ PostgreSQL สำเร็จ",
            "data": result
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "เชื่อมต่อ PostgreSQL ไม่สำเร็จ",
                "error": str(error)
            }
        )

@app.get("/api/users")
def get_users(request: Request):
    try:
        users = users_service.dump()
        actor = _actor(request)
        if actor["role"] == "OFFICER":
            users = [item for item in users if int(item["user_id"]) == int(actor["sub"])]
        if actor["role"] != "ADMIN":
            users = [{key: value for key, value in item.items() if key != "username"} for item in users]

        return JSONResponse(
            content=jsonable_encoder({
                "success": True,
                "count": len(users),
                "data": users
            }),
            media_type="application/json; charset=utf-8"
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถดึงข้อมูลผู้ใช้งานได้",
                "error": str(error)
            }
        )

class AdminUserCreate(BaseModel):
    employee_code: str
    first_name: str
    last_name: str
    username: str
    email: str | None = None
    password: str
    role: str
    group_code: str | None = None
    is_active: bool = True

class AdminUserUpdate(BaseModel):
    employee_code: str
    first_name: str
    last_name: str
    username: str
    email: str | None = None
    password: str | None = None
    role: str
    group_code: str | None = None
    is_active: bool = True

class AdminPasswordReset(BaseModel):
    password: str


class AdminUserInvitation(BaseModel):
    employee_code: str
    first_name: str
    last_name: str
    email: str
    role: str
    group_code: str | None = None


class InvitationTokenRequest(BaseModel):
    token: str


class AcceptUserInvitation(InvitationTokenRequest):
    username: str
    password: str


def _invitation_record(cursor, token_hash: str, lock: bool = False) -> dict:
    cursor.execute(
        """SELECT invitation_id,email,employee_code,first_name,last_name,role,group_code,
                  expires_at,accepted_at,revoked_at
           FROM public.user_invitations WHERE token_hash=%s""" + (" FOR UPDATE" if lock else ""),
        (token_hash,),
    )
    row = cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=400, detail="ลิงก์คำเชิญไม่ถูกต้องหรือหมดอายุ")
    record = dict(zip((column.name for column in cursor.description), row))
    if record["accepted_at"] or record["revoked_at"] or record["expires_at"] <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="ลิงก์คำเชิญถูกใช้งานแล้วหรือหมดอายุ")
    return record


@app.post("/api/users/invitations")
def create_user_invitation(payload: AdminUserInvitation, http_request: Request):
    _require_admin_account_management(http_request)
    email = _clean_email(payload.email, required=True)
    role = payload.role.upper()
    if role not in {"OFFICER", "DIRECTOR", "ADMIN"}:
        raise HTTPException(status_code=400, detail="สิทธิ์ผู้ใช้งานไม่ถูกต้อง")
    if role == "OFFICER" and not payload.group_code:
        raise HTTPException(status_code=400, detail="กรุณาเลือกกลุ่มรับผิดชอบ")
    if not payload.employee_code.strip() or not payload.first_name.strip() or not payload.last_name.strip():
        raise HTTPException(status_code=400, detail="กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน")
    expires_hours = max(1, min(168, int(os.getenv("INVITATION_EXPIRES_HOURS", "48"))))
    token, token_hash = _invite_token()
    url = _invitation_url(token)
    try:
        with db.transaction() as cursor:
            cursor.execute(
                """SELECT user_id FROM public.users WHERE employee_code=%s OR LOWER(email)=%s""",
                (payload.employee_code.strip(), email),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="รหัสพนักงานหรืออีเมลนี้มีบัญชีอยู่แล้ว")
            cursor.execute(
                """SELECT invitation_id FROM public.user_invitations
                   WHERE (employee_code=%s OR LOWER(email)=%s)
                     AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP""",
                (payload.employee_code.strip(), email),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="มีคำเชิญที่ยังไม่หมดอายุสำหรับรหัสพนักงานหรืออีเมลนี้")
            if role == "OFFICER":
                cursor.execute(
                    """SELECT user_id FROM public.responsibility_assignments
                       WHERE group_code=%s AND is_active=TRUE""", (payload.group_code,),
                )
                if cursor.fetchone():
                    raise HTTPException(status_code=409, detail="กลุ่มนี้มีเจ้าหน้าที่ผู้รับผิดชอบอยู่แล้ว")
            cursor.execute(
                """INSERT INTO public.user_invitations
                   (email,employee_code,first_name,last_name,role,group_code,token_hash,expires_at,created_by)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING invitation_id""",
                (email, payload.employee_code.strip(), payload.first_name.strip(),
                 payload.last_name.strip(), role, payload.group_code if role == "OFFICER" else None,
                 token_hash, datetime.now(timezone.utc) + timedelta(hours=expires_hours), _actor_id(http_request)),
            )
            invitation_id = cursor.fetchone()[0]
        return {
            "success": True,
            "data": {"invitation_id": invitation_id, "email": email, "invitation_url": url},
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("User invitation creation failed")
        raise HTTPException(status_code=500, detail="ไม่สามารถสร้างคำเชิญได้")


@app.post("/api/user-invitations/validate")
def validate_user_invitation(payload: InvitationTokenRequest):
    token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    with db.transaction() as cursor:
        record = _invitation_record(cursor, token_hash)
    return {"success": True, "data": {
        "email": record["email"], "name": f'{record["first_name"]} {record["last_name"]}',
        "role": record["role"], "expires_at": record["expires_at"].isoformat(),
    }}


@app.post("/api/user-invitations/accept")
def accept_user_invitation(payload: AcceptUserInvitation):
    username = payload.username.strip()
    if not re.fullmatch(r"[A-Za-z0-9._-]{3,64}", username):
        raise HTTPException(status_code=400, detail="ชื่อผู้ใช้งานต้องเป็นอักษรอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง 3–64 ตัว")
    if len(payload.password) < 12:
        raise HTTPException(status_code=400, detail="รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร")
    token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    with db.transaction() as cursor:
        invitation = _invitation_record(cursor, token_hash, lock=True)
        cursor.execute(
            """SELECT user_id FROM public.users
               WHERE username=%s OR employee_code=%s OR LOWER(email)=%s""",
            (username, invitation["employee_code"], invitation["email"]),
        )
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="ชื่อผู้ใช้งาน รหัสพนักงาน หรืออีเมลนี้ถูกใช้งานแล้ว")
        cursor.execute(
            """INSERT INTO public.users
               (employee_code,first_name,last_name,role,username,email,password_hash,is_active)
               VALUES (%s,%s,%s,%s,%s,%s,%s,TRUE) RETURNING user_id""",
            (invitation["employee_code"], invitation["first_name"], invitation["last_name"],
             invitation["role"], username, invitation["email"], password_hash.hash(payload.password)),
        )
        user_id = cursor.fetchone()[0]
        _save_user_assignment(cursor, user_id, invitation["role"], invitation["group_code"])
        cursor.execute(
            """UPDATE public.user_invitations
               SET accepted_at=CURRENT_TIMESTAMP,created_user_id=%s WHERE invitation_id=%s""",
            (user_id, invitation["invitation_id"]),
        )
    return {"success": True}

def _save_user_assignment(cursor, user_id: int, role: str, group_code: str | None):
    cursor.execute(
        """UPDATE public.responsibility_assignments
           SET is_active=FALSE,end_date=CURRENT_DATE
           WHERE user_id=%s AND is_active=TRUE""",
        (user_id,),
    )
    if role == "OFFICER" and group_code:
        cursor.execute(
            """SELECT user_id FROM public.responsibility_assignments
               WHERE group_code=%s AND is_active=TRUE AND user_id<>%s""",
            (group_code, user_id),
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=409,
                detail=f"กลุ่ม {group_code} มีพนักงานผู้รับผิดชอบที่ใช้งานอยู่แล้ว",
            )
        cursor.execute(
            """INSERT INTO public.responsibility_assignments
               (user_id,group_code,start_date,is_active)
               VALUES (%s,%s,CURRENT_DATE,TRUE)""",
            (user_id, group_code),
        )

@app.post("/api/users")
def create_admin_user(request: AdminUserCreate):
    role = request.role.upper()
    if role not in {"OFFICER", "DIRECTOR", "ADMIN"}:
        raise HTTPException(status_code=400, detail="สิทธิ์ผู้ใช้งานไม่ถูกต้อง")
    if role == "OFFICER" and not request.group_code:
        raise HTTPException(status_code=400, detail="กรุณาเลือกกลุ่มรับผิดชอบ")
    if len(request.password) < 12:
        raise HTTPException(status_code=400, detail="รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร")
    email = _clean_email(request.email)
    try:
        with db.transaction() as cursor:
            cursor.execute(
                """SELECT user_id FROM public.users
                   WHERE employee_code=%s OR username=%s OR (%s IS NOT NULL AND LOWER(email)=%s)""",
                (request.employee_code.strip(), request.username.strip(), email, email),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="รหัสพนักงานหรือ Username ถูกใช้งานแล้ว")
            cursor.execute(
                """INSERT INTO public.users
                   (employee_code,first_name,last_name,role,username,email,password_hash,is_active)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING user_id""",
                (request.employee_code.strip(), request.first_name.strip(), request.last_name.strip(),
                 role, request.username.strip(), email, password_hash.hash(request.password), request.is_active),
            )
            user_id = cursor.fetchone()[0]
            _save_user_assignment(cursor, user_id, role, request.group_code)
        return {"success": True, "data": {"user_id": user_id}}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail={"message": "เพิ่มผู้ใช้งานไม่สำเร็จ", "error": str(error)})

@app.put("/api/users/{user_id}")
def update_admin_user(user_id: int, request: AdminUserUpdate):
    role = request.role.upper()
    if role not in {"OFFICER", "DIRECTOR", "ADMIN"}:
        raise HTTPException(status_code=400, detail="สิทธิ์ผู้ใช้งานไม่ถูกต้อง")
    if role == "OFFICER" and not request.group_code:
        raise HTTPException(status_code=400, detail="กรุณาเลือกกลุ่มรับผิดชอบ")
    if request.password and len(request.password) < 12:
        raise HTTPException(status_code=400, detail="รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร")
    email = _clean_email(request.email)
    try:
        with db.transaction() as cursor:
            cursor.execute("SELECT user_id FROM public.users WHERE user_id=%s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้งาน")
            cursor.execute(
                """SELECT user_id FROM public.users
                   WHERE (employee_code=%s OR username=%s OR (%s IS NOT NULL AND LOWER(email)=%s))
                     AND user_id<>%s""",
                (request.employee_code.strip(), request.username.strip(), email, email, user_id),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="รหัสพนักงานหรือ Username ถูกใช้งานแล้ว")
            if request.password:
                cursor.execute(
                    """UPDATE public.users SET employee_code=%s,first_name=%s,last_name=%s,
                       role=%s,username=%s,email=%s,password_hash=%s,is_active=%s,updated_at=CURRENT_TIMESTAMP
                       WHERE user_id=%s""",
                    (request.employee_code.strip(), request.first_name.strip(), request.last_name.strip(),
                     role, request.username.strip(), email, password_hash.hash(request.password),
                     request.is_active, user_id),
                )
            else:
                cursor.execute(
                    """UPDATE public.users SET employee_code=%s,first_name=%s,last_name=%s,
                       role=%s,username=%s,email=%s,is_active=%s,updated_at=CURRENT_TIMESTAMP
                       WHERE user_id=%s""",
                    (request.employee_code.strip(), request.first_name.strip(), request.last_name.strip(),
                     role, request.username.strip(), email, request.is_active, user_id),
                )
            _save_user_assignment(cursor, user_id, role, request.group_code)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail={"message": "แก้ไขผู้ใช้งานไม่สำเร็จ", "error": str(error)})

@app.put("/api/users/{user_id}/active")
def set_admin_user_active(user_id: int, is_active: bool, http_request: Request):
    _require_admin_account_management(http_request)
    if user_id == _actor_id(http_request) and not is_active:
        raise HTTPException(status_code=400, detail="ไม่สามารถปิดการใช้งานบัญชีที่กำลังเข้าสู่ระบบอยู่ได้")
    try:
        with db.transaction() as cursor:
            cursor.execute(
                "UPDATE public.users SET is_active=%s,updated_at=CURRENT_TIMESTAMP WHERE user_id=%s RETURNING user_id",
                (is_active, user_id),
            )
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้งาน")
        return {"success": True}
    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "เปลี่ยนสถานะผู้ใช้งานไม่สำเร็จ",
                "error": str(error)
            }
        )

@app.put("/api/users/{user_id}/password")
def reset_admin_user_password(user_id: int, request: AdminPasswordReset, http_request: Request):
    _require_admin_account_management(http_request)
    if len(request.password) < 12:
        raise HTTPException(status_code=400, detail="รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร")
    try:
        with db.transaction() as cursor:
            cursor.execute(
                """UPDATE public.users
                   SET password_hash=%s,updated_at=CURRENT_TIMESTAMP
                   WHERE user_id=%s RETURNING user_id""",
                (password_hash.hash(request.password), user_id),
            )
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้งาน")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail={"message": "รีเซ็ตรหัสผ่านไม่สำเร็จ", "error": str(error)})

@app.delete("/api/users/{user_id}")
def delete_admin_user(user_id: int, http_request: Request):
    _require_admin_account_management(http_request)
    if user_id == _actor_id(http_request):
        raise HTTPException(status_code=400, detail="ไม่สามารถลบบัญชีที่กำลังเข้าสู่ระบบอยู่ได้")
    try:
        with db.transaction() as cursor:
            cursor.execute("SELECT username FROM public.users WHERE user_id=%s FOR UPDATE", (user_id,))
            record = cursor.fetchone()
            if record is None:
                raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้งาน")
            # เก็บประวัติการติดต่อ การชำระ และการประเมินภาษีไว้ โดย Foreign Key
            # ของข้อมูลประวัติตั้งค่า ON DELETE SET NULL ลบเฉพาะการมอบหมายกลุ่ม
            # ของบัญชี ก่อนลบบัญชีผู้ใช้งาน
            cursor.execute("DELETE FROM public.responsibility_assignments WHERE user_id=%s", (user_id,))
            cursor.execute("DELETE FROM public.users WHERE user_id=%s", (user_id,))
        return {"success": True, "data": {"username": record[0]}}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail={"message": "ลบบัญชีผู้ใช้งานไม่สำเร็จ", "error": str(error)})

@app.get("/api/taxpayers")
def get_taxpayers(request: Request):
    try:
        group = _officer_group(request)
        taxpayers = taxpayers_service.dump(group)

        return {
            "success": True,
            "count": len(taxpayers),
            "data": taxpayers
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถดึงข้อมูลผู้เสียภาษีได้",
                "error": str(error)
            }
        )

@app.get("/api/tax-assessments")
def get_tax_assessments(request: Request):
    try:
        group = _officer_group(request)
        tax_assessments = tax_assessments_service.dump(group)

        return {
            "success": True,
            "count": len(tax_assessments),
            "data": tax_assessments
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถดึงข้อมูลการประเมินภาษีได้",
                "error": str(error)
            }
        )

@app.get("/api/payments")
def get_payments(request: Request):
    try:
        group = _officer_group(request)
        payments = payments_service.dump(group)

        return {
            "success": True,
            "count": len(payments),
            "data": payments
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถดึงข้อมูลการชำระเงินได้",
                "error": str(error)
            }
        )

@app.get("/api/payment-allocations")
def get_payment_allocations(request: Request):
    try:
        group = _officer_group(request)
        allocations = payment_allocations_service.dump(group)
        return {
            "success": True,
            "count": len(allocations),
            "data": allocations
        }
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถดึงข้อมูลการจัดสรรยอดชำระได้",
                "error": str(error)
            }
        )

@app.get("/api/reports/monthly-payments")
def get_monthly_payment_report(request: Request, tax_year: int, group_code: str | None = None):
    """สรุปยอดที่รับจริงในปีรายงาน รวมเงินที่นำไปตัดหนี้ของปีก่อน"""
    try:
        officer_group = _officer_group(request)
        if officer_group is not None:
            group_code = officer_group
        data, columns = db.fetch(
            """
            SELECT
                EXTRACT(MONTH FROM p.payment_date)::int AS payment_month,
                COALESCE(SUM(pa.allocated_amount) FILTER (
                    WHERE ta.tax_type = 'LAND_BUILDING'
                ), 0) AS land_amount,
                COALESCE(SUM(pa.allocated_amount) FILTER (
                    WHERE ta.tax_type = 'SIGN'
                ), 0) AS sign_amount,
                COUNT(DISTINCT tyr.taxpayer_id) AS taxpayer_count
            FROM public.payment_allocations pa
            JOIN public.payments p
                ON p.payment_id = pa.payment_id
            JOIN public.tax_assessments ta
                ON ta.assessment_id = pa.assessment_id
            JOIN public.taxpayer_year_records tyr
                ON tyr.year_record_id = ta.year_record_id
            JOIN public.taxpayers t
                ON t.taxpayer_id = tyr.taxpayer_id
            WHERE EXTRACT(YEAR FROM p.payment_date)::int = %s - 543
              AND tyr.tax_year <= %s
              AND (%s::text IS NULL OR t.group_code = %s::text)
            GROUP BY EXTRACT(MONTH FROM p.payment_date)
            ORDER BY payment_month
            """,
            (tax_year, tax_year, group_code, group_code)
        )
        by_month = {row[0]: dict(zip(columns, row)) for row in data}
        months = []
        for month in range(1, 13):
            item = by_month.get(month)
            months.append({
                "month": month,
                "land_amount": float(item["land_amount"]) if item else 0,
                "sign_amount": float(item["sign_amount"]) if item else 0,
                "taxpayer_count": int(item["taxpayer_count"]) if item else 0,
            })
        return {"success": True, "data": months}
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={"message": "ไม่สามารถสรุปยอดชำระรายเดือนได้", "error": str(error)}
        )

@app.post("/api/slips/read")
async def read_payment_slip(request: Request):
    """OCR รูปสลิปแบบชั่วคราว: ไม่บันทึกรูปหรือข้อความ OCR ลงฐานข้อมูล"""
    try:
        content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
        result = read_slip(await request.body(), content_type)
        return {
            "success": True,
            "message": "อ่านสลิปเรียบร้อย กรุณาตรวจสอบยอดก่อนค้นหา",
            "data": result,
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="ใช้เวลาอ่านสลิปนานเกินไป กรุณาลองรูปที่ชัดขึ้น")
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={"message": "อ่านข้อมูลจากสลิปไม่สำเร็จ", "error": str(error)},
        )

@app.get("/api/follow-up-logs")
def get_follow_up_logs(request: Request):
    try:
        group = _officer_group(request)
        follow_up_logs = follow_up_logs_service.dump(group)

        return {
            "success": True,
            "count": len(follow_up_logs),
            "data": follow_up_logs
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถดึงข้อมูลการติดตามได้",
                "error": str(error)
            }
        )

class FollowUpCreate(BaseModel):
    taxpayer_id: int
    tax_year: int
    tax_scope: str = "BOTH"
    contact_type: str
    contacted_at: datetime
    result: str
    detail: str | None = None
    promise_date: date | None = None
    promise_amount: float | None = None
    next_follow_date: date | None = None
    recorded_by: int | None = None

@app.post("/api/follow-up-logs")
def create_follow_up_log(request: FollowUpCreate, http_request: Request):
    """บันทึกผลการติดต่อจริงและผูกกับผู้เสียภาษีในปีภาษีที่เลือก"""
    scope_map = {"LAND": "LAND_BUILDING", "LAND_BUILDING": "LAND_BUILDING", "SIGN": "SIGN", "BOTH": "BOTH"}
    contact_map = {"PHONE": "PHONE", "LINE": "LINE", "IN_PERSON": "OTHER", "LETTER": "OTHER", "OTHER": "OTHER"}
    result_map = {"CALLBACK": "CALL_BACK", "CALL_BACK": "CALL_BACK"}
    tax_scope = scope_map.get(request.tax_scope.upper())
    contact_type = contact_map.get(request.contact_type.upper())
    result = result_map.get(request.result.upper(), request.result.upper())
    allowed_results = {"NO_ANSWER", "REACHED", "PROMISED", "CALL_BACK", "DISPUTE", "WRONG_NUMBER", "OTHER"}

    if tax_scope is None:
        raise HTTPException(status_code=400, detail="ประเภทภาษีที่ติดตามไม่ถูกต้อง")
    if contact_type is None:
        raise HTTPException(status_code=400, detail="ช่องทางการติดต่อไม่ถูกต้อง")
    if result not in allowed_results:
        raise HTTPException(status_code=400, detail="ผลการติดต่อไม่ถูกต้อง")
    if request.promise_amount is not None and request.promise_amount < 0:
        raise HTTPException(status_code=400, detail="ยอดนัดชำระต้องไม่ติดลบ")

    _require_group(http_request, _taxpayer_group(request.taxpayer_id))
    recorded_by = _actor_id(http_request)

    try:
        with db.transaction() as cursor:
            cursor.execute(
                """SELECT year_record_id
                   FROM public.taxpayer_year_records
                   WHERE taxpayer_id=%s AND tax_year=%s AND is_included=TRUE""",
                (request.taxpayer_id, request.tax_year),
            )
            year_record = cursor.fetchone()
            if year_record is None:
                raise HTTPException(status_code=404, detail="ไม่พบผู้เสียภาษีในปีภาษีที่เลือก")

            cursor.execute(
                """INSERT INTO public.follow_up_logs
                   (year_record_id,tax_scope,contact_type,contacted_at,result,detail,
                    promise_date,promise_amount,next_follow_date,recorded_by)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   RETURNING follow_up_id""",
                (year_record[0], tax_scope, contact_type, request.contacted_at, result,
                 request.detail, request.promise_date, request.promise_amount,
                 request.next_follow_date, recorded_by),
            )
            follow_up_id = cursor.fetchone()[0]
        return {"success": True, "message": "บันทึกการติดต่อเรียบร้อยแล้ว", "data": {"follow_up_id": follow_up_id}}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail={"message": "บันทึกการติดต่อไม่สำเร็จ", "error": str(error)})

# Journey -------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str

class PaymentAllocationInput(BaseModel):
    assessment_id: int
    allocated_amount: float

class CompletePaymentCreate(BaseModel):
    payment_amount: float
    payment_date: date
    # รองรับหน้าที่ส่งเฉพาะวันที่ และใช้เวลาปัจจุบันเป็นค่าเริ่มต้น
    payment_datetime: datetime | None = None
    payment_method: Literal["transfer", "cash", "TRANSFER", "CASH"]
    reference_no: str | None = None
    receipt_no: str | None = None
    recorded_by: int | None = None
    allocations: list[PaymentAllocationInput]

@app.post("/api/payments/complete")
def create_complete_payment(request: CompletePaymentCreate, http_request: Request):
    """บันทึกยอดชำระและการจัดสรรภาษีทั้งหมดใน transaction เดียว"""
    if request.payment_amount <= 0:
        raise HTTPException(status_code=400, detail="ยอดชำระต้องมากกว่า 0")
    if not request.allocations:
        raise HTTPException(status_code=400, detail="กรุณาเลือกประเภทภาษีที่ต้องการชำระ")

    allocated_total = sum(item.allocated_amount for item in request.allocations)
    if any(item.allocated_amount <= 0 for item in request.allocations):
        raise HTTPException(status_code=400, detail="ยอดจัดสรรแต่ละรายการต้องมากกว่า 0")
    if abs(allocated_total - request.payment_amount) > 0.009:
        raise HTTPException(status_code=400, detail="ผลรวมยอดจัดสรรต้องเท่ากับยอดชำระ")

    assessment_ids = [item.assessment_id for item in request.allocations]
    if len(assessment_ids) != len(set(assessment_ids)):
        raise HTTPException(
            status_code=400,
            detail="รหัสการประเมินภาษีซ้ำกัน กรุณารีเฟรชข้อมูลแล้วเลือกประเภทภาษีใหม่"
        )

    for assessment_id in assessment_ids:
        _require_group(http_request, _assessment_group(assessment_id))
    recorded_by = _actor_id(http_request)

    stage = "ตรวจสอบข้อมูลก่อนบันทึก"
    try:
        with db.transaction() as cursor:
            stage = "ตรวจสอบรายการประเมินภาษี"
            cursor.execute(
                """SELECT ta.assessment_id,ta.year_record_id,ta.assessed_amount,
                          COALESCE((SELECT SUM(pa.allocated_amount)
                                    FROM public.payment_allocations pa
                                    WHERE pa.assessment_id=ta.assessment_id),0) AS paid_amount
                          ,tyr.taxpayer_id
                   FROM public.tax_assessments ta
                   JOIN public.taxpayer_year_records tyr
                     ON tyr.year_record_id=ta.year_record_id
                   WHERE ta.assessment_id = ANY(%s)
                   FOR UPDATE OF ta""",
                (assessment_ids,),
            )
            assessment_rows = {row[0]: row for row in cursor.fetchall()}
            missing = [item_id for item_id in assessment_ids if item_id not in assessment_rows]
            if missing:
                raise HTTPException(status_code=404, detail=f"ไม่พบข้อมูลการประเมินภาษีรหัส {missing[0]}")
            if len({row[4] for row in assessment_rows.values()}) != 1:
                raise HTTPException(status_code=400, detail="รายการภาษีที่จัดสรรต้องเป็นของผู้เสียภาษีรายเดียวกัน")
            for item in request.allocations:
                row = assessment_rows[item.assessment_id]
                remaining = float(row[2]) - float(row[3])
                if item.allocated_amount - remaining > 0.009:
                    raise HTTPException(status_code=400, detail=f"ยอดจัดสรรเกินยอดคงเหลือของการประเมินรหัส {item.assessment_id}")

            stage = "บันทึกรายการรับชำระ"
            cursor.execute(
                """
                INSERT INTO public.payments (
                    payment_amount, payment_date, paid_at, payment_method,
                    reference_no, receipt_no, status, recorded_by
                )
                VALUES (%s, %s, %s, %s, %s, %s, 'MATCHED', %s)
                RETURNING payment_id
                """,
                (
                    request.payment_amount, request.payment_date,
                    request.payment_datetime or datetime.now().astimezone(),
                    request.payment_method.upper(), request.reference_no,
                    request.receipt_no, recorded_by
                )
            )
            payment_id = cursor.fetchone()[0]

            stage = "จัดสรรยอดตามประเภทภาษี"
            cursor.executemany(
                """INSERT INTO public.payment_allocations
                   (payment_id,assessment_id,allocated_amount,matched_by)
                   VALUES (%s,%s,%s,%s)""",
                [(payment_id, item.assessment_id, item.allocated_amount, recorded_by)
                 for item in request.allocations],
            )

        return {
            "success": True,
            "message": "บันทึกการชำระและจัดสรรยอดเรียบร้อยแล้ว",
            "data": {"payment_id": payment_id}
        }
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Payment creation failed at stage: %s", stage)
        raise HTTPException(
            status_code=500,
            detail={
                "message": f"บันทึกการชำระไม่สำเร็จในขั้นตอน: {stage}",
                "error": str(error)
            }
        )

@app.post("/api/login")
def login(request: LoginRequest, http_request: Request):

    key = _login_key(http_request, request.username)
    _check_login_rate_limit(key)

    user = users_service.find_by_username(request.username.strip())

    if user is None:
        _record_login_failure(key)
        raise HTTPException(
            status_code=401,
            detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
        )

    if not user["is_active"]:
        raise HTTPException(
            status_code=403,
            detail="บัญชีผู้ใช้งานถูกปิดใช้งาน"
        )

    try:
        password_ok = password_hash.verify(
            request.password,
            user["password_hash"]
        )
    except Exception:
        password_ok = False

    if not password_ok:
        _record_login_failure(key)
        raise HTTPException(
            status_code=401,
            detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
        )

    _clear_login_failures(key)
    return {
        "success": True,
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": {
            "id": str(user["user_id"]),
            "code": user["employee_code"],
            "name": f'{user["first_name"]} {user["last_name"]}',
            "role": user["role"],
            "group": user["group_code"],
            "active": user["is_active"]
        }
    }

class TaxpayerCreate(BaseModel):
    taxpayer_type: str
    owner_code: str | None = None
    title: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    company_name: str | None = None
    phone: str | None = None
    address: str | None = None
    group_code: str
    is_active: bool = True

class CompleteTaxpayerCreate(TaxpayerCreate):
    tax_year: int
    land_amount: float = 0
    sign_amount: float = 0
    added_by: int | None = None


class HistoricalDebtCreate(BaseModel):
    tax_year: int
    land_amount: float = 0
    sign_amount: float = 0
    note: str | None = None


@app.post("/api/taxpayers/{taxpayer_id}/historical-debts")
def create_historical_debt(taxpayer_id: int, payload: HistoricalDebtCreate, request: Request):
    """บันทึกยอดหนี้ยกมาโดยไม่ต้องมีทะเบียนประจำปีฉบับเต็ม"""
    _require_group(request, _taxpayer_group(taxpayer_id))
    current_tax_year = date.today().year + 543
    if payload.tax_year < 2400 or payload.tax_year >= current_tax_year:
        raise HTTPException(status_code=400, detail=f"ปีภาษีต้องเป็นปีก่อน {current_tax_year}")
    if payload.land_amount < 0 or payload.sign_amount < 0:
        raise HTTPException(status_code=400, detail="ยอดหนี้ต้องไม่ติดลบ")
    if payload.land_amount <= 0 and payload.sign_amount <= 0:
        raise HTTPException(status_code=400, detail="กรุณาระบุยอดหนี้อย่างน้อยหนึ่งประเภทภาษี")

    note = (payload.note or "").strip()
    legacy_note = "หนี้ยกมาจากข้อมูลเดิม" + (f" — {note}" if note else "")
    try:
        with db.transaction() as cursor:
            cursor.execute(
                """INSERT INTO public.taxpayer_year_records
                   (taxpayer_id,tax_year,note,is_included,added_by)
                   VALUES (%s,%s,%s,TRUE,%s)
                   ON CONFLICT (taxpayer_id,tax_year) DO UPDATE SET
                     is_included=TRUE,
                     note=CASE
                       WHEN taxpayer_year_records.note IS NULL OR taxpayer_year_records.note='' THEN EXCLUDED.note
                       WHEN POSITION(EXCLUDED.note IN taxpayer_year_records.note)>0 THEN taxpayer_year_records.note
                       ELSE taxpayer_year_records.note || E'\n' || EXCLUDED.note
                     END
                   RETURNING year_record_id""",
                (taxpayer_id, payload.tax_year, legacy_note, _actor_id(request)),
            )
            year_record_id = cursor.fetchone()[0]
            cursor.execute(
                "SELECT tax_type FROM public.tax_assessments WHERE year_record_id=%s FOR UPDATE",
                (year_record_id,),
            )
            existing_types = {row[0] for row in cursor.fetchall()}
            requested = [
                ("LAND_BUILDING", payload.land_amount),
                ("SIGN", payload.sign_amount),
            ]
            conflicts = [tax_type for tax_type, amount in requested if amount > 0 and tax_type in existing_types]
            if conflicts:
                labels = ["ภาษีที่ดินและสิ่งปลูกสร้าง" if item == "LAND_BUILDING" else "ภาษีป้าย" for item in conflicts]
                raise HTTPException(
                    status_code=409,
                    detail=f"ปีภาษี {payload.tax_year} มีข้อมูล{' และ '.join(labels)}อยู่แล้ว กรุณาแก้ไขจากข้อมูลเดิม",
                )
            assessment_ids: dict[str, int] = {}
            for tax_type, amount in requested:
                if amount <= 0:
                    continue
                cursor.execute(
                    """INSERT INTO public.tax_assessments
                       (year_record_id,tax_type,assessed_amount,previous_amount,change_reason,created_by)
                       VALUES (%s,%s,%s,0,%s,%s) RETURNING assessment_id""",
                    (year_record_id, tax_type, amount, "บันทึกยอดหนี้ยกมาจากข้อมูลเดิม", _actor_id(request)),
                )
                assessment_ids[tax_type] = cursor.fetchone()[0]
        return {
            "success": True,
            "message": "บันทึกยอดหนี้ยกมาเรียบร้อยแล้ว",
            "data": {"year_record_id": year_record_id, "assessment_ids": assessment_ids},
        }
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Historical debt creation failed")
        raise HTTPException(status_code=500, detail={"message": "ไม่สามารถบันทึกยอดหนี้ยกมาได้", "error": str(error)})


@app.get("/api/payment-match/cross-group")
def get_cross_group_payment_matches(amount: float, tax_year: int, request: Request):
    """แจ้งผลตรงยอดจากกลุ่มอื่นโดยไม่ให้เจ้าหน้าที่ดำเนินการข้ามกลุ่ม"""
    actor = _actor(request)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="ยอดเงินต้องมากกว่า 0")
    own_group = actor.get("group") if actor.get("role") == "OFFICER" else None
    tolerance = max(amount * 0.1, 5)
    data, columns = db.fetch(
        """WITH assessment_remaining AS (
             SELECT t.taxpayer_id,t.owner_code,t.taxpayer_type,t.title,t.first_name,t.last_name,t.company_name,
                    t.group_code,tyr.tax_year,ta.tax_type,ta.assessed_amount,
                    GREATEST(ta.assessed_amount-COALESCE(SUM(pa.allocated_amount),0),0) AS remaining
             FROM public.tax_assessments ta
             JOIN public.taxpayer_year_records tyr ON tyr.year_record_id=ta.year_record_id
             JOIN public.taxpayers t ON t.taxpayer_id=tyr.taxpayer_id
             LEFT JOIN public.payment_allocations pa ON pa.assessment_id=ta.assessment_id
             WHERE tyr.is_included=TRUE AND t.is_active=TRUE
               AND (%s::text IS NULL OR t.group_code<>%s::text)
             GROUP BY t.taxpayer_id,t.owner_code,t.taxpayer_type,t.title,t.first_name,t.last_name,t.company_name,
                      t.group_code,tyr.tax_year,ta.tax_type,ta.assessed_amount
           ), candidates AS (
             SELECT *,tax_type AS match_type,remaining AS match_amount FROM assessment_remaining WHERE remaining>0
             UNION ALL
             SELECT taxpayer_id,MAX(owner_code),MAX(taxpayer_type),MAX(title),MAX(first_name),MAX(last_name),MAX(company_name),
                    group_code,tax_year,'BOTH',SUM(assessed_amount),SUM(remaining),'BOTH',SUM(remaining)
             FROM assessment_remaining
             GROUP BY taxpayer_id,group_code,tax_year
             HAVING COUNT(*) FILTER (WHERE remaining>0)>1 AND SUM(remaining)>0
           )
           SELECT taxpayer_id,owner_code,taxpayer_type,title,first_name,last_name,company_name,group_code,
                  tax_year,match_type,match_amount,(match_amount-%s) AS difference
           FROM candidates
           WHERE ABS(match_amount-%s)<=%s
           ORDER BY ABS(match_amount-%s),tax_year DESC,taxpayer_id
           LIMIT 20""",
        (own_group, own_group, amount, amount, tolerance, amount),
    )
    matches = [dict(zip(columns, row)) for row in data]
    return {"success": True, "count": len(matches), "data": jsonable_encoder(matches)}

@app.post("/api/taxpayers/complete")
def create_complete_taxpayer(request: CompleteTaxpayerCreate, http_request: Request):
    """สร้าง master, year record และ assessments ใน transaction เดียว"""
    try:
        taxpayer_type = request.taxpayer_type
        owner_code = request.owner_code
        title = (request.title or "").strip() or None
        first_name = request.first_name
        last_name = request.last_name
        company_name = request.company_name
        group_code = request.group_code

        if taxpayer_type == "INDIVIDUAL":
            if not first_name or not last_name or not owner_code:
                raise HTTPException(
                    status_code=400,
                    detail="บุคคลธรรมดาต้องมีชื่อ นามสกุล และ Owner Code"
                )
            company_name = None
        elif taxpayer_type == "COMPANY":
            if not company_name:
                raise HTTPException(
                    status_code=400,
                    detail="หน่วยงานหรือนิติบุคคลต้องมีชื่อ"
                )
            owner_code = None
            title = None
            first_name = None
            last_name = None
            group_code = "ว-ฮ และบริษัท"
        else:
            raise HTTPException(
                status_code=400,
                detail="taxpayer_type ต้องเป็น INDIVIDUAL หรือ COMPANY"
            )

        _require_group(http_request, group_code)
        actor_id = _actor_id(http_request)

        with db.transaction() as cursor:
            if owner_code is not None:
                cursor.execute(
                    "SELECT taxpayer_id FROM public.taxpayers WHERE owner_code = %s",
                    (owner_code,)
                )
                if cursor.fetchone() is not None:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Owner Code '{owner_code}' ถูกใช้งานแล้ว"
                    )

            cursor.execute(
                """
                INSERT INTO public.taxpayers (
                    taxpayer_type, owner_code, title, first_name, last_name,
                    company_name, phone, address, group_code, is_active
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING taxpayer_id
                """,
                (
                    taxpayer_type, owner_code, title, first_name, last_name,
                    company_name, request.phone, request.address,
                    group_code, request.is_active
                )
            )
            taxpayer_id = cursor.fetchone()[0]

            cursor.execute(
                """
                INSERT INTO public.taxpayer_year_records (
                    taxpayer_id, tax_year, note, is_included, added_by
                )
                VALUES (%s, %s, NULL, TRUE, %s)
                RETURNING year_record_id
                """,
                (taxpayer_id, request.tax_year, actor_id)
            )
            year_record_id = cursor.fetchone()[0]

            assessment_ids = {}
            for tax_type, amount in (
                ("LAND_BUILDING", request.land_amount),
                ("SIGN", request.sign_amount)
            ):
                if amount <= 0:
                    continue

                cursor.execute(
                    """
                    INSERT INTO public.tax_assessments (
                        year_record_id, tax_type, assessed_amount,
                        previous_amount, change_reason, assessment_date,
                        annual_due_date, created_by
                    )
                    VALUES (%s, %s, %s, 0, NULL, NULL, NULL, %s)
                    RETURNING assessment_id
                    """,
                    (year_record_id, tax_type, amount, actor_id)
                )
                assessment_ids[tax_type] = cursor.fetchone()[0]

        return {
            "success": True,
            "message": "เพิ่มผู้เสียภาษีและข้อมูลประจำปีเรียบร้อยแล้ว",
            "data": {
                "taxpayer_id": taxpayer_id,
                "year_record_id": year_record_id,
                "assessment_ids": assessment_ids
            }
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถเพิ่มผู้เสียภาษีได้",
                "error": str(error)
            }
        )

@app.post("/api/taxpayers")
def create_taxpayer(request: TaxpayerCreate, http_request: Request):
    _require_group(http_request, request.group_code)
    result = taxpayers_service.create(
        taxpayer_type=request.taxpayer_type,
        owner_code=request.owner_code,
        title=request.title,
        first_name=request.first_name,
        last_name=request.last_name,
        company_name=request.company_name,
        phone=request.phone,
        address=request.address,
        group_code=request.group_code,
        is_active=request.is_active
    )

    if result["Is Error"]:
        return {
            "success": False,
            "message": result["Error Message"]
        }

    return {
        "success": True,
        "message": "เพิ่มผู้เสียภาษีเรียบร้อยแล้ว",
        "data": {
            "taxpayer_id":
                result["taxpayer_id"]
        }
    }

class TaxpayerUpdate(BaseModel):
    taxpayer_type: str
    owner_code: str | None = None
    title: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    company_name: str | None = None
    phone: str | None = None
    address: str | None = None
    group_code: str
    is_active: bool
@app.put("/api/taxpayers/{taxpayer_id}")
def update_taxpayer(
    taxpayer_id: int,
    request: TaxpayerUpdate,
    http_request: Request,
):
    _require_group(http_request, _taxpayer_group(taxpayer_id))
    _require_group(http_request, request.group_code)
    result = taxpayers_service.update(
        taxpayer_id=taxpayer_id,
        taxpayer_type=request.taxpayer_type,
        owner_code=request.owner_code,
        title=request.title,
        first_name=request.first_name,
        last_name=request.last_name,
        company_name=request.company_name,
        phone=request.phone,
        address=request.address,
        group_code=request.group_code,
        is_active=request.is_active
    )

    if result["Is Error"]:
        return {
            "success": False,
            "message": result["Error Message"]
        }

    return {
        "success": True,
        "message": "แก้ไขข้อมูลผู้เสียภาษีเรียบร้อยแล้ว"
    }

# ปิดการใช้งานผู้เสียภาษี (ไม่ลบข้อมูลจริง)
@app.put("/api/taxpayers/{taxpayer_id}/deactivate")
def deactivate_taxpayer(taxpayer_id: int, request: Request):
    _require_group(request, _taxpayer_group(taxpayer_id))
    result = taxpayers_service.deactivate(
        taxpayer_id
    )

    if result["Is Error"]:
        return {
            "success": False,
            "message": result["Error Message"]
        }

    return {
        "success": True,
        "message": "ปิดการใช้งานผู้เสียภาษีเรียบร้อยแล้ว"
    }

@app.put("/api/taxpayers/{taxpayer_id}/reactivate")
def reactivate_taxpayer(taxpayer_id: int, request: Request):
    _require_group(request, _taxpayer_group(taxpayer_id))
    result = taxpayers_service.reactivate(taxpayer_id)
    if result["Is Error"]:
        raise HTTPException(status_code=404, detail=result["Error Message"])
    return {"success": True, "message": "เปิดใช้งานผู้เสียภาษีเรียบร้อยแล้ว"}

@app.delete("/api/taxpayers/{taxpayer_id}")
def delete_taxpayer(taxpayer_id: int, request: Request):
    _require_permanent_delete_permission(request)
    _require_group(request, _taxpayer_group(taxpayer_id))
    result = taxpayers_service.delete(taxpayer_id)
    if result["Is Error"]:
        raise HTTPException(status_code=409, detail=result["Error Message"])
    return {"success": True, "message": "ลบผู้เสียภาษีถาวรเรียบร้อยแล้ว"}

#เพิ่ม API สำหรับเพิ่มผู้เสียภาษีเข้าปีภาษี
class TaxpayerYearRecordCreate(BaseModel):
    taxpayer_id: int
    tax_year: int
    note: str | None = None
    added_by: int | None = None

class TaxpayerYearRecordUpdate(BaseModel):
    note: str | None = None
    is_included: bool = True

class AnnualBulkItem(BaseModel):
    taxpayer_id: int
    year_record_id: int | None = None
    include: bool = True
    note: str | None = None
    land_amount: float | None = None
    sign_amount: float | None = None
    prev_land_amount: float = 0
    prev_sign_amount: float = 0
    land_reason: str | None = None
    sign_reason: str | None = None

class AnnualBulkSave(BaseModel):
    tax_year: int
    user_id: int | None = None
    items: list[AnnualBulkItem]

@app.post("/api/taxpayer-year-records/bulk-save")
def bulk_save_taxpayer_year_records(request: AnnualBulkSave, http_request: Request):
    """บันทึกเพิ่ม/นำออก/ยอดประเมิน/หมายเหตุด้วย bulk upsert ชุดเดียว"""
    if not request.items:
        return {"success": True, "data": []}

    officer_group = _officer_group(http_request)
    if officer_group is not None:
        taxpayer_ids = list({item.taxpayer_id for item in request.items})
        rows, _ = db.fetch(
            """SELECT taxpayer_id FROM public.taxpayers
               WHERE taxpayer_id = ANY(%s) AND group_code=%s""",
            (taxpayer_ids, officer_group),
        )
        allowed_ids = {int(row[0]) for row in rows}
        if allowed_ids != set(taxpayer_ids):
            raise HTTPException(status_code=403, detail="มีรายการผู้เสียภาษีที่อยู่นอกกลุ่มรับผิดชอบ")
    actor_id = _actor_id(http_request)

    payload = json.dumps(
        [item.model_dump() for item in request.items],
        ensure_ascii=False,
    )
    try:
        with db.transaction() as cursor:
            # ป้องกันคำขอเปิดปีเดียวกันพร้อมกัน แล้วส่งข้อมูลทั้งหมดให้ PostgreSQL
            # จัดการใน statement เดียว เพื่อตัด network round-trip ต่อรายออก
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (request.tax_year,))
            cursor.execute(
                """
                WITH input_data AS (
                    SELECT *
                    FROM jsonb_to_recordset(%s::jsonb) AS item(
                        taxpayer_id bigint,
                        year_record_id bigint,
                        include boolean,
                        note text,
                        land_amount numeric,
                        sign_amount numeric,
                        prev_land_amount numeric,
                        prev_sign_amount numeric,
                        land_reason text,
                        sign_reason text
                    )
                ),
                saved_years AS (
                    INSERT INTO public.taxpayer_year_records
                        (taxpayer_id, tax_year, note, is_included, added_by)
                    SELECT taxpayer_id, %s, note, include, %s
                    FROM input_data
                    ON CONFLICT (taxpayer_id, tax_year) DO UPDATE SET
                        note = CASE
                            WHEN EXCLUDED.is_included THEN EXCLUDED.note
                            ELSE taxpayer_year_records.note
                        END,
                        is_included = EXCLUDED.is_included,
                        added_by = CASE
                            WHEN EXCLUDED.is_included THEN EXCLUDED.added_by
                            ELSE taxpayer_year_records.added_by
                        END,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING year_record_id, taxpayer_id, is_included
                ),
                assessment_input AS (
                    SELECT
                        sy.year_record_id,
                        i.taxpayer_id,
                        values_to_save.tax_type,
                        values_to_save.amount,
                        values_to_save.previous_amount,
                        values_to_save.reason
                    FROM saved_years sy
                    JOIN input_data i USING (taxpayer_id)
                    CROSS JOIN LATERAL (
                        VALUES
                            ('LAND_BUILDING'::text, i.land_amount, i.prev_land_amount, i.land_reason),
                            ('SIGN'::text, i.sign_amount, i.prev_sign_amount, i.sign_reason)
                    ) AS values_to_save(tax_type, amount, previous_amount, reason)
                    WHERE sy.is_included AND values_to_save.amount IS NOT NULL
                ),
                saved_assessments AS (
                    INSERT INTO public.tax_assessments
                        (year_record_id, tax_type, assessed_amount, previous_amount,
                         change_reason, created_by)
                    SELECT year_record_id, tax_type, amount, previous_amount, reason, %s
                    FROM assessment_input
                    ON CONFLICT (year_record_id, tax_type) DO UPDATE SET
                        assessed_amount = EXCLUDED.assessed_amount,
                        previous_amount = EXCLUDED.previous_amount,
                        change_reason = EXCLUDED.change_reason,
                        updated_by = %s,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING assessment_id, year_record_id, tax_type
                ),
                assessment_ids AS (
                    SELECT
                        year_record_id,
                        jsonb_object_agg(tax_type, assessment_id) AS ids
                    FROM saved_assessments
                    GROUP BY year_record_id
                )
                SELECT
                    sy.taxpayer_id,
                    sy.is_included,
                    sy.year_record_id,
                    COALESCE(ai.ids, '{}'::jsonb) AS assessment_ids,
                    i.land_amount,
                    i.sign_amount,
                    i.note
                FROM saved_years sy
                JOIN input_data i USING (taxpayer_id)
                LEFT JOIN assessment_ids ai
                    ON ai.year_record_id = sy.year_record_id
                ORDER BY sy.taxpayer_id
                """,
                (payload, request.tax_year, actor_id,
                 actor_id, actor_id),
            )
            rows = cursor.fetchall()
            results = [
                {
                    "taxpayer_id": row[0],
                    "included": row[1],
                    "year_record_id": row[2],
                    "assessment_ids": row[3],
                    "land_amount": float(row[4]) if row[4] is not None else None,
                    "sign_amount": float(row[5]) if row[5] is not None else None,
                    "note": row[6],
                }
                for row in rows
            ]
        return {"success": True, "data": results}
    except Exception as error:
        raise HTTPException(status_code=500, detail={"message": "บันทึกข้อมูลรายปีแบบชุดไม่สำเร็จ", "error": str(error)})

@app.get("/api/taxpayer-year-records/by-taxpayer/{taxpayer_id}/{tax_year}")
def get_taxpayer_year_record_by_taxpayer(taxpayer_id: int, tax_year: int, request: Request):
    """อ่านข้อมูลเดิมได้แม้ record ถูกนำออกจากปีภาษีแล้ว"""
    try:
        _require_group(request, _taxpayer_group(taxpayer_id))
        data, columns = db.fetch(
            """
            SELECT
                tyr.year_record_id,
                tyr.is_included,
                COALESCE(MAX(CASE WHEN ta.tax_type = 'LAND_BUILDING'
                    THEN ta.assessment_id END), 0) AS land_assessment_id,
                COALESCE(MAX(CASE WHEN ta.tax_type = 'SIGN'
                    THEN ta.assessment_id END), 0) AS sign_assessment_id,
                COALESCE(MAX(CASE WHEN ta.tax_type = 'LAND_BUILDING'
                    THEN ta.assessed_amount END), 0) AS land_amount,
                COALESCE(MAX(CASE WHEN ta.tax_type = 'SIGN'
                    THEN ta.assessed_amount END), 0) AS sign_amount,
                COALESCE(MAX(CASE WHEN ta.tax_type = 'LAND_BUILDING'
                    THEN ta.previous_amount END), 0) AS prev_land_amount,
                COALESCE(MAX(CASE WHEN ta.tax_type = 'SIGN'
                    THEN ta.previous_amount END), 0) AS prev_sign_amount
            FROM public.taxpayer_year_records tyr
            LEFT JOIN public.tax_assessments ta
                ON ta.year_record_id = tyr.year_record_id
            WHERE tyr.taxpayer_id = %s AND tyr.tax_year = %s
            GROUP BY tyr.year_record_id, tyr.is_included
            """,
            (taxpayer_id, tax_year)
        )

        return {
            "success": True,
            "data": dict(zip(columns, data[0])) if data else None
        }
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={"message": "ไม่สามารถโหลดข้อมูลปีภาษีเดิมได้", "error": str(error)}
        )

@app.post("/api/taxpayer-year-records")
def create_taxpayer_year_record(
    request: TaxpayerYearRecordCreate,
    http_request: Request,
):
    try:

        _require_group(http_request, _taxpayer_group(request.taxpayer_id))

        result = taxpayer_year_records_service.create(
            taxpayer_id=request.taxpayer_id,
            tax_year=request.tax_year,
            note=request.note,
            added_by=_actor_id(http_request)
        )

        if result["Is Error"]:
            raise HTTPException(
                status_code=400,
                detail=result["Error Message"]
            )

        record = (
            taxpayer_year_records_service
            .find_by_taxpayer_and_year(
                request.taxpayer_id,
                request.tax_year
            )
        )

        if record is None:
            raise HTTPException(
                status_code=500,
                detail=
                    "ดำเนินการสำเร็จ แต่ไม่พบข้อมูลปีภาษี"
            )

        return {
            "success": True,

            "action": result.get(
                "Action",
                "CREATED"
            ),

            "message": (
                "นำผู้เสียภาษีกลับเข้าปีภาษีเรียบร้อยแล้ว"
                if result.get("Action") == "REACTIVATED"
                else (
                    "ผู้เสียภาษีอยู่ในปีภาษีนี้แล้ว"
                    if result.get("Action") == "ALREADY_INCLUDED"
                    else "เพิ่มผู้เสียภาษีเข้าปีภาษีเรียบร้อยแล้ว"
                )
            ),

            "data":
                jsonable_encoder(record)
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message":
                    "ไม่สามารถเพิ่มผู้เสียภาษีเข้าปีภาษีได้",
                "error":
                str(error)
            }
        )

@app.put("/api/taxpayer-year-records/{year_record_id}")
def update_taxpayer_year_record(
    year_record_id: int,
    request: TaxpayerYearRecordUpdate,
    http_request: Request,
):
    try:
        _require_group(http_request, _year_record_group(year_record_id))
        result = taxpayer_year_records_service.update(
            year_record_id=year_record_id,
            note=request.note,
            is_included=request.is_included
        )

        if result["Is Error"]:
            raise HTTPException(
                status_code=404,
                detail=result["Error Message"]
            )

        return {
            "success": True,
            "message": "บันทึกหมายเหตุประจำปีเรียบร้อยแล้ว",
            "data": {
                "year_record_id": year_record_id,
                "note": request.note,
                "is_included": request.is_included
            }
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถบันทึกหมายเหตุประจำปีได้",
                "error": str(error)
            }
        )

# ลบผู้เสียภาษีออกจากปีภาษีนั้นๆ
@app.put("/api/taxpayer-year-records/{year_record_id}/remove")
def remove_taxpayer_from_year(year_record_id: int, request: Request):
    try:
        _require_group(request, _year_record_group(year_record_id))
        result = taxpayer_year_records_service.remove_from_year(
            year_record_id
        )

        if result["Is Error"]:
            raise HTTPException(
                status_code=404,
                detail=result["Error Message"]
            )

        return {
            "success": True,
            "message": "นำผู้เสียภาษีออกจากปีภาษีเรียบร้อยแล้ว"

        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถนำผู้เสียภาษีออกจากปีภาษีได้",
                "error": str(error)
            }
        )
    
class TaxAssessmentCreate(BaseModel):
    year_record_id: int
    tax_type: str
    assessed_amount: float
    previous_amount: float = 0
    change_reason: str | None = None
    assessment_date: str | None = None
    annual_due_date: str | None = None
    created_by: int | None = None
@app.post("/api/tax-assessments")
def create_tax_assessment(
    request: TaxAssessmentCreate,
    http_request: Request,
):
    try:
        _require_group(http_request, _year_record_group(request.year_record_id))
        result = tax_assessments_service.create(
            year_record_id=request.year_record_id,
            tax_type=request.tax_type,
            assessed_amount=request.assessed_amount,
            previous_amount=request.previous_amount,
            change_reason=request.change_reason,
            assessment_date=request.assessment_date,
            annual_due_date=request.annual_due_date,
            created_by=_actor_id(http_request)
        )

        if result["Is Error"]:
            raise HTTPException(
                status_code=400,
                detail=result["Error Message"]
            )

        return {
            "success": True,
            "message": "เพิ่มข้อมูลการประเมินภาษีเรียบร้อยแล้ว"
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถเพิ่มข้อมูลการประเมินภาษีได้",
                "error": str(error)
            }
        )

class TaxAssessmentUpdate(BaseModel):
    assessed_amount: float
    previous_amount: float
    change_reason: str | None = None
    assessment_date: str | None = None
    annual_due_date: str | None = None
    updated_by: int | None = None
@app.put("/api/tax-assessments/{assessment_id}")
def update_tax_assessment(
    assessment_id: int,
    request: TaxAssessmentUpdate,
    http_request: Request,
):
    try:
        _require_group(http_request, _assessment_group(assessment_id))
        result = tax_assessments_service.update(
            assessment_id=assessment_id,
            assessed_amount=request.assessed_amount,
            previous_amount=request.previous_amount,
            change_reason=request.change_reason,
            assessment_date=request.assessment_date,
            annual_due_date=request.annual_due_date,
            updated_by=_actor_id(http_request)
        )

        if result["Is Error"]:
            raise HTTPException(
                status_code=400,
                detail=result["Error Message"]
            )

        return {
            "success": True,
            "message": "แก้ไขข้อมูลการประเมินภาษีเรียบร้อยแล้ว"
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถแก้ไขข้อมูลการประเมินภาษีได้",
                "error": str(error)
            }
        )
#read one
@app.get("/api/tax-assessments/{assessment_id}")
def get_tax_assessment(
    assessment_id: int,
    request: Request,
):
    try:
        _require_group(request, _assessment_group(assessment_id))
        result, tax_assessment = tax_assessments_service.read(
            assessment_id
        )

        if result["Is Error"]:
            raise HTTPException(
                status_code=404,
                detail=result["Error Message"]
            )

        return {
            "success": True,
            "data": jsonable_encoder(tax_assessment)
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถดึงข้อมูลการประเมินภาษีได้",
                "error": str(error)
            }
        )
