import os
import time
import threading
from flask import Flask, jsonify, request, send_from_directory
from core.backend import Backend
import logging

app = Flask(__name__)
backend_instance = Backend()

# --- Background Task ---
def fetch_loop():
    # 第一次启动时先等待几秒，避免阻塞主流程
    time.sleep(3)
    while True:
        try:
            interval = backend_instance.config.get('check_interval', 1200)
            logging.info("后台抓取线程: 正在执行邮件同步...")
            backend_instance.fetch_emails()
        except Exception as e:
            logging.error(f"后台抓取线程异常: {e}")
        finally:
            time.sleep(interval)

# --- Routes for Static Files ---
@app.route('/')
def admin_index():
    return send_from_directory('web_admin', 'index.html')

@app.route('/web_admin/<path:path>')
def admin_static(path):
    return send_from_directory('web_admin', path)

@app.route('/widget')
def widget_index():
    return send_from_directory('web', 'index.html')

@app.route('/<path:path>')
def root_static(path):
    # 挂件原本用 <script src="app.js">，这里做 fallback
    if os.path.exists(os.path.join('web', path)):
        return send_from_directory('web', path)
    return "", 404

# --- API Routes ---
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    status = request.args.get('status')
    tasks = backend_instance.load_local_tasks()
    if status:
        tasks = [t for t in tasks if t.get('status') == status]
    return jsonify(tasks)

@app.route('/api/tasks/<task_id>/status', methods=['POST'])
def update_status(task_id):
    data = request.json
    new_status = data.get('status')
    if not new_status:
        return jsonify({"error": "status is required"}), 400
    
    success = backend_instance.update_task_status(task_id, new_status)
    if success:
        return jsonify({"success": True})
    return jsonify({"error": "Task not found"}), 404

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    tasks = backend_instance.load_local_tasks()
    companies = {}
    
    for t in tasks:
        comp = t.get('company')
        if not comp or comp == "未知公司" or comp.strip() == "":
            continue
        if comp not in companies:
            companies[comp] = []
        companies[comp].append(t)
    
    # 构建简化的聚合数据
    dashboard_data = []
    for comp, comp_tasks in companies.items():
        comp_tasks.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        # 获取最新的一条记录作为该公司的当前状态
        latest_task = comp_tasks[0]
        
        dashboard_data.append({
            "company": comp,
            "latest_type": latest_task.get('type'),
            "latest_time": latest_task.get('time'),
            "status": latest_task.get('status'),
            "task_count": len(comp_tasks)
        })
        
    # 按照更新时间/任务数量排序
    dashboard_data.sort(key=lambda x: x['task_count'], reverse=True)
    return jsonify(dashboard_data)

def start_server():
    # 启动后台抓取线程
    t = threading.Thread(target=fetch_loop, daemon=True)
    t.start()
    
    # 启动 Flask (禁止 debug，防止双重启动线程)
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    app.run(host='127.0.0.1', port=5555, debug=False, use_reloader=False)

if __name__ == '__main__':
    start_server()
