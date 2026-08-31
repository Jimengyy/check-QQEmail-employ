"""Regression: saving settings must not invalidate a frozen application's signature."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    'offerpilot_test_server', Path(__file__).resolve().parents[1] / 'client/server.py')
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


class ConfigPersistenceTests(unittest.TestCase):
    def test_frozen_save_only_writes_user_config(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bundle = root / 'OfferPilot.app' / 'Contents' / 'MacOS'
            bundle.mkdir(parents=True)
            marker = bundle / 'config.json'
            marker.write_text('original signed resource')
            user_dir = root / 'user-config'
            with patch.object(server.sys, 'frozen', True, create=True), \
                 patch.object(server, 'PROJECT_DIR', str(bundle)), \
                 patch.object(server, 'USER_CONFIG_DIR', str(user_dir)), \
                 patch.object(server, 'USER_CONFIG_PATH', str(user_dir / 'config.json')):
                response = server.app.test_client().post('/api/save_config', json={
                    'url': 'https://example.supabase.co/', 'publishable_key': 'test-public-key'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(marker.read_text(), 'original signed resource')
            self.assertEqual(json.loads((user_dir / 'config.json').read_text())['supabase']['url'],
                             'https://example.supabase.co')

    def test_source_save_preserves_development_config(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            user_dir = root / 'user-config'
            with patch.object(server.sys, 'frozen', False, create=True), \
                 patch.object(server, 'PROJECT_DIR', directory), \
                 patch.object(server, 'USER_CONFIG_DIR', str(user_dir)), \
                 patch.object(server, 'USER_CONFIG_PATH', str(user_dir / 'config.json')):
                response = server.app.test_client().post('/api/save_config', json={
                    'url': 'https://example.supabase.co', 'publishable_key': 'test-public-key'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual((root / 'config.json').read_bytes(), (user_dir / 'config.json').read_bytes())


if __name__ == '__main__':
    unittest.main()
