import { createRecord, emptyData, localDateString, parseBackupText } from "./domain.mjs";
import { NAV_ITEMS, getPage, pageFromHash } from "./navigation.mjs";
import { getHomeSummary, selectMemos, selectTodayTodos } from "./selectors.mjs";
import { createLocalStore } from "./storage.mjs";
import { normalizeFormFields } from "./forms.mjs";
import { ensureDefaultMemoCategory } from "./services.mjs";

const nav = document.querySelector("#primary-nav");
const pageTitle = document.querySelector("#page-title");
const pageContent = document.querySelector("#page-content");
const dialog = document.querySelector("#record-dialog");
const form = document.querySelector("#record-form");
const confirmDialog = document.querySelector("#confirm-dialog");
const today = () => localDateString();
const store = createLocalStore();
let data = emptyData();
let searchQuery = "";
let toastTimer;
let confirmationResolver;

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const dateLabel = (value) => value ? new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00`)) : "未设置日期";
const stamp = () => new Date().toISOString();

function showToast(message, kind = "success") {
  const region = document.querySelector("#toast-region");
  region.innerHTML = `<div class="toast toast-${kind}">${escapeHtml(message)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { region.innerHTML = ""; }, 2600);
}

function setData(nextData) {
  data = nextData;
  renderPage();
}

function renderNavigation(activeId) {
  nav.innerHTML = NAV_ITEMS.map((item) => `
    <a class="nav-link ${item.id === activeId ? "is-active" : ""}" href="#/${item.id}" ${item.id === activeId ? 'aria-current="page"' : ""}>
      <span class="nav-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>
    </a>`).join("");
}

function renderHeading(page) {
  pageTitle.textContent = page.label;
  const date = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
  return `<div class="page-heading"><div><p class="eyebrow">${escapeHtml(page.description)}</p><h1>${escapeHtml(page.label)}</h1></div><time class="today-date">${date}</time></div>`;
}

function emptyState(title, detail, action = "") {
  return `<div class="empty-state"><span class="empty-mark">✦</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p>${action}</div>`;
}

function sectionTitle(title, detail = "", action = "") {
  return `<div class="section-heading"><div><h2>${escapeHtml(title)}</h2>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>${action}</div>`;
}

function addButton(collection, label, extra = "") {
  return `<button class="button button-secondary" data-action="add" data-collection="${collection}" ${extra}>＋ ${escapeHtml(label)}</button>`;
}

function itemActions(collection, id, editLabel = "编辑") {
  return `<div class="item-actions"><button class="icon-button" data-action="edit" data-collection="${collection}" data-id="${escapeHtml(id)}" aria-label="${editLabel}">编辑</button><button class="icon-button danger-link" data-action="delete" data-collection="${collection}" data-id="${escapeHtml(id)}" aria-label="删除">删除</button></div>`;
}

function todoRow(todo, compact = false) {
  return `<div class="todo-row ${todo.completed ? "is-complete" : ""} ${compact ? "todo-row-compact" : ""}">
    <button class="check-button ${todo.completed ? "is-checked" : ""}" data-action="toggle-todo" data-id="${escapeHtml(todo.id)}" aria-label="${todo.completed ? "取消完成" : "标记完成"}">${todo.completed ? "✓" : ""}</button>
    <span class="todo-text">${escapeHtml(todo.text)}</span>${compact ? "" : itemActions("todos", todo.id)}
  </div>`;
}

function memoCard(memo, compact = false) {
  const category = data.memoCategories.find((item) => item.id === memo.categoryId)?.name ?? "未分类";
  return `<article class="memo-card ${compact ? "memo-card-compact" : ""}"><div class="memo-meta"><span class="category-pill">${escapeHtml(category)}</span><time>${dateLabel(memo.updatedAt.slice(0, 10))}</time></div><p>${escapeHtml(memo.content)}</p>${compact ? "" : itemActions("memos", memo.id)}</article>`;
}

