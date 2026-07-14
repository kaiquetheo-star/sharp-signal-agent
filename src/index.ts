// src/index.ts
import axios from "axios";
import dotenv from "dotenv";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { OddsStream, type OddsStreamPayload } from "./txline/stream";
import { persistAndBroadcast, startDashboardServer } from "./api/dashboard-server";
import { SharpDetector, type SharpSignal } from "./agent/detector";

dotenv.config();

const NETWORK = (process.env.NETWORK || "devnet") as "mainnet" | "devnet";
const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  (NETWORK === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");
const API_ORIGIN =
  NETWORK === "mainnet" ? "https://txline.txodds.com" : "https://txline-dev.txodds.com";
const BASE_URL = `${API_ORIGIN}/api`;
const USE_SSE = (process.env.USE_SSE ?? "true").toLowerCase() !== "false";

// ==========================================
// 1. MOTOR DE ANOMALIAS — ver src/agent/detector.ts
// ==========================================

// ==========================================
// 2. REGISTRO ON-CHAIN (Memo Program)
// ==========================================
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/** Serializa envios on-chain para evitar 429 no RPC público */
let onChainQueue: Promise<unknown> = Promise.resolve();

function enqueueOnChain<T>(task: () => Promise<T>): Promise<T> {
  const run = onChainQueue.then(task, task);
  onChainQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function logSignalOnChain(
  signal: SharpSignal,
  keypair: Keypair,
  connection: Connection
): Promise<string | null> {
  try {
    const memoText = JSON.stringify({
      agent: "SharpSignalAgent",
      f: signal.fixtureId,
      m: signal.market,
      o: signal.outcome,
      p: signal.currentPrice,
      avg: signal.averagePrice.toFixed(4),
      d: signal.deviationPercent,
      t: signal.timestamp,
    });

    const memoInstruction = new TransactionInstruction({
      keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: true }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memoText, "utf-8"),
    });

    const tx = new Transaction().add(memoInstruction);
    const signature = await connection.sendTransaction(tx, [keypair]);
    await connection.confirmTransaction(signature, "confirmed");

    console.log(`🔗 SINAL REGISTRADO ON-CHAIN!`);
    console.log(`   📝 Memo: ${memoText}`);
    const clusterQs = NETWORK === "mainnet" ? "" : "?cluster=devnet";
    console.log(`   🔍 Explorer: https://explorer.solana.com/tx/${signature}${clusterQs}\n`);
    return signature;
  } catch (err: any) {
    console.error("❌ Erro ao registrar on-chain:", err.message);
    return null;
  }
}

// ==========================================
// 3. Helpers compartilhados (SSE + polling)
// ==========================================
function resolveTeams(
  fixtureId: string,
  fixtureNames: Map<string, string>
): string {
  return fixtureNames.get(fixtureId) ?? `Fixture ${fixtureId}`;
}

