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

let supabase = null;
let realtimeChannel = null;

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('admin-setup-modal');
    const navSettings = document.getElementById('admin-settings-nav');
    const btnCloseModal = document.getElementById('admin-btn-close-cfg');
    const btnSaveModal = document.getElementById('admin-btn-save-cfg');
    const cfgUrlInput = document.getElementById('admin-cfg-url');
    const cfgKeyInput = document.getElementById('admin-cfg-key');
    const cfgMsg = document.getElementById('admin-cfg-msg');
    const statusDot = document.getElementById('admin-status-dot');
    const statusText = document.getElementById('admin-status-text');

    function openModal() {
        const cfg = window.APP_CONFIG || {};
        cfgUrlInput.value = cfg.SUPABASE_URL || '';
        cfgKeyInput.value = cfg.SUPABASE_ANON_KEY || '';
        cfgMsg.textContent = '';
        modal.style.display = 'flex';
    }

    function closeModal() {
        modal.style.display = 'none';
    }

    navSettings.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });

    btnCloseModal.addEventListener('click', closeModal);

    btnSaveModal.addEventListener('click', async () => {
        const url = cfgUrlInput.value.trim().replace(/\/+$/, '');
        const key = cfgKeyInput.value.trim();

        if (!url || !key) {
            cfgMsg.textContent = '⚠️ 请完整填写 Supabase URL 和 Key';
            cfgMsg.style.color = '#ef4444';
            return;
        }

        btnSaveModal.textContent = '保存并连接中...';
        btnSaveModal.disabled = true;

        try {
            const resp = await fetch('/api/save_config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url, publishable_key: key })
            });
            const res = await resp.json();

            if (res.success) {
                cfgMsg.textContent = '✅ 保存成功！';
                cfgMsg.style.color = '#10b981';

                window.APP_CONFIG.SUPABASE_URL = url;
                window.APP_CONFIG.SUPABASE_ANON_KEY = key;
                window.APP_CONFIG.IS_CONFIGURED = true;

                initAdmin();
                setTimeout(closeModal, 800);
            } else {
                throw new Error(res.message || '保存失败');
            }
        } catch (err) {
            cfgMsg.textContent = `❌ 保存失败: ${err.message}`;
            cfgMsg.style.color = '#ef4444';
        } finally {
            btnSaveModal.textContent = '保存配置并连接';
            btnSaveModal.disabled = false;
        }
    });

    // Navigation Logic
    const navLinks = document.querySelectorAll('nav a[data-target]');
    const views = document.querySelectorAll('.view');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const targetId = link.getAttribute('data-target');
            views.forEach(v => v.classList.remove('active'));
            const targetView = document.getElementById(targetId);
            if (targetView) targetView.classList.add('active');

            if (targetId === 'review-view') loadReviews();
            if (targetId === 'dashboard-view') loadDashboard();
        });
    });

    function updateStatus(online) {
        if (!statusDot || !statusText) return;
        if (online) {
            statusDot.style.background = '#10B981';
            statusText.textContent = '云端中枢已连接';
        } else {
            statusDot.style.background = '#EF4444';
            statusText.textContent = '云端未连接 (请配置)';
        }
    }

    function initAdmin() {
        const cfg = window.APP_CONFIG || {};
        if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
            updateStatus(false);
            openModal();
            return;
        }

        supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
        updateStatus(true);

        // Realtime Subscription
        if (realtimeChannel) {
            try { realtimeChannel.unsubscribe(); } catch(e) {}
        }

        realtimeChannel = supabase
            .channel('admin_tasks_sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'tasks' },
                (payload) => {
                    console.log('⚡️ 管理台收到实时变动:', payload);
                    const activeView = document.querySelector('.view.active');
                    if (activeView && activeView.id === 'review-view') {
                        loadReviews();
                    } else if (activeView && activeView.id === 'dashboard-view') {
                        loadDashboard();
                    }
                }
            )
            .subscribe();

        loadReviews();
    }

    initAdmin();
});