function renderHome() {
  const summary = getHomeSummary(data, today());
  const todos = summary.todos.length ? summary.todos.map((todo) => todoRow(todo, true)).join("") : emptyState("今天还没有待办", "想到要做的事，随时记下来。", addButton("todos", "添加待办"));
  const memos = summary.recentMemos.length ? summary.recentMemos.map((memo) => memoCard(memo, true)).join("") : emptyState("还没有备忘", "把临时想法放在这里。", addButton("memos", "记一条备忘"));
  const cards = [
    { id: "media", icon: "✎", title: "自媒体", value: summary.pendingIdeas.length ? `${summary.pendingIdeas.length} 个待处理选题` : "暂无待处理选题", hint: summary.pendingIdeas[0]?.title ?? "管理选题与发布记录" },
    { id: "development", icon: "⌘", title: "开发工作", value: `${summary.activeProjects.length} 个进行中的项目`, hint: summary.activeProjects[0]?.name ?? "项目、任务和进度" },
    { id: "consulting", icon: "◇", title: "咨询工作", value: `${summary.activeConsultations.length} 项待跟进咨询`, hint: summary.activeConsultations[0]?.title ?? "客户与咨询事项" },
    { id: "fitness", icon: "↗", title: "健身计划", value: summary.todayWorkouts.length ? `${summary.workoutCompleted}/${summary.todayWorkouts.length} 项训练完成` : "今天没有训练安排", hint: summary.todayWorkouts[0]?.plan ?? "查看训练安排与完成情况" },
    { id: "food", icon: "◒", title: "饮食计划", value: summary.todayMeal ? "今天已记录饮食" : "今天还没有饮食记录", hint: summary.todayMeal?.content ?? "记录今天吃了什么" },
    { id: "gaming", icon: "△", title: "游戏娱乐", value: summary.latestGame ? `${summary.latestGame.gameName} · ${summary.latestGame.durationMinutes} 分钟` : "还没有游玩记录", hint: summary.latestGame ? dateLabel(summary.latestGame.date) : "记录游戏与游玩时长" },
  ].map((card) => `<a class="summary-card" href="#/${card.id}"><span class="summary-icon">${card.icon}</span><span class="summary-title">${card.title}</span><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.hint)}</small><span class="summary-arrow">↗</span></a>`).join("");

  return `${sectionTitle("今天", "先看今天要做的事")}
    <div class="dashboard-grid">
      <section class="panel panel-todos">${sectionTitle("今日待办", `${summary.todoRemaining} 项未完成`, addButton("todos", "添加"))}<div class="todo-list">${todos}</div><a class="text-link" href="#/today">查看今日计划 →</a></section>
      <section class="panel panel-memos">${sectionTitle("快速备忘", "最近更新")}${memos}<a class="text-link" href="#/memos">查看全部备忘 →</a></section>
    </div>
    ${sectionTitle("模块摘要", "每个模块各自记录不同内容")}
    <div class="summary-grid">${cards}</div>
    <aside class="tip-card"><span class="tip-icon">✳</span><div><strong>小贴士</strong><p>把模块摘要当作入口使用；详细记录在各自模块中维护，首页会自动同步。</p></div></aside>`;
}

function renderToday() {
  const filterDate = pageContent.dataset.todayDate ?? today();
  const todos = selectTodayTodos(data, filterDate);
  return `${sectionTitle("当天待办", "记录当天要做的事，不安排具体时间。", `${dateFilter("today", filterDate)}${addButton("todos", "添加待办", `data-date="${filterDate}"`)}`)}
    <section class="panel list-panel"><div class="list-caption"><span>${dateLabel(filterDate)}</span><span>${todos.filter((item) => !item.completed).length} 项未完成</span></div>
    ${todos.length ? `<div class="todo-list">${todos.map((todo) => todoRow(todo)).join("")}</div>` : emptyState("今天还没有待办", "新增一条待办，首页会同步显示。", addButton("todos", "添加待办"))}</section>`;
}

function renderMemos() {
  const hashQuery = location.hash.split("?")[1] ?? "";
  const params = new URLSearchParams(hashQuery);
  const query = params.get("q") ?? searchQuery;
  const category = params.get("category") ?? "";
  const rows = selectMemos(data, { query, categoryId: category });
  const options = data.memoCategories.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === category ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  return `${sectionTitle("备忘列表", "随手记录、分类整理、按关键词查找。", addButton("memos", "记备忘"))}
    <section class="panel memo-tools"><label>关键词<input id="memo-query" type="search" value="${escapeHtml(query)}" placeholder="搜索备忘内容" /></label><label>分类<select id="memo-category"><option value="">全部分类</option>${options}</select></label>
      <button class="button button-quiet" data-action="add-category">＋ 新建分类</button></section>
    <div class="memo-grid">${rows.length ? rows.map((memo) => memoCard(memo)).join("") : emptyState(query || category ? "没有找到匹配备忘" : "还没有备忘", query || category ? "试试其他关键词或分类。" : "添加备忘后可以按分类和关键词查找。", addButton("memos", "记备忘"))}</div>`;
}

