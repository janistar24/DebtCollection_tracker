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