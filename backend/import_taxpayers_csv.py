import argparse
import csv
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

from DBHelper import DBHelper


HEADERS = [
    "name",
    "surname",
    "ownercode",
    "landtax_amount",
    "เพิ่มลดภาษีที่ดินและสิ่งปลูกสร้าง",
    "ครั้งที่ภาษีที่ดินและสิ่งปลูกสร้าง",
    "signtax_amount",
    "เพิ่มลดภาษีป้าย",
    "ครั้งที่ภาษีป้าย",
    "หมายเหตุ",
]

GROUPS = ("ก-น", "บ-ล", "ส-ศ", "ว-ฮ และบริษัท")


@dataclass(frozen=True)
class ImportRow:
    row_number: int
    name: str
    surname: str
    owner_code: str
    land_amount: Decimal
    land_change: Decimal
    land_count: int
    sign_amount: Decimal
    sign_change: Decimal
    sign_count: int
    note: str | None


def clean_text(value: object) -> str:
    return str(value or "").replace("\ufeff", "").strip()


def normalize_header(value: object) -> str:
    """ให้หัวคอลัมน์ที่ต่างกันเพียงช่องว่างหรือ / ถือเป็นคอลัมน์เดียวกัน"""
    return re.sub(r"[\s/]+", "", clean_text(value)).lower()


def row_value(row: dict[str, object], header: str) -> object:
    expected = normalize_header(header)
    for key, value in row.items():
        if normalize_header(key) == expected:
            return value
    return ""


def normalize_owner_code(value: object) -> str:
    return re.sub(r"\s+", "", clean_text(value))


def parse_money(value: object, field: str, row_number: int) -> Decimal:
    raw = clean_text(value).replace(",", "").replace("฿", "")
    if not raw:
        return Decimal("0")
    try:
        amount = Decimal(raw)
    except InvalidOperation as error:
        raise ValueError(f"แถว {row_number}: {field} ต้องเป็นตัวเลข") from error
    return amount.quantize(Decimal("0.01"))


def parse_count(value: object, field: str, row_number: int) -> int:
    raw = clean_text(value)
    if not raw:
        return 0
    try:
        count = int(raw)
    except ValueError as error:
        raise ValueError(f"แถว {row_number}: {field} ต้องเป็นจำนวนเต็ม") from error
    if count < 0:
        raise ValueError(f"แถว {row_number}: {field} ห้ามติดลบ")
    return count


