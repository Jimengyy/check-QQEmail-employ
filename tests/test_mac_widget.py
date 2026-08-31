"""Window setup and bridge behavior without opening GUI or accessing user data."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import MagicMock, patch


class WidgetInteractionTests(unittest.TestCase):
    def setUp(self):
        self.webview = MagicMock()
        self.server = MagicMock()
        modules = {'webview': self.webview, 'server': self.server}
        spec = importlib.util.spec_from_file_location('widget_main_test', Path(__file__).resolve().parents[1] / 'client/main.py')
        self.main = importlib.util.module_from_spec(spec)
        # main.py inserts BASE_DIR; restore sys.path after loading the test module.
        with patch.dict(sys.modules, modules), patch.object(sys, 'path', list(sys.path)):
            spec.loader.exec_module(self.main)

    def test_window_uses_title_drag_and_main_thread_native_event(self):
        window = self.webview.create_window.return_value
        before_show = window.events.before_show
        with patch.object(self.main.threading, 'Thread'), patch.object(self.main.time, 'sleep'):
            self.main.start_app(port=5567)
        options = self.webview.create_window.call_args.kwargs
        self.assertFalse(options['easy_drag'])
        self.assertTrue(options['focus'])
        self.assertEqual(options['url'], 'http://127.0.0.1:5567/widget')
        callback = before_show.__iadd__.call_args.args[0]
        appkit = types.SimpleNamespace(NSApp=MagicMock(), NSApplicationActivationPolicyAccessory=1,
            NSNormalWindowLevel=0, NSWindowCollectionBehaviorCanJoinAllSpaces=1,
            NSWindowCollectionBehaviorIgnoresCycle=64)
        with patch.dict(sys.modules, {'AppKit': appkit}), patch.object(self.main, 'IS_MAC', True):
            callback(window)
        window.native.setLevel_.assert_called_once_with(0)
        window.native.setIgnoresMouseEvents_.assert_called_once_with(False)
        self.webview.start.assert_called_once_with()

    def test_dashboard_bridge_opens_only_configured_local_url(self):
        api = self.main.WidgetAPI(admin_url='http://127.0.0.1:5567/')
        with patch.object(self.main.webbrowser, 'open', return_value=True) as opened:
            self.assertTrue(api.open_admin())
        opened.assert_called_once_with('http://127.0.0.1:5567/', new=2)
        with patch.object(self.main.webbrowser, 'open', return_value=False):
            with self.assertRaises(RuntimeError):
                api.open_admin()

    def test_mac_drag_applies_delta_without_adding_monitor_origin(self):
        window = MagicMock()
        window.native.frame.return_value.origin = types.SimpleNamespace(x=1720, y=300)
        helper = MagicMock()
        helper.callAfter.side_effect = lambda callback: callback()
        with patch.dict(sys.modules, {'PyObjCTools': types.SimpleNamespace(AppHelper=helper)}), \
             patch.object(self.main, 'IS_MAC', True):
            self.assertTrue(self.main.WidgetAPI(window).move_widget(115, 75))
        window.native.setFrameOrigin_.assert_called_once_with((1835.0, 225.0))
        window.move.assert_not_called()

    def test_close_hides_without_terminating_backend(self):
        window = MagicMock()
        self.main.WidgetAPI(window).close_widget()
        window.hide.assert_called_once_with()
        window.destroy.assert_not_called()
