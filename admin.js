(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const STORAGE_KEY = "workdesk-admin-connection-v1";
  const TOKEN_KEY = "workdesk-admin-token-v1";
  const LOCAL_PREVIEW_KEY = "workdesk-local-preview-v1";
  const IS_LOCAL_HOST = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

  let content = defaultContent();
  let sha = "";
  let connection = null;
  let source = "none";
  let busy = false;

  function defaultContent() {
    return {
      notices: [],
      duty: [],
      attention: [],
      externalRegistration: {
        title: "活动处理快速登记",
        description: "处理完成后，请打开外部登记表填写活动名称、处理人和处理结果。",
        url: "",
        buttonLabel: "打开快速登记"
      }
    };
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function toast(message) {
    const region = $("#toastRegion");
    const element = document.createElement("div");
    element.className = "toast";
    element.textContent = message;
    region.appendChild(element);
    window.setTimeout(() => element.remove(), 3600);
  }

  function setError(message = "") {
    const element = $("#errorMessage");
    element.textContent = message;
    element.hidden = !message;
  }

  function setBusy(next) {
    busy = next;
    $("#adminMain").setAttribute("aria-busy", String(next));
    $("#connectionFields").disabled = next;
    $("#loadLocal").disabled = next;
    $("#reloadLocalFile").disabled = next;
    $("#editor").disabled = next || source === "none";
    $("#exportJson").disabled = next || source === "none";
    $("#saveLocalPreview").disabled = next || source === "none";
    $("#saveChanges").disabled = next || !connection || !source.startsWith("github");
  }

  function setConnectionBadge(connected) {
    const badge = $("#connectionBadge");
    badge.classList.toggle("connected", connected);
    badge.textContent = connected ? "已连接" : "未连接";
  }

  function setSaveStatus(text) {
    $("#saveStatus").textContent = text;
  }

  function setSourceStatus(text) {
    $("#sourceStatus").textContent = text;
  }

  function setEditorEnabled(enabled) {
    const editor = $("#editor");
    editor.disabled = !enabled;
    editor.classList.toggle("hidden", !enabled);
    $("#exportJson").disabled = !enabled;
    $("#saveLocalPreview").disabled = !enabled;
    $("#saveChanges").disabled = !enabled || !connection;
    $("#saveLocalPreview").hidden = !(IS_LOCAL_HOST && enabled && !connection);
    $("#saveChanges").hidden = IS_LOCAL_HOST && !connection;
    $("#saveChanges").classList.toggle("button-primary", Boolean(connection));
  }

  function restoreConnectionFields() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved.owner) $("#owner").value = saved.owner;
      if (saved.repo) $("#repo").value = saved.repo;
      if (saved.branch) $("#branch").value = saved.branch;
      if (saved.filePath) $("#filePath").value = saved.filePath;
    } catch (error) {
      // Ignore invalid local settings.
    }
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) $("#token").value = token;
  }

  function saveConnectionFields() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        owner: $("#owner").value.trim(),
        repo: $("#repo").value.trim(),
        branch: $("#branch").value.trim() || "main",
        filePath: $("#filePath").value.trim() || "data/content.json"
      })
    );
    sessionStorage.setItem(TOKEN_KEY, $("#token").value.trim());
  }

  function encodeContentPath(path) {
    return String(path).split("/").filter(Boolean).map((part) => encodeURIComponent(part)).join("/");
  }

  function decodeBase64(value) {
    const binary = atob(String(value || "").replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function validHttpUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(String(value));
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function mergeContent(parsed) {
    const base = defaultContent();
    return {
      ...base,
      ...parsed,
      notices: Array.isArray(parsed?.notices) ? parsed.notices : [],
      duty: Array.isArray(parsed?.duty) ? parsed.duty : [],
      attention: Array.isArray(parsed?.attention) ? parsed.attention : [],
      externalRegistration: { ...base.externalRegistration, ...(parsed?.externalRegistration || {}) }
    };
  }

  async function githubRequest(url, options = {}) {
    if (!connection?.token) throw new Error("请先连接 GitHub 仓库");
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${connection.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {})
      }
    });
    if (response.status === 404) return { notFound: true, response };
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json()).message || ""; } catch (error) { /* Ignore non-JSON error bodies. */ }
      throw new Error(detail || `GitHub 请求失败（${response.status}）`);
    }
    return { notFound: false, response, data: await response.json() };
  }

  function renderNotices() {
    const container = $("#noticeEditor");
    if (!content.notices.length) {
      container.innerHTML = '<div class="empty-state">暂无通知，点击“添加通知”开始。</div>';
      return;
    }
    container.innerHTML = content.notices.map((notice, index) => `
      <article class="edit-card notice-edit" data-notice-index="${index}">
        <label><span>标题</span><input data-field="title" value="${esc(notice.title || "")}" maxlength="60"></label>
        <label><span>内容</span><textarea data-field="body" rows="2" maxlength="500">${esc(notice.body || "")}</textarea></label>
        <label class="pin-label"><input data-field="pinned" type="checkbox" ${notice.pinned ? "checked" : ""}><span>置顶显示</span></label>
        <button class="button button-danger" type="button" data-delete-notice="${index}">删除</button>
      </article>
    `).join("");
  }

  function renderDuty() {
    const container = $("#dutyEditor");
    if (!content.duty.length) {
      container.innerHTML = '<div class="empty-state">暂无排班，点击“添加班次”开始。</div>';
      return;
    }
    container.innerHTML = content.duty.map((item, index) => {
      const people = Array.isArray(item.people) ? item.people.join("、") : "";
      return `
        <article class="edit-card duty-edit" data-duty-index="${index}">
          <label><span>星期</span><select data-field="day">${WEEKDAYS.map((name, day) => `<option value="${day}" ${Number(item.day) === day ? "selected" : ""}>${name}</option>`).join("")}</select></label>
          <label><span>时间</span><input data-field="time" value="${esc(item.time || "")}" maxlength="30" placeholder="12:00-14:00"></label>
          <label><span>事项 / 地点</span><input data-field="task" value="${esc(item.task || "")}" maxlength="60"></label>
          <label><span>人员</span><input data-field="people" value="${esc(people)}" maxlength="120" placeholder="用、或空格分开"></label>
          <button class="button button-danger" type="button" data-delete-duty="${index}">删除</button>
        </article>
      `;
    }).join("");
  }

  function renderAttention() {
    const container = $("#attentionEditor");
    if (!content.attention.length) {
      container.innerHTML = '<div class="empty-state">暂无注意事项，点击“添加注意事项”开始。</div>';
      return;
    }
    container.innerHTML = content.attention.map((item, index) => `
      <article class="edit-card notice-edit attention-edit" data-attention-index="${index}">
        <label><span>标题</span><input data-field="title" value="${esc(item.title || "")}" maxlength="60"></label>
        <label><span>内容</span><textarea data-field="body" rows="2" maxlength="500">${esc(item.body || "")}</textarea></label>
        <button class="button button-danger" type="button" data-delete-attention="${index}">删除</button>
      </article>
    `).join("");
  }

  function renderExternal() {
    const external = content.externalRegistration || {};
    $("#externalTitle").value = external.title || "";
    $("#externalButtonLabel").value = external.buttonLabel || "";
    $("#externalUrl").value = external.url || "";
    $("#externalDescription").value = external.description || "";
  }

  function renderEditor() {
    renderNotices();
    renderDuty();
    renderAttention();
    renderExternal();
  }

  function readEditorContent(validate = false) {
    const notices = Array.from(document.querySelectorAll("[data-notice-index]")).map((card, index) => {
      const existing = content.notices[index] || {};
      return {
        id: existing.id || uid(),
        title: card.querySelector('[data-field="title"]').value.trim(),
        body: card.querySelector('[data-field="body"]').value.trim(),
        pinned: card.querySelector('[data-field="pinned"]').checked,
        createdAt: existing.createdAt || Date.now()
      };
    });
    const duty = Array.from(document.querySelectorAll("[data-duty-index]")).map((card, index) => {
      const existing = content.duty[index] || {};
      const people = card.querySelector('[data-field="people"]').value.split(/[、，,;；\s]+/).map((name) => name.trim()).filter(Boolean);
      return {
        id: existing.id || uid(),
        day: Number(card.querySelector('[data-field="day"]').value || 0),
        time: card.querySelector('[data-field="time"]').value.trim(),
        task: card.querySelector('[data-field="task"]').value.trim(),
        people
      };
    });
    const attention = Array.from(document.querySelectorAll("[data-attention-index]")).map((card, index) => {
      const existing = content.attention[index] || {};
      return {
        id: existing.id || uid(),
        title: card.querySelector('[data-field="title"]').value.trim(),
        body: card.querySelector('[data-field="body"]').value.trim(),
        createdAt: existing.createdAt || Date.now()
      };
    });
    const rawUrl = $("#externalUrl").value.trim();
    const safeUrl = validHttpUrl(rawUrl);
    if (validate && rawUrl && !safeUrl) throw new Error("外部登记网址必须是完整的 http:// 或 https:// 地址");
    return {
      notices,
      duty,
      attention,
      externalRegistration: {
        title: $("#externalTitle").value.trim() || "活动处理快速登记",
        description: $("#externalDescription").value.trim(),
        url: validate ? safeUrl : rawUrl,
        buttonLabel: $("#externalButtonLabel").value.trim() || "打开快速登记"
      }
    };
  }

  function compactContent(raw) {
    return {
      notices: raw.notices.filter((notice) => notice.title || notice.body),
      duty: raw.duty.filter((item) => item.time || item.task || item.people.length),
      attention: raw.attention.filter((item) => item.title || item.body),
      externalRegistration: raw.externalRegistration
    };
  }

  function collectContent() {
    content = readEditorContent();
    return content;
  }

  async function loadLocalFile() {
    setBusy(true);
    setError("");
    setSaveStatus("正在读取本地文件…");
    try {
      const response = await fetch(`data/content.json?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`本地数据读取失败（HTTP ${response.status}）`);
      content = mergeContent(await response.json());
      localStorage.removeItem(LOCAL_PREVIEW_KEY);
      source = "local-file";
      connection = null;
      sha = "";
      setConnectionBadge(false);
      renderEditor();
      setEditorEnabled(true);
      setSourceStatus("数据来源：本地 data/content.json");
      setSaveStatus("已读取，可编辑");
      toast("本地文件已读取");
    } catch (error) {
      source = "none";
      connection = null;
      sha = "";
      setConnectionBadge(false);
      setSourceStatus("尚未读取数据，编辑功能暂不可用。请检查本地服务是否启动。");
      setSaveStatus("读取失败");
      setError(error.message || "本地数据读取失败");
      setEditorEnabled(false);
    } finally {
      setBusy(false);
    }
  }

  function loadLocalDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_PREVIEW_KEY) || "null");
      if (!saved || typeof saved !== "object") return false;
      content = mergeContent(saved);
      source = "local-draft";
      connection = null;
      sha = "";
      setConnectionBadge(false);
      renderEditor();
      setEditorEnabled(true);
      setSourceStatus("数据来源：此浏览器的本地预览草稿");
      setSaveStatus("草稿已恢复，可继续编辑");
      return true;
    } catch (error) {
      localStorage.removeItem(LOCAL_PREVIEW_KEY);
      return false;
    }
  }

  async function startLocalMode() {
    if (busy) return;
    if (!IS_LOCAL_HOST) {
      toast("本地试用仅在 localhost 预览地址可用");
      return;
    }
    setError("");
    if (!loadLocalDraft()) await loadLocalFile();
  }

  async function reloadLocalFile() {
    if (busy) return;
    if (source !== "none" && !window.confirm("重新读取本地文件会放弃当前编辑内容并清除本地草稿，继续吗？")) return;
    await loadLocalFile();
  }

  async function connect(event) {
    event.preventDefault();
    if (busy) return;
    const owner = $("#owner").value.trim();
    const repo = $("#repo").value.trim();
    const branch = $("#branch").value.trim() || "main";
    const filePath = $("#filePath").value.trim() || "data/content.json";
    const token = $("#token").value.trim();
    if (!owner || !repo || !token) return;

    connection = { owner, repo, branch, filePath, token };
    saveConnectionFields();
    sha = "";
    setBusy(true);
    setError("");
    setConnectionBadge(false);
    setSaveStatus("正在验证仓库与分支…");
    try {
      const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      const branchResult = await githubRequest(`${base}/branches/${encodeURIComponent(branch)}`);
      if (branchResult.notFound) throw new Error("仓库或分支不存在，或当前令牌没有访问权限");
      const path = encodeContentPath(filePath);
      const result = await githubRequest(`${base}/contents/${path}?ref=${encodeURIComponent(branch)}`);
      if (result.notFound) {
        content = defaultContent();
        source = "github-new";
        toast("仓库已连接，数据文件尚不存在，首次提交时会自动创建。");
      } else {
        sha = result.data.sha || "";
        content = mergeContent(JSON.parse(decodeBase64(result.data.content)));
        source = "github";
        toast("GitHub 数据读取成功");
      }
      renderEditor();
      setEditorEnabled(true);
      setConnectionBadge(true);
      setSourceStatus(`数据来源：GitHub / ${owner}/${repo} · ${branch}`);
      setSaveStatus("已读取，可编辑");
    } catch (error) {
      connection = null;
      sha = "";
      source = "none";
      setConnectionBadge(false);
      setEditorEnabled(false);
      setSourceStatus("尚未读取数据，编辑功能暂不可用。请先连接并读取。 ");
      setSaveStatus("连接失败");
      setError(error.message || "连接失败，请检查仓库信息和令牌权限");
    } finally {
      setBusy(false);
    }
  }

  function exportJson() {
    if (busy || source === "none") return;
    try {
      const raw = readEditorContent(true);
      content = raw;
      const serialized = `${JSON.stringify(compactContent(raw), null, 2)}\n`;
      const blob = new Blob([serialized], { type: "application/json;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "content.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      setSaveStatus("已导出当前内容");
    } catch (error) {
      setError(error.message);
      toast(error.message);
    }
  }

  function saveLocalPreview() {
    if (busy || source === "none") return;
    try {
      const payload = compactContent(readEditorContent(true));
      localStorage.setItem(LOCAL_PREVIEW_KEY, JSON.stringify(payload));
      content = mergeContent(payload);
      source = "local-draft";
      setError("");
      renderEditor();
      setSaveStatus("本地预览已保存");
      setSourceStatus("数据来源：此浏览器的本地预览草稿");
      toast("已保存本地预览草稿");
    } catch (error) {
      setError(error.message);
      toast(error.message);
    }
  }

  async function saveToGithub() {
    if (busy || !connection || source === "none") {
      toast("请先连接 GitHub 仓库并读取数据");
      return;
    }
    if (!window.confirm(`确认提交到 GitHub？\n仓库：${connection.owner}/${connection.repo}\n分支：${connection.branch}\n文件：${connection.filePath}`)) return;
    try {
      const payload = compactContent(readEditorContent(true));
      const body = {
        message: `Update workdesk content ${new Date().toISOString()}`,
        content: encodeBase64(`${JSON.stringify(payload, null, 2)}\n`),
        branch: connection.branch
      };
      if (sha) body.sha = sha;
      setBusy(true);
      setSaveStatus("正在提交…");
      const path = encodeContentPath(connection.filePath);
      const result = await githubRequest(`https://api.github.com/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.repo)}/contents/${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (result.notFound) throw new Error("提交目标不存在或令牌权限不足，请重新连接仓库。");
      sha = result.data.content?.sha || sha;
      setError("");
      content = mergeContent(payload);
      renderEditor();
      setSaveStatus("已提交，GitHub Pages 通常 1–2 分钟后更新");
      toast("内容已提交到 GitHub");
    } catch (error) {
      setSaveStatus("提交失败");
      setError(error.message || "提交失败，请稍后重试");
      toast(error.message || "提交失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  function markDirty() {
    if (!busy && source !== "none") {
      setSaveStatus(source.startsWith("github") ? "有未提交的修改" : "有未保存的本地修改");
      setError("");
    }
  }

  $("#connectionForm").addEventListener("submit", connect);
  $("#saveChanges").addEventListener("click", saveToGithub);
  $("#saveLocalPreview").addEventListener("click", saveLocalPreview);
  $("#exportJson").addEventListener("click", exportJson);
  $("#loadLocal").addEventListener("click", startLocalMode);
  $("#reloadLocalFile").addEventListener("click", reloadLocalFile);
  $("#forgetToken").addEventListener("click", () => {
    sessionStorage.removeItem(TOKEN_KEY);
    $("#token").value = "";
    connection = null;
    sha = "";
    setConnectionBadge(false);
    if (source !== "none") setEditorEnabled(true);
    $("#saveChanges").disabled = true;
    toast("已清除当前浏览器中的访问令牌");
  });
  $("#addNotice").addEventListener("click", () => {
    collectContent();
    content.notices.unshift({ id: uid(), title: "", body: "", pinned: false, createdAt: Date.now() });
    renderNotices();
    markDirty();
  });
  $("#addDuty").addEventListener("click", () => {
    collectContent();
    content.duty.push({ id: uid(), day: 0, time: "", task: "", people: [] });
    renderDuty();
    markDirty();
  });
  $("#addAttention").addEventListener("click", () => {
    collectContent();
    content.attention.unshift({ id: uid(), title: "", body: "", createdAt: Date.now() });
    renderAttention();
    markDirty();
  });
  $("#noticeEditor").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-notice]");
    if (!button) return;
    collectContent();
    content.notices.splice(Number(button.dataset.deleteNotice), 1);
    renderNotices();
    markDirty();
  });
  $("#dutyEditor").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-duty]");
    if (!button) return;
    collectContent();
    content.duty.splice(Number(button.dataset.deleteDuty), 1);
    renderDuty();
    markDirty();
  });
  $("#attentionEditor").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-attention]");
    if (!button) return;
    collectContent();
    content.attention.splice(Number(button.dataset.deleteAttention), 1);
    renderAttention();
    markDirty();
  });
  $("#editor").addEventListener("input", markDirty);
  $("#editor").addEventListener("change", markDirty);

  restoreConnectionFields();
  if (IS_LOCAL_HOST) {
    $("#localPanel").hidden = false;
    $("#githubDetails").open = false;
    setSourceStatus("先选择本地试用，即可编辑并预览网站内容，无需连接 GitHub。");
  }
  setEditorEnabled(false);
  setConnectionBadge(false);
})();
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const STORAGE_KEY = "workdesk-admin-connection-v1";
  const TOKEN_KEY = "workdesk-admin-token-v1";

  let content = defaultContent();
  let sha = "";
  let connection = null;

  function defaultContent() {
    return {
      notices: [],
      duty: [],
      externalRegistration: {
        title: "活动处理快速登记",
        description: "处理完成后，请打开外部登记表填写活动名称、处理人和处理结果。",
        url: "",
        buttonLabel: "打开快速登记"
      }
    };
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function toast(message) {
    const region = $("#toastRegion");
    const element = document.createElement("div");
    element.className = "toast";
    element.textContent = message;
    region.appendChild(element);
    window.setTimeout(() => element.remove(), 3600);
  }

  function setConnectionBadge(connected) {
    const badge = $("#connectionBadge");
    badge.classList.toggle("connected", connected);
    badge.textContent = connected ? "已连接" : "未连接";
  }

  function setSaveStatus(text) {
    $("#saveStatus").textContent = text;
  }

  function restoreConnectionFields() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved.owner) $("#owner").value = saved.owner;
      if (saved.repo) $("#repo").value = saved.repo;
      if (saved.branch) $("#branch").value = saved.branch;
      if (saved.filePath) $("#filePath").value = saved.filePath;
    } catch (error) {
      // Ignore invalid local settings.
    }
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) $("#token").value = token;
  }

  function saveConnectionFields() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        owner: $("#owner").value.trim(),
        repo: $("#repo").value.trim(),
        branch: $("#branch").value.trim() || "main",
        filePath: $("#filePath").value.trim() || "data/content.json"
      })
    );
    sessionStorage.setItem(TOKEN_KEY, $("#token").value.trim());
  }

  function encodeContentPath(path) {
    return String(path)
      .split("/")
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join("/");
  }

  function decodeBase64(value) {
    const binary = atob(String(value || "").replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  async function githubRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${connection.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {})
      }
    });
    if (response.status === 404) {
      return { notFound: true, response };
    }
    if (!response.ok) {
      let detail = "";
      try {
        const error = await response.json();
        detail = error.message || "";
      } catch (error) {
        detail = "";
      }
      throw new Error(detail || `GitHub 请求失败（${response.status}）`);
    }
    return { notFound: false, response, data: await response.json() };
  }

  function renderNotices() {
    const container = $("#noticeEditor");
    if (!content.notices.length) {
      container.innerHTML = '<div class="empty-state">暂无通知，点击“添加通知”开始。</div>';
      return;
    }
    container.innerHTML = content.notices
      .map(
        (notice, index) => `
          <div class="edit-card" data-notice-index="${index}">
            <label>
              <span>标题</span>
              <input data-field="title" value="${esc(notice.title || "")}" maxlength="60">
            </label>
            <label>
              <span>内容</span>
              <textarea data-field="body" rows="2" maxlength="500">${esc(notice.body || "")}</textarea>
            </label>
            <label class="pin-label">
              <input data-field="pinned" type="checkbox" ${notice.pinned ? "checked" : ""}>
              <span>置顶</span>
            </label>
            <button class="button button-danger" type="button" data-delete-notice="${index}">删除</button>
          </div>
        `
      )
      .join("");
  }

  function renderDuty() {
    const container = $("#dutyEditor");
    if (!content.duty.length) {
      container.innerHTML = '<div class="empty-state">暂无排班，点击“添加班次”开始。</div>';
      return;
    }
    container.innerHTML = content.duty
      .map((item, index) => {
        const people = Array.isArray(item.people) ? item.people.join("、") : "";
        return `
          <div class="edit-card duty-edit" data-duty-index="${index}">
            <label>
              <span>星期</span>
              <select data-field="day">
                ${WEEKDAYS.map((name, day) => `<option value="${day}" ${Number(item.day) === day ? "selected" : ""}>${name}</option>`).join("")}
              </select>
            </label>
            <label>
              <span>时间</span>
              <input data-field="time" value="${esc(item.time || "")}" maxlength="30" placeholder="12:00-14:00">
            </label>
            <label>
              <span>事项 / 地点</span>
              <input data-field="task" value="${esc(item.task || "")}" maxlength="60">
            </label>
            <label>
              <span>人员</span>
              <input data-field="people" value="${esc(people)}" maxlength="120" placeholder="用、或空格分开">
            </label>
            <button class="button button-danger" type="button" data-delete-duty="${index}">删除</button>
          </div>
        `;
      })
      .join("");
  }

  function renderExternal() {
    const external = content.externalRegistration || {};
    $("#externalTitle").value = external.title || "";
    $("#externalButtonLabel").value = external.buttonLabel || "";
    $("#externalUrl").value = external.url || "";
    $("#externalDescription").value = external.description || "";
  }

  function renderEditor() {
    renderNotices();
    renderDuty();
    renderExternal();
  }

  function collectContent() {
    const notices = Array.from(document.querySelectorAll("[data-notice-index]")).map((card, index) => {
      const existing = content.notices[index] || {};
      return {
        id: existing.id || uid(),
        title: card.querySelector('[data-field="title"]').value.trim(),
        body: card.querySelector('[data-field="body"]').value.trim(),
        pinned: card.querySelector('[data-field="pinned"]').checked,
        createdAt: existing.createdAt || Date.now()
      };
    });

    const duty = Array.from(document.querySelectorAll("[data-duty-index]")).map((card, index) => {
      const existing = content.duty[index] || {};
      const people = card
        .querySelector('[data-field="people"]')
        .value
        .split(/[、，,;；\s]+/)
        .map((name) => name.trim())
        .filter(Boolean);
      return {
        id: existing.id || uid(),
        day: Number(card.querySelector('[data-field="day"]').value || 0),
        time: card.querySelector('[data-field="time"]').value.trim(),
        task: card.querySelector('[data-field="task"]').value.trim(),
        people
      };
    });

    content = {
      notices: notices.filter((notice) => notice.title || notice.body),
      duty: duty.filter((item) => item.time || item.task || item.people.length),
      externalRegistration: {
        title: $("#externalTitle").value.trim() || "活动处理快速登记",
        description: $("#externalDescription").value.trim(),
        url: $("#externalUrl").value.trim(),
        buttonLabel: $("#externalButtonLabel").value.trim() || "打开快速登记"
      }
    };
    return content;
  }

  async function connect(event) {
    event.preventDefault();
    const owner = $("#owner").value.trim();
    const repo = $("#repo").value.trim();
    const branch = $("#branch").value.trim() || "main";
    const filePath = $("#filePath").value.trim() || "data/content.json";
    const token = $("#token").value.trim();

    connection = { owner, repo, branch, filePath, token };
    saveConnectionFields();
    setConnectionBadge(false);
    setSaveStatus("正在读取...");

    try {
      const path = encodeContentPath(filePath);
      const result = await githubRequest(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`
      );

      if (result.notFound) {
        sha = "";
        content = defaultContent();
        toast("仓库已连接，数据文件尚不存在，首次提交时会自动创建。");
      } else {
        const file = result.data;
        sha = file.sha || "";
        const parsed = JSON.parse(decodeBase64(file.content));
        content = {
          ...defaultContent(),
          ...parsed,
          notices: Array.isArray(parsed.notices) ? parsed.notices : [],
          duty: Array.isArray(parsed.duty) ? parsed.duty : [],
          externalRegistration: {
            ...defaultContent().externalRegistration,
            ...(parsed.externalRegistration || {})
          }
        };
        toast("读取成功");
      }

      renderEditor();
      $("#editor").classList.remove("hidden");
      setConnectionBadge(true);
      setSaveStatus("已读取，尚未修改");
    } catch (error) {
      setConnectionBadge(false);
      setSaveStatus("连接失败");
      toast(error.message || "连接失败，请检查仓库信息和令牌权限");
    }
  }

  async function saveToGithub() {
    if (!connection) {
      toast("请先连接 GitHub 仓库");
      return;
    }
    collectContent();
    setSaveStatus("正在提交...");
    const serialized = `${JSON.stringify(content, null, 2)}\n`;
    const body = {
      message: `Update workdesk content ${new Date().toISOString()}`,
      content: encodeBase64(serialized),
      branch: connection.branch
    };
    if (sha) body.sha = sha;

    try {
      const path = encodeContentPath(connection.filePath);
      const result = await githubRequest(
        `https://api.github.com/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.repo)}/contents/${path}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      sha = result.data.content?.sha || sha;
      setSaveStatus("已提交，GitHub Pages 通常 1-2 分钟后更新");
      toast("内容已提交到 GitHub");
    } catch (error) {
      setSaveStatus("提交失败");
      toast(error.message || "提交失败，请稍后重试");
    }
  }

  function exportJson() {
    collectContent();
    const blob = new Blob([`${JSON.stringify(content, null, 2)}\n`], {
      type: "application/json;charset=utf-8"
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "content.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }

  $("#connectionForm").addEventListener("submit", connect);
  $("#saveChanges").addEventListener("click", saveToGithub);
  $("#exportJson").addEventListener("click", exportJson);

  $("#addNotice").addEventListener("click", () => {
    collectContent();
    content.notices.unshift({ id: uid(), title: "", body: "", pinned: false, createdAt: Date.now() });
    renderNotices();
    setSaveStatus("有未提交的修改");
  });

  $("#addDuty").addEventListener("click", () => {
    collectContent();
    content.duty.push({ id: uid(), day: 0, time: "", task: "", people: [] });
    renderDuty();
    setSaveStatus("有未提交的修改");
  });

  $("#noticeEditor").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-notice]");
    if (!button) return;
    collectContent();
    content.notices.splice(Number(button.dataset.deleteNotice), 1);
    renderNotices();
    setSaveStatus("有未提交的修改");
  });

  $("#dutyEditor").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-duty]");
    if (!button) return;
    collectContent();
    content.duty.splice(Number(button.dataset.deleteDuty), 1);
    renderDuty();
    setSaveStatus("有未提交的修改");
  });

  $("#editor").addEventListener("input", () => {
    setSaveStatus("有未提交的修改");
  });

  restoreConnectionFields();
})();
