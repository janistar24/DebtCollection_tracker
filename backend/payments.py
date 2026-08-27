from DBHelper import DBHelper


class Payments:

    def __init__(self):
        self.db = DBHelper()

    # READ ONE PAYMENT
    def read(self, payment_id):

        data, columns = self.db.fetch(
            """
            SELECT
                payment_id,
                payment_amount,
                payment_date,
                payment_method,
                reference_no,
                receipt_no,
                status,
                recorded_by,
                created_at

            FROM public.payments

            WHERE payment_id = %s
            """,
            (payment_id,)
        )

        if len(data) == 0:

            return (
                {
                    "Is Error": True,
                    "Error Message":
                        f"ไม่พบรายการชำระเงินรหัส {payment_id}"
                },
                {}
            )

        payment = dict(
            zip(columns, data[0])
        )

        return (
            {
                "Is Error": False,
                "Error Message": ""
            },
            payment
        )

    # READ ALL PAYMENTS
    def dump(self, group_code=None):

        data, columns = self.db.fetch(
            """
            SELECT
                payment_id,
                payment_amount,
                payment_date,
                payment_method,
                reference_no,
                receipt_no,
                status,
                recorded_by,
                created_at

            FROM public.payments

            WHERE %s::text IS NULL OR EXISTS (
                SELECT 1
                FROM public.payment_allocations pa
                JOIN public.tax_assessments ta ON ta.assessment_id=pa.assessment_id
                JOIN public.taxpayer_year_records tyr ON tyr.year_record_id=ta.year_record_id
                JOIN public.taxpayers t ON t.taxpayer_id=tyr.taxpayer_id
                WHERE pa.payment_id=payments.payment_id
                  AND t.group_code=%s::text
            )

            ORDER BY
                payment_date DESC,
                payment_id DESC
            """,
            (group_code, group_code)
        )

        payments = []

        for row in data:
            payments.append(
                dict(zip(columns, row))
            )

        return payments

    # CREATE PAYMENT
    def create(
        self,
        payment_amount,
        payment_date,
        payment_method,
        reference_no,
        receipt_no,
        recorded_by,
        status="UNMATCHED"
    ):

        if payment_amount <= 0:

            return {
                "Is Error": True,
                "Error Message":
                    "ยอดชำระต้องมากกว่า 0"
            }

        self.db.execute(
            """
            INSERT INTO public.payments (
                payment_amount,
                payment_date,
                payment_method,
                reference_no,
                receipt_no,
                status,
                recorded_by
            )
            VALUES (
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
                payment_amount,
                payment_date,
                payment_method,
                reference_no,
                receipt_no,
                status,
                recorded_by
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # UPDATE PAYMENT
    def update(
        self,
        payment_id,
        payment_amount,
        payment_date,
        payment_method,
        reference_no,
        receipt_no,
        status,
        recorded_by
    ):

        data, columns = self.db.fetch(
            """
            SELECT payment_id
            FROM public.payments
            WHERE payment_id = %s
            """,
            (payment_id,)
        )

        if len(data) == 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบรายการชำระเงินรหัส {payment_id}"
            }

        if payment_amount <= 0:

            return {
                "Is Error": True,
                "Error Message":
                    "ยอดชำระต้องมากกว่า 0"
            }

        self.db.execute(
            """
            UPDATE public.payments

            SET
                payment_amount = %s,
                payment_date = %s,
                payment_method = %s,
                reference_no = %s,
                receipt_no = %s,
                status = %s,
                recorded_by = %s

            WHERE payment_id = %s
            """,
            (
                payment_amount,
                payment_date,
                payment_method,
                reference_no,
                receipt_no,
                status,
                recorded_by,
                payment_id
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # UPDATE PAYMENT STATUS
    def update_status(
        self,
        payment_id,
        status
    ):

        data, columns = self.db.fetch(
            """
            SELECT payment_id
            FROM public.payments
            WHERE payment_id = %s
            """,
            (payment_id,)
        )

        if len(data) == 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบรายการชำระเงินรหัส {payment_id}"
            }

        self.db.execute(
            """
            UPDATE public.payments

            SET status = %s

            WHERE payment_id = %s
            """,
            (
                status,
                payment_id
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # FIND PAYMENTS BY STATUS
    def find_by_status(self, status):

        data, columns = self.db.fetch(
            """
            SELECT
                payment_id,
                payment_amount,
                payment_date,
                payment_method,
                reference_no,
                receipt_no,
                status,
                recorded_by,
                created_at

            FROM public.payments

            WHERE status = %s

            ORDER BY
                payment_date DESC,
                payment_id DESC
            """,
            (status,)
        )

        payments = []

        for row in data:
            payments.append(
                dict(zip(columns, row))
            )

        return payments
