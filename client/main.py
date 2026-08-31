import webview
import os
import sys
import logging
import threading
import time
import webbrowser
import math

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(BASE_DIR, '..'))
sys.path.insert(0, BASE_DIR)

from server import start_server, set_show_window_callback

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(levelname)s] - %(message)s'
)

IS_MAC = sys.platform == "darwin"
IS_WIN = sys.platform == "win32"

class WidgetAPI:
    def __init__(self, window=None, admin_url="http://127.0.0.1:5555/"):
        self._window = window
        self._admin_url = admin_url

    def close_widget(self):
        """仅隐藏/收起桌面挂件窗口，保持后台 Web 服务常驻"""
        logging.info("ℹ️ 已收起桌面透明挂件 (后台 Web 管理服务 %s 继续运行)", self._admin_url)
        if self._window:
            self._window.hide()

    def move_widget(self, dx, dy):
        """Move by a pointer delta; Cocoa's global coordinates work across monitors."""
        dx, dy = float(dx), float(dy)
        if not math.isfinite(dx) or not math.isfinite(dy):
            raise ValueError("Invalid movement")
        if not self._window:
            return False
        if IS_MAC:
            from PyObjCTools import AppHelper

            def move_on_main_thread():
                native = self._window.native
                origin = native.frame().origin
                native.setFrameOrigin_((origin.x + dx, origin.y - dy))

            AppHelper.callAfter(move_on_main_thread)
        else:
            self._window.move(self._window.x + dx, self._window.y + dy)
        return True

    def open_admin(self):
        """Open our local dashboard in the default browser, not a WKWebView popup."""
        if not webbrowser.open(self._admin_url, new=2):
            raise RuntimeError("无法打开默认浏览器，请手动访问 " + self._admin_url)
        return True

    def quit_app(self):
        """完全退出全部程序"""
        logging.info("🔴 正在退出 OfferPilot 全部进程...")
        os._exit(0)

def start_app(port=5555):
    logging.info("========================================")
    logging.info(f"🚀 OfferPilot V3.0 已启动 ({sys.platform})")
    logging.info(f"👉 网页管理控制台: http://127.0.0.1:{port}/")
    logging.info("========================================")

    # 1. 启动常驻轻量静态 Web 服务
    server_thread = threading.Thread(target=start_server, args=(port,), daemon=True)
    server_thread.start()

    time.sleep(0.3)

    api = WidgetAPI(None, f"http://127.0.0.1:{port}/")

    # 2. 创建桌面透明挂件窗口
    window = webview.create_window(
        'OfferPilot',
        url=f'http://127.0.0.1:{port}/widget',
        width=350,
        height=600,
        transparent=True,
        frameless=True,
        easy_drag=False,
        focus=True,
        on_top=False if IS_MAC else True,
        # macOS resize hit-zones otherwise steal the same border used for dragging.
        resizable=not IS_MAC,
        js_api=api
    )
    api._window = window

    # 3. 注册唤醒回调
    def do_show_window():
        logging.info("⚡️ 执行桌面挂件窗口重新显示...")
        if window:
            window.show()
            if IS_MAC:
                try:
                    from AppKit import NSApp
                    from PyObjCTools import AppHelper
                    AppHelper.callAfter(NSApp.activateIgnoringOtherApps_, True)
                except Exception:
                    pass

    set_show_window_callback(do_show_window)

    # Configure NSWindow on Cocoa's main thread, once native exists.
    # Desktop-level windows can be covered by Finder's desktop and lose interaction.
    def configure_native_window(window):
        if not IS_MAC:
            return
        from AppKit import (
            NSApp, NSApplicationActivationPolicyAccessory, NSNormalWindowLevel,
            NSWindowCollectionBehaviorCanJoinAllSpaces,
            NSWindowCollectionBehaviorIgnoresCycle,
        )
        NSApp.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
        native = window.native
        native.setLevel_(NSNormalWindowLevel)
        native.setIgnoresMouseEvents_(False)
        native.setMovable_(True)
        native.setMovableByWindowBackground_(False)
        native.setCollectionBehavior_(
            NSWindowCollectionBehaviorCanJoinAllSpaces |
            NSWindowCollectionBehaviorIgnoresCycle
        )
        logging.info("✅ Mac 挂件交互已启用（普通窗口层级、标题区域拖动）")

    window.events.before_show += configure_native_window
    webview.start()

if __name__ == '__main__':
    start_app()
