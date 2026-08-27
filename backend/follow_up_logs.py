from DBHelper import DBHelper


class Follow_up_logs:

    def __init__(self):
        self.db = DBHelper()

    # READ ONE FOLLOW UP LOG
    def read(self, follow_up_id):

        data, columns = self.db.fetch(
            """
            SELECT
                follow_up_id,
                year_record_id,
                tax_scope,
                contact_type,
                contacted_at,
                result,
                detail,
                promise_date,
                promise_amount,
                next_follow_date,
                recorded_by,
                created_at

            FROM public.follow_up_logs

            WHERE follow_up_id = %s
            """,
            (follow_up_id,)
        )

        if len(data) == 0:

            return (
                {
                    "Is Error": True,
                    "Error Message":
                        f"ไม่พบประวัติการติดตามรหัส {follow_up_id}"
                },
                {}
            )

        follow_up_log = dict(
            zip(columns, data[0])
        )

        return (
            {
                "Is Error": False,
                "Error Message": ""
            },
            follow_up_log
        )

    # READ ALL FOLLOW UP LOGS
    def dump(self, group_code=None):

        data, columns = self.db.fetch(
            """
            SELECT
                f.follow_up_id,
                f.year_record_id,

                tyr.taxpayer_id,
                tyr.tax_year,

                f.tax_scope,
                f.contact_type,
                f.contacted_at,
                f.result,
                f.detail,
                f.promise_date,
                f.promise_amount,
                f.next_follow_date,
                f.recorded_by,
                f.created_at

            FROM public.follow_up_logs f

            JOIN public.taxpayer_year_records tyr
                ON f.year_record_id = tyr.year_record_id

            JOIN public.taxpayers t
                ON t.taxpayer_id = tyr.taxpayer_id

            WHERE (%s::text IS NULL OR t.group_code = %s::text)

            ORDER BY
                f.contacted_at DESC,
                f.follow_up_id DESC
            """,
            (group_code, group_code)
        )

        follow_up_logs = []

        for row in data:
            follow_up_logs.append(
                dict(zip(columns, row))
            )

        return follow_up_logs

    # CREATE FOLLOW UP LOG
    def create(
        self,
        year_record_id,
        tax_scope,
        contact_type,
        contacted_at,
        result,
        detail,
        promise_date,
        promise_amount,
        next_follow_date,
        recorded_by
    ):

        # เช็ก year record
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
            INSERT INTO public.follow_up_logs (
                year_record_id,
                tax_scope,
                contact_type,
                contacted_at,
                result,
                detail,
                promise_date,
                promise_amount,
                next_follow_date,
                recorded_by
            )
            VALUES (
                %s,
                %s,
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
                tax_scope,
                contact_type,
                contacted_at,
                result,
                detail,
                promise_date,
                promise_amount,
                next_follow_date,
                recorded_by
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # UPDATE FOLLOW UP LOG
    def update(
        self,
        follow_up_id,
        tax_scope,
        contact_type,
        contacted_at,
        result,
        detail,
        promise_date,
        promise_amount,
        next_follow_date,
        recorded_by
    ):

        data, columns = self.db.fetch(
            """
            SELECT follow_up_id
            FROM public.follow_up_logs
            WHERE follow_up_id = %s
            """,
            (follow_up_id,)
        )

        if len(data) == 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบประวัติการติดตามรหัส {follow_up_id}"
            }

        self.db.execute(
            """
            UPDATE public.follow_up_logs

            SET
                tax_scope = %s,
                contact_type = %s,
                contacted_at = %s,
                result = %s,
                detail = %s,
                promise_date = %s,
                promise_amount = %s,
                next_follow_date = %s,
                recorded_by = %s

            WHERE follow_up_id = %s
            """,
            (
                tax_scope,
                contact_type,
                contacted_at,
                result,
                detail,
                promise_date,
                promise_amount,
                next_follow_date,
                recorded_by,
                follow_up_id
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # FIND FOLLOW UPS BY YEAR RECORD
    def find_by_year_record(self, year_record_id):

        data, columns = self.db.fetch(
            """
            SELECT
                follow_up_id,
                year_record_id,
                tax_scope,
                contact_type,
                contacted_at,
                result,
                detail,
                promise_date,
                promise_amount,
                next_follow_date,
                recorded_by,
                created_at

            FROM public.follow_up_logs

            WHERE year_record_id = %s

            ORDER BY contacted_at DESC
            """,
            (year_record_id,)
        )

        follow_up_logs = []

        for row in data:
            follow_up_logs.append(
                dict(zip(columns, row))
            )

        return follow_up_logs
