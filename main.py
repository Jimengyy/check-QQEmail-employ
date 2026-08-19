import webview
import os
import sys
import logging
from core.backend import Backend

# 平台判断
IS_MAC = sys.platform == "darwin"
IS_WIN = sys.platform == "win32"

# Unix-only imports
if not IS_WIN:
    try:
        import fcntl
    except ImportError:
        fcntl = None
else:
    fcntl = None

import threading
from server import start_server

def check_singleton():
    """确保程序单实例运行"""
    lock_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app.lock')
    
    if IS_WIN:
        # Windows 简易单例实现：检查文件是否存在并尝试打开
        try:
            if os.path.exists(lock_file):
                os.remove(lock_file) # 尝试删除旧锁
            fp = open(lock_file, 'w')
            return fp
        except Exception:
            print("⚠️ 检测到程序已在运行（或锁文件被占用），请勿重复打开。")
            sys.exit(0)
    else:
        # Unix/Mac 使用 fcntl
        fp = open(lock_file, 'w')
        try:
            if fcntl:
                fcntl.lockf(fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return fp
        except IOError:
            print("⚠️ 检测到程序已在运行，请勿重复打开。")
            sys.exit(0)

def start_app():
    logging.info("========================================")
    logging.info(f"🚀 招聘助手已启动 ({sys.platform}) - 开启新会话")
    logging.info("========================================")
    
    # 持有文件句柄直到程序结束，防止锁被释放
    _lock_fp = check_singleton()
    
    # 启动 Flask 服务
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    # Create window
    # Windows 下透明窗口可能需要特定配置，这里先尝试通用配置
    window = webview.create_window(
        '招聘助手',
        url='http://127.0.0.1:5555/widget',
        width=350,
        height=600,
        transparent=True,
        frameless=True,
        on_top=False if IS_MAC else True, # Windows 下默认置顶方便查看，Mac 下由于是挂件模式设为 False
        resizable=True
    )
    
    # Setup native macOS widget behavior
    def set_native_widget(window):
        if not IS_MAC:
            logging.info("ℹ️ 非 macOS 系统，跳过原生挂件行为配置")
            return

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
                logging.info("✅ 已成功应用 macOS 原生挂件行为")
            else:
                logging.warning("⚠️ 警告：macOS 原生窗口对象未就绪")
                
        except Exception as e:
            logging.error(f"❌ 设置 macOS 原生行为失败: {e}")

    # Start the app
    webview.start(func=set_native_widget, args=(window,))

if __name__ == '__main__':
    start_app()
