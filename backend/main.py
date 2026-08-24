import subprocess

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

app = FastAPI(
    title="Tax Collection API",
    version="1.0.0",
    default_response_class=JSONResponse
)

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
    allow_origins=[
        "http://localhost:8443",
        "http://127.0.0.1:8443",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

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

# Journey -------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str

class PaymentAllocationInput(BaseModel):
    assessment_id: int
    allocated_amount: float

class CompletePaymentCreate(BaseModel):
    payment_amount: float
    payment_date: str
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

    try:
        with db.transaction() as cursor:
            for item in request.allocations:
                cursor.execute(
                    "SELECT assessment_id FROM public.tax_assessments WHERE assessment_id = %s",
                    (item.assessment_id,)
                )
                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"ไม่พบข้อมูลการประเมินภาษีรหัส {item.assessment_id}"
                    )

            cursor.execute(
                """
                INSERT INTO public.payments (
                    payment_amount, payment_date, payment_method,
                    reference_no, receipt_no, status, recorded_by
                )
                VALUES (%s, %s, %s, %s, %s, 'MATCHED', %s)
                RETURNING payment_id
                """,
                (
                    request.payment_amount, request.payment_date,
                    request.payment_method.upper(), request.reference_no,
                    request.receipt_no, request.recorded_by
                )
            )
            payment_id = cursor.fetchone()[0]

            for item in request.allocations:
                cursor.execute(
                    """
                    INSERT INTO public.payment_allocations (
                        payment_id, assessment_id, allocated_amount, matched_by
                    )
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        payment_id, item.assessment_id,
                        item.allocated_amount, request.recorded_by
                    )
                )

        return {
            "success": True,
            "message": "บันทึกการชำระและจัดสรรยอดเรียบร้อยแล้ว",
            "data": {"payment_id": payment_id}
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail={"message": "บันทึกการชำระไม่สำเร็จ", "error": str(error)}
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
