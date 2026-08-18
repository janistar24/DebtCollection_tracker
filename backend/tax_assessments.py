from DBHelper import DBHelper


class Tax_assessments:

    def __init__(self):
        self.db = DBHelper()

    # READ ONE TAX ASSESSMENT
    def read(self, assessment_id):

        data, columns = self.db.fetch(
            """
            SELECT
                assessment_id,
                year_record_id,
                tax_type,
                assessed_amount,
                previous_amount,
                change_reason,
                assessment_date,
                annual_due_date,
                created_by,
                updated_by,
                created_at,
                updated_at

            FROM public.tax_assessments

            WHERE assessment_id = %s
            """,
            (assessment_id,)
        )

        if len(data) == 0:

            return (
                {
                    "Is Error": True,
                    "Error Message":
                        f"ไม่พบข้อมูลการประเมินภาษีรหัส {assessment_id}"
                },
                {}
            )

        tax_assessment = dict(
            zip(columns, data[0])
        )

        return (
            {
                "Is Error": False,
                "Error Message": ""
            },
            tax_assessment
        )

    # READ ALL TAX ASSESSMENTS
    # ใช้สำหรับหน้า Figma Annual Taxpayer
    def dump(self):

        data, columns = self.db.fetch(
            """
            SELECT
                tyr.year_record_id,
                tyr.taxpayer_id,
                tyr.tax_year,
                tyr.note,

                COALESCE(
                    MAX(
                        CASE
                            WHEN ta.tax_type = 'LAND_BUILDING'
                            THEN ta.assessment_id
                        END
                    ),
                    0
                ) AS land_assessment_id,

                COALESCE(
                    MAX(
                        CASE
                            WHEN ta.tax_type = 'SIGN'
                            THEN ta.assessment_id
                        END
                    ),
                    0
                ) AS sign_assessment_id,

                COALESCE(
                    MAX(
                        CASE
                            WHEN ta.tax_type = 'LAND_BUILDING'
                            THEN ta.assessed_amount
                        END
                    ),
                    0
                ) AS land_amount,

                COALESCE(
                    MAX(
                        CASE
                            WHEN ta.tax_type = 'SIGN'
                            THEN ta.assessed_amount
                        END
                    ),
                    0
                ) AS sign_amount,
                COALESCE(
                    MAX(
                        CASE
                            WHEN ta.tax_type = 'LAND_BUILDING'
                            THEN ta.previous_amount
                        END
                    ),
                    0
                ) AS prev_land_amount,

                COALESCE(
                    MAX(
                        CASE
                            WHEN ta.tax_type = 'SIGN'
                            THEN ta.previous_amount
                        END
                    ),
                    0
                ) AS prev_sign_amount

            FROM public.taxpayer_year_records tyr

            LEFT JOIN public.tax_assessments ta
                ON tyr.year_record_id = ta.year_record_id

            WHERE tyr.is_included = TRUE

            GROUP BY
                tyr.year_record_id,
                tyr.taxpayer_id,
                tyr.tax_year,
                tyr.note

            ORDER BY
                tyr.tax_year DESC,
                tyr.taxpayer_id
            """
        )

        tax_assessments = []

        for row in data:
            tax_assessments.append(
                dict(zip(columns, row))
            )

        return tax_assessments

    # CREATE TAX ASSESSMENT
    def create(
        self,
        year_record_id,
        tax_type,
        assessed_amount,
        previous_amount,
        change_reason,
        assessment_date,
        annual_due_date,
        created_by
    ):

        # เช็ก year_record มีจริงไหม
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

        # เช็กว่าปีนี้มีภาษีประเภทนี้แล้วหรือยัง
        data, columns = self.db.fetch(
            """
            SELECT assessment_id
            FROM public.tax_assessments

            WHERE year_record_id = %s
            AND tax_type = %s
            """,
            (
                year_record_id,
                tax_type
            )
        )

        if len(data) > 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"มีข้อมูลภาษีประเภท {tax_type} ในปีนี้แล้ว"
            }

        self.db.execute(
            """
            INSERT INTO public.tax_assessments (
                year_record_id,
                tax_type,
                assessed_amount,
                previous_amount,
                change_reason,
                assessment_date,
                annual_due_date,
                created_by
            )
            VALUES (
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s
            )
            """,
            (
                year_record_id,
                tax_type,
                assessed_amount,
                previous_amount,
                change_reason,
                assessment_date,
                annual_due_date,
                created_by
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # UPDATE TAX ASSESSMENT
    def update(
        self,
        assessment_id,
        assessed_amount,
        previous_amount,
        change_reason,
        assessment_date,
        annual_due_date,
        updated_by
    ):

        data, columns = self.db.fetch(
            """
            SELECT assessment_id
            FROM public.tax_assessments
            WHERE assessment_id = %s
            """,
            (assessment_id,)
        )

        if len(data) == 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบข้อมูลการประเมินภาษีรหัส {assessment_id}"
            }

        self.db.execute(
            """
            UPDATE public.tax_assessments

            SET
                assessed_amount = %s,
                previous_amount = %s,
                change_reason = %s,
                assessment_date = %s,
                annual_due_date = %s,
                updated_by = %s,
                updated_at = CURRENT_TIMESTAMP

            WHERE assessment_id = %s
            """,
            (
                assessed_amount,
                previous_amount,
                change_reason,
                assessment_date,
                annual_due_date,
                updated_by,
                assessment_id
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # FIND ASSESSMENT BY YEAR RECORD AND TAX TYPE
    def find_by_year_record_and_type(
        self,
        year_record_id,
        tax_type
    ):

        data, columns = self.db.fetch(
            """
            SELECT
                assessment_id,
                year_record_id,
                tax_type,
                assessed_amount,
                previous_amount,
                change_reason,
                assessment_date,
                annual_due_date,
                created_by,
                updated_by,
                created_at,
                updated_at

            FROM public.tax_assessments

            WHERE year_record_id = %s
            AND tax_type = %s
            """,
            (
                year_record_id,
                tax_type
            )
        )

        if len(data) == 0:
            return None

        return dict(
            zip(columns, data[0])
        )