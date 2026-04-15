import "./styles.css";

type TransportMode = "direct" | "proxy";
type StatusTone = "idle" | "info" | "ok" | "warn" | "error";

type SavedState = {
  baseUrl: string; transport: TransportMode; authToken: string;
  query: string; steamId: string; modeId: string; sessionId: string;
  recentEvents: string; conversationSummary: string;
};

const DEFAULT_BASE_URL = "https://ais-pre-ddtfjbzbgpc2mlkz7nqvra-782381585235.europe-west2.run.app";
const STORAGE_KEY = "battleluck-client-lab-state";

const defaultState: SavedState = {
  baseUrl: DEFAULT_BASE_URL, transport: "direct", authToken: "",
  query: "How should I approach the final circle in Bloodbath when two players are left?",
  steamId: "76561199507219786", modeId: "bloodbath", sessionId: "bloodbath_2002_demo",
  recentEvents: "mode_started\nplayer_scored:kill\nzone_shrink\nfinal_two",
  conversationSummary: "Player is in Bloodbath late-game with shrinking arena pressure."
};

const state = loadState();

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

app.innerHTML = `
  <div class="shell">
    <div class="ambient ambient-a"></div>
    <div class="ambient ambient-b"></div>
    <header class="hero panel reveal">
      <div>
        <p class="eyebrow">Client-side integration project</p>
        <h1>BattleLuck Client Lab</h1>
        <p class="hero-copy">
          Browser test harness for the BattleLuck AI enrichment routes. It can call the remote base URL directly,
          or use a local Vite proxy when you need a cleaner development loop.
        </p>
      </div>
      <div class="hero-actions">
        <button id="openRemote" class="button ghost">Open remote URL</button>
        <button id="checkHealth" class="button secondary">Check health</button>
        <button id="runEnrich" class="button primary">Run enrich request</button>
      </div>
    </header>

    <main class="grid">
      <section class="panel reveal delay-1">
        <div class="section-head">
          <h2>Connection</h2>
          <span id="statusPill" class="pill idle">Idle</span>
        </div>
        <label class="field"><span>Remote base URL</span><input id="baseUrl" type="url" placeholder="https://..." /></label>
        <div class="field-group">
          <label class="radio-card">
            <input type="radio" name="transport" value="direct" />
            <span><strong>Direct browser mode</strong><small>Calls the remote URL from the browser. Requires browser-safe auth and CORS.</small></span>
          </label>
          <label class="radio-card">
            <input type="radio" name="transport" value="proxy" />
            <span><strong>Local proxy mode</strong><small>Uses <code>/battleluck-api</code> through Vite during development.</small></span>
          </label>
        </div>
        <label class="field"><span>Bearer token</span><input id="authToken" type="password" placeholder="Optional shared secret for testing only" /></label>
        <div class="note warning-note">
          <strong>Reality check</strong>
          <p>Direct mode only works when the remote endpoint answers normal JSON requests and preflights. If your Cloud Run front door injects a cookie-check, this UI will flag that.</p>
        </div>
      </section>

      <section class="panel reveal delay-2">
        <div class="section-head">
          <h2>Battle Query</h2>
          <div class="chips">
            <button class="chip" data-sample="bloodbath">Bloodbath</button>
            <button class="chip" data-sample="colosseum">Colosseum</button>
            <button class="chip" data-sample="gauntlet">Gauntlet</button>
          </div>
        </div>
        <div class="two-up">
          <label class="field"><span>Steam ID</span><input id="steamId" type="text" /></label>
          <label class="field"><span>Mode ID</span><input id="modeId" type="text" /></label>
        </div>
        <label class="field"><span>Session ID</span><input id="sessionId" type="text" /></label>
        <label class="field"><span>Question</span><textarea id="query" rows="4"></textarea></label>
        <label class="field"><span>Recent events</span><textarea id="recentEvents" rows="5" placeholder="One event per line"></textarea></label>
        <label class="field"><span>Conversation summary</span><textarea id="conversationSummary" rows="4"></textarea></label>
      </section>

      <section class="panel reveal delay-3 diagnostics-panel">
        <div class="section-head">
          <h2>Diagnostics</h2>
          <button id="copyResponse" class="button ghost compact">Copy response</button>
        </div>
        <div id="diagnostics" class="diagnostics"></div>
      </section>

      <section class="panel reveal delay-4 response-panel">
        <div class="section-head">
          <h2>Response</h2>
          <span id="responseMeta" class="meta">No request yet</span>
        </div>
        <pre id="responseView" class="response-view">{\n  "message": "Run a health check or enrich request to see the response here."\n}</pre>
      </section>
    </main>
  </div>
`;

