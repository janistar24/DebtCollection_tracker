import json
import logging
import os
import subprocess
import traceback
from datetime import date, datetime

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

app = FastAPI(
    title="Tax Collection API",
    version="1.0.0",
    default_response_class=JSONResponse
)

logger = logging.getLogger("tax_collection_api")
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

PUBLIC_PATHS = {"/", "/api/login", "/docs", "/openapi.json", "/redoc"}

@app.middleware("http")
async def enforce_authentication(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in PUBLIC_PATHS:
        return await call_next(request)
    if request.url.path.startswith("/api/"):
        try:
            user = authenticated_user(request)
            request.state.user = user
            if request.url.path == "/api/database-test" and user["role"] != "ADMIN":
                raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้")
            if request.url.path.startswith("/api/users") and request.method != "GET" and user["role"] != "ADMIN":
                raise HTTPException(status_code=403, detail="เฉพาะผู้ดูแลระบบเท่านั้น")
            if request.method in {"POST", "PUT", "PATCH", "DELETE"} and user["role"] == "DIRECTOR":
                raise HTTPException(status_code=403, detail="บัญชีผู้บริหารมีสิทธิ์ดูข้อมูลเท่านั้น")
        except HTTPException as error:
            return JSONResponse(status_code=error.status_code, content={"detail": error.detail})
    return await call_next(request)

@app.middleware("http")
async def add_utf8_charset(request, call_next):
    response = await call_next(request)

    if response.headers.get("content-type", "").startswith("application/json"):
        response.headers["content-type"] = "application/json; charset=utf-8"

    return response

@app.get("/")
def home():
    return {
        "message": "Tax Collection Backend Running"
    }


@app.get("/health")
def health_check():
    return {"status": "ok"}

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
def get_users():
    try:
        users = users_service.dump()

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
    password: str
    role: str
    group_code: str | None = None
    is_active: bool = True

class AdminUserUpdate(BaseModel):
    employee_code: str
    first_name: str
    last_name: str
    username: str
    password: str | None = None
    role: str
    group_code: str | None = None
    is_active: bool = True

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
    try:
        with db.transaction() as cursor:
            cursor.execute(
                "SELECT user_id FROM public.users WHERE employee_code=%s OR username=%s",
                (request.employee_code.strip(), request.username.strip()),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="รหัสพนักงานหรือ Username ถูกใช้งานแล้ว")
            cursor.execute(
                """INSERT INTO public.users
                   (employee_code,first_name,last_name,role,username,password_hash,is_active)
                   VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING user_id""",
                (request.employee_code.strip(), request.first_name.strip(), request.last_name.strip(),
                 role, request.username.strip(), password_hash.hash(request.password), request.is_active),
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
    try:
        with db.transaction() as cursor:
            cursor.execute("SELECT user_id FROM public.users WHERE user_id=%s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้งาน")
            cursor.execute(
                """SELECT user_id FROM public.users
                   WHERE (employee_code=%s OR username=%s) AND user_id<>%s""",
                (request.employee_code.strip(), request.username.strip(), user_id),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="รหัสพนักงานหรือ Username ถูกใช้งานแล้ว")
            if request.password:
                cursor.execute(
                    """UPDATE public.users SET employee_code=%s,first_name=%s,last_name=%s,
                       role=%s,username=%s,password_hash=%s,is_active=%s,updated_at=CURRENT_TIMESTAMP
                       WHERE user_id=%s""",
                    (request.employee_code.strip(), request.first_name.strip(), request.last_name.strip(),
                     role, request.username.strip(), password_hash.hash(request.password),
                     request.is_active, user_id),
                )
            else:
                cursor.execute(
                    """UPDATE public.users SET employee_code=%s,first_name=%s,last_name=%s,
                       role=%s,username=%s,is_active=%s,updated_at=CURRENT_TIMESTAMP
                       WHERE user_id=%s""",
                    (request.employee_code.strip(), request.first_name.strip(), request.last_name.strip(),
                     role, request.username.strip(), request.is_active, user_id),
                )
            _save_user_assignment(cursor, user_id, role, request.group_code)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail={"message": "แก้ไขผู้ใช้งานไม่สำเร็จ", "error": str(error)})

@app.put("/api/users/{user_id}/active")
def set_admin_user_active(user_id: int, is_active: bool):
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

@app.get("/api/taxpayers")
def get_taxpayers():
    try:
        taxpayers = taxpayers_service.dump()

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
def get_tax_assessments():
    try:
        tax_assessments = tax_assessments_service.dump()

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
def get_payments():
    try:
        payments = payments_service.dump()

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
def get_payment_allocations():
    try:
        allocations = payment_allocations_service.dump()
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
def get_monthly_payment_report(tax_year: int, group_code: str | None = None):
    """สรุปยอดรับชำระจาก payment_date จริง แยกเดือนและประเภทภาษี"""
    try:
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
            WHERE tyr.tax_year = %s
              AND (%s::text IS NULL OR t.group_code = %s::text)
            GROUP BY EXTRACT(MONTH FROM p.payment_date)
            ORDER BY payment_month
            """,
            (tax_year, group_code, group_code)
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
def get_follow_up_logs():
    try:
        follow_up_logs = follow_up_logs_service.dump()

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
def create_follow_up_log(request: FollowUpCreate):
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
                 request.next_follow_date, request.recorded_by),
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
    payment_method: str
    reference_no: str | None = None
    receipt_no: str | None = None
    recorded_by: int | None = None
    allocations: list[PaymentAllocationInput]

@app.post("/api/payments/complete")
def create_complete_payment(request: CompletePaymentCreate):
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

    stage = "ตรวจสอบข้อมูลก่อนบันทึก"
    try:
        with db.transaction() as cursor:
            if request.recorded_by is not None:
                stage = "ตรวจสอบผู้บันทึก"
                cursor.execute(
                    "SELECT user_id FROM public.users WHERE user_id = %s",
                    (request.recorded_by,)
                )
                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=400,
                        detail=f"ไม่พบผู้ใช้งานรหัส {request.recorded_by} กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่"
                    )

            stage = "ตรวจสอบรายการประเมินภาษี"
            cursor.execute(
                """SELECT ta.assessment_id,ta.year_record_id,ta.assessed_amount,
                          COALESCE((SELECT SUM(pa.allocated_amount)
                                    FROM public.payment_allocations pa
                                    WHERE pa.assessment_id=ta.assessment_id),0) AS paid_amount
                   FROM public.tax_assessments ta
                   WHERE ta.assessment_id = ANY(%s)
                   FOR UPDATE OF ta""",
                (assessment_ids,),
            )
            assessment_rows = {row[0]: row for row in cursor.fetchall()}
            missing = [item_id for item_id in assessment_ids if item_id not in assessment_rows]
            if missing:
                raise HTTPException(status_code=404, detail=f"ไม่พบข้อมูลการประเมินภาษีรหัส {missing[0]}")
            if len({row[1] for row in assessment_rows.values()}) != 1:
                raise HTTPException(status_code=400, detail="รายการภาษีที่จัดสรรต้องเป็นของผู้เสียภาษีรายเดียวกันและปีเดียวกัน")
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
                    request.receipt_no, request.recorded_by
                )
            )
            payment_id = cursor.fetchone()[0]

            stage = "จัดสรรยอดตามประเภทภาษี"
            cursor.executemany(
                """INSERT INTO public.payment_allocations
                   (payment_id,assessment_id,allocated_amount,matched_by)
                   VALUES (%s,%s,%s,%s)""",
                [(payment_id, item.assessment_id, item.allocated_amount, request.recorded_by)
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
        print(f"[payments/complete] failed at: {stage}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail={
                "message": f"บันทึกการชำระไม่สำเร็จในขั้นตอน: {stage}",
                "error": str(error)
            }
        )

@app.post("/api/login")
def login(request: LoginRequest):

    user = users_service.find_by_username(request.username)

    if user is None:
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
        raise HTTPException(
            status_code=401,
            detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
        )

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

@app.post("/api/taxpayers/complete")
def create_complete_taxpayer(request: CompleteTaxpayerCreate):
    """สร้าง master, year record และ assessments ใน transaction เดียว"""
    try:
        taxpayer_type = request.taxpayer_type
        owner_code = request.owner_code
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
                    detail="นิติบุคคลหรือบริษัทต้องมีชื่อบริษัท"
                )
            owner_code = None
            first_name = None
            last_name = None
            group_code = "ว-ฮ และบริษัท"
        else:
            raise HTTPException(
                status_code=400,
                detail="taxpayer_type ต้องเป็น INDIVIDUAL หรือ COMPANY"
            )

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
                    taxpayer_type, owner_code, first_name, last_name,
                    company_name, phone, address, group_code, is_active
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING taxpayer_id
                """,
                (
                    taxpayer_type, owner_code, first_name, last_name,
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
                (taxpayer_id, request.tax_year, request.added_by)
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
                    (year_record_id, tax_type, amount, request.added_by)
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
def create_taxpayer(request: TaxpayerCreate):
    result = taxpayers_service.create(
        taxpayer_type=request.taxpayer_type,
        owner_code=request.owner_code,
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
    request: TaxpayerUpdate
):
    result = taxpayers_service.update(
        taxpayer_id=taxpayer_id,
        taxpayer_type=request.taxpayer_type,
        owner_code=request.owner_code,
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
def deactivate_taxpayer(taxpayer_id: int):
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
def reactivate_taxpayer(taxpayer_id: int):
    result = taxpayers_service.reactivate(taxpayer_id)
    if result["Is Error"]:
        raise HTTPException(status_code=404, detail=result["Error Message"])
    return {"success": True, "message": "เปิดใช้งานผู้เสียภาษีเรียบร้อยแล้ว"}

@app.delete("/api/taxpayers/{taxpayer_id}")
def delete_taxpayer(taxpayer_id: int):
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
def bulk_save_taxpayer_year_records(request: AnnualBulkSave):
    """บันทึกเพิ่ม/นำออก/ยอดประเมิน/หมายเหตุด้วย bulk upsert ชุดเดียว"""
    if not request.items:
        return {"success": True, "data": []}

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
                (payload, request.tax_year, request.user_id,
                 request.user_id, request.user_id),
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
def get_taxpayer_year_record_by_taxpayer(taxpayer_id: int, tax_year: int):
    """อ่านข้อมูลเดิมได้แม้ record ถูกนำออกจากปีภาษีแล้ว"""
    try:
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
    request: TaxpayerYearRecordCreate
):
    try:

        result = taxpayer_year_records_service.create(
            taxpayer_id=request.taxpayer_id,
            tax_year=request.tax_year,
            note=request.note,
            added_by=request.added_by
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
    request: TaxpayerYearRecordUpdate
):
    try:
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
def remove_taxpayer_from_year(year_record_id: int):
    try:
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
    request: TaxAssessmentCreate
):
    try:
        result = tax_assessments_service.create(
            year_record_id=request.year_record_id,
            tax_type=request.tax_type,
            assessed_amount=request.assessed_amount,
            previous_amount=request.previous_amount,
            change_reason=request.change_reason,
            assessment_date=request.assessment_date,
            annual_due_date=request.annual_due_date,
            created_by=request.created_by
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
    request: TaxAssessmentUpdate
):
    try:
        result = tax_assessments_service.update(
            assessment_id=assessment_id,
            assessed_amount=request.assessed_amount,
            previous_amount=request.previous_amount,
            change_reason=request.change_reason,
            assessment_date=request.assessment_date,
            annual_due_date=request.annual_due_date,
            updated_by=request.updated_by
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
    assessment_id: int
):
    try:
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
