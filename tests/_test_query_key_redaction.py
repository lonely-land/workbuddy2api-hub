"""Query-string API keys must not reach request logs.

`?key=` / `?api_key=` / `?api-key=` values are masked before log(). Other
query parameters and the path stay as they were. Quiet heartbeat GETs
still skip log() entirely.

    python tests/_test_query_key_redaction.py
"""
import os
import sys
import tempfile
import unittest
from unittest import mock

_startup_dir = tempfile.TemporaryDirectory(prefix="query-key-redaction-")
os.environ["ACCOUNTS_DIR"] = _startup_dir.name
os.environ["WB_PROXY_USAGE_DIR"] = _startup_dir.name
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import wb_proxy


_FMT = '"%s" %s %s'
_SECRET = "sk-SECRET"


def _handler(command="GET", path=None):
    handler = wb_proxy.Handler.__new__(wb_proxy.Handler)
    handler.command = command
    if path is not None:
        handler.path = path
    return handler


class QueryKeyRedactionTests(unittest.TestCase):
    def test_helper_masks_only_secret_query_params(self):
        redact = wb_proxy._redact_url_secrets
        self.assertEqual(
            redact("GET /v1/models?key=%s&model=x HTTP/1.1" % _SECRET),
            "GET /v1/models?key=***&model=x HTTP/1.1",
        )
        self.assertEqual(
            redact("GET /v1/models?api_key=%s&model=x HTTP/1.1" % _SECRET),
            "GET /v1/models?api_key=***&model=x HTTP/1.1",
        )
        self.assertEqual(
            redact("GET /v1/models?api-key=%s&model=x HTTP/1.1" % _SECRET),
            "GET /v1/models?api-key=***&model=x HTTP/1.1",
        )
        # Name case is ignored; the original spelling of the name stays.
        self.assertEqual(
            redact("/v1/models?KEY=%s&Api_Key=other&API-KEY=third&model=x" % _SECRET),
            "/v1/models?KEY=***&Api_Key=***&API-KEY=***&model=x",
        )
        # Secret in the middle or at the end does not swallow the neighbors.
        self.assertEqual(
            redact("GET /v1/models?model=x&key=%s&other=y HTTP/1.1" % _SECRET),
            "GET /v1/models?model=x&key=***&other=y HTTP/1.1",
        )
        # Path segments and unrelated parameter names are left alone,
        # including names that merely contain "key".
        unchanged = (
            "GET /v1/keys/api-key?model=x&apikey=%s&mykey=%s&key_name=%s&token=%s HTTP/1.1"
            % (_SECRET, _SECRET, _SECRET, _SECRET)
        )
        self.assertEqual(redact(unchanged), unchanged)
        self.assertEqual(redact("GET /v1/models HTTP/1.1"), "GET /v1/models HTTP/1.1")

    def _assert_masked(self, requestline, needle):
        handler = _handler(command="GET")
        with mock.patch("wb_proxy.log") as log:
            handler.log_message(_FMT, requestline, "200", "-")
        self.assertEqual(log.call_count, 1)
        self.assertEqual(len(log.call_args[0]), 1)
        text = log.call_args[0][0]
        self.assertNotIn(_SECRET, text)
        self.assertNotIn(_SECRET, repr(log.call_args_list))
        self.assertIn(needle, text)
        self.assertIn("model=x", text)
        self.assertEqual(
            text,
            '"%s" 200 -' % requestline.replace(_SECRET, "***"),
        )

    def test_log_message_masks_key(self):
        self._assert_masked(
            "GET /v1/models?key=%s&model=x HTTP/1.1" % _SECRET,
            "key=***",
        )

    def test_log_message_masks_api_key(self):
        self._assert_masked(
            "GET /v1/models?api_key=%s&model=x HTTP/1.1" % _SECRET,
            "api_key=***",
        )

    def test_log_message_masks_api_hyphen_key(self):
        self._assert_masked(
            "GET /v1/models?api-key=%s&model=x HTTP/1.1" % _SECRET,
            "api-key=***",
        )

    def test_quiet_get_logs_does_not_call_log(self):
        handler = _handler(command="GET", path="/logs?key=%s" % _SECRET)
        with mock.patch("wb_proxy.log") as log:
            handler.log_message(
                _FMT,
                "GET /logs?key=%s HTTP/1.1" % _SECRET,
                "200",
                "-",
            )
        self.assertEqual(log.call_count, 0)


if __name__ == "__main__":
    unittest.main()
