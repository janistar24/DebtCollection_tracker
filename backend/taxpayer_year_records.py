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

        # 1. ตรวจ Master taxpayer
        taxpayer_data, taxpayer_columns = self.db.fetch(
            """
            SELECT taxpayer_id
            FROM public.taxpayers
            WHERE taxpayer_id = %s
            """,
            (taxpayer_id,)
        )

        if len(taxpayer_data) == 0:
            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบผู้เสียภาษีรหัส {taxpayer_id}"
            }


        # 2. ตรวจ record ของ taxpayer + ปี
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


        # ==========================================
        # เคยมี record ปีนี้แล้ว
        # ==========================================

        if len(data) > 0:

            year_record = dict(
                zip(columns, data[0])
            )

            # ยัง active อยู่ → ห้ามเพิ่มซ้ำ
            # มีข้อมูลอยู่แล้ว ให้ตอบสำเร็จแทน 400
            # รองรับกรณี frontend ส่ง POST ซ้ำ
            if year_record["is_included"]:

                return {
                    "Is Error": False,
                    "Error Message": "",
                    "Action": "ALREADY_INCLUDED",
                    "year_record_id": year_record["year_record_id"]
                }


            # ถูกเอาออกไว้ → เปิดของเดิมกลับมา
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

            # ⭐ ต้องจบตรงนี้
            return {
                "Is Error": False,
                "Error Message": "",
                "Action": "REACTIVATED",
                "year_record_id":
                    year_record["year_record_id"]
            }


        # ==========================================
        # ไม่เคยมีในปีนี้ → INSERT ใหม่
        # ==========================================

        new_row, new_columns = self.db.execute_returning(
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

        new_record = dict(
            zip(new_columns, new_row)
        )

        return {
            "Is Error": False,
            "Error Message": "",
            "Action": "CREATED",
            "year_record_id": new_record["year_record_id"]
        }

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
        ##is_included is key to determine if the taxpayer is included in the year or not. If is_included is False, it means the taxpayer has been removed from the year. If is_included is True, it means the taxpayer is still included in the year.
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