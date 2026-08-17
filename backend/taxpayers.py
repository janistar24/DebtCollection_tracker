import code

from DBHelper import DBHelper


class Taxpayers:

    def __init__(self):
        self.db = DBHelper()

    def create(self, taxpayer_id, owner_code, taxpayer_type, first_name, last_name, company_name, phone, address, group_code, is_active):
        # เช็ก owner_code ซ้ำ เฉพาะกรณีที่มี owner_code
        if owner_code is not None:
            data, columns = self.db.fetch(
                """
                SELECT taxpayer_id
                FROM public.taxpayers
                WHERE owner_code = %s
                """,
                (owner_code,)
            )

            if len(data) > 0:
                return {
                    'Is Error': True,
                    'Error Message':
                        f"Owner code '{owner_code}' already exists. Cannot Create."
                }

        self.db.execute(
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
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
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

        return {
            'Is Error': False,
            'Error Message': ""
        }
    
    def dump(self):
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
            ORDER BY t.taxpayer_id
            """
        )

        taxpayers = []

        for row in data:
            taxpayers.append(dict(zip(columns, row)))

        return taxpayers

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