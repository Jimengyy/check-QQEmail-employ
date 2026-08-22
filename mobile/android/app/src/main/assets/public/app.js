/**
 * OfferPilot Mobile V3.3.0 - 移动端核心状态机与业务控制器 (Apple 极简白瓷版)
 * 极致轻量、低视觉噪音、原生微触感与秒级 WebSocket 推流
 */

// ==========================================================================
// 1. 全局状态与数据缓存
// ==========================================================================
let supabase = null;
let realtimeChannelApps = null;
let realtimeChannelStages = null;

let allApplications = [];
let allStages = [];
let appStagesMap = {}; // applicationId -> [stages]

let currentActiveTab = 'tabAgenda';
let currentTriageSubtab = 'pending';
let currentPipelineFilter = 'all';
let currentSearchQuery = '';
let currentTimelineAppId = null;

const AVATAR_PALETTE = [
    '#4F46E5', '#2563EB', '#0D9488', '#059669', 
    '#D97706', '#DC2626', '#7C3AED', '#DB2777', 
    '#0284C7', '#475569'
];

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// 智能清洗企业名称与岗位（1:1 像素级对齐图1高质感微型小组件）
function cleanCompanyName(name) {
    if (!name) return '未知企业';
    let clean = name
        .replace(/^转发[:：]\s*/i, '')
        .replace(/^【[^】]*】\s*/i, '')
        .replace(/\|.*$/g, '')
        .replace(/诚邀您.*$/g, '')
        .replace(/20\d\d届.*$/g, '')
        .replace(/校园招聘.*$/g, '')
        .replace(/校招.*$/g, '')
        .replace(/有限公司/g, '')
        .replace(/股份有限公司/g, '')
        .replace(/（.*?）/g, '')
        .replace(/\(.*?\)/g, '')
        .trim();

    if (clean.includes('招商银行·招银网络科技') || clean.includes('招银网络科技')) return '招银网络科技';
    if (clean.includes('中信期货')) return '中信期货';
    if (clean.includes('宁波银行')) return '宁波银行';
    if (clean.includes('网易游戏')) return '网易游戏';
    if (clean.includes('南京841')) return '南京841所';

    return clean || name;
}

function cleanPosition(pos, company) {
    if (!pos) return '校招岗位';
    let clean = pos
        .replace(/^转发[:：]\s*/i, '')
        .replace(/【.*?】/g, '')
        .replace(/\|.*$/g, '')
        .replace(/诚邀您.*$/g, '')
        .replace(/20\d\d届/g, '')
        .replace(/校园招聘/g, '')
        .trim();

    if (clean.includes('计算机、信息安全') || clean.includes('相关专业方向岗位')) return '研发工程师';
    if (clean.includes('总行金融科技定向生')) return '金融科技定向生';
    if (clean.includes('未来星')) return '未来星管培生';
    if (clean.includes('校招岗位') || clean.includes('招聘') || clean.length > 16) return '软件开发工程师';

    return clean || '校招岗位';
}

function triggerHaptic(type = 'light') {
    try {
        if (window.AndroidNative && window.AndroidNative.haptic) {
            window.AndroidNative.haptic(type);
            return;
        }
        if (navigator.vibrate) {
            if (type === 'success') navigator.vibrate([20, 60, 20]);
            else if (type === 'warning') navigator.vibrate([40, 40]);
            else navigator.vibrate(15);
        }
    } catch (e) {}
}

function showToast(msg, icon = '✨') {
    const toast = document.getElementById('globalToast');
    const toastMsg = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');
    if (!toast || !toastMsg) return;

    toastMsg.innerText = msg;
    toastIcon.innerText = icon;
    toast.classList.add('show');
    triggerHaptic('light');

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('show');
    }, 2200);
}

function getCompanyColor(companyName) {
    if (!companyName) return AVATAR_PALETTE[0];
    let hash = 0;
    for (let i = 0; i < companyName.length; i++) {
        hash = companyName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_PALETTE.length;
    return AVATAR_PALETTE[index];
}

function getCompanyInitial(companyName) {
    if (!companyName) return '企';
    const clean = cleanCompanyName(companyName).replace(/[\(\)（）\s·\-]/g, '');
    return clean.charAt(0) || '企';
}

// ==========================================================================
// 2. 初始化与配置加载
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    loadLocalSettings();
    setupEventListeners();
    setupTabNavigation();

    const savedUrl = localStorage.getItem('OFFERPILOT_SUPABASE_URL');
    const savedKey = localStorage.getItem('OFFERPILOT_SUPABASE_KEY');

    if (savedUrl && savedKey) {
        try {
            supabase = window.supabase.createClient(savedUrl, savedKey);
            setupRealtimeListeners();
            await loadAllData();
        } catch (err) {
            console.error('初始化 Supabase 失败:', err);
            showToast('云数据库连接失败，请检查设置', '⚠️');
        }
    } else {
        switchTab('tabSettings');
        showToast('请先配置 Supabase URL 与 Key', '⚙️');
    }
}

function loadLocalSettings() {
    let url = localStorage.getItem('OFFERPILOT_SUPABASE_URL') || '';
    let key = localStorage.getItem('OFFERPILOT_SUPABASE_KEY') || '';

    // 尝试从本地 Web 服务注入的配置自动预填
    if (!url && window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) {
        url = window.APP_CONFIG.SUPABASE_URL;
        localStorage.setItem('OFFERPILOT_SUPABASE_URL', url);
    }
    if (!key && window.APP_CONFIG && window.APP_CONFIG.SUPABASE_ANON_KEY) {
        key = window.APP_CONFIG.SUPABASE_ANON_KEY;
        localStorage.setItem('OFFERPILOT_SUPABASE_KEY', key);
    }

    const season = localStorage.getItem('OFFERPILOT_SEASON') || '2027届秋招';
    const isDark = localStorage.getItem('OFFERPILOT_DARK_MODE') === 'true';

    document.getElementById('cfgSupabaseUrl').value = url;
    document.getElementById('cfgSupabaseKey').value = key;
    document.getElementById('selectSeason').value = season;
    document.getElementById('currentSeasonBadge').innerText = season;

    const darkModeCheckbox = document.getElementById('toggleDarkMode');
    if (darkModeCheckbox) {
        darkModeCheckbox.checked = isDark;
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }
}

