import os
import re
import shutil
import subprocess
import tempfile


ALLOWED_CONTENT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
MAX_FILE_SIZE = 10 * 1024 * 1024


def _valid_signature(data: bytes, content_type: str) -> bool:
    if content_type == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    if content_type == "image/webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return False


def _money_candidates(text: str) -> list[float]:
    # รับเฉพาะตัวเลขที่มีทศนิยม 2 หลัก เพื่อลดโอกาสหยิบเลขบัญชี/วันที่เป็นยอดเงิน
    matches = re.findall(
        r"(?<!\d)(?:\d{1,3}(?:,\d{3})+|\d{1,7})\.\d{2}(?!\d)",
        text,
    )
    values = []
    for token in matches:
        value = float(token.replace(",", ""))
        if 0 < value <= 10_000_000:
            values.append(value)
    return values


def read_slip(data: bytes, content_type: str) -> dict:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("รองรับเฉพาะไฟล์ PNG, JPG, JPEG และ WEBP")
    if not data:
        raise ValueError("ไฟล์รูปว่างเปล่า")
    if len(data) > MAX_FILE_SIZE:
        raise ValueError("ไฟล์รูปต้องมีขนาดไม่เกิน 10 MB")
    if not _valid_signature(data, content_type):
        raise ValueError("เนื้อหาไฟล์ไม่ตรงกับชนิดรูปภาพ")
    if shutil.which("tesseract") is None:
        raise RuntimeError("เซิร์ฟเวอร์ยังไม่ได้ติดตั้ง Tesseract OCR")

    suffix = ALLOWED_CONTENT_TYPES[content_type]
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            temp_file.write(data)
            temp_path = temp_file.name

        result = subprocess.run(
            ["tesseract", temp_path, "stdout", "-l", "eng+tha", "--psm", "6"],
            capture_output=True,
            text=True,
            timeout=25,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "OCR ไม่สามารถอ่านรูปนี้ได้")

        text = result.stdout.strip()
        amounts = _money_candidates(text)
        # สลิปมักแสดงยอดโอนเป็นจำนวนเงินที่เด่นที่สุด; คืน candidates ให้ผู้ใช้ตรวจสอบด้วย
        amount = max(amounts) if amounts else None
        return {
            "amount": amount,
            "amount_candidates": sorted(set(amounts), reverse=True),
            "ocr_text": text,
        }
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
