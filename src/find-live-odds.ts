// src/find-live-odds.ts
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function findLiveOdds() {
  console.log("🤖 Buscando fixture com odds disponíveis...\n");
  
  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  const baseURL = "https://txline-dev.txodds.com/api";

  if (!jwt || !apiToken) {
    throw new Error("❌ Credenciais não encontradas no .env");
  }

  const api = axios.create({
    baseURL,
    headers: { 
      "Authorization": `Bearer ${jwt}`, 
      "X-Api-Token": apiToken,
    },
    timeout: 10000,
  });

  // 1. Buscar TODOS os fixtures
  console.log("📋 Buscando todos os fixtures...\n");
  
  let fixtures: any[] = [];
  try {
    const fixturesRes = await api.get("/fixtures/snapshot");
    fixtures = Array.isArray(fixturesRes.data) ? fixturesRes.data : [];
    console.log(`✅ ${fixtures.length} fixtures encontrados\n`);
  } catch (err: any) {
    console.error("❌ Erro ao buscar fixtures:", err.message);
    return;
  }

  // 2. Testar cada fixture até encontrar um com odds
  console.log("🔍 Testando odds para cada fixture...\n");
  
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const fixtureId = fixture.FixtureId;
    const teams = `${fixture.Participant1} vs ${fixture.Participant2}`;
    
    console.log(`[${i + 1}/${fixtures.length}] Testando: ${teams} (ID: ${fixtureId})`);
    
    try {
      const oddsRes = await api.get(`/odds/snapshot/${fixtureId}`);
      const odds = Array.isArray(oddsRes.data) ? oddsRes.data : [];
      
      if (odds.length > 0) {
        console.log(`\n✅✅✅ ODDS ENCONTRADAS! ✅✅✅`);
        console.log(`Fixture: ${teams}`);
        console.log(`FixtureId: ${fixtureId}`);
        console.log(`Status: ${oddsRes.status}`);
        console.log(`📊 ${odds.length} registro(s) de odds\n`);
        
        console.log("🔍 ================================================");
        console.log("🔍 ESTRUTURA DO PRIMEIRO REGISTRO DE ODD:");
        console.log(JSON.stringify(odds[0], null, 2));
        console.log("🔍 ================================================\n");
        
        // Se tiver mais de um, mostrar o segundo também
        if (odds.length > 1) {
          console.log("🔍 SEGUNDO REGISTRO (para comparação):");
          console.log(JSON.stringify(odds[1], null, 2));
          console.log("");
        }
        
        console.log("🎉 ENDPOINT DE ODDS FUNCIONANDO!");
        console.log(`📌 Use: GET /odds/snapshot/${fixtureId}`);
        return;
      } else {
        console.log(`   ⚠️  Sem odds (array vazio)`);
      }
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 404) {
        console.log(`   ❌ 404`);
      } else {
        console.log(`   ⚠️  Status: ${status}`);
      }
    }
  }

  console.log("\n❌ Nenhum fixture tem odds disponíveis no momento.");
  console.log("\n💡 POSSÍVEIS CAUSAS:");
  console.log("   1. O Free Tier Devnet só tem fixtures, não odds");
  console.log("   2. Os jogos disponíveis não têm mercados de odds ativos");
  console.log("   3. As odds só estão disponíveis via SSE stream");
  
  console.log("\n💡 PRÓXIMO PASSO: Testar SSE stream /odds/stream");
}

findLiveOdds().catch(console.error);