def read_rows(csv_path: Path) -> list[ImportRow]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        sample = csv_file.read(4096)
        csv_file.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel

        reader = csv.DictReader(csv_file, dialect=dialect)
        actual_headers = {
            normalize_header(header) for header in (reader.fieldnames or []) if clean_text(header)
        }
        missing = [
            header for header in HEADERS if normalize_header(header) not in actual_headers
        ]
        if missing:
            raise ValueError("ไม่พบคอลัมน์: " + ", ".join(missing))

        rows: list[ImportRow] = []
        taxpayer_rows: dict[tuple[str, str, str], int] = {}
        for row_number, raw in enumerate(reader, start=2):
            if not any(clean_text(value) for value in raw.values()):
                continue

            name = clean_text(row_value(raw, "name"))
            surname = clean_text(row_value(raw, "surname"))
            owner_code = normalize_owner_code(row_value(raw, "ownercode"))
            if not name:
                raise ValueError(f"แถว {row_number}: กรุณากรอก name")
            if not surname:
                raise ValueError(f"แถว {row_number}: กรุณากรอก surname")
            if not owner_code:
                raise ValueError(f"แถว {row_number}: กรุณากรอก ownercode")
            taxpayer_key = (name.casefold(), surname.casefold(), owner_code)
            if taxpayer_key in taxpayer_rows:
                raise ValueError(
                    f"แถว {row_number}: ผู้เสียภาษีซ้ำกับแถว {taxpayer_rows[taxpayer_key]} "
                    "(ชื่อ นามสกุล และ ownercode ตรงกันทั้งหมด)"
                )
            taxpayer_rows[taxpayer_key] = row_number

            land_amount = parse_money(row_value(raw, "landtax_amount"), "landtax_amount", row_number)
            land_change = parse_money(
                row_value(raw, "เพิ่มลดภาษีที่ดินและสิ่งปลูกสร้าง"),
                "เพิ่มลดภาษีที่ดินและสิ่งปลูกสร้าง",
                row_number,
            )
            sign_amount = parse_money(row_value(raw, "signtax_amount"), "signtax_amount", row_number)
            sign_change = parse_money(row_value(raw, "เพิ่มลดภาษีป้าย"), "เพิ่มลดภาษีป้าย", row_number)
            land_count = parse_count(
                row_value(raw, "ครั้งที่ภาษีที่ดินและสิ่งปลูกสร้าง"),
                "ครั้งที่ภาษีที่ดินและสิ่งปลูกสร้าง",
                row_number,
            )
            sign_count = parse_count(
                row_value(raw, "ครั้งที่ภาษีป้าย"), "ครั้งที่ภาษีป้าย", row_number
            )

            if land_amount < 0 or sign_amount < 0:
                raise ValueError(f"แถว {row_number}: จำนวนเงินภาษีห้ามติดลบ")
            if land_amount - land_change < 0:
                raise ValueError(f"แถว {row_number}: ยอดภาษีที่ดินปีก่อนคำนวณแล้วติดลบ")
            if sign_amount - sign_change < 0:
                raise ValueError(f"แถว {row_number}: ยอดภาษีป้ายปีก่อนคำนวณแล้วติดลบ")

            note = clean_text(row_value(raw, "หมายเหตุ")) or None
            rows.append(
                ImportRow(
                    row_number=row_number,
                    name=name,
                    surname=surname,
                    owner_code=owner_code,
                    land_amount=land_amount,
                    land_change=land_change,
                    land_count=land_count,
                    sign_amount=sign_amount,
                    sign_change=sign_change,
                    sign_count=sign_count,
                    note=note,
                )
            )
    if not rows:
        raise ValueError("ไม่พบข้อมูลสำหรับนำเข้า")
    return rows


