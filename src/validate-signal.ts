// src/validate-signal.ts
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function validateSignal(fixtureId: string, signalTime: number) {
  const api = axios.create({
    baseURL: "https://txline-dev.txodds.com/api",
    headers: {
      "Authorization": `Bearer ${process.env.TXLINE_JWT}`,
      "X-Api-Token": process.env.TXLINE_API_TOKEN,
    },
  });

  console.log(`🔍 Validando sinal do fixture ${fixtureId}...\n`);
  
  // Buscar resultado final
  try {
    const scoresRes = await api.get(`/scores/snapshot/${fixtureId}`);
    const scores = scoresRes.data;
    
    console.log("📊 Resultado do jogo:");
    console.log(JSON.stringify(scores, null, 2));
    
    // Análise simples
    if (scores && scores.length > 0) {
      const finalScore = scores[scores.length - 1];
      console.log(`\n✅ Sinal detectado em: ${new Date(signalTime).toISOString()}`);
      console.log(`🏆 Placar final: ${finalScore.Score1 || 0} x ${finalScore.Score2 || 0}`);
    }
  } catch (err: any) {
    console.log("⚠️ Jogo ainda não finalizou ou sem dados de scores");
  }
}

// Uso: npx tsx src/validate-signal.ts 18193785 1783379788214
const fixtureId = process.argv[2];
const signalTime = parseInt(process.argv[3]);

if (!fixtureId || !signalTime) {
  console.log("Uso: npx tsx src/validate-signal.ts <fixtureId> <timestamp>");
  process.exit(1);
}

validateSignal(fixtureId, signalTime);