async function processOddsRecord(
  oddRecord: OddsStreamPayload,
  detector: SharpDetector,
  fixtureNames: Map<string, string>,
  keypair: Keypair,
  connection: Connection
): Promise<number> {
  const fixtureId = String(oddRecord.FixtureId);
  const market = `${oddRecord.SuperOddsType}${
    oddRecord.MarketPeriod ? `_${oddRecord.MarketPeriod}` : ""
  }`;
  const priceNames = oddRecord.PriceNames || [];
  const prices = oddRecord.Prices || [];
  let signals = 0;

  for (let i = 0; i < priceNames.length; i++) {
    const outcome = priceNames[i];
    const rawPrice = prices[i];
    if (typeof rawPrice !== "number") continue;

    const price = rawPrice / 1000;
    const signal = detector.analyze(fixtureId, market, outcome, price);
    if (!signal) continue;

    const teams = resolveTeams(fixtureId, fixtureNames);
    console.log(`\n🚨 SHARP SIGNAL DETECTADO!`);
    console.log(`   🏟️  Jogo: ${teams}`);
    console.log(`   📊 Mercado: ${market}`);
    console.log(`   🎯 Outcome: ${outcome}`);
    console.log(`   💰 Preço Atual: ${price.toFixed(3)}`);
    console.log(`   📈 Média: ${signal.averagePrice.toFixed(3)}`);
    console.log(`   ⚡ Desvio: ${signal.deviationPercent}%\n`);

    signals++;
    // Persiste/broadcast imediato (dashboard); tx on-chain em fila serial
    const pendingId = `${signal.timestamp}-${fixtureId}-${outcome}`;
    persistAndBroadcast({
      id: pendingId,
      type: signal.type,
      fixtureId: signal.fixtureId,
      market: signal.market,
      outcome: signal.outcome,
      currentPrice: signal.currentPrice,
      averagePrice: signal.averagePrice,
      deviationPercent: signal.deviationPercent,
      timestamp: signal.timestamp,
      teams,
    });

    void enqueueOnChain(async () => {
      const txSignature = await logSignalOnChain(signal, keypair, connection);
      if (!txSignature) return;
      const clusterQs = NETWORK === "mainnet" ? "" : "?cluster=devnet";
      persistAndBroadcast({
        id: pendingId,
        type: signal.type,
        fixtureId: signal.fixtureId,
        market: signal.market,
        outcome: signal.outcome,
        currentPrice: signal.currentPrice,
        averagePrice: signal.averagePrice,
        deviationPercent: signal.deviationPercent,
        timestamp: signal.timestamp,
        teams,
        txSignature,
        explorerUrl: `https://explorer.solana.com/tx/${txSignature}${clusterQs}`,
      });
    });
  }

  return signals;
}

async function refreshGuestJwt(): Promise<string> {
  const { data } = await axios.post<{ token: string }>(
    `${API_ORIGIN}/auth/guest/start`
  );
  return data.token;
}

async function loadFixtureNames(
  api: ReturnType<typeof axios.create>
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data } = await api.get("/fixtures/snapshot");
    const fixtures = Array.isArray(data) ? data : [];
    for (const f of fixtures) {
      map.set(String(f.FixtureId), `${f.Participant1} vs ${f.Participant2}`);
    }
    console.log(`📋 Cache de fixtures: ${map.size} jogo(s)`);
  } catch (err: any) {
    console.warn("⚠️  Não foi possível carregar nomes de fixtures:", err.message);
  }
  return map;
}

// ==========================================
// 4. Modo polling (fallback)
// ==========================================
function startPolling(params: {
  api: ReturnType<typeof axios.create>;
  detector: SharpDetector;
  fixtureNames: Map<string, string>;
  keypair: Keypair;
  connection: Connection;
}): void {
  const { api, detector, fixtureNames, keypair, connection } = params;
  const pollInterval = 15_000;

  console.log("📡 Modo polling ativo (intervalo 15s)");

  const tick = async () => {
    try {
      console.log(`\n[${new Date().toISOString()}] 🔄 Tick do agente...`);

      const fixturesRes = await api.get("/fixtures/snapshot");
      const fixtures = Array.isArray(fixturesRes.data) ? fixturesRes.data : [];

      for (const fixture of fixtures) {
        fixtureNames.set(
          String(fixture.FixtureId),
          `${fixture.Participant1} vs ${fixture.Participant2}`
        );
      }

      console.log(`📋 ${fixtures.length} fixture(s) encontrado(s)`);

      let totalOdds = 0;
      let signalsCount = 0;

      for (const fixture of fixtures) {
        const fixtureId = String(fixture.FixtureId);

        try {
          const oddsRes = await api.get(`/odds/snapshot/${fixtureId}`);
          const odds = Array.isArray(oddsRes.data) ? oddsRes.data : [];
          if (odds.length === 0) continue;

          totalOdds += odds.length;

          for (const oddRecord of odds) {
            signalsCount += await processOddsRecord(
              oddRecord,
              detector,
              fixtureNames,
              keypair,
              connection
            );
          }
        } catch (err: any) {
          if (err.response?.status !== 404) {
            console.error(
              `⚠️  Erro ao buscar odds de ${fixtureId}:`,
              err.message
            );
          }
        }
      }

      console.log(`\n📊 Resumo do tick:`);
      console.log(`   📋 Fixtures analisados: ${fixtures.length}`);
      console.log(`   💹 Registros de odds: ${totalOdds}`);
      console.log(`   🚨 Sinais detectados: ${signalsCount}`);
    } catch (error: any) {
      console.error("❌ Erro no tick:", error.response?.data || error.message);
    }
  };

  void tick();
  setInterval(tick, pollInterval);
}

