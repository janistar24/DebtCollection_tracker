import os
import unittest
from unittest.mock import AsyncMock, patch

from starlette.requests import Request
from starlette.responses import JSONResponse


os.environ.setdefault("AUTH_SECRET", "test-secret-that-is-at-least-32-characters-long")

import main


def request_for(path: str, method: str = "POST") -> Request:
    return Request({
        "type": "http",
        "method": method,
        "path": path,
        "headers": [(b"authorization", b"Bearer test")],
        "client": ("127.0.0.1", 1234),
        "scheme": "http",
        "server": ("test", 80),
        "query_string": b"",
    })


class AuthorizationTests(unittest.IsolatedAsyncioTestCase):
    @patch("main.authenticated_user", return_value={"sub": 2})
    @patch.object(main.db, "fetch_one")
    async def test_director_cannot_write_payment(self, fetch_one, _authenticated):
        fetch_one.return_value = ((2, "DIRECTOR", True, None), ("user_id", "role", "is_active", "group_code"))
        call_next = AsyncMock(return_value=JSONResponse({"success": True}))

        response = await main.enforce_authentication(
            request_for("/api/payments/complete"), call_next
        )

        self.assertEqual(response.status_code, 403)
        call_next.assert_not_awaited()

    @patch("main.authenticated_user", return_value={"sub": 2})
    @patch.object(main.db, "fetch_one")
    async def test_director_can_use_read_only_slip_ocr(self, fetch_one, _authenticated):
        fetch_one.return_value = ((2, "DIRECTOR", True, None), ("user_id", "role", "is_active", "group_code"))
        call_next = AsyncMock(return_value=JSONResponse({"success": True}))

        response = await main.enforce_authentication(
            request_for("/api/slips/read"), call_next
        )

        self.assertEqual(response.status_code, 200)
        call_next.assert_awaited_once()

    @patch("main.authenticated_user", return_value={"sub": 1})
    @patch.object(main.db, "fetch_one")
    async def test_admin_can_write(self, fetch_one, _authenticated):
        fetch_one.return_value = ((1, "ADMIN", True, None), ("user_id", "role", "is_active", "group_code"))
        call_next = AsyncMock(return_value=JSONResponse({"success": True}))

        response = await main.enforce_authentication(
            request_for("/api/payments/complete"), call_next
        )

        self.assertEqual(response.status_code, 200)
        call_next.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
