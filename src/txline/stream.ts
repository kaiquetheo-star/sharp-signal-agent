import { EventSource } from "eventsource";

export interface OddsStreamPayload {
  FixtureId: number;
  SuperOddsType: string;
  MarketPeriod?: string;
  PriceNames?: string[];
  Prices?: number[];
  Ts?: number;
  Bookmaker?: string;
  InRunning?: boolean;
  [key: string]: unknown;
}

export type OddsMessageHandler = (payload: OddsStreamPayload) => void | Promise<void>;
export type AuthRefreshHandler = () => Promise<{ jwt: string; apiToken: string }>;

export interface OddsStreamOptions {
  baseUrl: string;
  jwt: string;
  apiToken: string;
  /** Optional filter for a single fixture */
  fixtureId?: number;
  onMessage: OddsMessageHandler;
  /** Called on 401/403 so the agent can refresh guest JWT / API token */
  onAuthRefresh?: AuthRefreshHandler;
  onError?: (err: Error) => void;
  onConnected?: () => void;
}

const CLOSED = 2;
const BACKOFF_MS = [3000, 6000, 12000];

/**
 * TxLINE odds SSE client with Last-Event-ID resume and exponential reconnect.
 * Endpoint: GET {baseUrl}/odds/stream
 */
export class OddsStream {
  private eventSource: EventSource | null = null;
  private lastSeenId: string | undefined;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private jwt: string;
  private apiToken: string;
  private authRefreshing = false;

  constructor(private readonly options: OddsStreamOptions) {
    this.jwt = options.jwt;
    this.apiToken = options.apiToken;
  }

  connect(): void {
    this.stopped = false;
    this.open();
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.eventSource?.close();
    this.eventSource = null;
  }

  updateCredentials(jwt: string, apiToken: string): void {
    this.jwt = jwt;
    this.apiToken = apiToken;
  }

  get lastEventId(): string | undefined {
    return this.lastSeenId;
  }

  private streamUrl(): string {
    const url = new URL(`${this.options.baseUrl.replace(/\/$/, "")}/odds/stream`);
    if (this.options.fixtureId !== undefined) {
      url.searchParams.set("fixtureId", String(this.options.fixtureId));
    }
    return url.toString();
  }

  private open(): void {
    if (this.stopped) return;

    this.eventSource?.close();

    const streamUrl = this.streamUrl();
    this.eventSource = new EventSource(streamUrl, {
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("Accept-Encoding", "deflate");
        headers.set("Authorization", `Bearer ${this.jwt}`);
        headers.set("X-Api-Token", this.apiToken);
        if (this.lastSeenId) {
          headers.set("Last-Event-ID", this.lastSeenId);
        }

        const response = await fetch(input, { ...init, headers });

        if (response.status === 401 || response.status === 403) {
          await this.handleAuthFailure(response.status);
          throw new Error(`SSE auth failed: HTTP ${response.status}`);
        }

        if (!response.ok) {
          throw new Error(`SSE connect failed: HTTP ${response.status}`);
        }

        return response;
      },
    });

    this.eventSource.onopen = () => {
      this.reconnectAttempt = 0;
      console.log("🔌 SSE stream conectado");
      this.options.onConnected?.();
    };

    this.eventSource.onmessage = (event) => {
      if (event.lastEventId) {
        this.lastSeenId = event.lastEventId;
      }

      if (!event.data || event.data === "[DONE]") return;

      try {
        const parsed = JSON.parse(event.data) as OddsStreamPayload | OddsStreamPayload[];
        const records = Array.isArray(parsed) ? parsed : [parsed];
        for (const record of records) {
          if (typeof record?.FixtureId !== "number") continue;
          void Promise.resolve(this.options.onMessage(record)).catch((err) => {
            console.error("⚠️  Erro ao processar evento SSE:", err);
          });
        }
      } catch (err) {
        console.warn("⚠️  Evento SSE inválido (ignorado):", String(event.data).slice(0, 120));
      }
    };

    this.eventSource.addEventListener("heartbeat", (event) => {
      const msg = event as MessageEvent;
      if (msg.lastEventId) this.lastSeenId = msg.lastEventId;
    });

    this.eventSource.onerror = () => {
      const state = this.eventSource?.readyState;
      const err = new Error(
        state === CLOSED
          ? "SSE conexão fechada"
          : "SSE erro de conexão"
      );
      this.options.onError?.(err);

      if (this.stopped) return;

      if (state === CLOSED || state === undefined) {
        this.eventSource?.close();
        this.eventSource = null;
        this.scheduleReconnect();
      }
    };
  }

  private async handleAuthFailure(status: number): Promise<void> {
    if (!this.options.onAuthRefresh || this.authRefreshing) {
      console.error(`❌ SSE HTTP ${status}: credenciais inválidas (sem handler de refresh)`);
      return;
    }

    this.authRefreshing = true;
    try {
      console.warn(`🔄 SSE HTTP ${status} — renovando credenciais TxLINE...`);
      const next = await this.options.onAuthRefresh();
      this.updateCredentials(next.jwt, next.apiToken);
      console.log("✅ Credenciais SSE atualizadas");
    } catch (err) {
      console.error("❌ Falha ao renovar JWT/API token:", err);
    } finally {
      this.authRefreshing = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;

    const delay =
      BACKOFF_MS[Math.min(this.reconnectAttempt, BACKOFF_MS.length - 1)];
    this.reconnectAttempt += 1;

    console.warn(
      `♻️  Reconectando SSE em ${delay / 1000}s (tentativa ${this.reconnectAttempt})...`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }
}
