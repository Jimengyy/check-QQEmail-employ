import webview
import os
import sys
import fcntl
import logging
from core.backend import Backend

class API:
    def __init__(self):
        self.backend = Backend()

    def fetch_data(self):
        return self.backend.fetch_emails()
    
    def get_config(self):
        return self.backend.config

    def complete_task(self, task_id):
        return self.backend.complete_task(task_id)

def check_singleton():
    """使用文件锁确保程序单实例运行"""
    lock_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app.lock')
    fp = open(lock_file, 'w')
    try:
        # 尝试加锁，LOCK_NB 表示非阻塞，如果已被占用则抛出异常
        fcntl.lockf(fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return fp
    except IOError:
        print("⚠️ 检测到程序已在运行，请勿重复打开。")
        sys.exit(0)

def start_app():
    logging.info("========================================")
    logging.info("🚀 招聘助手已启动 - 开启新会话")
    logging.info("========================================")
    
    # 持有文件句柄直到程序结束，防止锁被释放
    _lock_fp = check_singleton()
    api = API()
    
    # Get current directory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    html_file = os.path.join(current_dir, 'web', 'index.html')
    
    # Create window
    window = webview.create_window(
        '招聘助手',
        url=html_file,
        js_api=api,
        width=350,
        height=600,
        transparent=True,
        frameless=True,
        on_top=False,
        resizable=True
    )
    
    # Setup native macOS widget behavior
    def set_native_widget(window):
        try:
            from AppKit import NSApp, NSApplicationActivationPolicyAccessory, \
                             NSWindowCollectionBehaviorCanJoinAllSpaces, \
                             NSWindowCollectionBehaviorStationary, \
                             NSWindowCollectionBehaviorIgnoresCycle
            
            # 1. 设置应用为“附件”模式，从而从 Dock 和 Cmd+Tab 中隐藏
            NSApp.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
            
            try:
                from Quartz import kCGDesktopWindowLevel
            except ImportError:
                # Fallback to standard desktop level if Quartz is missing
                kCGDesktopWindowLevel = -2147483623 # Common desktop level value
            
            # Get the native NSWindow object
            ns_window = window.native
            
            if ns_window:
                # 2. 设置窗口层级：固定在桌面上
                ns_window.setLevel_(kCGDesktopWindowLevel)
                
                # 3. 配置集合行为：在所有桌面显示、固定位置、不参与循环切换
                ns_window.setCollectionBehavior_(
                    NSWindowCollectionBehaviorCanJoinAllSpaces | 
                    NSWindowCollectionBehaviorStationary | 
                    NSWindowCollectionBehaviorIgnoresCycle
                )
                logging.info("✅ 已成功应用 macOS 原生挂件行为（隐藏 Dock 图标，固定桌面层级）")
            else:
                logging.warning("⚠️ 提示：macOS 原生窗口对象尚未完全就绪，已跳过层级设置（这不影响程序抓取邮件和显示）")
                
        except Exception as e:
            logging.error(f"❌ 设置原生行为时发生意外错误: {e}")

    # Use the start callback to apply native settings
    webview.start(func=set_native_widget, args=(window,))

if __name__ == '__main__':
    start_app()