def upsert_assessment(
    cursor,
    *,
    year_record_id: int,
    tax_type: str,
    amount: Decimal,
    change: Decimal,
    adjustment_count: int,
    user_id: int | None,
) -> None:
    previous_amount = amount - change
    cursor.execute(
        """
        INSERT INTO public.tax_assessments (
            year_record_id, tax_type, assessed_amount, previous_amount,
            adjustment_count, change_reason, created_by, updated_by
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (year_record_id,tax_type) DO UPDATE SET
            previous_amount = EXCLUDED.previous_amount,
            assessed_amount = EXCLUDED.assessed_amount,
            adjustment_count = EXCLUDED.adjustment_count,
            change_reason = EXCLUDED.change_reason,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            year_record_id,
            tax_type,
            amount,
            previous_amount,
            adjustment_count,
            f"นำเข้า CSV: เพิ่ม/ลด {change:+.2f}",
            user_id,
            user_id,
        ),
    )


def import_rows(
    rows: list[ImportRow], tax_year: int, group_code: str, user_id: int | None
) -> None:
    db = DBHelper()
    try:
        with db.transaction() as cursor:
            cursor.execute(
                """SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='tax_assessments'
                     AND column_name='adjustment_count'"""
            )
            if cursor.fetchone() is None:
                raise RuntimeError(
                    "กรุณารัน migrations/002_add_adjustment_count.sql ก่อนนำเข้า"
                )

            if user_id is not None:
                cursor.execute("SELECT 1 FROM public.users WHERE user_id=%s", (user_id,))
                if cursor.fetchone() is None:
                    raise ValueError(f"ไม่พบผู้ใช้งาน user_id={user_id}")
            print("กำลังส่งข้อมูลขึ้นฐานข้อมูล...", flush=True)
            cursor.execute(
                """
                CREATE TEMP TABLE import_taxpayers_stage (
                    row_number INTEGER PRIMARY KEY,
                    first_name TEXT NOT NULL,
                    last_name TEXT NOT NULL,
                    owner_code TEXT NOT NULL,
                    land_amount NUMERIC(14,2) NOT NULL,
                    land_change NUMERIC(14,2) NOT NULL,
                    land_count INTEGER NOT NULL,
                    sign_amount NUMERIC(14,2) NOT NULL,
                    sign_change NUMERIC(14,2) NOT NULL,
                    sign_count INTEGER NOT NULL,
                    note TEXT
                ) ON COMMIT DROP
                """
            )
            with cursor.copy(
                """COPY import_taxpayers_stage (
                    row_number, first_name, last_name, owner_code,
                    land_amount, land_change, land_count,
                    sign_amount, sign_change, sign_count, note
                ) FROM STDIN"""
            ) as copy:
                for item in rows:
                    copy.write_row(
                        (
                            item.row_number,
                            item.name,
                            item.surname,
                            item.owner_code,
                            item.land_amount,
                            item.land_change,
                            item.land_count,
                            item.sign_amount,
                            item.sign_change,
                            item.sign_count,
                            item.note,
                        )
                    )

            cursor.execute(
                """
                SELECT s.row_number
                FROM import_taxpayers_stage s
                JOIN public.taxpayers t
                  ON regexp_replace(COALESCE(t.owner_code,''),'\\s','','g') = s.owner_code
                 AND lower(trim(COALESCE(t.first_name,''))) = lower(trim(s.first_name))
                 AND lower(trim(COALESCE(t.last_name,''))) = lower(trim(s.last_name))
                GROUP BY s.row_number
                HAVING COUNT(*) > 1
                ORDER BY s.row_number
                LIMIT 1
                """
            )
            duplicate = cursor.fetchone()
            if duplicate:
                raise ValueError(
                    f"แถว {duplicate[0]}: พบชื่อ นามสกุล และ ownercode "
                    "เดียวกันหลายรายการในฐานข้อมูล"
                )

            print("กำลังบันทึกข้อมูลผู้เสียภาษี...", flush=True)
            cursor.execute(
                """
                UPDATE public.taxpayers t
                SET first_name = s.first_name,
                    last_name = s.last_name,
                    owner_code = s.owner_code,
                    group_code = %s,
                    taxpayer_type = 'INDIVIDUAL',
                    is_active = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                FROM import_taxpayers_stage s
                WHERE regexp_replace(COALESCE(t.owner_code,''),'\\s','','g') = s.owner_code
                  AND lower(trim(COALESCE(t.first_name,''))) = lower(trim(s.first_name))
                  AND lower(trim(COALESCE(t.last_name,''))) = lower(trim(s.last_name))
                """,
                (group_code,),
            )
            cursor.execute(
                """
                INSERT INTO public.taxpayers (
                    taxpayer_type, owner_code, first_name, last_name,
                    group_code, is_active
                )
                SELECT 'INDIVIDUAL', s.owner_code, s.first_name, s.last_name, %s, TRUE
                FROM import_taxpayers_stage s
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM public.taxpayers t
                    WHERE regexp_replace(COALESCE(t.owner_code,''),'\\s','','g') = s.owner_code
                      AND lower(trim(COALESCE(t.first_name,''))) = lower(trim(s.first_name))
                      AND lower(trim(COALESCE(t.last_name,''))) = lower(trim(s.last_name))
                )
                """,
                (group_code,),
            )

            print("กำลังบันทึกข้อมูลปีภาษี...", flush=True)
            cursor.execute(
                """
                INSERT INTO public.taxpayer_year_records (
                    taxpayer_id, tax_year, note, is_included, added_by
                )
                SELECT t.taxpayer_id, %s, s.note, TRUE, %s
                FROM import_taxpayers_stage s
                JOIN public.taxpayers t
                  ON regexp_replace(COALESCE(t.owner_code,''),'\\s','','g') = s.owner_code
                 AND lower(trim(COALESCE(t.first_name,''))) = lower(trim(s.first_name))
                 AND lower(trim(COALESCE(t.last_name,''))) = lower(trim(s.last_name))
                ON CONFLICT (taxpayer_id, tax_year) DO UPDATE SET
                    note = EXCLUDED.note,
                    is_included = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (tax_year, user_id),
            )

            print("กำลังบันทึกยอดประเมินภาษี...", flush=True)
            cursor.execute(
                """
                INSERT INTO public.tax_assessments (
                    year_record_id, tax_type, assessed_amount, previous_amount,
                    adjustment_count, change_reason, created_by, updated_by
                )
                SELECT
                    yr.year_record_id,
                    assessment.tax_type,
                    assessment.amount,
                    assessment.amount - assessment.change_amount,
                    assessment.adjustment_count,
                    'นำเข้า CSV: เพิ่ม/ลด ' ||
                        to_char(assessment.change_amount, 'FM999999999999990.00'),
                    %s,
                    %s
                FROM import_taxpayers_stage s
                JOIN public.taxpayers t
                  ON regexp_replace(COALESCE(t.owner_code,''),'\\s','','g') = s.owner_code
                 AND lower(trim(COALESCE(t.first_name,''))) = lower(trim(s.first_name))
                 AND lower(trim(COALESCE(t.last_name,''))) = lower(trim(s.last_name))
                JOIN public.taxpayer_year_records yr
                  ON yr.taxpayer_id = t.taxpayer_id
                 AND yr.tax_year = %s
                CROSS JOIN LATERAL (
                    VALUES
                        ('LAND_BUILDING', s.land_amount, s.land_change, s.land_count),
                        ('SIGN', s.sign_amount, s.sign_change, s.sign_count)
                ) AS assessment(tax_type, amount, change_amount, adjustment_count)
                WHERE assessment.amount > 0
                   OR assessment.change_amount <> 0
                   OR assessment.adjustment_count > 0
                ON CONFLICT (year_record_id, tax_type) DO UPDATE SET
                    previous_amount = EXCLUDED.previous_amount,
                    assessed_amount = EXCLUDED.assessed_amount,
                    adjustment_count = EXCLUDED.adjustment_count,
                    change_reason = EXCLUDED.change_reason,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (user_id, user_id, tax_year),
            )

            cursor.execute(
                """
                SELECT COUNT(DISTINCT t.taxpayer_id)
                FROM import_taxpayers_stage s
                JOIN public.taxpayers t
                  ON regexp_replace(COALESCE(t.owner_code,''),'\\s','','g') = s.owner_code
                 AND lower(trim(COALESCE(t.first_name,''))) = lower(trim(s.first_name))
                 AND lower(trim(COALESCE(t.last_name,''))) = lower(trim(s.last_name))
                """
            )
            mapped_count = cursor.fetchone()[0]
            if mapped_count != len(rows):
                raise RuntimeError(
                    f"จับคู่ข้อมูลได้ {mapped_count}/{len(rows)} ราย ระบบยกเลิกการนำเข้า"
                )
            print("กำลังยืนยันข้อมูลทั้งหมด...", flush=True)
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="ตรวจสอบและนำเข้าผู้เสียภาษีจาก CSV")
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--tax-year", required=True, type=int)
    parser.add_argument("--group-code", required=True, choices=GROUPS)
    parser.add_argument("--added-by", type=int, default=None)
    parser.add_argument(
        "--commit",
        action="store_true",
        help="เขียนฐานข้อมูลจริง หากไม่ระบุจะตรวจไฟล์อย่างเดียว",
    )
    args = parser.parse_args()

    rows = read_rows(args.file)
    land_total = sum((row.land_amount for row in rows), Decimal("0"))
    sign_total = sum((row.sign_amount for row in rows), Decimal("0"))
    print(f"ตรวจสอบผ่าน: {len(rows)} ราย")
    print(f"ปีภาษี: {args.tax_year} | กลุ่ม: {args.group_code}")
    print(f"รวมภาษีที่ดิน: {land_total:,.2f}")
    print(f"รวมภาษีป้าย: {sign_total:,.2f}")

    if not args.commit:
        print("DRY RUN: ยังไม่มีการเขียนฐานข้อมูล")
        print("ตรวจสอบยอดแล้วจึงรันคำสั่งเดิมพร้อม --commit")
        return

    import_rows(rows, args.tax_year, args.group_code, args.added_by)
    print(f"นำเข้าสำเร็จ: {len(rows)} ราย (บันทึกฐานข้อมูลแล้ว)")


if __name__ == "__main__":
    main()
