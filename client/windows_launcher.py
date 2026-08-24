"""OfferPilot Windows 独立应用启动入口 (用于 PyInstaller 单文件打包)
自动启动本地微型 Web 服务并唤起 Windows 默认浏览器打开宽屏全景看板。
"""

import os
import sys
import time
import socket
import logging
import threading
import webbrowser

# 确保能正确导入 client 内模块
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS
    sys.path.insert(0, BUNDLE_DIR)
    sys.path.insert(0, os.path.join(BUNDLE_DIR, 'client'))
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_DIR = os.path.abspath(os.path.join(BASE_DIR, '..'))
    sys.path.insert(0, BASE_DIR)
    sys.path.insert(0, PROJECT_DIR)

from server import start_server

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(levelname)s] - %(message)s'
)

def is_port_in_use(port=5555):
    """检测指定端口是否已被占用"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0

def wait_for_server(port=5555, timeout=5.0):
    """等待本地服务器就绪"""
    start_time = time.time()
    while time.time() - start_time < timeout:
        if is_port_in_use(port):
            return True
        time.sleep(0.1)
    return False

def main():
    target_url = "http://127.0.0.1:5555/"
    logging.info("✦ OfferPilot Windows 独立客户端启动中...")

    # 1. 检查是否已经有正在运行的实例 (防重复启动)
    if is_port_in_use(5555):
        logging.info("🟢 检测到已有 OfferPilot 服务在后台运行，直接唤起浏览器...")
        webbrowser.open(target_url)
        time.sleep(0.5)
        sys.exit(0)

    # 2. 启动后台轻量 Web 服务线程
    logging.info("🚀 正在启动后台 Web 服务 (端口: 5555)...")
    server_thread = threading.Thread(
        target=start_server,
        kwargs={'port': 5555},
        daemon=True
    )
    server_thread.start()

    # 3. 等待服务就绪并打开默认浏览器
    if wait_for_server(5555, timeout=5.0):
        logging.info(f"🌐 服务已就绪，正在打开 Windows 默认浏览器: {target_url}")
        webbrowser.open(target_url)
    else:
        logging.warning("⚠️ 服务启动等待超时，尝试强制唤起浏览器...")
        webbrowser.open(target_url)

    # 4. 主线程常驻维持服务运行
    try:
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        logging.info("🔴 接收到退出信号，OfferPilot 服务正在安全关闭...")
        sys.exit(0)

if __name__ == '__main__':
    main()
