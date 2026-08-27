import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import HTTPException, Request


TOKEN_TTL_SECONDS = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", "28800"))


def _secret() -> bytes:
    value = os.getenv("AUTH_SECRET", "").strip()
    if len(value) < 32:
        raise RuntimeError("AUTH_SECRET ต้องมีความยาวอย่างน้อย 32 ตัวอักษร")
    return value.encode("utf-8")


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_access_token(user: dict) -> str:
    payload = {
        "sub": int(user["user_id"]),
        "role": str(user["role"]).upper(),
        "group": user.get("group_code"),
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }
    body = _encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _encode(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{signature}"


def verify_access_token(token: str) -> dict:
    try:
        body, signature = token.split(".", 1)
        expected = _encode(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid signature")
        payload = json.loads(_decode(body))
        if int(payload["exp"]) <= int(time.time()):
            raise ValueError("expired")
        return payload
    except Exception as error:
        raise HTTPException(status_code=401, detail="กรุณาเข้าสู่ระบบอีกครั้ง") from error


def authenticated_user(request: Request) -> dict:
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="กรุณาเข้าสู่ระบบ")
    return verify_access_token(token)