// --- 审核大厅核心逻辑 ---
async function loadReviews() {
    if (!supabase) return;
    const tbody = document.getElementById('review-tbody');
    const badge = document.getElementById('review-badge');
    
    tbody.innerHTML = '<tr><td colspan="6" class="loading">正在拉取待审核邮件...</td></tr>';

    try {
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .in('status', ['pending', 'pending_review'])
            .eq('is_deleted', false)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const tasks = data || [];
        badge.textContent = tasks.length;

        if (tasks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">🎉 暂无待审核任务，所有新邮件均已处理完毕！</td></tr>';
            return;
        }

        tbody.innerHTML = tasks.map(task => {
            const safeCompany = escapeHTML(task.company || '未知');
            const safeType = escapeHTML(task.type || '招聘');
            const safeSubject = escapeHTML(task.subject || '');
            const safeTime = escapeHTML(task.time || '待定');
            const safeNotes = escapeHTML(task.notes || '');

            let timeStr = '未知';
            if (task.created_at) {
                try {
                    const dt = new Date(task.created_at);
                    timeStr = `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;
                } catch(e) {}
            }

            return `
                <tr id="row-${task.id}">
                    <td><span style="font-size:0.85rem;color:var(--text-muted);">${timeStr}</span></td>
                    <td>
                        <strong style="font-size:1rem;color:var(--text-main);">${safeCompany}</strong>
                        ${safeSubject ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">${safeSubject}</div>` : ''}
                    </td>
                    <td><span class="badge" style="background:#EEF2FF;color:var(--primary);">${safeType}</span></td>
                    <td>
                        <span style="font-weight:600;">${safeTime}</span>
                        ${safeNotes ? `<div style="font-size:0.75rem;color:#D97706;margin-top:2px;">📌 ${safeNotes}</div>` : ''}
                    </td>
                    <td><span class="badge" style="background:#FEF3C7;color:#D97706;">待审核</span></td>
                    <td>
                        <div class="action-btn-group">
                            <button class="btn btn-success" onclick="updateTaskStatus('${task.id}', 'approved')">通过展示</button>
                            <button class="btn btn-outline" onclick="updateTaskStatus('${task.id}', 'completed')">标为完成</button>
                            <button class="btn btn-danger" onclick="updateTaskStatus('${task.id}', 'rejected')">忽略/误报</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('拉取待审核任务异常:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="loading" style="color:var(--danger)">拉取失败: ${err.message}</td></tr>`;
    }
}

async function updateTaskStatus(taskId, newStatus) {
    if (!supabase) return;
    const row = document.getElementById(`row-${taskId}`);
    if (row) {
        row.style.opacity = '0.3';
        row.style.pointerEvents = 'none';
    }

    try {
        const updatePayload = {
            status: newStatus,
            updated_at: new Date().toISOString()
        };

        if (newStatus === 'rejected') {
            updatePayload.is_deleted = true;
        }

        const { error } = await supabase
            .from('tasks')
            .update(updatePayload)
            .eq('id', taskId);

        if (error) throw error;

        console.log(`✅ 任务 ${taskId} 状态已更新为 ${newStatus}`);
        loadReviews();
    } catch (err) {
        console.error('更新状态失败:', err);
        alert(`操作失败: ${err.message}`);
        if (row) {
            row.style.opacity = '1';
            row.style.pointerEvents = 'auto';
        }
    }
}

// --- 招聘进度看板核心逻辑 ---
async function loadDashboard() {
    if (!supabase) return;
    const tbody = document.getElementById('dashboard-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">正在聚合各公司求职进展...</td></tr>';

    try {
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('is_deleted', false)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const tasks = data || [];
        if (tasks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无投递记录</td></tr>';
            return;
        }

        const companyMap = {};
        tasks.forEach(t => {
            const comp = t.company || '其他/未识别公司';
            if (!companyMap[comp]) {
                companyMap[comp] = [];
            }
            companyMap[comp].push(t);
        });

        const rowsHTML = Object.keys(companyMap).map(comp => {
            const compTasks = companyMap[comp];
            const latestTask = compTasks[0];
            const hasPending = compTasks.some(t => t.status === 'pending');
            const hasApproved = compTasks.some(t => t.status === 'approved');

            let statusBadge = '<span class="badge" style="background:#D1FAE5;color:#065F46;">✓ 全部已完成</span>';
            if (hasApproved) {
                statusBadge = '<span class="badge" style="background:#DBEAFE;color:#1E40AF;">⏳ 待处理中</span>';
            } else if (hasPending) {
                statusBadge = '<span class="badge" style="background:#FEF3C7;color:#92400E;">✉️ 有新邮件待审</span>';
            }

            const safeCompany = escapeHTML(comp);
            const safeType = escapeHTML(latestTask.type || '投递进展');
            const safeTime = escapeHTML(latestTask.time || '待定');

            return `
                <tr>
                    <td><strong style="font-size:1rem;">${safeCompany}</strong></td>
                    <td><span class="badge" style="background:#EEF2FF;color:var(--primary);">${safeType}</span></td>
                    <td>${safeTime}</td>
                    <td><span style="font-weight:700;color:var(--primary);">${compTasks.length}</span> 封相关通知</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rowsHTML;

    } catch (err) {
        console.error('拉取看板异常:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="loading" style="color:var(--danger)">加载看板失败: ${err.message}</td></tr>`;
    }
}
