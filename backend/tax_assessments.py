from DBHelper import DBHelper


class Tax_assessments:

    def __init__(self):
        self.db = DBHelper()

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

        assessments = []

        for row in data:
            assessments.append(dict(zip(columns, row)))

        return assessments