function statusBadge(status) {
  const labels = { pending: "待处理", published: "已发布", "not-started": "未开始", "in-progress": "进行中", completed: "已完成" };
  return `<span class="status-pill status-${status}">${labels[status] ?? escapeHtml(status)}</span>`;
}

function renderMedia() {
  const ideas = [...data.ideas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `${sectionTitle("选题与发布", "跟踪每个内容选题的处理和发布状态。", addButton("ideas", "新增选题"))}
    <div class="record-grid">${ideas.length ? ideas.map((idea) => `<article class="record-card"><div class="record-card-top">${statusBadge(idea.status)}${itemActions("ideas", idea.id)}</div><h3>${escapeHtml(idea.title)}</h3>${idea.description ? `<p>${escapeHtml(idea.description)}</p>` : ""}<div class="record-foot">${idea.status === "published" ? `发布于 ${dateLabel(idea.publishedDate)}` : `更新于 ${dateLabel(idea.updatedAt.slice(0, 10))}`}</div></article>`).join("") : emptyState("还没有选题", "先记录一个内容方向，之后可以更新发布状态。", addButton("ideas", "新增选题"))}</div>`;
}

function renderDevelopment() {
  const projects = [...data.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `${sectionTitle("开发项目", "每个项目管理自己的任务和进度。", addButton("projects", "新建项目"))}
    <div class="project-list">${projects.length ? projects.map((project) => {
      const tasks = data.devTasks.filter((task) => task.projectId === project.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return `<article class="project-card"><div class="record-card-top"><div class="title-with-status"><h3>${escapeHtml(project.name)}</h3>${statusBadge(project.status)}</div>${itemActions("projects", project.id)}</div>
        <div class="project-progress"><span>${tasks.filter((task) => task.status === "completed").length} / ${tasks.length} 个任务完成</span><div class="progress-track"><i style="width:${tasks.length ? Math.round(tasks.filter((task) => task.status === "completed").length / tasks.length * 100) : 0}%"></i></div></div>
        <div class="task-list">${tasks.length ? tasks.map((task) => `<div class="task-row"><span class="task-status-dot task-${task.status}"></span><span>${escapeHtml(task.title)}</span>${statusBadge(task.status)}${itemActions("devTasks", task.id)}</div>`).join("") : emptyState("还没有开发任务", "为项目添加第一项任务。")}</div>
        <button class="button button-quiet add-task-button" data-action="add" data-collection="devTasks" data-project-id="${escapeHtml(project.id)}">＋ 添加开发任务</button></article>`;
    }).join("") : emptyState("还没有开发项目", "先创建项目，再在项目中安排开发任务。", addButton("projects", "新建项目"))}</div>`;
}

function renderConsulting() {
  const clients = [...data.clients].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `${sectionTitle("客户与咨询", "按客户查看咨询事项和跟进记录。", addButton("clients", "新增客户"))}
    <div class="project-list">${clients.length ? clients.map((client) => {
      const consultations = data.consultations.filter((item) => item.clientId === client.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return `<article class="project-card client-card"><div class="record-card-top"><div><h3>${escapeHtml(client.name)}</h3>${client.notes ? `<p class="client-notes">${escapeHtml(client.notes)}</p>` : ""}</div>${itemActions("clients", client.id)}</div>
        <div class="consultation-list">${consultations.length ? consultations.map((consultation) => {
          const followUps = data.followUps.filter((item) => item.consultationId === consultation.id).sort((a, b) => b.date.localeCompare(a.date));
          return `<section class="consultation-card"><div class="record-card-top"><div class="title-with-status"><h4>${escapeHtml(consultation.title)}</h4>${statusBadge(consultation.status)}</div>${itemActions("consultations", consultation.id)}</div>
            <div class="followup-list">${followUps.length ? followUps.map((followUp) => `<div class="followup-row"><time>${dateLabel(followUp.date)}</time><span>${escapeHtml(followUp.content)}</span>${itemActions("followUps", followUp.id)}</div>`).join("") : `<p class="muted-line">还没有跟进记录</p>`}</div>
            <button class="button button-quiet" data-action="add" data-collection="followUps" data-consultation-id="${escapeHtml(consultation.id)}">＋ 记录跟进</button>
          </section>`;
        }).join("") : emptyState("还没有咨询事项", "为该客户创建一项咨询工作。")}</div>
        <button class="button button-quiet add-task-button" data-action="add" data-collection="consultations" data-client-id="${escapeHtml(client.id)}">＋ 新增咨询事项</button></article>`;
    }).join("") : emptyState("还没有客户", "添加客户后，可以记录咨询事项和跟进进度。", addButton("clients", "新增客户"))}</div>`;
}

function dateFilter(pageId, value) {
  return `<label class="date-filter">查看日期<input type="date" data-filter-date="${pageId}" value="${escapeHtml(value)}" /></label>`;
}

function renderFitness() {
  const filterDate = pageContent.dataset.fitnessDate ?? today();
  const rows = [...data.workouts].filter((item) => item.date === filterDate).sort((a, b) => a.date.localeCompare(b.date));
  return `${sectionTitle("训练安排", "安排训练并标记实际完成情况。", `${dateFilter("fitness", filterDate)}${addButton("workouts", "新增训练", `data-date="${filterDate}"`)}`)}
    <div class="record-grid">${rows.length ? rows.map((workout) => `<article class="record-card"><div class="record-card-top">${statusBadge(workout.completed ? "completed" : "not-started")}${itemActions("workouts", workout.id)}</div><h3>${escapeHtml(workout.plan)}</h3><div class="record-foot">安排于 ${dateLabel(workout.date)}${workout.completedDate ? ` · 完成于 ${dateLabel(workout.completedDate)}` : ""}</div>${workout.notes ? `<p>${escapeHtml(workout.notes)}</p>` : ""}<button class="button button-quiet" data-action="toggle-workout" data-id="${escapeHtml(workout.id)}">${workout.completed ? "标记为未完成" : "标记完成"}</button></article>`).join("") : emptyState("这天没有训练安排", "选择日期查看，或新增一项训练。", addButton("workouts", "新增训练", `data-date="${filterDate}"`))}</div>`;
}

function renderFood() {
  const filterDate = pageContent.dataset.foodDate ?? today();
  const rows = [...data.meals].filter((item) => item.date === filterDate).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `${sectionTitle("每日饮食", "记录这一天吃了什么。", `${dateFilter("food", filterDate)}<button class="button button-secondary" data-action="add" data-collection="meals" data-date="${filterDate}">＋ 记录饮食</button>`)}
    <div class="record-grid">${rows.length ? rows.map((meal) => `<article class="record-card"><div class="record-card-top"><span class="category-pill">${dateLabel(meal.date)}</span>${itemActions("meals", meal.id)}</div><p class="long-copy">${escapeHtml(meal.content)}</p></article>`).join("") : emptyState("这天还没有饮食记录", "记下今天吃了什么即可。", `<button class="button button-secondary" data-action="add" data-collection="meals" data-date="${filterDate}">＋ 记录饮食</button>`)}</div>`;
}

function renderGaming() {
  const filterDate = pageContent.dataset.gamingDate ?? today();
  const rows = [...data.gameSessions].filter((item) => item.date === filterDate).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `${sectionTitle("游戏记录", "记下玩了什么游戏和游玩时长。", `${dateFilter("gaming", filterDate)}<button class="button button-secondary" data-action="add" data-collection="gameSessions" data-date="${filterDate}">＋ 添加记录</button>`)}
    <div class="record-grid">${rows.length ? rows.map((session) => `<article class="record-card"><div class="record-card-top"><span class="category-pill">${dateLabel(session.date)}</span>${itemActions("gameSessions", session.id)}</div><h3>${escapeHtml(session.gameName)}</h3><p class="duration-value">${session.durationMinutes}<small> 分钟</small></p>${session.notes ? `<p>${escapeHtml(session.notes)}</p>` : ""}</article>`).join("") : emptyState("这天还没有游戏记录", "结束游玩后记录游戏和时长。", `<button class="button button-secondary" data-action="add" data-collection="gameSessions" data-date="${filterDate}">＋ 添加记录</button>`)}</div>`;
}

function renderSettings() {
  const count = (collection) => data[collection].length;
  const total = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
  return `${sectionTitle("本地数据", "数据只保存在当前浏览器配置中。", "")}
    <div class="settings-grid">
      <section class="panel settings-card"><span class="settings-icon">▤</span><h2>数据概览</h2><p>当前浏览器中保存了 <strong>${total}</strong> 条记录。</p><div class="data-counts"><span>待办 <b>${count("todos")}</b></span><span>备忘 <b>${count("memos")}</b></span><span>选题 <b>${count("ideas")}</b></span><span>项目/任务 <b>${count("projects") + count("devTasks")}</b></span><span>客户/咨询 <b>${count("clients") + count("consultations")}</b></span><span>训练/饮食/游戏 <b>${count("workouts") + count("meals") + count("gameSessions")}</b></span></div></section>
      <section class="panel settings-card"><span class="settings-icon">↓</span><h2>导出备份</h2><p>下载包含全部模块数据的 JSON 文件。请将文件保存在你容易找到的位置。</p><button class="button button-primary" data-action="export-backup">导出完整数据</button></section>
      <section class="panel settings-card"><span class="settings-icon">↑</span><h2>导入恢复</h2><p>选择本应用导出的有效 JSON 文件。确认后，备份中的全部数据会替换当前数据。</p><button class="button button-secondary" data-action="choose-import">选择备份文件</button><input id="backup-file" type="file" accept="application/json,.json" hidden /></section>
    </div>
    <aside class="tip-card settings-tip"><span class="tip-icon">!</span><div><strong>备份提示</strong><p>清除浏览器站点数据可能移除本地记录。建议定期导出备份；本应用不会上传或同步这些文件。</p></div></aside>`;
}

function renderPage() {
  const id = pageFromHash(location.hash);
  const page = getPage(id);
  renderNavigation(id);
  const body = id === "home" ? renderHome() : id === "today" ? renderToday() : id === "memos" ? renderMemos()
    : id === "media" ? renderMedia() : id === "development" ? renderDevelopment() : id === "consulting" ? renderConsulting()
      : id === "fitness" ? renderFitness() : id === "food" ? renderFood() : id === "gaming" ? renderGaming()
        : id === "settings" ? renderSettings() : renderPlaceholder(page);
  pageContent.innerHTML = `${renderHeading(page)}${body}`;
}

function renderPlaceholder(page) {
  return `<div class="page-placeholder"><span class="placeholder-icon">${page.icon}</span><h2>${escapeHtml(page.label)}</h2><p>正在准备${escapeHtml(page.description)}。</p></div>`;
}

function selectField(name, label, options, value) {
  return `<label class="field"><span>${escapeHtml(label)}</span><select name="${name}" required>${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${value === optionValue ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}</select></label>`;
}

function inputField(name, label, value = "", { type = "text", required = true, min = "", step = "" } = {}) {
  return `<label class="field"><span>${escapeHtml(label)}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? "required" : ""} ${min !== "" ? `min="${min}"` : ""} ${step !== "" ? `step="${step}"` : ""} /></label>`;
}

function textAreaField(name, label, value = "", required = false) {
  return `<label class="field field-full"><span>${escapeHtml(label)}</span><textarea name="${name}" rows="4" ${required ? "required" : ""}>${escapeHtml(value)}</textarea></label>`;
}

function checkField(name, label, checked = false) {
  return `<label class="field-check"><input name="${name}" type="checkbox" ${checked ? "checked" : ""} /><span>${escapeHtml(label)}</span></label>`;
}

const progressOptions = [["not-started", "未开始"], ["in-progress", "进行中"], ["completed", "已完成"]];
const consultationOptions = [["in-progress", "进行中"], ["completed", "已完成"]];

function formConfig(collection, record = {}, context = {}) {
  switch (collection) {
    case "todos": return { title: record.id ? "编辑待办" : "新增待办", fields: `${inputField("text", "待办内容", record.text ?? "")}${inputField("date", "所属日期", record.date ?? context.date ?? today(), { type: "date" })}` };
    case "memos": return { title: record.id ? "编辑备忘" : "新增备忘", fields: `${textAreaField("content", "备忘内容", record.content ?? "", true)}${selectField("categoryId", "分类", data.memoCategories.map((category) => [category.id, category.name]), record.categoryId ?? data.memoCategories[0]?.id)}` };
    case "memoCategories": return { title: "新建备忘分类", fields: inputField("name", "分类名称", record.name ?? "") };
    case "ideas": return { title: record.id ? "编辑选题" : "新增选题", fields: `${inputField("title", "选题标题", record.title ?? "")}${selectField("status", "状态", [["pending", "待处理"], ["published", "已发布"]], record.status ?? "pending")}${textAreaField("description", "选题说明", record.description ?? "")}${inputField("publishedDate", "发布日期", record.publishedDate ?? "", { type: "date", required: false })}` };
    case "projects": return { title: record.id ? "编辑项目" : "新建项目", fields: `${inputField("name", "项目名称", record.name ?? "")}${selectField("status", "项目进度", progressOptions, record.status ?? "not-started")}` };
    case "devTasks": return { title: record.id ? "编辑开发任务" : "新增开发任务", fields: `${selectField("projectId", "所属项目", data.projects.map((project) => [project.id, project.name]), record.projectId ?? context.projectId ?? data.projects[0]?.id)}${inputField("title", "任务名称", record.title ?? "")}${selectField("status", "任务进度", progressOptions, record.status ?? "not-started")}` };
    case "clients": return { title: record.id ? "编辑客户" : "新增客户", fields: `${inputField("name", "客户名称", record.name ?? "")}${textAreaField("notes", "客户备注", record.notes ?? "")}` };
    case "consultations": return { title: record.id ? "编辑咨询事项" : "新增咨询事项", fields: `${selectField("clientId", "所属客户", data.clients.map((client) => [client.id, client.name]), record.clientId ?? context.clientId ?? data.clients[0]?.id)}${inputField("title", "咨询事项", record.title ?? "")}${selectField("status", "进度", consultationOptions, record.status ?? "in-progress")}` };
    case "followUps": return { title: record.id ? "编辑跟进记录" : "新增跟进记录", fields: `${selectField("consultationId", "所属咨询事项", data.consultations.map((item) => [item.id, item.title]), record.consultationId ?? context.consultationId ?? data.consultations[0]?.id)}${inputField("date", "跟进日期", record.date ?? today(), { type: "date" })}${textAreaField("content", "跟进内容", record.content ?? "", true)}` };
    case "workouts": return { title: record.id ? "编辑训练安排" : "新增训练安排", fields: `${inputField("date", "训练日期", record.date ?? context.date ?? today(), { type: "date" })}${inputField("plan", "训练安排", record.plan ?? "")}${checkField("completed", "已完成", record.completed ?? false)}${inputField("completedDate", "实际完成日期", record.completedDate ?? "", { type: "date", required: false })}${textAreaField("notes", "备注", record.notes ?? "")}` };
    case "meals": return { title: record.id ? "编辑饮食记录" : "记录饮食", fields: `${inputField("date", "记录日期", record.date ?? context.date ?? today(), { type: "date" })}${textAreaField("content", "今天吃了什么", record.content ?? "", true)}` };
    case "gameSessions": return { title: record.id ? "编辑游戏记录" : "新增游戏记录", fields: `${inputField("date", "游玩日期", record.date ?? context.date ?? today(), { type: "date" })}${inputField("gameName", "游戏名称", record.gameName ?? "")}${inputField("durationMinutes", "游玩时长（分钟）", record.durationMinutes ?? "", { type: "number", min: "0", step: "1" })}${textAreaField("notes", "备注", record.notes ?? "")}` };
    default: return null;
  }
}

function openForm(collection, id = "", context = {}) {
  const record = id ? data[collection]?.find((item) => item.id === id) : null;
  if (id && !record) return showToast("没有找到这条记录，请刷新后重试。", "error");
  if (collection === "devTasks" && data.projects.length === 0) return showToast("请先创建开发项目。", "error");
  if (collection === "consultations" && data.clients.length === 0) return showToast("请先添加客户。", "error");
  if (collection === "followUps" && data.consultations.length === 0) return showToast("请先添加咨询事项。", "error");
  const config = formConfig(collection, record ?? {}, context);
  if (!config) return showToast("该内容暂不可编辑。", "error");
  form.dataset.collection = collection;
  form.dataset.id = id;
  form.innerHTML = `<div class="dialog-heading"><div><p class="eyebrow">我的日常</p><h2 id="dialog-title">${config.title}</h2></div><button type="button" class="icon-button dialog-close" data-action="close-dialog" aria-label="关闭">×</button></div><div class="form-grid">${config.fields}</div><div class="dialog-actions"><button type="button" class="button button-quiet" data-action="close-dialog">取消</button><button type="submit" class="button button-primary">保存</button></div>`;
  dialog.showModal();
}

async function submitForm(event) {
  event.preventDefault();
  const collection = form.dataset.collection;
  const id = form.dataset.id;
  const existing = id ? data[collection].find((record) => record.id === id) : null;
  const rawFields = Object.fromEntries(new FormData(form).entries());
  if (collection === "workouts") rawFields.completed = form.elements.namedItem("completed").checked;
  const fields = normalizeFormFields(collection, rawFields, existing, today());
  try {
    const record = existing
      ? { ...existing, ...fields, updatedAt: stamp() }
      : createRecord(collection, fields);
    await store.save(collection, record);
    const next = { ...data, [collection]: existing ? data[collection].map((item) => item.id === id ? record : item) : [...data[collection], record] };
    setData(next);
    dialog.close();
    showToast(collection === "memoCategories" ? "分类已保存" : "已保存");
  } catch (error) {
    showToast(error.message || "保存失败，请重试。", "error");
  }
}

async function removeRecord(collection, id) {
  const labels = { todos: "待办", memos: "备忘", ideas: "选题", projects: "项目及其开发任务", devTasks: "开发任务", clients: "客户及其咨询记录", consultations: "咨询事项及其跟进记录", followUps: "跟进记录", workouts: "训练安排", meals: "饮食记录", gameSessions: "游戏记录" };
  const name = collection === "projects" ? "该项目及其开发任务" : collection === "clients" ? "该客户、咨询事项和跟进记录" : collection === "consultations" ? "该咨询事项及其跟进记录" : `该${labels[collection] ?? "记录"}`;
  if (!window.confirm(`确定删除${name}吗？此操作无法撤销。`)) return;
  try {
    await store.remove(collection, id);
    const next = { ...data };
    next[collection] = data[collection].filter((item) => item.id !== id);
    if (collection === "projects") next.devTasks = data.devTasks.filter((task) => task.projectId !== id);
    if (collection === "clients") {
      const consultationIds = new Set(data.consultations.filter((item) => item.clientId === id).map((item) => item.id));
      next.consultations = data.consultations.filter((item) => !consultationIds.has(item.id));
      next.followUps = data.followUps.filter((item) => !consultationIds.has(item.consultationId));
    }
    if (collection === "consultations") next.followUps = data.followUps.filter((item) => item.consultationId !== id);
    setData(next);
    showToast("已删除");
  } catch (error) {
    showToast(error.message || "删除失败。", "error");
  }
}

async function toggleTodo(id) {
  const existing = data.todos.find((todo) => todo.id === id);
  if (!existing) return;
  const record = { ...existing, completed: !existing.completed, updatedAt: stamp() };
  await store.save("todos", record);
  setData({ ...data, todos: data.todos.map((todo) => todo.id === id ? record : todo) });
}

async function toggleWorkout(id) {
  const existing = data.workouts.find((workout) => workout.id === id);
  if (!existing) return;
  const completed = !existing.completed;
  const record = { ...existing, completed, completedDate: completed ? today() : "", updatedAt: stamp() };
  await store.save("workouts", record);
  setData({ ...data, workouts: data.workouts.map((workout) => workout.id === id ? record : workout) });
  showToast(completed ? "训练已标记完成" : "已更新训练状态");
}

async function exportBackup() {
  try {
    const backup = await store.exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `my-daily-backup-${today()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("备份文件已导出");
  } catch (error) {
    showToast(error.message || "导出备份失败。", "error");
  }
}

async function importBackup(file) {
  if (!file) return;
  try {
    const parsed = parseBackupText(await file.text());
    if (!parsed.valid) throw new Error(parsed.errors.slice(0, 3).join("；"));
    const accepted = await confirmImport();
    if (!accepted) {
      showToast("已取消导入");
      return;
    }
    await store.replaceAll(parsed.backup.data);
    setData(await ensureDefaultMemoCategory(store, await store.readAll()));
    showToast("数据已从备份恢复");
  } catch (error) {
    showToast(error.message || "导入备份失败，现有数据未更改。", "error");
  } finally {
    const input = document.querySelector("#backup-file");
    if (input) input.value = "";
  }
}

function confirmImport() {
  return new Promise((resolve) => {
    confirmationResolver = resolve;
    confirmDialog.innerHTML = `<div class="dialog-heading"><div><p class="eyebrow">恢复本地备份</p><h2 id="confirm-title">确认替换当前数据？</h2></div></div><p class="confirm-copy">导入会用备份文件中的全部数据替换当前浏览器里的记录，无法自动合并。建议先导出当前数据。确认后立即恢复。</p><div class="dialog-actions"><button type="button" class="button button-quiet" data-action="cancel-import">取消</button><button type="button" class="button button-primary" data-action="confirm-import">确认导入并替换数据</button></div>`;
    confirmDialog.showModal();
  });
}

function finishImportConfirmation(accepted) {
  confirmDialog.close();
  const resolve = confirmationResolver;
  confirmationResolver = null;
  resolve?.(accepted);
}

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const { action: name, collection, id } = action.dataset;
  if (name === "add" || name === "add-category") openForm(name === "add-category" ? "memoCategories" : collection, "", {
    projectId: action.dataset.projectId,
    clientId: action.dataset.clientId,
    consultationId: action.dataset.consultationId,
    date: action.dataset.date,
  });
  if (name === "edit") openForm(collection, id);
  if (name === "delete") void removeRecord(collection, id);
  if (name === "toggle-todo") void toggleTodo(id);
  if (name === "toggle-workout") void toggleWorkout(id);
  if (name === "export-backup") void exportBackup();
  if (name === "choose-import") document.querySelector("#backup-file")?.click();
  if (name === "confirm-import") finishImportConfirmation(true);
  if (name === "cancel-import") finishImportConfirmation(false);
  if (name === "close-dialog") dialog.close();
});

confirmDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  finishImportConfirmation(false);
});

document.querySelector("#page-content").addEventListener("change", (event) => {
  if (event.target.id === "backup-file") void importBackup(event.target.files?.[0]);
});

form.addEventListener("submit", (event) => void submitForm(event));
window.addEventListener("hashchange", renderPage);
window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.querySelector("#global-search").focus();
  }
});

document.querySelector("#global-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchQuery = event.currentTarget.value.trim();
    location.hash = `#/memos${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ""}`;
  }
});

pageContent.addEventListener("input", (event) => {
  if (event.target.id === "memo-query") {
    searchQuery = event.target.value;
    renderPage();
    const input = document.querySelector("#memo-query");
    input.focus();
    input.setSelectionRange(searchQuery.length, searchQuery.length);
  }
});

pageContent.addEventListener("change", (event) => {
  if (event.target.matches("[data-filter-date]")) {
    const key = `${event.target.dataset.filterDate}Date`;
    pageContent.dataset[key] = event.target.value;
    renderPage();
  }
  if (event.target.id === "memo-category") {
    const query = document.querySelector("#memo-query")?.value ?? "";
    const category = event.target.value;
    location.hash = `#/memos?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(category ? { category } : {}) })}`;
  }
});

async function initialize() {
  try {
    data = await ensureDefaultMemoCategory(store, await store.readAll());
    renderPage();
  } catch (error) {
    pageContent.innerHTML = `${renderHeading(getPage("home"))}<div class="storage-error"><h2>无法读取本地数据</h2><p>${escapeHtml(error.message)}。请使用支持 IndexedDB 的浏览器，并通过本地启动地址打开应用。</p></div>`;
  }
}

initialize();
