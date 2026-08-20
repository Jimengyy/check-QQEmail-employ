function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

document.addEventListener('DOMContentLoaded', () => {
    const pendingList = document.getElementById('task-list');
    const historyList = document.getElementById('history-list');
    const pendingCount = document.getElementById('pending-count');
    const historyCount = document.getElementById('history-count');
    const pendingHeader = document.getElementById('pending-header');
    const historyHeader = document.getElementById('history-header');
    const refreshBtn = document.getElementById('refresh-btn');
    const lastSyncSpan = document.getElementById('last-sync');
    const statusDot = document.getElementById('status-dot');
    
    // Modal Elements
    const setupModal = document.getElementById('setup-modal');
    const settingsBtn = document.getElementById('settings-btn');
    const cfgUrlInput = document.getElementById('cfg-url');
    const cfgKeyInput = document.getElementById('cfg-key');
    const cfgMsg = document.getElementById('cfg-msg');
    const btnSaveCfg = document.getElementById('btn-save-cfg');
    const btnCloseCfg = document.getElementById('btn-close-cfg');

    let supabase = null;
    let realtimeChannel = null;

    function updateStatusDot(online, reconnecting = false) {
        if (!statusDot) return;
        statusDot.className = '';
        if (reconnecting) {
            statusDot.classList.add('reconnecting');
            statusDot.title = '正在重连云端...';
        } else if (online) {
            statusDot.classList.add('online');
            statusDot.title = '云端连接正常 (Realtime 监听中)';
        } else {
            statusDot.classList.add('offline');
            statusDot.title = '云端连接断开 (离线/未配置)';
        }
    }

    // 折叠展开交互
    function toggleCollapse(header, list) {
        header.addEventListener('click', () => {
            const isCollapsed = list.classList.toggle('collapsed');
            header.classList.toggle('is-collapsed', isCollapsed);
        });
    }
    toggleCollapse(pendingHeader, pendingList);
    toggleCollapse(historyHeader, historyList);

    // 模态弹窗控制
    function showModal(isInitial = false) {
        const cfg = window.APP_CONFIG || {};
        cfgUrlInput.value = cfg.SUPABASE_URL || '';
        cfgKeyInput.value = cfg.SUPABASE_ANON_KEY || '';
        cfgMsg.textContent = '';
        cfgMsg.className = 'cfg-msg';

        if (isInitial || !cfg.SUPABASE_URL) {
            btnCloseCfg.style.display = 'none';
        } else {
            btnCloseCfg.style.display = 'block';
        }
        setupModal.classList.add('active');
    }

    function hideModal() {
        setupModal.classList.remove('active');
    }

    settingsBtn.addEventListener('click', () => showModal(false));
    btnCloseCfg.addEventListener('click', hideModal);

    const quitBtn = document.getElementById('quit-btn');
    if (quitBtn) {
        quitBtn.addEventListener('click', () => {
            if (window.pywebview && window.pywebview.api && window.pywebview.api.close_widget) {
                window.pywebview.api.close_widget();
            } else {
                window.close();
            }
        });
    }

    // 保存配置
    btnSaveCfg.addEventListener('click', async () => {
        const url = cfgUrlInput.value.trim().replace(/\/+$/, '');
        const key = cfgKeyInput.value.trim();

        if (!url || !key) {
            cfgMsg.textContent = '⚠️ 请完整填写 Supabase URL 和 Key';
            cfgMsg.className = 'cfg-msg error';
            return;
        }

        if (!url.startsWith('https://') && !url.startsWith('http://')) {
            cfgMsg.textContent = '⚠️ URL 必须以 https:// 开头';
            cfgMsg.className = 'cfg-msg error';
            return;
        }

        btnSaveCfg.textContent = '正在保存并测试...';
        btnSaveCfg.disabled = true;

        try {
            const resp = await fetch('/api/save_config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url, publishable_key: key })
            });
            const res = await resp.json();

            if (res.success) {
                cfgMsg.textContent = '✅ 保存成功，正在连通云端...';
                cfgMsg.className = 'cfg-msg success';

                window.APP_CONFIG.SUPABASE_URL = url;
                window.APP_CONFIG.SUPABASE_ANON_KEY = key;
                window.APP_CONFIG.IS_CONFIGURED = true;

                initClient();
                setTimeout(hideModal, 800);
            } else {
                throw new Error(res.message || '保存失败');
            }
        } catch (err) {
            cfgMsg.textContent = `❌ 保存失败: ${err.message}`;
            cfgMsg.className = 'cfg-msg error';
        } finally {
            btnSaveCfg.textContent = '⚡️ 保存并立即连接';
            btnSaveCfg.disabled = false;
        }
    });

    // 2. 从 Supabase 拉取任务数据 (桌面端仅展示已审核通过的任务 status = 'approved')
    async function fetchData() {
        if (!supabase) return;
        try {
            const { data: pendingData, error: pendingErr } = await supabase
                .from('tasks')
                .select('*')
                .eq('status', 'approved')
                .eq('is_deleted', false)
                .order('urgent', { ascending: false })
                .order('created_at', { ascending: false });

            if (pendingErr) throw pendingErr;

            const { data: completedData, error: completedErr } = await supabase
                .from('tasks')
                .select('*')
                .eq('status', 'completed')
                .eq('is_deleted', false)
                .order('updated_at', { ascending: false })
                .limit(20);

            if (completedErr) throw completedErr;

            renderTasks(pendingData || [], completedData || []);
            updateStatusDot(true);

            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            lastSyncSpan.textContent = `最后同步: ${timeStr}`;
        } catch (error) {
            console.error('Supabase fetch error:', error);
            updateStatusDot(false);
            if (pendingList.children.length === 0 || pendingList.querySelector('.loading')) {
                pendingList.innerHTML = '<div class="loading" style="color:#ff6b81">云端连接异常，点击 ⚙️ 检查配置</div>';
            }
        }
    }

    // 3. 渲染任务列表
    function renderTasks(pendingTasks, completedTasks) {
        pendingCount.textContent = pendingTasks.length;
        historyCount.textContent = completedTasks.length;

        if (pendingTasks.length === 0) {
            pendingList.innerHTML = '<div class="loading">暂无已审核待办任务<br><span style="font-size:0.75rem;opacity:0.8">可在管理后台审核新邮件 ☕️</span></div>';
        } else {
            pendingList.innerHTML = pendingTasks.map(task => createTaskHTML(task, false)).join('');
        }

        if (completedTasks.length === 0) {
            historyList.innerHTML = '<div class="loading">暂无历史记录</div>';
        } else {
            historyList.innerHTML = completedTasks.map(task => createTaskHTML(task, true)).join('');
        }

        attachTaskEvents();
    }

    function createTaskHTML(task, isHistory = false) {
        let typeClass = '';
        const taskType = task.type || '招聘';
        if (taskType.includes('AI')) typeClass = 'type-ai';
        else if (taskType.includes('线上')) typeClass = 'type-online';
        else if (taskType.includes('线下')) typeClass = 'type-offline';
        else if (taskType.includes('笔试')) typeClass = 'type-test';
        else if (taskType.includes('测评')) typeClass = 'type-assessment';
        else if (taskType.includes('Offer') || taskType.includes('录取')) typeClass = 'type-success';
        else if (taskType.includes('投递') || taskType.includes('网申') || taskType.includes('资料') || taskType.includes('入职')) typeClass = 'type-info';

        const safeCompany = escapeHTML(task.company || '未知公司');
        const safeType = escapeHTML(taskType);
        const safeTime = escapeHTML(task.time || '待定');
        
        let completedTimeText = '';
        if (isHistory && (task.updated_at || task.created_at)) {
            try {
                const dt = new Date(task.updated_at || task.created_at);
                completedTimeText = `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;
            } catch (e) {
                completedTimeText = '已完成';
            }
        }

        return `
            <div class="task-item ${isHistory ? 'is-completed' : ''}" id="task-${task.id}" data-id="${task.id}">
                ${task.urgent && !isHistory ? '<div class="urgent-indicator" title="紧急任务"></div>' : ''}
                <div class="task-header">
                    <span class="company-name" title="${safeCompany}">${safeCompany}</span>
                    <span class="task-type ${typeClass}">${safeType}</span>
                </div>
                <div class="task-time">${safeTime}</div>
                ${isHistory ? 
                    `<div class="completed-tag">✓ 完成 @ ${completedTimeText}</div>` : 
                    `<button class="complete-btn" data-id="${task.id}" title="标记为已完成">✓</button>`
                }
            </div>
        `;
    }

    function attachTaskEvents() {
        document.querySelectorAll('.complete-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const taskId = btn.getAttribute('data-id');
                const taskElement = document.getElementById(`task-${taskId}`);

                if (taskElement) {
                    taskElement.style.opacity = '0.3';
                    taskElement.style.transform = 'scale(0.95)';
                }

                try {
                    const nowIso = new Date().toISOString();
                    const { error } = await supabase
                        .from('tasks')
                        .update({ 
                            status: 'completed', 
                            updated_at: nowIso
                        })
                        .eq('id', taskId);

                    if (error) throw error;
                    fetchData();
                } catch (err) {
                    console.error('更新任务状态失败:', err);
                    if (taskElement) {
                        taskElement.style.opacity = '1';
                        taskElement.style.transform = 'none';
                    }
                    alert('网络异常，状态更新失败');
                }
            };
        });

        document.querySelectorAll('.task-item').forEach(item => {
            item.onclick = () => {
                item.classList.toggle('expanded');
            };
        });
    }

    // 4. Supabase Realtime 实时订阅频道
    function setupRealtime() {
        if (!supabase) return;
        if (realtimeChannel) {
            try { realtimeChannel.unsubscribe(); } catch (e) {}
        }

        realtimeChannel = supabase
            .channel('public:tasks')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'tasks' },
                (payload) => {
                    console.log('⚡️ 收到 Supabase Realtime 广播:', payload);
                    fetchData();
                }
            )
            .subscribe((status) => {
                console.log('⚡️ Supabase Realtime 订阅状态:', status);
                if (status === 'SUBSCRIBED') {
                    updateStatusDot(true);
                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    updateStatusDot(false, true);
                }
            });
    }

    // 手动刷新按钮
    refreshBtn.addEventListener('click', () => {
        refreshBtn.style.transform = 'rotate(360deg)';
        fetchData().finally(() => {
            setTimeout(() => { refreshBtn.style.transform = 'none'; }, 300);
        });
    });

    // 5. 初始化主流程
    function initClient() {
        const cfg = window.APP_CONFIG || {};
        if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
            pendingList.innerHTML = '<div class="loading" style="color:#38bdf8">👋 首次使用，请点击 ⚙️ 设置配置云数据库</div>';
            updateStatusDot(false);
            showModal(true);
            return;
        }

        supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
        fetchData();
        setupRealtime();
    }

    initClient();
    setInterval(fetchData, 60000);
});
