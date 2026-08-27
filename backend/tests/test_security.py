import os
import unittest

os.environ.setdefault("AUTH_SECRET", "test-only-secret-that-is-at-least-32-characters")

from auth_security import create_access_token, verify_access_token
from slip_ocr import _money_candidates, _valid_signature


class SecurityTests(unittest.TestCase):
    def test_signed_token_round_trip(self):
        token = create_access_token({
            "user_id": 7,
            "role": "OFFICER",
            "group_code": "ก-น",
        })
        payload = verify_access_token(token)
        self.assertEqual(payload["sub"], 7)
        self.assertEqual(payload["role"], "OFFICER")
        self.assertEqual(payload["group"], "ก-น")

    def test_modified_token_is_rejected(self):
        token = create_access_token({
            "user_id": 1,
            "role": "ADMIN",
            "group_code": None,
        })
        body, signature = token.split(".", 1)
        with self.assertRaises(Exception):
            verify_access_token(f"{body}x.{signature}")

    def test_ocr_amount_candidates_ignore_plain_account_numbers(self):
        self.assertEqual(_money_candidates("บัญชี 1234567890 ยอด 1,250.50 บาท"), [1250.50])

    def test_png_signature(self):
        self.assertTrue(_valid_signature(b"\x89PNG\r\n\x1a\nrest", "image/png"))
        self.assertFalse(_valid_signature(b"not an image", "image/png"))


if __name__ == "__main__":
    unittest.main()
