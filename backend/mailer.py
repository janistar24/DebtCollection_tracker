import html
import os
import smtplib
import ssl
from email.message import EmailMessage


def send_user_invitation(email: str, recipient_name: str, invitation_url: str, expires_hours: int) -> None:
    host = os.getenv("SMTP_HOST", "").strip()
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_APP_PASSWORD", "").strip()
    from_email = os.getenv("SMTP_FROM_EMAIL", username).strip()
    from_name = os.getenv("SMTP_FROM_NAME", "ระบบบริหารภาษี เทศบาลเมืองตาคลี").strip()
    port = int(os.getenv("SMTP_PORT", "587"))

    if not host or not username or not password or not from_email:
        raise RuntimeError("ยังไม่ได้กำหนดค่า SMTP สำหรับการส่งอีเมล")

    safe_name = html.escape(recipient_name)
    safe_url = html.escape(invitation_url, quote=True)
    message = EmailMessage()
    message["Subject"] = "คำเชิญเข้าใช้งานระบบบริหารภาษี เทศบาลเมืองตาคลี"
    message["From"] = f"{from_name} <{from_email}>"
    message["To"] = email
    message.set_content(
        f"เรียน {recipient_name}\n\n"
        "ผู้ดูแลระบบได้เชิญท่านเข้าใช้งานระบบบริหารภาษี เทศบาลเมืองตาคลี\n"
        f"กรุณาตั้งชื่อผู้ใช้งานและรหัสผ่านภายใน {expires_hours} ชั่วโมง:\n{invitation_url}\n\n"
        "หากท่านไม่ได้คาดหมายอีเมลฉบับนี้ โปรดละเว้นข้อความนี้"
    )
    message.add_alternative(
        f"""
        <div style="font-family:Arial,'Noto Sans Thai',sans-serif;color:#302747;line-height:1.7">
          <h2 style="color:#6d4fbb">คำเชิญเข้าใช้งานระบบบริหารภาษี</h2>
          <p>เรียน {safe_name}</p>
          <p>ผู้ดูแลระบบได้เชิญท่านเข้าใช้งานระบบบริหารภาษี เทศบาลเมืองตาคลี</p>
          <p><a href="{safe_url}" style="display:inline-block;padding:11px 18px;border-radius:9px;background:#7653c6;color:#fff;text-decoration:none">ตั้งค่าบัญชีผู้ใช้งาน</a></p>
          <p style="color:#766b8d;font-size:13px">ลิงก์นี้ใช้ได้ครั้งเดียวและจะหมดอายุภายใน {expires_hours} ชั่วโมง</p>
        </div>
        """,
        subtype="html",
    )

    context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=context, timeout=20) as server:
            server.login(username, password)
            server.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(username, password)
            server.send_message(message)
