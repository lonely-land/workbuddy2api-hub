"""Credential files are owner-only on POSIX.

Account tokens and API keys stay plaintext JSON. open() creates them as
0666 & ~umask, which is 0644 under the usual umask 022, so another local
user could read them. Writers chmod the temp file to 0600 before
os.replace and the accounts directory to 0700. AccountPool.load() repairs
a 0644 account file left by an older install.

Mode bits are a POSIX idea, so those assertions are skipped on Windows
(os.name == "nt"). An OSError from chmod must not abort a save or a load.

    python tests/_test_credentials_permissions.py
"""
import json
import os
import shutil
import stat
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import wb_accounts
import wb_settings


def _mode(path):
    return stat.S_IMODE(os.stat(path).st_mode)


class CredentialPermissionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.mkdtemp(prefix="wb-cred-mode-")

    def tearDown(self):
        # The directory is 0700 after a successful harden; the owner can
        # still remove it. Widen first so a failed chmod cannot strand it.
        try:
            os.chmod(self.directory, 0o700)
        except OSError:
            pass
        shutil.rmtree(self.directory, ignore_errors=True)

    def _assert_mode(self, path, expected):
        if os.name == "nt":
            return
        actual = _mode(path)
        self.assertEqual(actual, expected, "%s is %04o, want %04o" % (path, actual, expected))

    def _loosen(self, path, mode):
        """Start from a world-readable mode so the assertion proves a change."""
        if os.name == "nt":
            return
        os.chmod(path, mode)

    def test_account_save_creates_an_owner_only_file(self):
        self._loosen(self.directory, 0o755)
        account = wb_accounts.Account({
            "uid": "user-1",
            "accessToken": "secret-token",
            "realm": "intl",
        })
        path = account.save(self.directory)
        self.assertTrue(path.endswith("user-1.json"))
        with open(path, encoding="utf-8") as fh:
            stored = json.load(fh)
        self.assertEqual(stored.get("accessToken"), "secret-token")
        self._assert_mode(path, 0o600)
        self._assert_mode(self.directory, 0o700)

    def test_settings_save_creates_an_owner_only_file(self):
        self._loosen(self.directory, 0o755)
        path = wb_settings.save(self.directory, {"api_key": "secret-key"})
        self.assertEqual(os.path.basename(path), "settings.json")
        with open(path, encoding="utf-8") as fh:
            stored = json.load(fh)
        self.assertEqual(stored.get("api_key"), "secret-key")
        self._assert_mode(path, 0o600)
        self._assert_mode(self.directory, 0o700)

    def test_pool_load_repairs_a_world_readable_account_file(self):
        self._loosen(self.directory, 0o755)
        path = os.path.join(self.directory, "user-1.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({
                "uid": "user-1",
                "accessToken": "secret-token",
                "realm": "intl",
            }, fh)
        self._loosen(path, 0o644)
        if os.name != "nt":
            self.assertEqual(_mode(path), 0o644)
        loaded = wb_accounts.AccountPool(self.directory).load()
        self.assertEqual([account.uid for account in loaded], ["user-1"])
        with open(path, encoding="utf-8") as fh:
            stored = json.load(fh)
        self.assertEqual(stored.get("accessToken"), "secret-token")
        self._assert_mode(path, 0o600)
        self._assert_mode(self.directory, 0o700)

    def test_chmod_oserror_does_not_abort_save_or_load(self):
        path = os.path.join(self.directory, "user-1.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({
                "uid": "user-1",
                "accessToken": "secret-token",
                "realm": "intl",
            }, fh)
        with mock.patch.object(wb_settings.os, "chmod", side_effect=OSError("unsupported")):
            settings_path = wb_settings.save(self.directory, {"api_key": "secret-key"})
            account = wb_accounts.Account({
                "uid": "user-2",
                "accessToken": "other-token",
                "realm": "intl",
            })
            account_path = account.save(self.directory)
            loaded = wb_accounts.AccountPool(self.directory).load()
        self.assertTrue(os.path.isfile(settings_path))
        self.assertTrue(os.path.isfile(account_path))
        uids = sorted(account.uid for account in loaded)
        self.assertEqual(uids, ["user-1", "user-2"])


if __name__ == "__main__":
    unittest.main()
