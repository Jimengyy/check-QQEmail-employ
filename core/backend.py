import imaplib
import os
import email
from email.header import decode_header
import json
from bs4 import BeautifulSoup
from datetime import datetime
import logging
from openai import OpenAI

# 配置日志系统：同时输出到文件和控制台
log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fetch.log')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    encoding='utf-8',
    handlers=[
        logging.FileHandler(log_file, encoding='utf-8'),
        logging.StreamHandler()
    ]
)

class Backend:
    def __init__(self, config_path=None):
        if config_path is None:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            config_path = os.path.join(current_dir, '..', 'config.json')
        self.config_path = config_path
        self.config = self.load_config()
        self.tasks_path = os.path.join(os.path.dirname(config_path), 'tasks.json')
        self.sync_state_path = os.path.join(os.path.dirname(config_path), 'sync_state.json')
        self.imap_server = self.config.get('imap_server', 'imap.qq.com')
        
        # 初始化 AI 引擎
        self.ai_conf = self.config.get('ai_config', {})
        self.use_ai = self.ai_conf.get('use_ai', False)
        self.ai_provider = self.ai_conf.get('provider', 'gemini').lower()
        self.api_key = self.ai_conf.get('api_key')
        
        if self.use_ai and self.api_key and "YOUR_API_KEY" not in self.api_key:
            try:
                if self.ai_provider == 'openai':
                    self.openai_client = OpenAI(
                        api_key=self.api_key,
                        base_url=self.ai_conf.get('api_base', 'https://api.deepseek.com/v1')
                    )
                    self.ai_model_name = self.ai_conf.get('model', 'deepseek-chat')
                    logging.info(f"🚀 OpenAI 兼容引擎 ({self.ai_provider}) 初始化成功")
                else:
                    logging.warning(f"⚠️ 未知的 AI 供应商: {self.ai_provider}")
                    self.use_ai = False
            except Exception as e:
                logging.error(f"❌ AI 初始化失败: {e}")
                self.use_ai = False
        else:
            self.use_ai = False
            logging.info("ℹ️ 未启用 AI 解析或未配置有效 API Key，将使用正则解析")

    def load_config(self):
        logging.info(f"正在从路径加载配置: {os.path.abspath(self.config_path)}")
        try:
            if not os.path.exists(self.config_path):
                logging.error(f"❌ 找不到配置文件: {self.config_path}")
                return {}
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                logging.info(f"✅ 配置加载成功，邮箱为: {config.get('email')}")
                return config
        except Exception as e:
            logging.error(f"❌ 解析 config.json 失败: {e}")
            return {}

    def load_local_tasks(self):
        if os.path.exists(self.tasks_path):
            try:
                with open(self.tasks_path, 'r', encoding='utf-8') as f:
                    tasks = json.load(f)
                    # 数据格式向后兼容，自动向新系统迁移
                    for t in tasks:
                        if 'status' not in t:
                            if t.get('completed'):
                                t['status'] = 'completed'
                            else:
                                t['status'] = 'approved'
                    return tasks
            except json.JSONDecodeError:
                logging.error(f"❌ 任务文件 {self.tasks_path} 损坏，正在备份...")
                try:
                    os.rename(self.tasks_path, self.tasks_path + '.corrupted')
                except Exception as e:
                    logging.error(f"备份损坏的任务文件失败: {e}")
                return []
            except Exception as e:
                logging.error(f"读取任务失败: {e}")
                return []
        return []

    def load_sync_state(self):
        if os.path.exists(self.sync_state_path):
            try:
                with open(self.sync_state_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except: pass
        return {"last_uid": 0}

    def save_sync_state(self, state):
        try:
            with open(self.sync_state_path, 'w', encoding='utf-8') as f:
                json.dump(state, f)
        except Exception as e:
            logging.error(f"保存 sync_state 失败: {e}")

    def save_local_tasks(self, tasks):
        try:
            with open(self.tasks_path, 'w', encoding='utf-8') as f:
                json.dump(tasks, f, ensure_ascii=False, indent=4)
        except Exception as e:
            logging.error(f"保存任务失败: {e}")

    def decode_str(self, s):
        value, charset = decode_header(s)[0]
        if charset:
            if isinstance(value, bytes):
                return value.decode(charset)
            return value
        return value

    def parse_email_content(self, msg):
        content = ""
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                if content_type == 'text/plain' or content_type == 'text/html':
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

    def parse_with_ai(self, subject, body):
        """使用 AI 解析邮件内容，并判断是否为招聘相关"""
        prompt = f"""
        你是一个招聘信息提取专家。请阅读下面的邮件主题和内容。
        
        任务：
        1. 判断该邮件是否与“招聘、面试、笔试、测评、Offer、录取、入职、简历投递、资料补充”等招聘流程相关。
        2. 如果相关，提取公司名称、核心任务类型（优先选择：线上面试/线下面试/AI面试/笔试/测评；如果不属于这些，请自行总结核心任务，如：Offer发放、简历投递成功、资料补充等，字数控制在2-10字）、任务的时间范围或时间，根据具体的任务来判断。
        
        邮件主题: {subject}
        邮件内容: {body[:3000]}
        
        请严格按以下 JSON 格式返回，不要包含任何其它文字：
        {{
            "is_recruitment": true/false (是否与招聘相关),
            "company": "公司名称 (如果不相关则填空)",
            "time": "时间 (格式如：2024-05-20 14:00，如果不相关则填空)",
            "type": "核心任务类型 (优先使用预设类别，或自定义2-4个字的任务名称)",
            "urgent": true/false (如果是面试或时间很近则为 true)
        }}
        """
        try:
            logging.info(f"🔍 正在使用 AI 解析邮件: 【{subject}】")
            if self.ai_provider == 'openai':
                response = self.openai_client.chat.completions.create(
                    model=self.ai_model_name,
                    messages=[
                        {"role": "system", "content": "你是一个招聘助手，只负责提取和识别招聘类邮件。"},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"} if "deepseek" in self.ai_model_name.lower() or "gpt" in self.ai_model_name.lower() else None
                )
                text = response.choices[0].message.content.strip()
                logging.info(f"📡 AI 响应原文: \n{text}")
            else:
                return None

            # 清理可能的 markdown 标记
            if text.startswith("```json"):
                text = text.split("```json")[1].split("```")[0].strip()
            elif text.startswith("```"):
                text = text.split("```")[1].split("```")[0].strip()
            
            result = json.loads(text)
            logging.info(f"✅ AI 解析结果: 公司={result.get('company')}, 时间={result.get('time')}, 类型={result.get('type')}, 招聘相关={result.get('is_recruitment')}")
            return result
        except Exception as e:
            error_msg = f"❌ AI 解析过程中发生异常: {e}"
            logging.error(error_msg)
            # 如果存在 text 变量（说明 API 调用成功但解析失败），打印出原文以便调试
            if 'text' in locals():
                logging.error(f"📄 AI 原始返回内容: \n{text}")
            # 向上抛出异常，防止程序误认为这封邮件是不相关的垃圾邮件
            raise Exception(f"AI API 错误: {e}")

    def extract_info(self, subject, body, msg_id):
        logging.info(f"📩 正在对新邮件进行提取解析: 【{subject}】 (ID: {msg_id})")
        # 展示前 500 个字符以供 debug
        debug_body = body[:500].replace('\n', ' ')
        logging.info(f"📄 邮件正文摘要 (前500字): {debug_body}...")
        logging.info("-" * 40)
        
        # 仅使用 AI 解析，不再使用正则回退
        if not self.use_ai:
            logging.warning("⚠️ AI 解析未启用，跳过邮件提取")
            return None

        ai_result = self.parse_with_ai(subject, body)
        if ai_result and ai_result.get("is_recruitment"):
            return {
                "id": msg_id,
                "company": ai_result.get("company", "未知公司"),
                "time": ai_result.get("time", "待定"),
                "type": ai_result.get("type", "其它"),
                "urgent": ai_result.get("urgent", False),
                "status": "pending_review",
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
            }
        
        # AI 判定不相关或解析失败
        if ai_result:
            logging.info(f"⏭️ 忽略非招聘邮件: {subject[:30]}...")
        
        return None

    def fetch_emails(self):
        # 检查是否在工作时间 (早6点到晚11点)
        current_hour = datetime.now().hour
        if current_hour < 6 or current_hour >= 23:
            logging.info(f"🌙 当前时间 {current_hour}:00，进入深夜休眠模式，暂停自动拉取")
            return self.load_local_tasks()

        logging.info("--- 开始执行邮件拉取任务 ---")
        try:
            email_addr = self.config.get('email')
            auth_code = self.config.get('auth_code')
            
            if not email_addr or "your_email" in email_addr:
                logging.warning("⚠️ 尝试拉取失败：未配置有效邮箱")
                return self.load_local_tasks()

            mail = imaplib.IMAP4_SSL(self.imap_server)
            mail.login(email_addr, auth_code)
            mail.select("INBOX")

            # 策略变更：记录上一次抓取的最大 UID，进行增量拉取，避免重复拉取
            local_tasks = self.load_local_tasks()
            sync_state = self.load_sync_state()
            last_uid = sync_state.get('last_uid', 0)

            # 兼容旧版本：如果 sync_state 为空，从 tasks 里找最大的 UID
            if last_uid == 0:
                for task in local_tasks:
                    try:
                        uid = int(task.get('id', 0))
                        if uid > last_uid:
                            last_uid = uid
                    except ValueError:
                        continue

            if last_uid > 0:
                logging.info(f"正在获取新邮件 (增量模式: UID > {last_uid})...")
                status, messages = mail.uid('search', None, f'UID {last_uid + 1}:*')
            else:
                import datetime as dt
                five_days_ago = (dt.datetime.now() - dt.timedelta(days=5)).strftime("%d-%b-%Y")
                logging.info(f"初次运行或无历史记录，正在获取最近 5 天的数据 (SINCE {five_days_ago})...")
                status, messages = mail.uid('search', None, 'SINCE', five_days_ago)
                
            if status == 'OK' and messages[0]:
                all_mail_ids = messages[0].split()
            else:
                all_mail_ids = []
            
            logging.info(f"📡 扫描结果：本次符合条件的待处理邮件共 {len(all_mail_ids)} 封")

            new_count = 0
            max_uid_in_batch = last_uid
            
            for m_id in all_mail_ids:
                m_id_str = m_id.decode()
                
                # 获取邮件头部以便记录日志
                status, header_data = mail.uid('fetch', m_id, '(BODY[HEADER.FIELDS (SUBJECT FROM)])')
                subject = "未知主题"
                if status == 'OK' and header_data[0]:
                    header_msg = email.message_from_bytes(header_data[0][1])
                    subject = self.decode_str(header_msg.get("Subject", "无主题"))
                
                # 检查是否已抓取过
                if any(t['id'] == m_id_str for t in local_tasks):
                    logging.info(f"⏭️ 跳过已处理邮件: UID={m_id_str}, 主题={subject}")
                    continue
                    
                logging.info(f"📥 正在处理新邮件: UID={m_id_str}, 主题={subject}")
                status, data = mail.uid('fetch', m_id, '(RFC822)')
                if status != 'OK' or not data[0]: continue
                
                msg = email.message_from_bytes(data[0][1])
                body = self.parse_email_content(msg)
                
                try:
                    new_task = self.extract_info(subject, body, m_id_str)
                    if new_task:
                        local_tasks.append(new_task)
                        new_count += 1
                        
                    # 只有在解析没有发生 API 异常时，才将该邮件标记为已处理
                    try:
                        uid_int = int(m_id_str)
                        if uid_int > max_uid_in_batch:
                            max_uid_in_batch = uid_int
                    except: pass

                except Exception as e:
                    logging.error(f"⚠️ 解析中断，可能是 API 欠费或网络错误。停止处理剩余邮件，下次将重试。({e})")
                    break
            
            if max_uid_in_batch > last_uid:
                sync_state['last_uid'] = max_uid_in_batch
                self.save_sync_state(sync_state)

            if new_count > 0:
                self.save_local_tasks(local_tasks)
                logging.info(f"✅ 同步完成，新抓取到 {new_count} 条任务")
            else:
                logging.info("ℹ️ 同步完成，没有发现新的招聘相关邮件")

            mail.logout()
            
            # 清理可能存在的 None 值（防御性编程）
            local_tasks = [t for t in local_tasks if t is not None]
            
            # 按紧急程度和时间排序
            return sorted(local_tasks, key=lambda x: (x.get('urgent', False), x.get('created_at', '')), reverse=True)

        except Exception as e:
            logging.error(f"邮件抓取失败: {e}")
            return self.load_local_tasks()

    def update_task_status(self, task_id, status):
        tasks = self.load_local_tasks()
        found = False
        for t in tasks:
            if str(t['id']) == str(task_id):
                t['status'] = status
                if status == 'completed':
                    t['completed_at'] = datetime.now().strftime("%Y-%m-%d %H:%M")
                found = True
                break
        
        if found:
            self.save_local_tasks(tasks)
            return True
        return False

if __name__ == "__main__":
    print("--- 正在开始真实抓取测试 ---")
    backend = Backend()
    data = backend.fetch_emails()
    if not data:
        print("💡 未抓取到任何匹配邮件，请检查关键字或邮箱收件箱。")
    else:
        for item in data:
            print(f"[{item['type']}] {item['company']} - {item['time']}")
