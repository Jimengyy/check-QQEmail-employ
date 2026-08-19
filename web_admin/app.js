document.addEventListener('DOMContentLoaded', () => {
    // Navigation Logic
    const navLinks = document.querySelectorAll('nav a');
    const views = document.querySelectorAll('.view');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const targetId = link.getAttribute('data-target');
            views.forEach(v => v.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'review-view') loadReviews();
            if (targetId === 'dashboard-view') loadDashboard();
        });
    });

    // Initial Load
    loadReviews();
});

async function loadReviews() {
    const tbody = document.getElementById('review-tbody');
    const badge = document.getElementById('review-badge');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">加载中...</td></tr>';

    try {
        const res = await fetch('/api/tasks?status=pending_review');
        const tasks = await res.json();
        
        badge.textContent = tasks.length;

        if (tasks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">目前没有待审核的任务，您可以喝杯咖啡休息一下 ☕️</td></tr>';
            return;
        }

        tbody.innerHTML = tasks.map(task => `
            <tr id="row-${task.id}">
                <td>${task.created_at || '-'}</td>
                <td><strong>${task.company}</strong></td>
                <td><span class="badge" style="background:#8b5cf6">${task.type}</span></td>
                <td>${task.time}</td>
                <td><span style="color:var(--danger)">待审核</span></td>
                <td>
                    <button class="btn btn-success btn-sm" onclick="updateStatus('${task.id}', 'approved')">通过展示</button>
                    <button class="btn btn-danger btn-sm" onclick="updateStatus('${task.id}', 'rejected')">拒绝/误报</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state" style="color:red">加载失败</td></tr>';
    }
}

async function loadDashboard() {
    const tbody = document.getElementById('dashboard-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">加载中...</td></tr>';

    try {
        const res = await fetch('/api/dashboard');
        const data = await res.json();
        
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无任何招聘记录</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => `
            <tr>
                <td><strong>${item.company}</strong></td>
                <td>${item.latest_type}</td>
                <td>${item.latest_time}</td>
                <td><span class="badge" style="background:var(--primary)">${item.task_count} 条记录</span></td>
                <td>
                    ${item.status === 'completed' 
                        ? '<span style="color:var(--success)">已完成当前阶段</span>' 
                        : '<span style="color:var(--text-muted)">跟进中</span>'}
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state" style="color:red">加载失败</td></tr>';
    }
}

async function updateStatus(taskId, status) {
    if (!confirm(status === 'approved' ? '确认将该任务推送到桌面展示吗？' : '确认将该任务标记为误报并丢弃吗？')) {
        return;
    }
    
    try {
        const res = await fetch(`/api/tasks/${taskId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        
        if (res.ok) {
            const row = document.getElementById(`row-${taskId}`);
            if (row) row.remove();
            
            const badge = document.getElementById('review-badge');
            let count = parseInt(badge.textContent);
            badge.textContent = Math.max(0, count - 1);
        } else {
            alert('操作失败');
        }
    } catch (e) {
        alert('网络错误');
    }
}
