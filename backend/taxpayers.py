from DBHelper import DBHelper


class Taxpayers:
    def __init__(self):
        self.db = DBHelper()

    # READ ONE USER
    def read(self, taxpayer_id):
        data, columns = self.db.fetch(
            """
            SELECT
                t.taxpayer_id,
                t.owner_code,
                t.taxpayer_type,
                t.first_name,
                t.last_name,
                t.company_name,
                t.phone,
                t.address,
                t.group_code,
                t.is_active,
                t.created_at,
                t.updated_at,
            
                u.user_id AS responsible_officer_id,
                u.first_name AS officer_first_name,
                u.last_name AS officer_last_name
            FROM public.taxpayers t
            LEFT JOIN public.responsibility_assignments ra
                ON t.group_code = ra.group_code
            AND ra.is_active = TRUE
            
            LEFT JOIN public.users u
                ON ra.user_id = u.user_id
            WHERE t.taxpayer_id = %s
            """,
            (taxpayer_id,)
        )

        if len(data) == 0:
            return (
                {
                    "Is Error": True,
                    "Error Message": (
                        f"ไม่พบหน่วยงานรหัส {taxpayer_id}"
                    )
                },
                {}
            )

        taxpayer = dict(zip(columns, data[0]))

        return (
            {
                "Is Error": False,
                "Error Message": ""
            },
            taxpayer
        )

    # READ ALL USERS
    def dump(self, group_code=None):
        data, columns = self.db.fetch(
            """
            SELECT
                t.taxpayer_id,
                t.owner_code,
                t.taxpayer_type,
                t.first_name,
                t.last_name,
                t.company_name,
                t.phone,
                t.address,
                t.group_code,
                t.is_active,
                t.created_at,
                t.updated_at,

                u.user_id AS responsible_officer_id,
                u.first_name AS officer_first_name,
                u.last_name AS officer_last_name
            FROM public.taxpayers t
            LEFT JOIN public.responsibility_assignments ra
            ON t.group_code = ra.group_code
            AND ra.is_active = TRUE

            LEFT JOIN public.users u
            ON ra.user_id = u.user_id
            WHERE (%s::text IS NULL OR t.group_code = %s::text)
            ORDER BY t.taxpayer_id
            """,
            (group_code, group_code)
        )

        taxpayers = []

        for row in data:
            taxpayers.append(dict(zip(columns, row)))

        return taxpayers
    
    # CREATE TAXPAYER
    def create(self,taxpayer_type,owner_code,first_name,last_name,company_name,phone,address,group_code,is_active=True):
        # บุคคลธรรมดา
        if taxpayer_type == "INDIVIDUAL":
            if first_name is None or last_name is None:
                return {
                    "Is Error": True,
                    "Error Message":
                        "บุคคลธรรมดาต้องมีชื่อและนามสกุล"
                }

            if owner_code is None:
                return {
                    "Is Error": True,
                    "Error Message":
                        "บุคคลธรรมดาต้องมี Owner Code"
                }

            # บุคคลธรรมดาไม่ใช้ company_name
            company_name = None

        # บริษัท
        elif taxpayer_type == "COMPANY":

            if company_name is None:
                return {
                    "Is Error": True,
                    "Error Message":
                        "นิติบุคคลหรือบริษัทต้องมีชื่อบริษัท"
                }

            # บริษัทไม่มี Owner Code
            owner_code = None

            # บริษัทอยู่กลุ่มนี้เสมอ
            group_code = "ว-ฮ และบริษัท"

            # บริษัทไม่ใช้ชื่อ-นามสกุลบุคคล
            first_name = None
            last_name = None

        else:

            return {
                "Is Error": True,
                "Error Message":
                    "taxpayer_type ต้องเป็น INDIVIDUAL หรือ COMPANY"
            }

        data, columns = self.db.execute_returning(
            """
            INSERT INTO public.taxpayers (
                taxpayer_type,
                owner_code,
                first_name,
                last_name,
                company_name,
                phone,
                address,
                group_code,
                is_active
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
                %s
            )
            RETURNING taxpayer_id
            """,
            (
                taxpayer_type,
                owner_code,
                first_name,
                last_name,
                company_name,
                phone,
                address,
                group_code,
                is_active
            )
        )

        taxpayer = dict(
            zip(columns, data)
        )

        return {
            "Is Error": False,
            "Error Message": "",
            "taxpayer_id": taxpayer["taxpayer_id"]
        }

    # UPDATE TAXPAYER
    def update(
        self,
        taxpayer_id,
        taxpayer_type,
        owner_code,
        first_name,
        last_name,
        company_name,
        phone,
        address,
        group_code,
        is_active
    ):

        # บุคคลธรรมดา
        if taxpayer_type == "INDIVIDUAL":

            if first_name is None or last_name is None:

                return {
                    "Is Error": True,
                    "Error Message":
                        "บุคคลธรรมดาต้องมีชื่อและนามสกุล"
                }

            if owner_code is None:

                return {
                    "Is Error": True,
                    "Error Message":
                        "บุคคลธรรมดาต้องมี Owner Code"
                }

            # เช็ก Owner Code ว่าซ้ำกับคนอื่นหรือไม่
            data, columns = self.db.fetch(
                """
                SELECT taxpayer_id
                FROM public.taxpayers
                WHERE owner_code = %s
                AND taxpayer_id <> %s
                """,
                (
                    owner_code,
                    taxpayer_id
                )
            )

            if len(data) > 0:

                return {
                    "Is Error": True,
                    "Error Message":
                        f"Owner Code '{owner_code}' ถูกใช้งานแล้ว"
                }

            company_name = None

        # บริษัท
        elif taxpayer_type == "COMPANY":

            if company_name is None:

                return {
                    "Is Error": True,
                    "Error Message":
                        "นิติบุคคลหรือบริษัทต้องมีชื่อบริษัท"
                }

            owner_code = None
            first_name = None
            last_name = None
            group_code = "ว-ฮ และบริษัท"

        else:

            return {
                "Is Error": True,
                "Error Message":
                    "taxpayer_type ต้องเป็น INDIVIDUAL หรือ COMPANY"
            }

        self.db.execute(
            """
            UPDATE public.taxpayers

            SET
                taxpayer_type = %s,
                owner_code = %s,
                first_name = %s,
                last_name = %s,
                company_name = %s,
                phone = %s,
                address = %s,
                group_code = %s,
                is_active = %s,
                updated_at = CURRENT_TIMESTAMP

            WHERE taxpayer_id = %s
            """,
            (
                taxpayer_type,
                owner_code,
                first_name,
                last_name,
                company_name,
                phone,
                address,
                group_code,
                is_active,
                taxpayer_id
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # DEACTIVATE TAXPAYER
    # ไม่ DELETE taxpayer จริง
    def deactivate(self, taxpayer_id):

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

        self.db.execute(
            """
            UPDATE public.taxpayers

            SET
                is_active = FALSE,
                updated_at = CURRENT_TIMESTAMP

            WHERE taxpayer_id = %s
            """,
            (taxpayer_id,)
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    def reactivate(self, taxpayer_id):
        data, _ = self.db.fetch(
            "SELECT taxpayer_id FROM public.taxpayers WHERE taxpayer_id = %s",
            (taxpayer_id,)
        )
        if not data:
            return {"Is Error": True, "Error Message": f"ไม่พบผู้เสียภาษีรหัส {taxpayer_id}"}

        self.db.execute(
            "UPDATE public.taxpayers SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE taxpayer_id = %s",
            (taxpayer_id,)
        )
        return {"Is Error": False, "Error Message": ""}

    def delete(self, taxpayer_id):
        # ห้ามลบเมื่อมีการชำระเงินที่จัดสรรแล้ว เพื่อรักษาประวัติทางการเงิน
        data, _ = self.db.fetch(
            """
            SELECT pa.allocation_id
            FROM public.payment_allocations pa
            JOIN public.tax_assessments ta ON ta.assessment_id = pa.assessment_id
            JOIN public.taxpayer_year_records tyr ON tyr.year_record_id = ta.year_record_id
            WHERE tyr.taxpayer_id = %s
            LIMIT 1
            """,
            (taxpayer_id,)
        )
        if data:
            return {
                "Is Error": True,
                "Error Message": "ไม่สามารถลบได้ เนื่องจากผู้เสียภาษีรายนี้มีประวัติการชำระเงินแล้ว"
            }

        # ไม่มีการชำระเงิน: ลบข้อมูลลูกและ master ใน transaction เดียว
        with self.db.transaction() as cursor:
            cursor.execute(
                "DELETE FROM public.follow_up_logs WHERE year_record_id IN (SELECT year_record_id FROM public.taxpayer_year_records WHERE taxpayer_id = %s)",
                (taxpayer_id,)
            )
            cursor.execute(
                "DELETE FROM public.tax_assessments WHERE year_record_id IN (SELECT year_record_id FROM public.taxpayer_year_records WHERE taxpayer_id = %s)",
                (taxpayer_id,)
            )
            cursor.execute("DELETE FROM public.taxpayer_year_records WHERE taxpayer_id = %s", (taxpayer_id,))
            cursor.execute("DELETE FROM public.taxpayers WHERE taxpayer_id = %s", (taxpayer_id,))
        return {"Is Error": False, "Error Message": ""}

    # FIND TAXPAYER BY OWNER CODE
    def find_by_owner_code(self, owner_code):
        data, columns = self.db.fetch(
            """
            SELECT
                taxpayer_id,
                taxpayer_type,
                owner_code,
                first_name,
                last_name,
                company_name,
                phone,
                address,
                group_code,
                is_active,
                created_at,
                updated_at

            FROM public.taxpayers

            WHERE owner_code = %s

            ORDER BY taxpayer_id
            """,
            (owner_code,)
        )

        taxpayers = []

        for row in data:
            taxpayers.append(
                dict(zip(columns, row))
            )

        return taxpayers