const elements = {
  baseUrl: getInput("baseUrl"), authToken: getInput("authToken"),
  steamId: getInput("steamId"), modeId: getInput("modeId"), sessionId: getInput("sessionId"),
  query: getTextArea("query"), recentEvents: getTextArea("recentEvents"),
  conversationSummary: getTextArea("conversationSummary"),
  statusPill: getElement("statusPill"), diagnostics: getElement("diagnostics"),
  responseView: getElement("responseView"), responseMeta: getElement("responseMeta")
};

hydrateInputs();
wireEvents();
renderDiagnostics([
  `Mode: ${state.transport === "direct" ? "Direct browser" : "Local proxy"}`,
  `Resolved health route: ${resolveRoute("/health")}`,
  `Resolved enrich route: ${resolveRoute("/api/query/enrich")}`,
  `Tip: open the remote URL first if you need to inspect its auth flow manually.`
]);

function wireEvents(): void {
  const trackedInputs: Array<HTMLInputElement | HTMLTextAreaElement> = [
    elements.baseUrl, elements.authToken, elements.steamId, elements.modeId,
    elements.sessionId, elements.query, elements.recentEvents, elements.conversationSummary
  ];
  trackedInputs.forEach((input) => {
    input.addEventListener("input", () => { syncStateFromInputs(); saveState(); updateRouteDiagnostics(); });
  });
  document.querySelectorAll<HTMLInputElement>('input[name="transport"]').forEach((radio) => {
    radio.checked = radio.value === state.transport;
    radio.addEventListener("change", () => { state.transport = radio.value as TransportMode; saveState(); updateRouteDiagnostics(); });
  });
  document.querySelectorAll<HTMLButtonElement>(".chip").forEach((button) => {
    button.addEventListener("click", () => applySample(button.dataset.sample || "bloodbath"));
  });
  getButton("openRemote").addEventListener("click", () => {
    syncStateFromInputs();
    window.open(normalizeBaseUrl(state.baseUrl), "_blank", "noopener,noreferrer");
  });
  getButton("checkHealth").addEventListener("click", async () => runHealthCheck());
  getButton("runEnrich").addEventListener("click", async () => runEnrichRequest());
  getButton("copyResponse").addEventListener("click", async () => {
    await navigator.clipboard.writeText(elements.responseView.textContent || "");
    setStatus("ok", "Response copied");
  });
}

async function runHealthCheck(): Promise<void> {
  syncStateFromInputs();
  setStatus("info", "Checking health");
  presentResult("health", await requestRoute("/health", { method: "GET" }));
}

async function runEnrichRequest(): Promise<void> {
  syncStateFromInputs();
  setStatus("info", "Running enrich request");
  const payload = {
    query: state.query.trim(),
    player: {
      steamId: state.steamId.trim(),
      recentEvents: parseRecentEvents(state.recentEvents),
      conversationSummary: state.conversationSummary.trim() || undefined
    },
    session: { modeId: state.modeId.trim() || undefined, sessionId: state.sessionId.trim() || undefined }
  };
  presentResult("enrich", await requestRoute("/api/query/enrich", { method: "POST", body: JSON.stringify(payload) }), payload);
}

