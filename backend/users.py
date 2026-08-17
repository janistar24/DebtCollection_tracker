from DBHelper import DBHelper
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()

class Users:

    def __init__(self):
        self.db = DBHelper()
        #self.pwd_hasher = PasswordHash()

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
            users.append(dict(zip(columns, row)))

        return users

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

        return dict(zip(columns, data[0]))

    def create(self, employee_code, first_name, last_name, role, username, password, is_active):
        # เช็ก username ซ้ำ
        if self.find_by_username(username) is not None:
            return {
                'Is Error': True,
                'Error Message': f"Username '{username}' already exists. Cannot Create."
            }

        password_hash = password_hash.hash(password)

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
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                employee_code,
                first_name,
                last_name,
                role,
                username,
                password,
                is_active
            )
        )

        return {
            'Is Error': False,
            'Error Message': ""
        }

    def update(self, receipt_no, newDate, newCustomer_code, newPayment_method, newPayment_reference, newRemarks, newReceiptLineTuplesList):
        # Finds the receipt date, customer code, payment method, payment reference, remarks in receipts object and then changes the values to the new ones. 
        # Returns dictionary {‘Is Error’: ___, ‘Error Message’: _____}.

        data, columns = self.db.fetch ("SELECT * FROM receipt WHERE receipt_no = '{}' ".format(receipt_no))
        if len(data) > 0:
            self.db.execute ("UPDATE receipt SET date={}, customer_code='{}', payment_method='{}', payment_reference='{}', remarks='{}' ".format(newDate, newCustomer_code, newPayment_method, newPayment_reference, newRemarks, receipt_no))
            self.__updateLineItem(receipt_no, newReceiptLineTuplesList)
        else:
            return {'Is Error': True, 'Error Message': "Receipt No '{}' not found. Cannot Update.".format(receipt_no)}

        return {'Is Error': False, 'Error Message': ""}

    def update_users_line_item(self, receipt_no, item_no, invoice_no, amount_paid_here):  
        # Finds the receipt_line_item amount paid here in receipt_line_item object and then changes the values to the new ones
        # Returns dictionary {‘Is Error’: ___, ‘Error Message’: _____}.

        data, columns = self.db.fetch ("SELECT * FROM receipt_line_item WHERE receipt_no = '{}' AND item_no = '{}' ".format(receipt_no, item_no))
        if len(data) > 0:
            self.db.execute ("UPDATE receipt_line_item SET amount_paid_here = {} WHERE receipt_no = '{}' AND item_no = '{}' AND invoice_no = '{}' ".format(amount_paid_here, receipt_no, item_no, invoice_no))
            self.__updateReceiptTotal(receipt_no)
        else:
            return {'Is Error': True, 'Error Message': "Item No '{}' not found in Invoice No '{}'. Cannot Update.".format(item_no, invoice_no)}

        return {'Is Error': False, 'Error Message': ""}

    def delete_receipt_line_item(self, receipt_no, item_no, invoice_no):
        # Returns dictionary {‘Is Error’: ___, ‘Error Message’: _____}

        data, columns = self.db.fetch ("SELECT * FROM receipt_line_item WHERE receipt_no = '{}' AND invoice_no = '{}' ".format(receipt_no, invoice_no))
        if len(data) > 0:
            self.db.execute ("DELETE FROM receipt_line_item WHERE receipt_no = '{}' AND item_no = '{}' AND invoice_no = '{}' ".format(receipt_no, item_no, invoice_no))
            self.__updateReceiptTotal(receipt_no)
        else:
            return {'Is Error': True, 'Error Message': "Item No {} and Invoice No '{}' not found in Receipt No '{}'. Cannot Delete.".format(item_no, invoice_no, receipt_no)}

        return {'Is Error': False, 'Error Message': ""}
