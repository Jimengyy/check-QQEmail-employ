"""Exercise the real release decision script, including macOS Bash 3.2 errors."""
from pathlib import Path
import subprocess
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/mac_release_mode.sh'
CREDENTIALS = ('CERTIFICATE_BASE64', 'CERTIFICATE_PASSWORD', 'SIGNING_IDENTITY',
               'APPLE_ID', 'APPLE_TEAM_ID', 'APPLE_APP_PASSWORD')


class ReleaseModeTests(unittest.TestCase):
    def run_mode(self, credentials):
        # Never inherit real signing credentials from the machine running tests.
        return subprocess.run(['/bin/bash', str(SCRIPT)],
                              env={'PATH': '/usr/bin:/bin', 'LANG': 'en_US.UTF-8', **credentials},
                              capture_output=True, text=True)

    def test_unset_credentials_allow_unsigned_release(self):
        result = self.run_mode({})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'mode=unsigned')
        self.assertIn('-unsigned', result.stderr)

    def test_empty_github_secrets_allow_unsigned_release(self):
        result = self.run_mode(dict.fromkeys(CREDENTIALS, ''))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'mode=unsigned')

    def test_complete_credentials_choose_notarization_without_exposing_values(self):
        result = self.run_mode(dict.fromkeys(CREDENTIALS, 'private-test-value'))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'mode=notarized')
        self.assertNotIn('private-test-value', result.stdout + result.stderr)

    def test_each_missing_credential_is_reported_without_bash_crash_or_downgrade(self):
        for name in CREDENTIALS:
            with self.subTest(missing=name):
                credentials = dict.fromkeys(CREDENTIALS, 'private-test-value')
                credentials[name] = ''
                result = self.run_mode(credentials)
                self.assertEqual(result.returncode, 1)
                self.assertIn(name, result.stderr)
                self.assertNotIn('unbound variable', result.stderr)
                self.assertNotIn('private-test-value', result.stdout + result.stderr)
                self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()
