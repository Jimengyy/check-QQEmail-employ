import os
import sys
import json
import imaplib
import email
from email.header import decode_header
from bs4 import BeautifulSoup
from datetime import datetime
import logging
import httpx
from openai import OpenAI

# 配置日志输出格式
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(levelname)s] - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

class CloudSyncWorker:
    def __init__(self):
        # 1. 尝试从本地 config.json 读取 (支持本地手动调试测试)
        current_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(current_dir, '..', 'config.json')
        if not os.path.exists(config_path):
            config_path = os.path.join(current_dir, 'config.json')
        config = {}
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
            except Exception as e:
                logging.warning(f"读取本地 config.json 失败: {e}")

        # 2. 显式读取环境变量 (优先读取环境变量，支持 GitHub Actions)
        ai_conf = config.get("ai_config", {})
        sb_conf = config.get("supabase_config", {})

        self.email_addr = os.getenv("EMAIL_USER", config.get("email"))
        self.auth_code = os.getenv("EMAIL_AUTH_CODE", config.get("auth_code"))
        self.imap_server = os.getenv("IMAP_SERVER", config.get("imap_server", "imap.qq.com"))

        self.api_key = os.getenv("DEEPSEEK_API_KEY", ai_conf.get("api_key"))
        self.api_base = os.getenv("DEEPSEEK_API_BASE", ai_conf.get("api_base", "https://api.deepseek.com")).rstrip("/")
        self.model_name = os.getenv("DEEPSEEK_MODEL", ai_conf.get("model", "deepseek-chat"))

        self.supabase_url = os.getenv("SUPABASE_URL", sb_conf.get("url", "")).rstrip("/")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", sb_conf.get("secret_key", ""))

        # 3. 严格校验所有必需参数，杜绝未定义
        missing = []
        if not self.email_addr: missing.append("EMAIL_USER")
        if not self.auth_code: missing.append("EMAIL_AUTH_CODE")
        if not self.imap_server: missing.append("IMAP_SERVER")
        if not self.api_key: missing.append("DEEPSEEK_API_KEY")
        if not self.api_base: missing.append("DEEPSEEK_API_BASE")
        if not self.model_name: missing.append("DEEPSEEK_MODEL")
        if not self.supabase_url: missing.append("SUPABASE_URL")
        if not self.supabase_key: missing.append("SUPABASE_SERVICE_ROLE_KEY")

        if missing:
            raise ValueError(f"❌ 启动失败: 缺少必需配置项 [{', '.join(missing)}]，请在环境变量或 GitHub Secrets 中显式配置！")

        # 打印显式配置概览 (安全脱敏)
        masked_email = self.email_addr[:3] + "***@" + self.email_addr.split("@")[-1] if "@" in self.email_addr else "***"
        logging.info("========================================")
        logging.info("⚙️  云端 Worker 配置已显式加载成功:")
        logging.info(f"   ├─ 邮箱账号: {masked_email} (IMAP: {self.imap_server})")
        logging.info(f"   ├─ AI 接口地址: {self.api_base}")
        logging.info(f"   ├─ AI 选用模型: {self.model_name}")
        logging.info(f"   └─ 云端数据库: {self.supabase_url}")
        logging.info("========================================")

        # 初始化 OpenAI/DeepSeek 客户端
        self.ai_client = OpenAI(
            api_key=self.api_key,
            base_url=self.api_base
        )

        # 初始化 Supabase HTTP 请求头 (使用最高权限 Secret Key 写入)
        self.sb_headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }

    def decode_str(self, s):
        if not s:
            return ""
        try:
            value, charset = decode_header(s)[0]
            if charset:
                if isinstance(value, bytes):
                    return value.decode(charset, errors='ignore')
                return value
            if isinstance(value, bytes):
                return value.decode('utf-8', errors='ignore')
            return str(value)
        except Exception:
            return str(s)

    def parse_email_content(self, msg):
        content = ""
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                if content_type in ['text/plain', 'text/html']:
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or 'utf-8'
                        content += payload.decode(charset, errors='ignore')
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or 'utf-8'
                content = payload.decode(charset, errors='ignore')
        
        soup = BeautifulSoup(content, 'html.parser')
        return soup.get_text(separator=' ')

    def get_sync_state(self):
        """从 Supabase 查询上次抓取的 last_uid"""
        try:
            resp = httpx.get(
                f"{self.supabase_url}/rest/v1/sync_state?key=eq.email_sync&select=last_uid",
                headers=self.sb_headers,
                timeout=10.0
            )
            if resp.status_code == 200:
                data = resp.json()
                if data and len(data) > 0:
                    return int(data[0].get("last_uid", 0))
            logging.warning(f"⚠️ 未查询到 sync_state，将默认使用 last_uid = 0. 响应: {resp.text}")
            return 0
        except Exception as e:
            logging.error(f"❌ 读取云端 sync_state 异常: {e}")
            return 0

    def update_sync_state(self, new_uid):
        """更新 Supabase 中的 last_uid"""
        try:
            payload = {
                "key": "email_sync",
                "last_uid": new_uid,
                "updated_at": datetime.now().isoformat()
            }
            resp = httpx.post(
                f"{self.supabase_url}/rest/v1/sync_state",
                headers=self.sb_headers,
                json=payload,
                timeout=10.0
            )
            if resp.status_code in [200, 201]:
                logging.info(f"✅ 云端书签已成功更新为: last_uid = {new_uid}")
            else:
                logging.error(f"❌ 更新 sync_state 失败: {resp.status_code}, {resp.text}")
        except Exception as e:
            logging.error(f"❌ 更新 sync_state 异常: {e}")

    def parse_with_ai(self, subject, body):
        """使用 DeepSeek AI 提取邮件结构化信息"""
        prompt = f"""
你是一个招聘信息提取专家。请阅读下面的邮件主题和内容。

任务：
1. 判断该邮件是否与“招聘、面试、笔试、测评、Offer、录取、入职、简历投递、资料补充”等招聘流程相关。
2. 如果相关，提取以下关键要素：
   - company: 公司名称（如果不相关则填空）
   - time: 面试/笔试时间（如：2026-05-20 14:00 或 待定）
   - type: 核心任务类型（如：线上面试、线下面试、AI面试、笔试、测评、Offer发放、简历投递成功等，字数2-10字）
   - subject: 邮件主题或具体投递岗位名称
   - notes: 关键备注（如：腾讯会议号/Zoom链接/面试地点/注意事项等，无则留空）
   - urgent: 布尔值（如果是48小时内的面试/笔试，则为 true，否则为 false）

邮件主题: {subject}
邮件内容摘要: {body[:3000]}

请严格按以下 JSON 格式返回，不要输出任何其他说明文字：
{{
    "is_recruitment": true,
    "company": "公司名称",
    "time": "时间",
    "type": "核心任务类型",
    "subject": "岗位/主题",
    "notes": "会议号/地点/备注",
    "urgent": false
}}
"""
        try:
            logging.info(f"🔍 正在使用 AI 解析邮件: 【{subject}】")
            response = self.ai_client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": "你是一个招聘助手，只负责精准提取和识别招聘类邮件。"},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )
            text = response.choices[0].message.content.strip()
            
            # 清理 markdown 标签
            if text.startswith("```json"):
                text = text.split("```json")[1].split("```")[0].strip()
            elif text.startswith("```"):
                text = text.split("```")[1].split("```")[0].strip()

            result = json.loads(text)
            logging.info(f"✅ AI 解析结果: 公司={result.get('company')}, 类型={result.get('type')}, 时间={result.get('time')}")
            return result
        except Exception as e:
            logging.error(f"❌ AI 解析异常: {e}")
            raise e

    def upsert_task(self, task_dict):
        """将新识别出的任务插入 Supabase tasks 表"""
        try:
            resp = httpx.post(
                f"{self.supabase_url}/rest/v1/tasks",
                headers=self.sb_headers,
                json=task_dict,
                timeout=10.0
            )
            if resp.status_code in [200, 201]:
                logging.info(f"💾 任务已成功存入云端: [{task_dict['type']}] {task_dict['company']}")
                return True
            else:
                logging.error(f"❌ 任务入库失败: {resp.status_code}, {resp.text}")
                return False
        except Exception as e:
            logging.error(f"❌ 任务入库网络异常: {e}")
            return False

    def run(self):
        logging.info("🚀 ========================================")
        logging.info("🚀 启动云端招聘邮件同步 Worker")
        logging.info("🚀 ========================================")

        # 1. 获取上次同步的 UID
        last_uid = self.get_sync_state()
        logging.info(f"📖 云端当前进度书签: last_uid = {last_uid}")

        # 2. 连接 IMAP 邮箱
        try:
            mail = imaplib.IMAP4_SSL(self.imap_server)
            mail.login(self.email_addr, self.auth_code)
            mail.select("INBOX")
        except Exception as e:
            logging.error(f"❌ 邮箱登录连接失败: {e}")
            return

        # 3. 检索新邮件 (增量模式)
        if last_uid > 0:
            logging.info(f"📥 正在检索新邮件 (UID > {last_uid})...")
            status, messages = mail.uid('search', None, f'UID {last_uid + 1}:*')
        else:
            import datetime as dt
            five_days_ago = (dt.datetime.now() - dt.timedelta(days=5)).strftime("%d-%b-%Y")
            logging.info(f"📥 初次同步或书签为0，检索最近 5 天邮件 (SINCE {five_days_ago})...")
            status, messages = mail.uid('search', None, 'SINCE', five_days_ago)

        if status == 'OK' and messages[0]:
            all_mail_ids = messages[0].split()
        else:
            all_mail_ids = []

        logging.info(f"📬 扫描到待处理邮件数量: {len(all_mail_ids)} 封")
        if not all_mail_ids:
            logging.info("✨ 没有发现新邮件，本次同步结束。")
            mail.logout()
            return

        new_tasks_count = 0
        max_uid_in_batch = last_uid

        for m_id in all_mail_ids:
            m_id_str = m_id.decode()
            
            # 过滤小于等于 last_uid 的冗余邮件
            try:
                current_uid_int = int(m_id_str)
                if current_uid_int <= last_uid:
                    continue
            except ValueError:
                continue

            # 获取邮件主题
            status, header_data = mail.uid('fetch', m_id, '(BODY[HEADER.FIELDS (SUBJECT FROM)])')
            subject = "无主题"
            if status == 'OK' and header_data[0]:
                header_msg = email.message_from_bytes(header_data[0][1])
                subject = self.decode_str(header_msg.get("Subject", "无主题"))

            logging.info(f"----------------------------------------")
            logging.info(f"📨 正在处理邮件 [UID: {m_id_str}]: {subject}")

            # 获取正文
            status, data = mail.uid('fetch', m_id, '(RFC822)')
            if status != 'OK' or not data[0]:
                continue

            msg = email.message_from_bytes(data[0][1])
            body = self.parse_email_content(msg)

            # 调用 AI 进行分析
            try:
                ai_result = self.parse_with_ai(subject, body)
                if ai_result and ai_result.get("is_recruitment"):
                    task_data = {
                        "id": m_id_str,
                        "company": ai_result.get("company", "未知公司"),
                        "time": ai_result.get("time", "待定"),
                        "type": ai_result.get("type", "招聘"),
                        "subject": ai_result.get("subject", subject),
                        "notes": ai_result.get("notes", ""),
                        "urgent": bool(ai_result.get("urgent", False)),
                        "status": "pending",
                        "is_deleted": False
                    }
                    if self.upsert_task(task_data):
                        new_tasks_count += 1
                else:
                    logging.info(f"⏭️ 忽略非招聘邮件: {subject[:30]}...")

                if current_uid_int > max_uid_in_batch:
                    max_uid_in_batch = current_uid_int

            except Exception as e:
                logging.error(f"⚠️ 解析处理中断 (网络/API错误)，停止推进，下次将重试该邮件。错误: {e}")
                break

        # 4. 如果有新进度，更新云端书签
        if max_uid_in_batch > last_uid:
            self.update_sync_state(max_uid_in_batch)

        logging.info("========================================")
        logging.info(f"🎉 同步完成！本次新增 {new_tasks_count} 条招聘任务，最新 UID: {max_uid_in_batch}")
        logging.info("========================================")
        mail.logout()

if __name__ == "__main__":
    worker = CloudSyncWorker()
    worker.run()
