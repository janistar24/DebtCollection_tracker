from DBHelper import DBHelper


class Payments:

    def __init__(self):
        self.db = DBHelper()

    def dump(self):
        data, columns = self.db.fetch(
            """
            SELECT *
            FROM public.payments
            ORDER BY payment_id
            """
        )

        payments = []

        for row in data:
            payments.append(dict(zip(columns, row)))

        return payments

    def read(self, payment_id):
        data, columns = self.db.fetch(
            """
            SELECT *
            FROM public.payments
            WHERE id = %s
            """,
            (payment_id,)
        )

        if len(data) == 0:
            return (
                {
                    "Is Error": True,
                    "Error Message": (
                        f"ไม่พบหน่วยงานรหัส {payment_id}"
                    )
                },
                {}
            )

        payment = dict(zip(columns, data[0]))

        return (
            {
                "Is Error": False,
                "Error Message": ""
            },
            payment
        )