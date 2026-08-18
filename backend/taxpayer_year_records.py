from DBHelper import DBHelper


class Taxpayer_year_records:

    def __init__(self):
        self.db = DBHelper()

    def create(
        self,
        taxpayer_id,
        tax_year,
        note,
        added_by
    ):
        data, columns = self.db.fetch(
            """
            INSERT INTO public.taxpayer_year_records (
                taxpayer_id,
                tax_year,
                note,
                is_included,
                added_by
            )
            VALUES (%s, %s, %s, TRUE, %s)

            ON CONFLICT (taxpayer_id, tax_year)
            DO UPDATE SET
                note = EXCLUDED.note,
                is_included = TRUE,
                updated_at = CURRENT_TIMESTAMP

            RETURNING
                year_record_id,
                taxpayer_id,
                tax_year,
                note,
                is_included,
                added_by,
                created_at,
                updated_at
            """,
            (
                taxpayer_id,
                tax_year,
                note,
                added_by
            )
        )

        if len(data) == 0:
            return None

        return dict(zip(columns, data[0]))
    
    def dump(self):
        data, columns = self.db.fetch(
            """
            SELECT *
            FROM public.taxpayer_year_records
            ORDER BY year_record_id
            """
        )
        taxpayer_year_records = []

        for row in data:
            taxpayer_year_records.append(dict(zip(columns, row)))

        return taxpayer_year_records

    def read(self, year_record_id):
        data, columns = self.db.fetch(
            """
            SELECT *
            FROM public.taxpayer_year_records
            WHERE year_record_id = %s
            """,
            (year_record_id,)
        )

        if len(data) == 0:
            return (
                {
                    "Is Error": True,
                    "Error Message": (
                        f"ไม่พบหน่วยงานรหัส {year_record_id}"
                    )
                },
                {}
            )

        taxpayer_year_record = dict(zip(columns, data[0]))

        return (
            {
                "Is Error": False,
                "Error Message": ""
            },
            taxpayer_year_record
        )

    # CREATE TAXPAYER YEAR RECORD
    def create(
        self,
        taxpayer_id,
        tax_year,
        note,
        added_by
    ):

        # เช็กว่าผู้เสียภาษีมีอยู่จริงไหม
        data, columns = self.db.fetch(
            """
            SELECT taxpayer_id
            FROM public.taxpayers
            WHERE taxpayer_id = %s
            """,
            (taxpayer_id,)
        )

        if len(data) == 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบผู้เสียภาษีรหัส {taxpayer_id}"
            }

        # เช็กว่าคนนี้มี record ในปีนี้แล้วหรือยัง
        data, columns = self.db.fetch(
            """
            SELECT
                year_record_id,
                is_included

            FROM public.taxpayer_year_records

            WHERE taxpayer_id = %s
            AND tax_year = %s
            """,
            (
                taxpayer_id,
                tax_year
            )
        )

        if len(data) > 0:

            year_record = dict(
                zip(columns, data[0])
            )

            # มีอยู่แล้วและยังใช้งานอยู่
            if year_record["is_included"]:

                return {
                    "Is Error": True,
                    "Error Message":
                        f"ผู้เสียภาษีรหัส {taxpayer_id} มีอยู่ในปี {tax_year} แล้ว"
                }

            # เคยถูกนำออกจากปีนี้ → เปิดกลับมา
            self.db.execute(
                """
                UPDATE public.taxpayer_year_records

                SET
                    note = %s,
                    is_included = TRUE,
                    added_by = %s,
                    updated_at = CURRENT_TIMESTAMP

                WHERE year_record_id = %s
                """,
                (
                    note,
                    added_by,
                    year_record["year_record_id"]
                )
            )

            return {
                "Is Error": False,
                "Error Message": ""
            }

        # ยังไม่เคยมีในปีนี้ → INSERT ใหม่
        self.db.execute(
            """
            INSERT INTO public.taxpayer_year_records (
                taxpayer_id,
                tax_year,
                note,
                is_included,
                added_by
            )
            VALUES (
                %s,
                %s,
                %s,
                TRUE,
                %s
            )
            """,
            (
                taxpayer_id,
                tax_year,
                note,
                added_by
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # UPDATE TAXPAYER YEAR RECORD
    def update(
        self,
        year_record_id,
        note,
        is_included
    ):

        # เช็กว่ามี record นี้จริงไหม
        data, columns = self.db.fetch(
            """
            SELECT year_record_id
            FROM public.taxpayer_year_records
            WHERE year_record_id = %s
            """,
            (year_record_id,)
        )

        if len(data) == 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบข้อมูลผู้เสียภาษีประจำปีรหัส {year_record_id}"
            }

        self.db.execute(
            """
            UPDATE public.taxpayer_year_records

            SET
                note = %s,
                is_included = %s,
                updated_at = CURRENT_TIMESTAMP

            WHERE year_record_id = %s
            """,
            (
                note,
                is_included,
                year_record_id
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # REMOVE TAXPAYER FROM YEAR
    # ไม่ DELETE record จริง
    def remove_from_year(self, year_record_id):

        data, columns = self.db.fetch(
            """
            SELECT year_record_id
            FROM public.taxpayer_year_records
            WHERE year_record_id = %s
            """,
            (year_record_id,)
        )

        if len(data) == 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบข้อมูลผู้เสียภาษีประจำปีรหัส {year_record_id}"
            }

        self.db.execute(
            """
            UPDATE public.taxpayer_year_records

            SET
                is_included = FALSE,
                updated_at = CURRENT_TIMESTAMP

            WHERE year_record_id = %s
            """,
            (year_record_id,)
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # FIND BY TAXPAYER AND YEAR
    def find_by_taxpayer_and_year(
        self,
        taxpayer_id,
        tax_year
    ):

        data, columns = self.db.fetch(
            """
            SELECT
                year_record_id,
                taxpayer_id,
                tax_year,
                note,
                is_included,
                added_by,
                created_at,
                updated_at

            FROM public.taxpayer_year_records

            WHERE taxpayer_id = %s
            AND tax_year = %s
            """,
            (
                taxpayer_id,
                tax_year
            )
        )

        if len(data) == 0:
            return None

        return dict(
            zip(columns, data[0])
        )