function setupEventListeners() {
    document.getElementById('btnAddApplication').addEventListener('click', () => {
        triggerHaptic('light');
        openAddModal();
    });

    // 搜索输入
    const searchInput = document.getElementById('pipelineSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchQuery = e.target.value.trim().toLowerCase();
            renderPipeline();
        });
    }

    // 状态过滤胶囊点击
    document.querySelectorAll('.pipeline-filter-chips .chip-item[data-filter]').forEach(chip => {
        chip.addEventListener('click', () => {
            triggerHaptic('light');
            document.querySelectorAll('.pipeline-filter-chips .chip-item[data-filter]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentPipelineFilter = chip.getAttribute('data-filter');
            renderPipeline();
        });
    });

    // 设置项
    document.getElementById('btnSaveConfig').addEventListener('click', async () => {
        triggerHaptic('success');
        const url = document.getElementById('cfgSupabaseUrl').value.trim();
        const key = document.getElementById('cfgSupabaseKey').value.trim();
        if (!url || !key) {
            showToast('请完整输入 URL 和 Key', '⚠️');
            return;
        }
        localStorage.setItem('OFFERPILOT_SUPABASE_URL', url);
        localStorage.setItem('OFFERPILOT_SUPABASE_KEY', key);

        supabase = window.supabase.createClient(url, key);
        setupRealtimeListeners();
        await loadAllData();
        showToast('配置已保存并连接成功！', '🎉');
        switchTab('tabAgenda');
    });

    document.getElementById('btnTestConfig').addEventListener('click', async () => {
        triggerHaptic('light');
        const url = document.getElementById('cfgSupabaseUrl').value.trim();
        const key = document.getElementById('cfgSupabaseKey').value.trim();
        if (!url || !key) {
            showToast('请先输入配置信息', '⚠️');
            return;
        }
        try {
            const client = window.supabase.createClient(url, key);
            const { data, error } = await client.from('applications').select('id').limit(1);
            if (error) throw error;
            showToast('连接测试成功！', '✅');
        } catch (e) {
            showToast('连接失败: ' + (e.message || '网络异常'), '❌');
        }
    });

    document.getElementById('selectSeason').addEventListener('change', (e) => {
        const season = e.target.value;
        localStorage.setItem('OFFERPILOT_SEASON', season);
        document.getElementById('currentSeasonBadge').innerText = season;
        showToast('已切换至 ' + season, '🎯');
        renderAllViews();
    });

    document.getElementById('toggleDarkMode').addEventListener('change', (e) => {
        const isDark = e.target.checked;
        localStorage.setItem('OFFERPILOT_DARK_MODE', isDark ? 'true' : 'false');
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        triggerHaptic('light');
    });

    // 一键放行全部
    document.getElementById('btnBatchApprove').addEventListener('click', () => {
        batchApproveAllStages();
    });

    // 抽屉与弹窗关闭按钮
    document.getElementById('btnCloseTimelineDrawer').addEventListener('click', closeTimelineDrawer);
    document.getElementById('btnCloseEmailDetailDrawer').addEventListener('click', closeEmailDetailDrawer);
    document.getElementById('btnCloseEditStageModal').addEventListener('click', closeEditStageModal);
    document.getElementById('btnCloseAddModal').addEventListener('click', closeAddModal);

    // 遮罩点击关闭
    document.getElementById('timelineSheetOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'timelineSheetOverlay') closeTimelineDrawer();
    });
    document.getElementById('emailDetailSheetOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'emailDetailSheetOverlay') closeEmailDetailDrawer();
    });
    document.getElementById('editStageSheetOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'editStageSheetOverlay') closeEditStageModal();
    });
    document.getElementById('addModalSheetOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'addModalSheetOverlay') closeAddModal();
    });

    // 表单提交
    document.getElementById('btnSubmitAddModal').addEventListener('click', submitAddModal);
    document.getElementById('btnSubmitEditStage').addEventListener('click', submitEditStage);
    document.getElementById('btnDeleteStage').addEventListener('click', deleteCurrentEditingStage);

    // 抽屉内部动作
    document.getElementById('btnDrawerAddStage').addEventListener('click', () => {
        if (!currentTimelineAppId) return;
        const app = allApplications.find(a => a.id === currentTimelineAppId);
        if (!app) return;
        closeTimelineDrawer();
        openAddModal(app);
    });

    document.getElementById('btnDrawerToggleArchive').addEventListener('click', async () => {
        if (!currentTimelineAppId) return;
        const app = allApplications.find(a => a.id === currentTimelineAppId);
        if (!app) return;
        const targetStatus = app.overall_status === 'archived' ? 'active' : 'archived';
        await toggleAppArchive(app.id, targetStatus);
    });
}

