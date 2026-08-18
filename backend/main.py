from fastapi import FastAPI, HTTPException
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

class LoginRequest(BaseModel):
    username: str
    password: str
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

#เพิ่ม API สำหรับเพิ่มผู้เสียภาษีเข้าปีภาษี
class TaxpayerYearRecordCreate(BaseModel):
    taxpayer_id: int
    tax_year: int
    note: str | None = None
    added_by: int | None = None
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
                detail="สร้างข้อมูลปีภาษีสำเร็จ แต่ไม่พบข้อมูลที่สร้าง"
            )

        return {
            "success": True,
            "message":
                "เพิ่มผู้เสียภาษีเข้าปีภาษีเรียบร้อยแล้ว",
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