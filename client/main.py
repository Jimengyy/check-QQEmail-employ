import webview
import os
import sys
import logging
import threading
import time

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
    def __init__(self, window=None):
        self._window = window

    def close_widget(self):
        """仅隐藏/收起桌面挂件窗口，保持后台 Web 服务常驻"""
        logging.info("ℹ️ 已收起桌面透明挂件 (后台 Web 管理服务 http://127.0.0.1:5555/ 继续运行)")
        if self._window:
            self._window.hide()

    def quit_app(self):
        """完全退出全部程序"""
        logging.info("🔴 正在退出 OfferPilot 全部进程...")
        os._exit(0)

def start_app():
    logging.info("========================================")
    logging.info(f"🚀 OfferPilot V3.0 已启动 ({sys.platform})")
    logging.info("👉 网页管理控制台: http://127.0.0.1:5555/")
    logging.info("========================================")

    # 1. 启动常驻轻量静态 Web 服务
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    time.sleep(0.3)

    api = WidgetAPI(None)

    # 2. 创建桌面透明挂件窗口
    window = webview.create_window(
        'OfferPilot',
        url='http://127.0.0.1:5555/widget',
        width=350,
        height=600,
        transparent=True,
        frameless=True,
        on_top=False if IS_MAC else True,
        resizable=True,
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
                    NSApp.activateIgnoringOtherApps_(True)
                except Exception:
                    pass

    set_show_window_callback(do_show_window)

    # 4. 配置 macOS 原生挂件行为
    def set_native_widget(window):
        if not IS_MAC:
            return

        try:
            from AppKit import NSApp, NSApplicationActivationPolicyAccessory, \
                             NSWindowCollectionBehaviorCanJoinAllSpaces, \
                             NSWindowCollectionBehaviorStationary, \
                             NSWindowCollectionBehaviorIgnoresCycle
            
            NSApp.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
            
            try:
                from Quartz import kCGDesktopWindowLevel
            except ImportError:
                kCGDesktopWindowLevel = -2147483623
            
            ns_window = window.native
            if ns_window:
                ns_window.setLevel_(kCGDesktopWindowLevel)
                ns_window.setCollectionBehavior_(
                    NSWindowCollectionBehaviorCanJoinAllSpaces | 
                    NSWindowCollectionBehaviorStationary | 
                    NSWindowCollectionBehaviorIgnoresCycle
                )
                logging.info("✅ 已成功应用 macOS 原生挂件特性")
        except Exception as e:
            logging.error(f"❌ 设置 macOS 原生行为失败: {e}")

    # 启动 GUI 事件循环
    webview.start(func=set_native_widget, args=(window,))

if __name__ == '__main__':
    start_app()
