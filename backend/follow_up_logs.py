from DBHelper import DBHelper


class Follow_up_logs:

    def __init__(self):
        self.db = DBHelper()

    def dump(self):
        data, columns = self.db.fetch(
            """
            SELECT *
            FROM public.follow_up_logs
            ORDER BY follow_up_id
            """
        )

        follow_up_logs = []

        for row in data:
            follow_up_logs.append(dict(zip(columns, row)))

        return follow_up_logs

    def read(self, follow_up_id):
        data, columns = self.db.fetch(
            """
            SELECT *
            FROM public.follow_up_logs
            WHERE id = %s
            """,
            (follow_up_id,)
        )

        if len(data) == 0:
            return (
                {
                    "Is Error": True,
                    "Error Message": (
                        f"ไม่พบหน่วยงานรหัส {follow_up_id}"
                    )
                },
                {}
            )

        follow_up_log = dict(zip(columns, data[0]))

        return (
            {
                "Is Error": False,
                "Error Message": ""
            },
            follow_up_log
        )