// ==========================================
// 5. Modo SSE (+ fallback automático)
// ==========================================
async function startSseWithFallback(params: {
  api: ReturnType<typeof axios.create>;
  detector: SharpDetector;
  fixtureNames: Map<string, string>;
  keypair: Keypair;
  connection: Connection;
  jwt: string;
  apiToken: string;
}): Promise<void> {
  const { api, detector, fixtureNames, keypair, connection } = params;
  let jwt = params.jwt;
  let apiToken = params.apiToken;
  let fellBackToPolling = false;
  let eventCount = 0;
  let stream: OddsStream;

  const fallbackToPolling = (reason: string) => {
    if (fellBackToPolling) return;
    fellBackToPolling = true;
    clearTimeout(connectWatchdog);
    console.warn(`⚠️  SSE indisponível (${reason}) — caindo para polling`);
    stream.disconnect();
    startPolling({ api, detector, fixtureNames, keypair, connection });
  };

  const connectWatchdog = setTimeout(() => {
    if (eventCount === 0 && !fellBackToPolling) {
      fallbackToPolling("timeout de conexão / sem eventos");
    }
  }, 20_000);

  stream = new OddsStream({
    baseUrl: BASE_URL,
    jwt,
    apiToken,
    onConnected: () => {
      clearTimeout(connectWatchdog);
    },
    onAuthRefresh: async () => {
      jwt = await refreshGuestJwt();
      process.env.TXLINE_JWT = jwt;
      return { jwt, apiToken };
    },
    onMessage: async (payload) => {
      eventCount++;
      if (eventCount === 1) clearTimeout(connectWatchdog);
      if (eventCount === 1 || eventCount % 50 === 0) {
        console.log(
          `⚡ SSE evento #${eventCount} · fixture ${payload.FixtureId} · ${payload.SuperOddsType}`
        );
      }
      await processOddsRecord(
        payload,
        detector,
        fixtureNames,
        keypair,
        connection
      );
    },
    onError: (err) => {
      console.warn("⚠️  SSE:", err.message);
    },
  });

  stream.connect();

  setInterval(() => {
    void loadFixtureNames(api).then((next) => {
      for (const [id, name] of next) fixtureNames.set(id, name);
    });
  }, 5 * 60_000);

  process.on("SIGINT", () => {
    clearTimeout(connectWatchdog);
    stream.disconnect();
    process.exit(0);
  });
}

// ==========================================
// 6. Entry point
// ==========================================
async function runAgent() {
  console.log("🤖 Iniciando Sharp Signal Agent (Track 1 - TxLINE Hackathon)...\n");

  let jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;

  if (!jwt || !apiToken) {
    throw new Error("❌ Credenciais TxLINE não encontradas no .env");
  }

  const secretKey = process.env.WALLET_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!secretKey) throw new Error("❌ Chave privada não encontrada no .env");

  const keypair = Keypair.fromSecretKey(bs58.decode(secretKey));
  const connection = new Connection(RPC_URL, "confirmed");
  process.env.DASHBOARD_WALLET = keypair.publicKey.toBase58();

  console.log(`🔑 Carteira do Agente: ${keypair.publicKey.toBase58()}`);
  console.log(`🌐 Rede: ${NETWORK}`);
  console.log(`📡 Endpoint: ${BASE_URL}`);
  console.log(`🔌 Transporte: ${USE_SSE ? "SSE (com fallback polling)" : "polling"}\n`);

  startDashboardServer();

  const api = axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": apiToken,
    },
    timeout: 10_000,
  });

  const detector = new SharpDetector();
  const fixtureNames = await loadFixtureNames(api);

  if (USE_SSE) {
    await startSseWithFallback({
      api,
      detector,
      fixtureNames,
      keypair,
      connection,
      jwt,
      apiToken,
    });
  } else {
    startPolling({ api, detector, fixtureNames, keypair, connection });
  }
}

runAgent().catch(console.error);