async function requestRoute(path: string, init: RequestInit): Promise<{ ok: boolean; status: number | null; url: string; contentType: string; data: unknown; reason?: string }> {
  const url = resolveRoute(path);
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json, text/plain;q=0.8, */*;q=0.5");
  if (init.body) headers.set("Content-Type", "application/json");
  if (state.authToken.trim()) headers.set("Authorization", `Bearer ${state.authToken.trim()}`);
  try {
    const response = await fetch(url, { ...init, headers, mode: state.transport === "direct" ? "cors" : "same-origin", credentials: state.transport === "direct" ? "omit" : "same-origin" });
    const contentType = response.headers.get("content-type") || "unknown";
    const rawText = await response.text();
    const htmlRedirectDetected = contentType.includes("text/html") || rawText.includes("__cookie_check.html") || rawText.includes("required security cookie") || rawText.includes("Authenticate in new window");
    if (htmlRedirectDetected) return { ok: false, status: response.status, url, contentType, data: rawText, reason: "The endpoint returned HTML for a cookie/auth flow instead of JSON." };
    let data: unknown = rawText;
    if (contentType.includes("application/json") || looksLikeJson(rawText)) data = rawText ? JSON.parse(rawText) : {};
    return { ok: response.ok, status: response.status, url, contentType, data, reason: response.ok ? undefined : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: null, url, contentType: "request-error", data: { message: error instanceof Error ? error.message : String(error) }, reason: "The browser could not complete the request. Usually CORS, a redirect during preflight, or a blocked auth cookie flow." };
  }
}

function presentResult(routeName: string, result: { ok: boolean; status: number | null; url: string; contentType: string; data: unknown; reason?: string }, payload?: unknown): void {
  const tone: StatusTone = result.ok ? "ok" : result.status === null ? "error" : result.status >= 400 ? "warn" : "info";
  setStatus(tone, result.ok ? `${routeName} succeeded` : `${routeName} needs attention`);
  elements.responseMeta.textContent = `${routeName.toUpperCase()} \u00b7 ${result.status ?? "network"} \u00b7 ${result.contentType}`;
  elements.responseView.textContent = formatJson({ route: routeName, url: result.url, status: result.status, contentType: result.contentType, reason: result.reason, requestPayload: payload, data: result.data });
  const diagnostics = [`Route: ${result.url}`, `Status: ${result.status ?? "network failure"}`, `Content-Type: ${result.contentType}`, result.reason || "No special warnings detected."];
  if (!result.ok && state.transport === "direct") diagnostics.push("Recommendation: try proxy mode for development, then move to a same-origin production API.");
  if (!result.ok && result.status === 401) diagnostics.push("The sidecar rejected the request. Supply the shared secret as a bearer token.");
  renderDiagnostics(diagnostics);
}

function applySample(sample: string): void {
  if (sample === "colosseum") {
    elements.modeId.value = "colosseum"; elements.sessionId.value = "colosseum_3001_demo";
    elements.query.value = "What should I change after losing the first round in Colosseum?";
    elements.recentEvents.value = "mode_started\nround_lost\nplayer_scored:duel_loss";
    elements.conversationSummary.value = "Player lost the opening duel and needs a tactical reset.";
  } else if (sample === "gauntlet") {
    elements.modeId.value = "gauntlet"; elements.sessionId.value = "gauntlet_4001_demo";
    elements.query.value = "How do I survive the next Gauntlet wave with low sustain?";
    elements.recentEvents.value = "mode_started\nwave_started:3\nwave_kill\nwave_kill";
    elements.conversationSummary.value = "Player is progressing through wave 3 with limited sustain.";
  } else {
    elements.modeId.value = "bloodbath"; elements.sessionId.value = "bloodbath_2002_demo";
    elements.query.value = "How should I approach the final circle in Bloodbath when two players are left?";
    elements.recentEvents.value = "mode_started\nplayer_scored:kill\nzone_shrink\nfinal_two";
    elements.conversationSummary.value = "Player is in Bloodbath late-game with shrinking arena pressure.";
  }
  syncStateFromInputs();
  saveState();
}

function updateRouteDiagnostics(): void {
  renderDiagnostics([
    `Mode: ${state.transport === "direct" ? "Direct browser" : "Local proxy"}`,
    `Resolved health route: ${resolveRoute("/health")}`,
    `Resolved enrich route: ${resolveRoute("/api/query/enrich")}`,
    state.transport === "proxy" ? "Proxy mode helps development, but it does not fix backend auth or cookie policy by itself." : "Direct mode is best only when the remote endpoint already allows browser auth and CORS."
  ]);
}

function renderDiagnostics(lines: string[]): void {
  elements.diagnostics.innerHTML = lines.map((line) => `<div class="diagnostic-row">${escapeHtml(line)}</div>`).join("");
}

function setStatus(tone: StatusTone, text: string): void {
  elements.statusPill.className = `pill ${tone}`;
  elements.statusPill.textContent = text;
}

function resolveRoute(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return state.transport === "proxy" ? `/battleluck-api${cleanPath}` : `${normalizeBaseUrl(state.baseUrl)}${cleanPath}`;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
}

function hydrateInputs(): void {
  elements.baseUrl.value = state.baseUrl;
  elements.authToken.value = state.authToken;
  elements.steamId.value = state.steamId;
  elements.modeId.value = state.modeId;
  elements.sessionId.value = state.sessionId;
  elements.query.value = state.query;
  elements.recentEvents.value = state.recentEvents;
  elements.conversationSummary.value = state.conversationSummary;
}

function syncStateFromInputs(): void {
  state.baseUrl = elements.baseUrl.value;
  state.authToken = elements.authToken.value;
  state.steamId = elements.steamId.value;
  state.modeId = elements.modeId.value;
  state.sessionId = elements.sessionId.value;
  state.query = elements.query.value;
  state.recentEvents = elements.recentEvents.value;
  state.conversationSummary = elements.conversationSummary.value;
}

function saveState(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    return { ...defaultState, ...(JSON.parse(raw) as Partial<SavedState>) };
  } catch { return { ...defaultState }; }
}

function parseRecentEvents(raw: string): string[] {
  return raw.split(/\r?\n/).map((e) => e.trim()).filter(Boolean);
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function formatJson(value: unknown): string { return JSON.stringify(value, null, 2); }

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function getInput(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Input ${id} not found`);
  return element;
}

function getTextArea(id: string): HTMLTextAreaElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLTextAreaElement)) throw new Error(`Textarea ${id} not found`);
  return element;
}

function getButton(id: string): HTMLButtonElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Button ${id} not found`);
  return element;
}

function getElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error(`Element ${id} not found`);
  return element;
}