function setupTabNavigation() {
    const dockItems = document.querySelectorAll('.bottom-dock .dock-item');
    dockItems.forEach(item => {
        item.addEventListener('click', () => {
            triggerHaptic('light');
            const targetTab = item.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabId) {
    currentActiveTab = tabId;

    document.querySelectorAll('.bottom-dock .dock-item').forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    document.querySelectorAll('.view-container .tab-view').forEach(view => {
        if (view.id === tabId) {
            view.classList.add('active');
        } else {
            view.classList.remove('active');
        }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================================================
// 3. 数据层与 Realtime 实时推流监听
// ==========================================================================
function setupRealtimeListeners() {
    if (!supabase) return;

    if (realtimeChannelApps) realtimeChannelApps.unsubscribe();
    if (realtimeChannelStages) realtimeChannelStages.unsubscribe();

    realtimeChannelApps = supabase.channel('realtime_mobile_apps')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => {
            loadAllData(false);
        })
        .subscribe((status) => {
            updateOnlineDot(status === 'SUBSCRIBED');
        });

    realtimeChannelStages = supabase.channel('realtime_mobile_stages')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'application_stages' }, () => {
            loadAllData(false);
        })
        .subscribe((status) => {
            updateOnlineDot(status === 'SUBSCRIBED');
        });
}

function updateOnlineDot(online) {
    const dot = document.getElementById('realtimeDot');
    if (dot) {
        if (online) dot.classList.add('online');
        else dot.classList.remove('online');
    }
}

async function loadAllData(showNotification = true) {
    if (!supabase) return;

    try {
        const [resApps, resStages] = await Promise.all([
            supabase.from('applications').select('*').order('created_at', { ascending: false }),
            supabase.from('application_stages').select('*').order('seq', { ascending: true })
        ]);

        if (resApps.error) throw resApps.error;
        if (resStages.error) throw resStages.error;

        allApplications = resApps.data || [];
        allStages = resStages.data || [];

        appStagesMap = {};
        allStages.forEach(st => {
            if (!appStagesMap[st.application_id]) {
                appStagesMap[st.application_id] = [];
            }
            appStagesMap[st.application_id].push(st);
        });

        Object.keys(appStagesMap).forEach(appId => {
            appStagesMap[appId].sort((a, b) => (a.seq || 0) - (b.seq || 0));
        });

        renderAllViews();
        updateOnlineDot(true);
    } catch (err) {
        console.error('加载数据失败:', err);
        updateOnlineDot(false);
    }
}

function renderAllViews() {
    renderAgenda();
    renderTriage();
    renderPipeline();
    updateBadges();
}

function updateBadges() {
    const pendingStages = allStages.filter(st => st.stage_status === 'pending');
    const dockBadge = document.getElementById('dockTriageBadge');

    if (dockBadge) {
        if (pendingStages.length > 0) {
            dockBadge.innerText = pendingStages.length;
            dockBadge.style.display = 'flex';
        } else {
            dockBadge.style.display = 'none';
        }
    }
}

// ==========================================================================
// 4. Tab 1: 📱 今日待办 (Agenda View)
// ==========================================================================
function parseDateTime(timeStr) {
    if (!timeStr || timeStr === '待定' || timeStr.includes('待定')) return null;
    const clean = timeStr.replace(/（[^）]*）|\([^)]*\)/g, '').trim();
    const matched = clean.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
    if (!matched) return null;

    const year = parseInt(matched[1]);
    const month = parseInt(matched[2]) - 1;
    const day = parseInt(matched[3]);
    const hour = matched[4] ? parseInt(matched[4]) : 9;
    const min = matched[5] ? parseInt(matched[5]) : 0;

    return new Date(year, month, day, hour, min);
}

function formatCountdown(targetDate) {
    const now = new Date();
    const diffMs = targetDate - now;
    if (diffMs < 0) {
        const passMin = Math.abs(Math.floor(diffMs / 60000));
        if (passMin < 120) return `已开始 (${passMin} 分钟前)`;
        return `已于 ${targetDate.toLocaleDateString()} 结束`;
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainHours = diffHours % 24;
    const diffMin = Math.floor((diffMs % (1000 * 60 * 60)) / 60000);

    if (diffDays > 0) {
        return `距离还有 ${diffDays} 天 ${remainHours} 小时`;
    } else if (diffHours > 0) {
        return `距离还有 ${diffHours} 小时 ${diffMin} 分钟`;
    } else {
        return `⚠️ 距离还有 ${diffMin} 分钟，请准备入会！`;
    }
}

function renderAgenda() {
    const heroCard = document.getElementById('heroAgendaCard');
    const emptyBox = document.getElementById('agendaEmptyBox');
    const upcomingList = document.getElementById('upcomingAgendaList');
    const upcomingSection = document.getElementById('upcomingSection');

    const scheduledStages = allStages.filter(st => {
        if (st.stage_status !== 'scheduled') return false;
        const app = allApplications.find(a => a.id === st.application_id);
        if (!app || app.overall_status === 'archived' || app.overall_status === 'failed') return false;
        return true;
    });

    scheduledStages.sort((a, b) => {
        const da = parseDateTime(a.schedule_time);
        const db = parseDateTime(b.schedule_time);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
    });

    if (scheduledStages.length === 0) {
        if (heroCard) heroCard.style.display = 'none';
        if (upcomingSection) upcomingSection.style.display = 'none';
        if (emptyBox) emptyBox.style.display = 'block';
        return;
    }

    if (emptyBox) emptyBox.style.display = 'none';
    if (upcomingSection) upcomingSection.style.display = 'block';

    // 1. 渲染置顶 Hero Ticket 卡片
    const nearestStage = scheduledStages[0];
    const nearestApp = allApplications.find(a => a.id === nearestStage.application_id) || {};
    const parsedDate = parseDateTime(nearestStage.schedule_time);

    if (heroCard) {
        heroCard.style.display = 'block';
        const compName = cleanCompanyName(nearestApp.company);
        const posName = cleanPosition(nearestApp.position);

        document.getElementById('heroCompany').innerText = compName;
        document.getElementById('heroPosition').innerText = posName;
        document.getElementById('heroStageTag').innerText = nearestStage.stage_name || '待办环节';
        document.getElementById('heroTime').innerText = nearestStage.schedule_time || '待定';
        document.getElementById('heroMeetingInfo').innerText = nearestStage.meeting_info || '无会议号/线下';
        document.getElementById('heroNextExp').innerText = nearestStage.next_expectation || '按时准备，保持网络畅通';

        const avatar = document.getElementById('heroAvatar');
        if (avatar) {
            avatar.innerText = getCompanyInitial(compName);
            avatar.style.background = getCompanyColor(compName);
        }

        const countdownElem = document.getElementById('heroCountdownText');
        const countdownPill = document.getElementById('heroCountdownPill');
        if (countdownElem) {
            if (parsedDate) {
                const isPast = parsedDate < new Date();
                countdownElem.innerText = formatCountdown(parsedDate);
                if (countdownPill) countdownPill.classList.toggle('past', isPast);
            } else {
                countdownElem.innerText = '时间待定';
                if (countdownPill) countdownPill.classList.add('past');
            }
        }

        document.getElementById('btnHeroCopyMeeting').onclick = (e) => {
            e.stopPropagation();
            copyTextToClipboard(nearestStage.meeting_info || nearestStage.schedule_time);
        };
        document.getElementById('btnHeroOpenMeeting').onclick = (e) => {
            e.stopPropagation();
            openMeetingLink(nearestStage.meeting_info);
        };
        document.getElementById('btnHeroMarkAttended').onclick = (e) => {
            e.stopPropagation();
            advanceStageStatus(nearestStage.id, 'awaiting_result', nearestApp.id);
        };

        heroCard.onclick = () => {
            openTimelineDrawer(nearestApp.id);
        };
    }

    // 2. 渲染后续列表
    if (upcomingList) {
        const remainingStages = scheduledStages.slice(1);
        if (remainingStages.length === 0) {
            upcomingList.innerHTML = '<div style="color: var(--text-tertiary); font-size: 12px; text-align: center; padding: 14px;">后续暂无其他待办日程</div>';
        } else {
            upcomingList.innerHTML = remainingStages.map(st => {
                const app = allApplications.find(a => a.id === st.application_id) || {};
                const compName = cleanCompanyName(app.company);
                const posName = cleanPosition(app.position);
                const pDate = parseDateTime(st.schedule_time);
                const countText = pDate ? formatCountdown(pDate) : (st.schedule_time || '时间待定');

                return `
                    <div class="porcelain-card" style="padding: 12px 14px; margin-bottom: 8px;" onclick="openTimelineDrawer('${app.id}')">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="company-squircle" style="width: 34px; height: 34px; font-size: 14px; background: ${getCompanyColor(compName)}">
                                    ${getCompanyInitial(compName)}
                                </div>
                                <div>
                                    <strong style="font-size: 14px; color: var(--text-primary);">${escapeHTML(compName)}</strong>
                                    <div style="font-size: 12px; color: var(--text-secondary); max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(posName)}</div>
                                </div>
                            </div>
                            <span class="triage-stage-badge">${escapeHTML(st.stage_name)}</span>
                        </div>
                        <div style="margin-top: 6px; font-size: 11px; color: var(--text-tertiary); display: flex; justify-content: space-between;">
                            <span>📅 ${escapeHTML(st.schedule_time || '待定')}</span>
                            <span style="color: var(--emerald-text); font-weight: 600;">${countText}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

// 复制剪贴板
function copyTextToClipboard(text) {
    if (!text) {
        showToast('暂无有效凭据信息', '⚠️');
        return;
    }
    const numberMatch = text.match(/\d{3}[-\s]?\d{3}[-\s]?\d{3,4}/);
    const toCopy = numberMatch ? numberMatch[0].replace(/[-\s]/g, '') : text;

    if (window.AndroidNative && window.AndroidNative.copyText) {
        window.AndroidNative.copyText(toCopy);
        triggerHaptic('success');
        showToast(`已复制: ${toCopy}`, '📋');
        return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(toCopy).then(() => {
            triggerHaptic('success');
            showToast(`已复制: ${toCopy}`, '📋');
        }).catch(() => {
            fallbackCopy(toCopy);
        });
    } else {
        fallbackCopy(toCopy);
    }
}

function fallbackCopy(text) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    triggerHaptic('success');
    showToast(`已复制: ${text}`, '📋');
}

// 调起腾讯会议或浏览器
function openMeetingLink(meetingInfo) {
    if (!meetingInfo) {
        showToast('未提供入会链接', '⚠️');
        return;
    }
    const urlMatch = meetingInfo.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
        window.open(urlMatch[1], '_blank');
        return;
    }
    const codeMatch = meetingInfo.match(/\d{3}[-\s]?\d{3}[-\s]?\d{3,4}/);
    if (codeMatch) {
        const code = codeMatch[0].replace(/[-\s]/g, '');
        window.location.href = `wemeet://page/inmeeting?meeting_code=${code}`;
        setTimeout(() => {
            copyTextToClipboard(code);
        }, 600);
        return;
    }
    showToast('未能识别有效会议号，已复制内容', '📋');
    copyTextToClipboard(meetingInfo);
}

// ==========================================================================
// 5. Tab 2: 📥 待审大厅 (Triage View)
// ==========================================================================
function switchTriageSubtab(subtab) {
    currentTriageSubtab = subtab;
    triggerHaptic('light');

    document.getElementById('subtabPending').classList.toggle('active', subtab === 'pending');
    document.getElementById('subtabIgnored').classList.toggle('active', subtab === 'ignored');

    renderTriage();
}

function renderTriage() {
    const container = document.getElementById('triageCardsStream');
    const emptyBox = document.getElementById('triageEmptyBox');
    const countPending = document.getElementById('countPending');
    const countIgnored = document.getElementById('countIgnored');

    const pendingStages = allStages.filter(st => st.stage_status === 'pending');
    const ignoredStages = allStages.filter(st => st.stage_status === 'ignored');

    if (countPending) countPending.innerText = pendingStages.length;
    if (countIgnored) countIgnored.innerText = ignoredStages.length;

    const displayStages = currentTriageSubtab === 'pending' ? pendingStages : ignoredStages;

    if (displayStages.length === 0) {
        if (container) container.innerHTML = '';
        if (emptyBox) emptyBox.style.display = 'block';
        return;
    }

    if (emptyBox) emptyBox.style.display = 'none';

    if (container) {
        container.innerHTML = displayStages.map(st => {
            const app = allApplications.find(a => a.id === st.application_id) || {};
            const isPending = st.stage_status === 'pending';
            const compName = cleanCompanyName(app.company);
            const posName = cleanPosition(app.position);

            return `
                <div class="porcelain-card triage-card" id="triageCard_${st.id}">
                    <div class="triage-card-header">
                        <span class="triage-stage-badge">${escapeHTML(st.stage_name)}</span>
                        <span style="font-size: 11px; color: var(--text-tertiary);">${escapeHTML(st.schedule_time || '时间待定')}</span>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;" onclick="openEmailDetailDrawer('${st.id}')">
                        <div style="display: flex; align-items: center; gap: 10px; flex: 1; overflow: hidden;">
                            <div class="company-squircle" style="width: 36px; height: 36px; font-size: 15px; background: ${getCompanyColor(compName)}">
                                ${getCompanyInitial(compName)}
                            </div>
                            <div style="flex: 1; overflow: hidden;">
                                <h4 style="font-size: 15px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(compName)}</h4>
                                <p style="font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(posName)}</p>
                            </div>
                        </div>
                        <span style="font-size: 12px; color: var(--emerald-text); font-weight: 600; flex-shrink: 0;">详情 ›</span>
                    </div>

                    <div class="triage-card-actions">
                        ${isPending ? `
                            <button class="btn-triage-pass" onclick="approveReviewCard('${st.id}')">
                                <span>✓</span> 准入放行
                            </button>
                            <button class="btn-triage-skip" onclick="ignoreReviewCard('${st.id}')">
                                <span>✕</span> 忽略
                            </button>
                        ` : `
                            <button class="btn-triage-pass" style="grid-column: span 2;" onclick="restoreIgnoredStage('${st.id}')">
                                <span>🔄</span> 恢复放行
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }
}

async function approveReviewCard(stageId) {
    triggerHaptic('success');
    const stage = allStages.find(s => s.id === stageId);
    if (!stage || !supabase) return;

    try {
        const nextStatus = (stage.stage_name.includes('感谢信') || stage.stage_name.includes('未通过')) ? 'failed' : 'scheduled';
        
        await supabase.from('application_stages')
            .eq('id', stageId)
            .update({ stage_status: nextStatus, updated_at: new Date().toISOString() });

        await supabase.from('applications')
            .eq('id', stage.application_id)
            .update({ current_stage_name: stage.stage_name, updated_at: new Date().toISOString() });

        showToast('已准入放行', '🎉');
        await loadAllData(false);
    } catch (e) {
        showToast('放行失败: ' + e.message, '❌');
    }
}

async function ignoreReviewCard(stageId) {
    triggerHaptic('warning');
    try {
        await supabase.from('application_stages')
            .eq('id', stageId)
            .update({ stage_status: 'ignored', updated_at: new Date().toISOString() });

        showToast('已忽略该条目', '📦');
        await loadAllData(false);
    } catch (e) {
        showToast('操作失败: ' + e.message, '❌');
    }
}

async function restoreIgnoredStage(stageId) {
    triggerHaptic('success');
    try {
        await supabase.from('application_stages')
            .eq('id', stageId)
            .update({ stage_status: 'scheduled', updated_at: new Date().toISOString() });

        showToast('已恢复并放行！', '✨');
        await loadAllData(false);
    } catch (e) {
        showToast('恢复失败: ' + e.message, '❌');
    }
}

async function batchApproveAllStages() {
    const pendingStages = allStages.filter(st => st.stage_status === 'pending');
    if (pendingStages.length === 0) {
        showToast('暂无待放行的邮件条目', '☕️');
        return;
    }

    triggerHaptic('success');
    try {
        const stageIds = pendingStages.map(s => s.id);
        await supabase.from('application_stages')
            .in('id', stageIds)
            .update({ stage_status: 'scheduled', updated_at: new Date().toISOString() });

        showToast(`已放行全部 ${pendingStages.length} 个环节！`, '🎉');
        await loadAllData(false);
    } catch (e) {
        showToast('批量放行失败: ' + e.message, '❌');
    }
}

function openEmailDetailDrawer(stageId) {
    const stage = allStages.find(s => s.id === stageId);
    if (!stage) return;
    const app = allApplications.find(a => a.id === stage.application_id) || {};

    triggerHaptic('light');
    document.getElementById('emailDetailSubject').innerText = stage.raw_subject || '（未记录邮件主题）';
    
    document.getElementById('emailDetailParsedMeta').innerHTML = `
        <div><strong>企业名称:</strong> ${escapeHTML(app.company || '待定')}</div>
        <div><strong>岗位名称:</strong> ${escapeHTML(app.position || '待定')}</div>
        <div><strong>环节名称:</strong> ${escapeHTML(stage.stage_name)}</div>
        <div><strong>安排时间:</strong> ${escapeHTML(stage.schedule_time || '待定')}</div>
        <div><strong>会议凭据:</strong> ${escapeHTML(stage.meeting_info || '无')}</div>
    `;

    document.getElementById('emailDetailRawText').innerText = stage.notes || '（AI 抓取时未携带扩展邮件文本片段）';
    document.getElementById('emailDetailSheetOverlay').classList.add('open');
}

function closeEmailDetailDrawer() {
    document.getElementById('emailDetailSheetOverlay').classList.remove('open');
}

// ==========================================================================
// 6. Tab 3: 📊 投递看板 (Pipeline View) - 图 1 风格 Apple 瓷感微型小组件矩阵
// ==========================================================================
function getAppSemanticCategory(app) {
    const stages = appStagesMap[app.id] || [];
    const latestStage = stages[stages.length - 1];
    const stageName = app.current_stage_name || (latestStage ? latestStage.stage_name : '');
    const status = app.overall_status || 'active';

    if (status === 'archived') return 'archived';
    if (status === 'offered' || /Offer|录用|意向|签约/i.test(stageName)) return 'offered';
    if (status === 'failed' || /感谢信|未通过|终止|淘汰|结束/i.test(stageName)) return 'failed';
    
    if (/面|初面|二面|三面|终面|总监|主管|HR|综合|交叉/i.test(stageName)) return 'interview';
    if (/笔试|机考|专业笔试|代码考核|机试/i.test(stageName)) return 'exam';
    if (/测评|测试|性格|心理|认知|在线测评/i.test(stageName)) return 'assessment';
    return 'applied';
}

function renderPipeline() {
    const container = document.getElementById('pipelineCardsList');
    const emptyBox = document.getElementById('pipelineEmptyBox');

    const selectedSeason = localStorage.getItem('OFFERPILOT_SEASON') || '2027届秋招';
    
    // 仅筛选出已审核放行（拥有非 pending/ignored 环节）或主动归档的投递单
    const approvedApplications = allApplications.filter(app => {
        if ((app.recruitment_season || '2027届秋招') !== selectedSeason) return false;
        const stages = (appStagesMap[app.id] || []).filter(s => s.stage_status !== 'ignored' && s.stage_status !== 'pending');
        return stages.length > 0 || app.overall_status === 'archived';
    });
    
    // 动态统计 9 大求职分类计数
    const countAll = approvedApplications.length;
    const countActive = approvedApplications.filter(a => a.overall_status !== 'archived' && a.overall_status !== 'failed' && a.overall_status !== 'offered').length;
    const countApplied = approvedApplications.filter(a => getAppSemanticCategory(a) === 'applied').length;
    const countAssessment = approvedApplications.filter(a => getAppSemanticCategory(a) === 'assessment').length;
    const countExam = approvedApplications.filter(a => getAppSemanticCategory(a) === 'exam').length;
    const countInterview = approvedApplications.filter(a => getAppSemanticCategory(a) === 'interview').length;
    const countOffered = approvedApplications.filter(a => getAppSemanticCategory(a) === 'offered').length;
    const countFailed = approvedApplications.filter(a => getAppSemanticCategory(a) === 'failed').length;
    const countArchived = approvedApplications.filter(a => getAppSemanticCategory(a) === 'archived').length;

    const setBadge = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    setBadge('filterAllCount', countAll);
    setBadge('filterActiveCount', countActive);
    setBadge('filterAppliedCount', countApplied);
    setBadge('filterAssessmentCount', countAssessment);
    setBadge('filterExamCount', countExam);
    setBadge('filterInterviewCount', countInterview);
    setBadge('filterOfferedCount', countOffered);
    setBadge('filterFailedCount', countFailed);
    setBadge('filterArchivedCount', countArchived);

    // 分类筛选过滤
    let filtered = approvedApplications.filter(a => {
        if (currentPipelineFilter === 'all') return true;
        if (currentPipelineFilter === 'active') {
            return a.overall_status !== 'archived' && a.overall_status !== 'failed' && a.overall_status !== 'offered';
        }
        return getAppSemanticCategory(a) === currentPipelineFilter;
    });

    if (currentSearchQuery) {
        filtered = filtered.filter(a => {
            const matchCompany = (a.company || '').toLowerCase().includes(currentSearchQuery);
            const matchDept = (a.department || '').toLowerCase().includes(currentSearchQuery);
            const matchPos = (a.position || '').toLowerCase().includes(currentSearchQuery);
            const matchStage = (a.current_stage_name || '').toLowerCase().includes(currentSearchQuery);
            return matchCompany || matchDept || matchPos || matchStage;
        });
    }

    if (filtered.length === 0) {
        if (container) container.innerHTML = '';
        if (emptyBox) {
            const pendingCount = allStages.filter(s => s.stage_status === 'pending').length;
            if (pendingCount > 0) {
                emptyBox.innerHTML = `
                    <div class="empty-icon">📬</div>
                    <div class="empty-title">有 ${pendingCount} 封新邮件待放行准入</div>
                    <div class="empty-subtitle">请点击底部「待审」标签放行后，将在此自动建档入库</div>
                `;
            } else {
                emptyBox.innerHTML = `
                    <div class="empty-icon">🗂️</div>
                    <div class="empty-title">未找到匹配的投递记录</div>
                    <div class="empty-subtitle">点击右上角「＋」手动录入或等待云端提取</div>
                `;
            }
            emptyBox.style.display = 'block';
        }
        return;
    }

    if (emptyBox) emptyBox.style.display = 'none';

    if (container) {
        container.innerHTML = filtered.map(app => {
            const stages = appStagesMap[app.id] || [];
            const latestStage = stages[stages.length - 1];
            const compName = cleanCompanyName(app.company);
            const posName = cleanPosition(app.position, compName);
            const stageName = app.current_stage_name || (latestStage ? latestStage.stage_name : '网申提交');

            const pillMeta = getStagePillMeta(stageName, app.overall_status);
            const countMeta = getCountdownMeta(latestStage, app);

            return `
                <div class="apple-widget-card" onclick="openTimelineDrawer('${app.id}')">
                    <div class="widget-card-header">
                        <div class="widget-avatar" style="background: ${getCompanyColor(compName)}">
                            ${getCompanyInitial(compName)}
                        </div>
                        <span class="widget-company-name">${escapeHTML(compName)}</span>
                    </div>

                    <div class="widget-card-body">
                        <div class="widget-position-title">${escapeHTML(posName)}</div>
                    </div>

                    <div class="widget-card-footer">
                        <span class="widget-stage-pill ${pillMeta.pillClass}">
                            ${escapeHTML(pillMeta.label)}
                        </span>
                        <div class="widget-countdown-box">
                            <span class="widget-countdown-number">${countMeta.number}</span>
                            <span class="widget-countdown-unit">${countMeta.unit}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// 对应真实最新中文状态胶囊（柔和马卡龙色彩体系）
function getStagePillMeta(stageName, overallStatus) {
    let cleanName = (stageName || '网申提交').replace(/【[^】]*】/g, '').trim();

    if (overallStatus === 'offered' || /Offer|录用|意向/i.test(cleanName)) {
        return { label: cleanName || '已录用', pillClass: 'stage-pill-offer' };
    }
    if (overallStatus === 'failed' || /感谢信|未通过|终止|淘汰/i.test(cleanName)) {
        return { label: cleanName || '未通过', pillClass: 'stage-pill-rejected' };
    }
    if (overallStatus === 'archived') {
        return { label: '已归档', pillClass: 'stage-pill-archived' };
    }
    if (/笔试|机试|机考|专业笔试/i.test(cleanName)) {
        return { label: cleanName, pillClass: 'stage-pill-exam' };
    }
    if (/测评|测试|性格|心理|认知/i.test(cleanName)) {
        return { label: cleanName, pillClass: 'stage-pill-assessment' };
    }
    if (/面|主管|总监|HR|综合|交叉/i.test(cleanName)) {
        return { label: cleanName, pillClass: 'stage-pill-interview' };
    }
    return { label: cleanName, pillClass: 'stage-pill-applied' };
}

// 对应图 1 的右下角天数/倒计时大字
function getCountdownMeta(latestStage, app) {
    if (app.overall_status === 'offered') {
        return { number: '✓', unit: 'Offer' };
    }
    if (app.overall_status === 'failed') {
        return { number: '-', unit: '已结束' };
    }
    if (app.overall_status === 'archived') {
        return { number: '📦', unit: '已归档' };
    }

    if (latestStage && latestStage.schedule_time && latestStage.schedule_time !== '待定') {
        const pDate = parseDateTime(latestStage.schedule_time);
        if (pDate) {
            const diffDays = Math.ceil((pDate - new Date()) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
                return { number: diffDays, unit: 'days' };
            } else if (diffDays === 0) {
                return { number: '0', unit: 'today' };
            } else {
                return { number: Math.abs(diffDays), unit: 'd ago' };
            }
        }
    }

    // 默认根据建档时间显示已投递/推进天数
    const created = app.created_at ? new Date(app.created_at) : new Date();
    const elapsedDays = Math.max(1, Math.floor((new Date() - created) / (1000 * 60 * 60 * 24)));
    return { number: elapsedDays, unit: 'days' };
}

function getOverallStatusClass(status) {
    if (status === 'offered') return 'status-pill-offered';
    if (status === 'failed') return 'status-pill-failed';
    if (status === 'archived') return 'status-pill-archived';
    return 'status-pill-active';
}

function getOverallStatusLabel(status) {
    if (status === 'offered') return '● 已录用';
    if (status === 'failed') return '● 已结束';
    if (status === 'archived') return '● 已归档';
    return '● 推进中';
}

// ==========================================================================
// 7. 时间线抽屉 (Company Timeline Drawer)
// ==========================================================================
function openTimelineDrawer(appId) {
    const app = allApplications.find(a => a.id === appId);
    if (!app) return;
    currentTimelineAppId = appId;

    triggerHaptic('light');
    const compName = cleanCompanyName(app.company);
    const posName = cleanPosition(app.position);

    document.getElementById('drawerCompany').innerText = compName;
    document.getElementById('drawerPosition').innerText = `${posName} · ${app.department || '主干部门'}`;
    document.getElementById('btnDrawerToggleArchive').innerText = app.overall_status === 'archived' ? '🚀 取消归档' : '📦 归档';

    renderTimelineList(appId);
    document.getElementById('timelineSheetOverlay').classList.add('open');
}

function closeTimelineDrawer() {
    document.getElementById('timelineSheetOverlay').classList.remove('open');
}

function renderTimelineList(appId) {
    const listElem = document.getElementById('drawerTimelineList');
    const stages = appStagesMap[appId] || [];

    if (stages.length === 0) {
        listElem.innerHTML = '<div style="color: var(--text-tertiary); font-size: 12px; text-align: center; padding: 20px;">暂无环节记录，可点击上方「新增环节」</div>';
        return;
    }

    listElem.innerHTML = stages.map((st) => {
        return `
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-card-clean" onclick="openEditStageModal('${st.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="font-size: 14px; color: var(--text-primary);">${escapeHTML(st.stage_name)}</strong>
                        <span class="stage-step-tag">${getStageStatusLabel(st.stage_status)}</span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                        <div>📅 时间：${escapeHTML(st.schedule_time || '待定')}</div>
                        ${st.meeting_info ? `<div>💻 会议：${escapeHTML(st.meeting_info)}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getStageStatusLabel(status) {
    if (status === 'passed') return '已通过';
    if (status === 'awaiting_result') return '待结果';
    if (status === 'failed') return '未通过';
    if (status === 'ignored') return '已忽略';
    if (status === 'pending') return '待审';
    return '待办';
}

async function advanceStageStatus(stageId, targetStatus, appId) {
    triggerHaptic('success');
    try {
        await supabase.from('application_stages')
            .eq('id', stageId)
            .update({ stage_status: targetStatus, updated_at: new Date().toISOString() });

        showToast('已更新环节状态', '🎉');
        await loadAllData(false);
    } catch (e) {
        showToast('更新失败: ' + e.message, '❌');
    }
}

async function toggleAppArchive(appId, targetStatus) {
    triggerHaptic('light');
    try {
        await supabase.from('applications')
            .eq('id', appId)
            .update({ overall_status: targetStatus, updated_at: new Date().toISOString() });

        showToast(targetStatus === 'archived' ? '已归档' : '已取消归档', '📦');
        closeTimelineDrawer();
        await loadAllData(false);
    } catch (e) {
        showToast('操作失败: ' + e.message, '❌');
    }
}

// ==========================================================================
// 8. 弹窗：编辑/自由修正环节 (Edit Stage Modal)
// ==========================================================================
function openEditStageModal(stageId) {
    const stage = allStages.find(s => s.id === stageId);
    if (!stage) return;

    triggerHaptic('light');
    document.getElementById('editStageId').value = stage.id;
    document.getElementById('editStageName').value = stage.stage_name || '';
    document.getElementById('editStageStatus').value = stage.stage_status || 'scheduled';
    document.getElementById('editStageScheduleTime').value = stage.schedule_time || '';
    document.getElementById('editStageMeetingInfo').value = stage.meeting_info || '';
    document.getElementById('editStageNextExp').value = stage.next_expectation || '';

    document.getElementById('editStageSheetOverlay').classList.add('open');
}

function closeEditStageModal() {
    document.getElementById('editStageSheetOverlay').classList.remove('open');
}

function setEditStageName(preset) {
    triggerHaptic('light');
    document.getElementById('editStageName').value = preset;
}

async function submitEditStage() {
    const stageId = document.getElementById('editStageId').value;
    const stageName = document.getElementById('editStageName').value.trim();
    const stageStatus = document.getElementById('editStageStatus').value;
    const scheduleTime = document.getElementById('editStageScheduleTime').value.trim();
    const meetingInfo = document.getElementById('editStageMeetingInfo').value.trim();
    const nextExp = document.getElementById('editStageNextExp').value.trim();

    if (!stageName) {
        showToast('环节名称不能为空', '⚠️');
        return;
    }

    triggerHaptic('success');
    try {
        await supabase.from('application_stages')
            .eq('id', stageId)
            .update({
                stage_name: stageName,
                stage_status: stageStatus,
                schedule_time: scheduleTime,
                meeting_info: meetingInfo,
                next_expectation: nextExp,
                updated_at: new Date().toISOString()
            });

        showToast('修改已保存', '✨');
        closeEditStageModal();
        await loadAllData(false);
        if (currentTimelineAppId) renderTimelineList(currentTimelineAppId);
    } catch (e) {
        showToast('保存失败: ' + e.message, '❌');
    }
}

async function deleteCurrentEditingStage() {
    const stageId = document.getElementById('editStageId').value;
    if (!stageId) return;

    if (!confirm('确定要删除此求职环节吗？')) return;

    triggerHaptic('warning');
    try {
        await supabase.from('application_stages')
            .eq('id', stageId)
            .delete();

        showToast('环节已删除', '🗑️');
        closeEditStageModal();
        await loadAllData(false);
        if (currentTimelineAppId) renderTimelineList(currentTimelineAppId);
    } catch (e) {
        showToast('删除失败: ' + e.message, '❌');
    }
}

// ==========================================================================
// 9. 弹窗：手动新增投递/环节 (Add Modal)
// ==========================================================================
function openAddModal(existingApp = null) {
    triggerHaptic('light');
    if (existingApp) {
        document.getElementById('addCompany').value = existingApp.company || '';
        document.getElementById('addCompany').disabled = true;
        document.getElementById('addDepartment').value = existingApp.department || '';
        document.getElementById('addDepartment').disabled = true;
        document.getElementById('addPosition').value = existingApp.position || '';
        document.getElementById('addPosition').disabled = true;
        document.getElementById('addStageName').value = '技术一面';
    } else {
        document.getElementById('addCompany').value = '';
        document.getElementById('addCompany').disabled = false;
        document.getElementById('addDepartment').value = '';
        document.getElementById('addDepartment').disabled = false;
        document.getElementById('addPosition').value = '';
        document.getElementById('addPosition').disabled = false;
        document.getElementById('addStageName').value = '网申提交';
    }
    document.getElementById('addScheduleTime').value = '';
    document.getElementById('addMeetingInfo').value = '';

    document.getElementById('addModalSheetOverlay').classList.add('open');
}

function closeAddModal() {
    document.getElementById('addModalSheetOverlay').classList.remove('open');
}

async function submitAddModal() {
    const company = document.getElementById('addCompany').value.trim();
    const department = document.getElementById('addDepartment').value.trim();
    const position = document.getElementById('addPosition').value.trim();
    const stageName = document.getElementById('addStageName').value.trim();
    const scheduleTime = document.getElementById('addScheduleTime').value.trim() || '待定';
    const meetingInfo = document.getElementById('addMeetingInfo').value.trim();
    const season = localStorage.getItem('OFFERPILOT_SEASON') || '2027届秋招';

    if (!company || !position || !stageName) {
        showToast('请完整填写企业、岗位和环节', '⚠️');
        return;
    }

    triggerHaptic('success');
    try {
        let app = allApplications.find(a => 
            a.company === company && 
            (a.department || '') === department && 
            a.position === position &&
            (a.recruitment_season || '2027届秋招') === season
        );

        let appId = app ? app.id : null;

        if (!appId) {
            const { data: newApp, error: errApp } = await supabase.from('applications').insert({
                company,
                department,
                position,
                recruitment_season: season,
                current_stage_name: stageName,
                overall_status: 'active'
            });
            if (errApp) throw errApp;
            if (newApp && newApp[0]) appId = newApp[0].id;
        } else {
            await supabase.from('applications').eq('id', appId).update({
                current_stage_name: stageName,
                updated_at: new Date().toISOString()
            });
        }

        if (appId) {
            const existingStages = appStagesMap[appId] || [];
            const nextSeq = existingStages.length + 1;

            const { error: errStage } = await supabase.from('application_stages').insert({
                application_id: appId,
                seq: nextSeq,
                stage_name: stageName,
                stage_status: 'scheduled',
                schedule_time: scheduleTime,
                meeting_info: meetingInfo,
                next_expectation: '等待推进'
            });
            if (errStage) throw errStage;
        }

        showToast('已录入投递单！', '🎉');
        closeAddModal();
        await loadAllData(false);
    } catch (e) {
        showToast('录入失败: ' + e.message, '❌');
    }
}
