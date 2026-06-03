(function () {
  if (window.__BRUNEL_CHATBOT_LOADED__) return;
  window.__BRUNEL_CHATBOT_LOADED__ = true;

  var script = document.currentScript;
  var baseUrl = script && script.src ? new URL(script.src).origin : window.location.origin;
  var userConfig = window.BRUNEL_CHATBOT_CONFIG || {};
  var config = {
    apiUrl: userConfig.apiUrl || baseUrl + "/api/chat",
    title: userConfig.title || "Ask Brunel",
    accent: userConfig.accent || "#007f73"
  };

  var styles = document.createElement("style");
  styles.textContent = `
    .brunel-chat-root {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483000;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #102a36;
    }

    .brunel-chat-button {
      width: 58px;
      height: 58px;
      border: 0;
      border-radius: 50%;
      background: #073b4c;
      color: #ffffff;
      box-shadow: 0 14px 34px rgba(7, 59, 76, 0.28);
      display: grid;
      place-items: center;
      cursor: pointer;
    }

    .brunel-chat-button:focus-visible,
    .brunel-chat-send:focus-visible,
    .brunel-chat-close:focus-visible,
    .brunel-chat-suggestion:focus-visible {
      outline: 3px solid rgba(0, 127, 115, 0.35);
      outline-offset: 2px;
    }

    .brunel-chat-panel {
      position: absolute;
      right: 0;
      bottom: 72px;
      width: min(390px, calc(100vw - 32px));
      height: min(610px, calc(100vh - 112px));
      min-height: 460px;
      border: 1px solid #d7e1e4;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 24px 70px rgba(5, 35, 46, 0.24);
      overflow: hidden;
      display: none;
      grid-template-rows: auto 1fr auto;
    }

    .brunel-chat-panel.is-open {
      display: grid;
    }

    .brunel-chat-header {
      background: #073b4c;
      color: #ffffff;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .brunel-chat-title {
      font-size: 15px;
      line-height: 1.25;
      font-weight: 700;
    }

    .brunel-chat-subtitle {
      margin-top: 2px;
      font-size: 12px;
      line-height: 1.3;
      color: rgba(255, 255, 255, 0.78);
    }

    .brunel-chat-close {
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 50%;
      color: #ffffff;
      background: rgba(255, 255, 255, 0.12);
      cursor: pointer;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
    }

    .brunel-chat-messages {
      padding: 16px;
      overflow-y: auto;
      background: #f6f8f8;
    }

    .brunel-chat-message {
      max-width: 88%;
      margin: 0 0 12px;
      padding: 11px 12px;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.45;
    }

    .brunel-chat-message.bot {
      background: #ffffff;
      border: 1px solid #dbe5e8;
      color: #102a36;
    }

    .brunel-chat-message.user {
      margin-left: auto;
      background: #007f73;
      color: #ffffff;
      white-space: pre-wrap;
    }

    .brunel-chat-message p {
      margin: 0 0 8px;
    }

    .brunel-chat-message p:last-child,
    .brunel-chat-message ul:last-child,
    .brunel-chat-message ol:last-child {
      margin-bottom: 0;
    }

    .brunel-chat-message ul,
    .brunel-chat-message ol {
      margin: 0 0 8px;
      padding-left: 18px;
    }

    .brunel-chat-message li {
      margin: 0 0 5px;
    }

    .brunel-chat-heading {
      margin: 0 0 7px;
      font-weight: 700;
      line-height: 1.3;
    }

    .brunel-chat-message code {
      padding: 1px 4px;
      border-radius: 4px;
      background: #edf3f5;
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 0.92em;
    }

    .brunel-chat-sources {
      margin-top: 8px;
      display: grid;
      gap: 5px;
      font-size: 12px;
    }

    .brunel-chat-sources a {
      color: #007f73;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .brunel-chat-suggestions {
      display: grid;
      gap: 8px;
      margin: 0 0 14px;
    }

    .brunel-chat-suggestion {
      width: 100%;
      border: 1px solid #d7e1e4;
      border-radius: 8px;
      background: #ffffff;
      color: #102a36;
      padding: 9px 10px;
      text-align: left;
      font: inherit;
      font-size: 13px;
      line-height: 1.35;
      cursor: pointer;
    }

    .brunel-chat-form {
      border-top: 1px solid #d7e1e4;
      background: #ffffff;
      padding: 12px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
    }

    .brunel-chat-input {
      min-width: 0;
      border: 1px solid #cad7db;
      border-radius: 8px;
      padding: 11px 12px;
      font: inherit;
      font-size: 14px;
      line-height: 1.3;
      color: #102a36;
    }

    .brunel-chat-send {
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 8px;
      background: #007f73;
      color: #ffffff;
      cursor: pointer;
      display: grid;
      place-items: center;
    }

    .brunel-chat-send:disabled {
      opacity: 0.55;
      cursor: wait;
    }

    @media (max-width: 520px) {
      .brunel-chat-root {
        right: 16px;
        bottom: 16px;
      }

      .brunel-chat-panel {
        position: fixed;
        inset: 12px;
        width: auto;
        height: auto;
        min-height: 0;
      }
    }
  `;
  document.head.appendChild(styles);

  var root = document.createElement("div");
  root.className = "brunel-chat-root";
  root.innerHTML = `
    <section class="brunel-chat-panel" aria-live="polite" aria-label="Ask Brunel chat">
      <header class="brunel-chat-header">
        <div>
          <div class="brunel-chat-title">${escapeHtml(config.title)}</div>
          <div class="brunel-chat-subtitle">West of England research and data</div>
        </div>
        <button class="brunel-chat-close" type="button" aria-label="Close chat">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="brunel-chat-messages"></div>
      <form class="brunel-chat-form">
        <input class="brunel-chat-input" autocomplete="off" placeholder="Ask a question" />
        <button class="brunel-chat-send" type="submit" aria-label="Send message">
          <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M22 2 11 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </form>
    </section>
    <button class="brunel-chat-button" type="button" aria-label="Open chat">
      <svg width="27" height="27" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-4-.9l-5 1.5 1.6-4.4A8.2 8.2 0 0 1 3 11.5C3 6.8 7 3 12 3s9 3.8 9 8.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
    </button>
  `;
  document.body.appendChild(root);

  var panel = root.querySelector(".brunel-chat-panel");
  var button = root.querySelector(".brunel-chat-button");
  var closeButton = root.querySelector(".brunel-chat-close");
  var messages = root.querySelector(".brunel-chat-messages");
  var form = root.querySelector(".brunel-chat-form");
  var input = root.querySelector(".brunel-chat-input");
  var send = root.querySelector(".brunel-chat-send");
  var hasStarted = false;

  button.addEventListener("click", function () {
    panel.classList.add("is-open");
    button.style.display = "none";
    if (!hasStarted) {
      hasStarted = true;
      showStarter();
    }
    setTimeout(function () {
      input.focus();
    }, 0);
  });

  closeButton.addEventListener("click", function () {
    panel.classList.remove("is-open");
    button.style.display = "grid";
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    ask(text);
  });

  function showStarter() {
    appendMessage("bot", "Ask me about Brunel Centre research, data, and the West of England economy.");

    var suggestions = document.createElement("div");
    suggestions.className = "brunel-chat-suggestions";
    [
      "What does the Strategic Economic Audit say?",
      "How do wages in the West of England compare nationally?",
      "What sectors make the region distinctive?"
    ].forEach(function (question) {
      var item = document.createElement("button");
      item.className = "brunel-chat-suggestion";
      item.type = "button";
      item.textContent = question;
      item.addEventListener("click", function () {
        ask(question);
        suggestions.remove();
      });
      suggestions.appendChild(item);
    });
    messages.appendChild(suggestions);
  }

  async function ask(text) {
    appendMessage("user", text);
    var pending = appendMessage("bot", "Checking Brunel Centre sources...");
    setBusy(true);

    try {
      var response = await fetch(config.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });
      var payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Chat request failed.");
      }

      setMessageContent(pending, payload.answer || "No answer returned.", true);
      renderSources(pending, payload.sources || []);
    } catch (error) {
      setMessageContent(pending, "I could not reach the chatbot service. Please try again in a moment.", false);
    } finally {
      setBusy(false);
      scrollToEnd();
    }
  }

  function appendMessage(role, text) {
    var node = document.createElement("div");
    node.className = "brunel-chat-message " + role;
    setMessageContent(node, text, role === "bot");
    messages.appendChild(node);
    scrollToEnd();
    return node;
  }

  function setMessageContent(node, text, allowMarkdown) {
    if (allowMarkdown) {
      node.innerHTML = renderMarkdown(text);
    } else {
      node.textContent = text;
    }
  }

  function renderMarkdown(text) {
    var lines = String(text || "").replace(/\r/g, "").split("\n");
    var html = "";
    var listType = null;

    lines.forEach(function (line) {
      var heading = line.match(/^#{1,6}\s+(.+)$/);
      var unordered = line.match(/^\s*[-*]\s+(.+)$/);
      var ordered = line.match(/^\s*\d+\.\s+(.+)$/);

      if (!line.trim()) {
        closeList();
        return;
      }

      if (heading) {
        closeList();
        html += '<div class="brunel-chat-heading">' + formatInline(heading[1]) + "</div>";
        return;
      }

      if (unordered) {
        openList("ul");
        html += "<li>" + formatInline(unordered[1]) + "</li>";
        return;
      }

      if (ordered) {
        openList("ol");
        html += "<li>" + formatInline(ordered[1]) + "</li>";
        return;
      }

      closeList();
      html += "<p>" + formatInline(line) + "</p>";
    });

    closeList();
    return html;

    function openList(type) {
      if (listType === type) return;
      closeList();
      listType = type;
      html += "<" + type + ">";
    }

    function closeList() {
      if (!listType) return;
      html += "</" + listType + ">";
      listType = null;
    }
  }

  function formatInline(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  }

  function renderSources(messageNode, sources) {
    if (!sources.length) return;

    var list = document.createElement("div");
    list.className = "brunel-chat-sources";

    sources.slice(0, 3).forEach(function (source) {
      if (!source.url) return;
      var link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.title || source.url;
      list.appendChild(link);
    });

    if (list.childNodes.length) messageNode.appendChild(list);
  }

  function setBusy(value) {
    send.disabled = value;
    input.disabled = value;
  }

  function scrollToEnd() {
    messages.scrollTop = messages.scrollHeight;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
