from DBHelper import DBHelper
from pwdlib import PasswordHash

password_hasher = PasswordHash.recommended()

class Users:
    def __init__(self):
        self.db = DBHelper()

    # READ ONE USER
    def read(self, user_id):

        data, columns = self.db.fetch(
            """
            SELECT
                u.user_id,
                u.employee_code,
                u.first_name,
                u.last_name,
                u.role,
                u.username,
                u.is_active,
                u.created_at,
                u.updated_at,
                ra.group_code

            FROM public.users u

            LEFT JOIN public.responsibility_assignments ra
                ON u.user_id = ra.user_id
                AND ra.is_active = TRUE

            WHERE u.user_id = %s
            """,
            (user_id,)
        )

        if len(data) == 0:

            return (
                {
                    "Is Error": True,
                    "Error Message":
                        f"ไม่พบผู้ใช้งานรหัส {user_id}"
                },
                {}
            )

        user = dict(
            zip(columns, data[0])
        )

        return (
            {
                "Is Error": False,
                "Error Message": ""
            },
            user
        )

    # READ ALL USERS
    def dump(self):

        data, columns = self.db.fetch(
            """
            SELECT
                u.user_id,
                u.employee_code,
                u.first_name,
                u.last_name,
                u.role,
                u.username,
                u.is_active,
                u.created_at,
                u.updated_at,
                ra.group_code

            FROM public.users u

            LEFT JOIN public.responsibility_assignments ra
                ON u.user_id = ra.user_id
                AND ra.is_active = TRUE

            ORDER BY u.user_id
            """
        )

        users = []

        for row in data:
            users.append(
                dict(zip(columns, row))
            )

        return users

    # FIND USER BY USERNAME | LOGIN
    def find_by_username(self, username):

        data, columns = self.db.fetch(
            """
            SELECT
                u.user_id,
                u.employee_code,
                u.first_name,
                u.last_name,
                u.role,
                u.username,
                u.password_hash,
                u.is_active,
                ra.group_code

            FROM public.users u

            LEFT JOIN public.responsibility_assignments ra
                ON u.user_id = ra.user_id
                AND ra.is_active = TRUE

            WHERE u.username = %s
            """,
            (username,)
        )

        if len(data) == 0:
            return None

        return dict(
            zip(columns, data[0])
        )

    # CREATE USER
    def create(
        self,employee_code,first_name,last_name,role,username,password,is_active=True):

        # เช็ก employee_code หรือ username ซ้ำ
        data, columns = self.db.fetch(
            """
            SELECT user_id
            FROM public.users
            WHERE employee_code = %s
               OR username = %s
            """,
            (
                employee_code,
                username
            )
        )

        if len(data) > 0:

            return {
                "Is Error": True,
                "Error Message":
                    "รหัสพนักงานหรือ Username นี้มีอยู่แล้ว"
            }

        # Hash password ก่อนเก็บ
        hashed_password = password_hasher.hash(
            password
        )

        self.db.execute(
            """
            INSERT INTO public.users (
                employee_code,
                first_name,
                last_name,
                role,
                username,
                password_hash,
                is_active
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
                employee_code,
                first_name,
                last_name,
                role,
                username,
                hashed_password,
                is_active
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # UPDATE USER
    # ไม่แก้ password
    def update(
        self,
        user_id,
        employee_code,
        first_name,
        last_name,
        role,
        username,
        is_active
    ):

        # เช็กว่า user มีจริงไหม
        data, columns = self.db.fetch(
            """
            SELECT user_id
            FROM public.users
            WHERE user_id = %s
            """,
            (user_id,)
        )

        if len(data) == 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบผู้ใช้งานรหัส {user_id}"
            }
        
        # เช็ก employee_code หรือ username ซ้ำ
        data, columns = self.db.fetch(
            """
            SELECT user_id
            FROM public.users
            WHERE (
                employee_code = %s
                OR username = %s
            )
            AND user_id <> %s
            """,
            (
                employee_code,
                username,
                user_id
            )
        )

        if len(data) > 0:

            return {
                "Is Error": True,
                "Error Message":
                    "รหัสพนักงานหรือ Username นี้ถูกใช้งานแล้ว"
            }

        self.db.execute(
            """
            UPDATE public.users

            SET
                employee_code = %s,
                first_name = %s,
                last_name = %s,
                role = %s,
                username = %s,
                is_active = %s,
                updated_at = CURRENT_TIMESTAMP

            WHERE user_id = %s
            """,
            (
                employee_code,
                first_name,
                last_name,
                role,
                username,
                is_active,
                user_id
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # CHANGE PASSWORD
    def update_password(self,user_id,new_password):
        data, columns = self.db.fetch(
            """
            SELECT user_id
            FROM public.users
            WHERE user_id = %s
            """,
            (user_id,)
        )

        if len(data) == 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบผู้ใช้งานรหัส {user_id}"
            }

        hashed_password = password_hasher.hash(
            new_password
        )

        self.db.execute(
            """
            UPDATE public.users

            SET
                password_hash = %s,
                updated_at = CURRENT_TIMESTAMP

            WHERE user_id = %s
            """,
            (
                hashed_password,
                user_id
            )
        )

        return {
            "Is Error": False,
            "Error Message": ""
        }

    # DEACTIVATE USER
    # ไม่ DELETE user จริง
    def deactivate(self, user_id):
        data, columns = self.db.fetch(
            """
            SELECT user_id
            FROM public.users
            WHERE user_id = %s
            """,
            (user_id,)
        )

        if len(data) == 0:

            return {
                "Is Error": True,
                "Error Message":
                    f"ไม่พบผู้ใช้งานรหัส {user_id}"
            }

        self.db.execute(
            """
            UPDATE public.users

            SET
                is_active = FALSE,
                updated_at = CURRENT_TIMESTAMP

            WHERE user_id = %s
            """,
            (user_id,)
        )
        return {
            "Is Error": False,
            "Error Message": ""
        }