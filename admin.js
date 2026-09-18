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
