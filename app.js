(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const CONTENT_PATH = window.WORKDESK_CONTENT_PATH || "data/content.json";
  const SITES = Array.isArray(window.WORKDESK_SITES) ? window.WORKDESK_SITES : [];

  const ICONS = {
    external:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/></svg>',
    clipboard:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 11h6"/><path d="M9 15h6"/><path d="M9 19h4"/></svg>'
  };

  document.querySelectorAll("[data-icon]").forEach((element) => {
    const icon = ICONS[element.dataset.icon];
    if (icon) element.innerHTML = icon;
  });

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function todayIndex() {
    return (new Date().getDay() + 6) % 7;
  }

  function formatTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function validHttpUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function refreshToday() {
    $("#todayLine").textContent = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long"
    }).format(new Date());
  }

  function setStatus(online, text) {
    const badge = $("#dataBadge");
    badge.classList.toggle("online", online);
    $("#dataStatus").textContent = text;
  }

  function applySites() {
    SITES.forEach((site) => {
      const entry = document.getElementById(`${site.id}Entry`);
      const name = document.getElementById(`siteName-${site.id}`);
      const url = document.getElementById(`siteUrl-${site.id}`);
      if (entry) entry.href = site.url;
      if (name) name.textContent = site.name;
      if (url) url.textContent = site.url;
    });
  }

  function renderNotices(notices) {
    const list = $("#noticeList");
    const sorted = [...notices].sort((left, right) => {
      if (Boolean(right.pinned) !== Boolean(left.pinned)) return right.pinned ? 1 : -1;
      return Number(right.createdAt || 0) - Number(left.createdAt || 0);
    });

    $("#noticeSub").textContent = `${sorted.length} 条`;
    if (!sorted.length) {
      list.innerHTML = '<li class="empty-state">暂无公共通知</li>';
      return;
    }

    list.innerHTML = sorted
      .map((notice) => {
        const meta = [];
        if (notice.pinned) meta.push('<span class="pin-flag">置顶</span>');
        if (notice.createdAt) meta.push(`<span>${formatTime(notice.createdAt)}</span>`);
        return `
          <li class="notice-item">
            <div class="notice-content">
              ${meta.length ? `<div class="notice-meta">${meta.join("")}</div>` : ""}
              <div class="notice-title-line">
                <h3>${esc(notice.title || "未命名通知")}</h3>
              </div>
              ${notice.body ? `<p class="notice-body">${esc(notice.body)}</p>` : ""}
            </div>
          </li>
        `;
      })
      .join("");
  }

  function renderDuty(duty) {
    const table = $("#dutyTable");
    const sorted = [...duty].sort((left, right) => {
      if (Number(left.day || 0) !== Number(right.day || 0)) {
        return Number(left.day || 0) - Number(right.day || 0);
      }
      return String(left.time || "").localeCompare(String(right.time || ""), "zh-CN");
    });

    $("#dutySub").textContent = `${sorted.length} 个班次`;
    const head = `
      <div class="table-head">
        <span>星期</span>
        <span>时间</span>
        <span>事项 / 地点</span>
        <span>人员</span>
      </div>
    `;

    if (!sorted.length) {
      table.classList.remove("has-four-columns");
      table.innerHTML = `${head}<div class="empty-state">暂无排班</div>`;
      return;
    }

    const rows = sorted
      .map((item) => {
        const people = Array.isArray(item.people) ? item.people : [];
        const chips = people
          .map((person) => `<span class="chip">${esc(person)}</span>`)
          .join("");
        const current = Number(item.day) === todayIndex() ? " current" : "";
        return `
          <div class="duty-row${current}">
            <span class="cell-strong">${WEEKDAYS[Number(item.day)] || "-"}</span>
            <span>${esc(item.time || "-")}</span>
            <span>${esc(item.task || "-")}</span>
            <div class="people-chips">${chips || '<span class="cell-sub">未填写</span>'}</div>
          </div>
        `;
      })
      .join("");

    table.classList.add("has-four-columns");
    table.innerHTML = `${head}${rows}`;
  }

  function renderExternalRegistration(registration) {
    const config = registration && typeof registration === "object" ? registration : {};
    const url = validHttpUrl(config.url);
    $("#quickRegName").textContent = config.title || "活动处理快速登记";
    $("#quickRegDescription").textContent =
      config.description || "处理完成后，请打开外部登记表填写处理结果。";
    $("#quickRegLabel").textContent = config.buttonLabel || "打开快速登记";

    const link = $("#quickRegLink");
    if (url) {
      link.href = url;
      link.classList.remove("is-disabled");
      link.removeAttribute("aria-disabled");
      link.removeAttribute("tabindex");
    } else {
      link.removeAttribute("href");
      link.classList.add("is-disabled");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
    }
  }

  function toast(message) {
    const region = $("#toastRegion");
    const element = document.createElement("div");
    element.className = "toast";
    element.textContent = message;
    region.appendChild(element);
    window.setTimeout(() => element.remove(), 2600);
  }

  async function loadContent(showFeedback = false) {
    setStatus(false, "读取中");
    try {
      const response = await fetch(`${CONTENT_PATH}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const content = await response.json();
      renderNotices(Array.isArray(content.notices) ? content.notices : []);
      renderDuty(Array.isArray(content.duty) ? content.duty : []);
      renderExternalRegistration(content.externalRegistration);
      setStatus(true, "已同步");
      if (showFeedback) toast("数据已刷新");
    } catch (error) {
      setStatus(false, "读取失败");
      renderNotices([]);
      renderDuty([]);
      renderExternalRegistration({});
      if (showFeedback) toast("数据读取失败，请稍后重试");
    }
  }

  $("#openBothBtn").addEventListener("click", () => {
    SITES.forEach((site) => window.open(site.url, "_blank", "noopener,noreferrer"));
  });

  $("#refreshBtn").addEventListener("click", () => loadContent(true));
  $("#quickRegLink").addEventListener("click", (event) => {
    if ($("#quickRegLink").classList.contains("is-disabled")) event.preventDefault();
  });

  refreshToday();
  applySites();
  loadContent();
})();
