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

password_hash = PasswordHash.recommended()


class LoginRequest(BaseModel):
    username: str
    password: str


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
        record = taxpayer_year_records_service.create(
            taxpayer_id=request.taxpayer_id,
            tax_year=request.tax_year,
            note=request.note,
            added_by=request.added_by
        )

        if record is None:
            raise HTTPException(
                status_code=500,
                detail="ไม่สามารถเพิ่มผู้เสียภาษีเข้าปีภาษีได้"
            )

        return {
            "success": True,
            "data": jsonable_encoder(record)
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "ไม่สามารถเพิ่มผู้เสียภาษีเข้าปีภาษีได้",
                "error": str(e)
            }
        )