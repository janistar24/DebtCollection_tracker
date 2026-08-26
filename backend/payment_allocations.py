from DBHelper import DBHelper


class Payment_allocations:

    def __init__(self):
        self.db = DBHelper()

    # READ ONE PAYMENT ALLOCATION
    def read(self, allocation_id):

        data, columns = self.db.fetch(
            """
            SELECT
                allocation_id,
                payment_id,
                assessment_id,
                allocated_amount,
                matched_by,
                matched_at

            FROM public.payment_allocations

            WHERE allocation_id = %s
            """,
            (allocation_id,)
        )

        if len(data) == 0:

            return (
                {
                    "Is Error": True,
                    "Error Message":
                        f"ไม่พบข้อมูลการจับคู่การชำระรหัส {allocation_id}"
                },
                {}
            )

        payment_allocation = dict(
            zip(columns, data[0])
        )

        return (
            {
                "Is Error": False,
                "Error Message": ""
            },
            payment_allocation
        )

    # READ ALL PAYMENT ALLOCATIONS
    def dump(self):

        data, columns = self.db.fetch(
            """
            SELECT
                pa.allocation_id,
                pa.payment_id,
                pa.assessment_id,
                pa.allocated_amount,
                pa.matched_by,
                pa.matched_at,

                ta.tax_type,
                ta.year_record_id,

                tyr.taxpayer_id,
                tyr.tax_year,

                p.payment_amount,
                p.payment_date,
                p.paid_at,
                p.payment_method,
                p.reference_no,
                p.receipt_no
                ,p.status
                ,p.recorded_by

            FROM public.payment_allocations pa

            JOIN public.payments p
                ON pa.payment_id = p.payment_id

            JOIN public.tax_assessments ta
                ON pa.assessment_id = ta.assessment_id

            JOIN public.taxpayer_year_records tyr
                ON ta.year_record_id = tyr.year_record_id

            ORDER BY
                pa.matched_at DESC,
                pa.allocation_id DESC
            """
        )

        payment_allocations = []

        for row in data:
            payment_allocations.append(
                dict(zip(columns, row))
            )

        return payment_allocations

    # CREATE PAYMENT ALLOCATION
    def create(
        self,
        payment_id,
        assessment_id,
        allocated_amount,
        matched_by
    ):

        # เช็ก payment ว่ามีจริงไหม
        data, columns = self.db.fetch(
            """
            SELECT
                payment_id,
                payment_amount

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

        payment = dict(
            zip(columns, data[0])
        )

        # เช็ก assessment ว่ามีจริงไหม
        data, columns = self.db.fetch(
            """
            SELECT
                assessment_id,
                assessed_amount

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

        if allocated_amount <= 0:

            return {
                "Is Error": True,
                "Error Message":
                    "ยอดที่จับคู่ต้องมากกว่า 0"
            }

        # เช็กยอดที่ payment นี้ถูก allocate ไปแล้ว
        data, columns = self.db.fetch(
            """
            SELECT
                COALESCE(
                    SUM(allocated_amount),
                    0
                ) AS total_allocated

            FROM public.payment_allocations

            WHERE payment_id = %s
            """,
            (payment_id,)
        )

        total_allocated = data[0][0]

        payment_remaining = (
            payment["payment_amount"]
            - total_allocated
        )

        if allocated_amount > payment_remaining:

            return {
                "Is Error": True,
                "Error Message":
                    "ยอดที่จับคู่มากกว่ายอดชำระที่เหลือ"
            }

        self.db.execute(
            """
            INSERT INTO public.payment_allocations (
                payment_id,
                assessment_id,
                allocated_amount,
                matched_by
            )
            VALUES (
                %s,
                %s,
                %s,
                %s
            )
            """,
            (
                payment_id,
                assessment_id,
                allocated_amount,
                matched_by
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # UPDATE PAYMENT ALLOCATION
    def update(
        self,
        allocation_id,
        assessment_id,
        allocated_amount,
        matched_by
    ):

        # เช็ก allocation
        data, columns = self.db.fetch(
            """
            SELECT
                allocation_id,
                payment_id

            FROM public.payment_allocations

            WHERE allocation_id = %s
            """,
            (allocation_id,)
        )

        if len(data) == 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบข้อมูลการจับคู่การชำระรหัส {allocation_id}"
            }

        allocation = dict(
            zip(columns, data[0])
        )

        # เช็ก assessment
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

        if allocated_amount <= 0:

            return {
                "Is Error": True,
                "Error Message":
                    "ยอดที่จับคู่ต้องมากกว่า 0"
            }

        # ยอด payment ทั้งหมด
        data, columns = self.db.fetch(
            """
            SELECT payment_amount
            FROM public.payments
            WHERE payment_id = %s
            """,
            (allocation["payment_id"],)
        )

        payment_amount = data[0][0]

        # รวม allocation อื่นของ payment เดียวกัน
        # แต่ไม่รวม allocation ที่กำลังแก้
        data, columns = self.db.fetch(
            """
            SELECT
                COALESCE(
                    SUM(allocated_amount),
                    0
                )

            FROM public.payment_allocations

            WHERE payment_id = %s
            AND allocation_id <> %s
            """,
            (
                allocation["payment_id"],
                allocation_id
            )
        )

        other_allocated = data[0][0]

        if other_allocated + allocated_amount > payment_amount:

            return {
                "Is Error": True,
                "Error Message":
                    "ยอดรวมที่จับคู่มากกว่ายอดชำระ"
            }

        self.db.execute(
            """
            UPDATE public.payment_allocations

            SET
                assessment_id = %s,
                allocated_amount = %s,
                matched_by = %s

            WHERE allocation_id = %s
            """,
            (
                assessment_id,
                allocated_amount,
                matched_by,
                allocation_id
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # DELETE PAYMENT ALLOCATION
    # ใช้กรณีจับคู่ผิดแล้วต้องยกเลิกการจับคู่
    def delete(self, allocation_id):

        data, columns = self.db.fetch(
            """
            SELECT allocation_id
            FROM public.payment_allocations
            WHERE allocation_id = %s
            """,
            (allocation_id,)
        )

        if len(data) == 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบข้อมูลการจับคู่การชำระรหัส {allocation_id}"
            }

        self.db.execute(
            """
            DELETE FROM public.payment_allocations
            WHERE allocation_id = %s
            """,
            (allocation_id,)
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # FIND ALLOCATIONS BY PAYMENT
    def find_by_payment(self, payment_id):

        data, columns = self.db.fetch(
            """
            SELECT
                pa.allocation_id,
                pa.payment_id,
                pa.assessment_id,
                pa.allocated_amount,
                pa.matched_by,
                pa.matched_at,

                ta.tax_type,
                ta.assessed_amount,

                tyr.taxpayer_id,
                tyr.tax_year

            FROM public.payment_allocations pa

            JOIN public.tax_assessments ta
                ON pa.assessment_id = ta.assessment_id

            JOIN public.taxpayer_year_records tyr
                ON ta.year_record_id = tyr.year_record_id

            WHERE pa.payment_id = %s

            ORDER BY pa.allocation_id
            """,
            (payment_id,)
        )

        payment_allocations = []

        for row in data:
            payment_allocations.append(
                dict(zip(columns, row))
            )

        return payment_allocations
