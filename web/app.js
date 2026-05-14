document.addEventListener('DOMContentLoaded', () => {
    const taskList = document.getElementById('task-list');
    const refreshBtn = document.getElementById('refresh-btn');
    const lastSyncSpan = document.getElementById('last-sync');

    const pendingList = document.getElementById('task-list');
    const historyList = document.getElementById('history-list');
    const pendingCount = document.getElementById('pending-count');
    const historyCount = document.getElementById('history-count');
    const pendingHeader = document.getElementById('pending-header');
    const historyHeader = document.getElementById('history-header');

    async function fetchData() {
        try {
            if (window.pywebview && window.pywebview.api) {
                const data = await window.pywebview.api.fetch_data();
                renderTasks(data);
            }
        } catch (error) {
            console.error('Fetch error:', error);
            pendingList.innerHTML = '<div class="loading">同步失败，请检查网络或配置</div>';
        }
        
        const now = new Date();
        lastSyncSpan.textContent = `最后同步: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }

    function toggleCollapse(header, list) {
        header.addEventListener('click', () => {
            const isCollapsed = list.classList.toggle('collapsed');
            header.classList.toggle('is-collapsed', isCollapsed);
        });
    }

    toggleCollapse(pendingHeader, pendingList);
    toggleCollapse(historyHeader, historyList);

    function renderTasks(allTasks) {
        const pendingTasks = allTasks.filter(t => !t.completed);
        const completedTasks = allTasks.filter(t => t.completed)
            .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

        pendingCount.textContent = pendingTasks.length;
        historyCount.textContent = completedTasks.length;

        // Render Pending
        if (pendingTasks.length === 0) {
            pendingList.innerHTML = '<div class="loading">暂无待处理任务</div>';
        } else {
            pendingList.innerHTML = pendingTasks.map(task => createTaskHTML(task)).join('');
        }

        // Render History
        if (completedTasks.length === 0) {
            historyList.innerHTML = '<div class="loading">暂无历史记录</div>';
        } else {
            historyList.innerHTML = completedTasks.map(task => createTaskHTML(task, true)).join('');
        }

        // Attach events
        attachTaskEvents();
    }

    function createTaskHTML(task, isHistory = false) {
        let typeClass = '';
        if (task.type.includes('AI')) typeClass = 'type-ai';
        else if (task.type.includes('线上')) typeClass = 'type-online';
        else if (task.type.includes('线下')) typeClass = 'type-offline';
        else if (task.type.includes('笔试')) typeClass = 'type-test';
        else if (task.type.includes('测评')) typeClass = 'type-assessment';
        else if (task.type.includes('Offer') || task.type.includes('录取')) typeClass = 'type-success';
        else if (task.type.includes('投递') || task.type.includes('资料') || task.type.includes('入职')) typeClass = 'type-info';

        return `
            <div class="task-item ${isHistory ? 'is-completed' : ''}" id="task-${task.id}">
                ${task.urgent && !isHistory ? '<div class="urgent-indicator"></div>' : ''}
                <div class="task-header">
                    <span class="company-name">${task.company}</span>
                    <span class="task-type ${typeClass}">${task.type}</span>
                </div>
                <div class="task-time">${task.time}</div>
                ${isHistory ? 
                    `<div class="completed-tag">已完成 @ ${task.completed_at.split(' ')[1]}</div>` : 
                    `<button class="complete-btn" data-id="${task.id}" title="标记为完成">✓</button>`
                }
            </div>
        `;
    }

    function attachTaskEvents() {
        document.querySelectorAll('.complete-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const taskId = btn.getAttribute('data-id');
                const success = await window.pywebview.api.complete_task(taskId);
                if (success) {
                    const item = document.getElementById(`task-${taskId}`);
                    item.style.opacity = '0';
                    item.style.transform = 'scale(0.9)';
                    setTimeout(() => fetchData(), 300);
                }
            };
        });

        // 点击任务展示详情/放大效果
        document.querySelectorAll('.task-item').forEach(item => {
            item.onclick = () => {
                item.classList.toggle('expanded');
            };
        });
    }

    refreshBtn.addEventListener('click', fetchData);

    async function init() {
        console.log("初始化程序...");
        let intervalTime = 1200 * 1000; 

        try {
            if (window.pywebview && window.pywebview.api) {
                const config = await window.pywebview.api.get_config();
                if (config && config.check_interval) {
                    intervalTime = config.check_interval * 1000;
                }
            }
        } catch (e) {}

        fetchData();
        setInterval(fetchData, intervalTime);
    }

    setTimeout(init, 1500);
});
