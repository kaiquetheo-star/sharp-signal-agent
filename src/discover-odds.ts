// src/discover-odds.ts
import axios from "axios";
import dotenv from "dotenv";
import * as yaml from "js-yaml";

dotenv.config();

async function discoverOddsEndpoints() {
  console.log("🤖 Descobrindo endpoints de Odds via OpenAPI spec...\n");
  
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

  // ============================================
  // PASSO 1: Baixar OpenAPI spec
  // ============================================
  console.log("📚 Buscando OpenAPI spec...\n");
  
  let openApiSpec: any = null;
  const specEndpoints = ["/docs.yaml", "/docs/docs.yaml", "/openapi.yaml", "/swagger.yaml"];
  
  for (const endpoint of specEndpoints) {
    try {
      const response = await api.get(endpoint);
      console.log(`✅ OpenAPI spec encontrado: ${endpoint}`);
      
      // Parsear YAML
      openApiSpec = yaml.load(response.data);
      break;
    } catch (err: any) {
      if (err.response?.status !== 404) {
        console.log(`⚠️  ${endpoint} - Status: ${err.response?.status}`);
      }
    }
  }

  if (!openApiSpec) {
    console.log("❌ Não foi possível baixar o OpenAPI spec");
    console.log("💡 Tentando testar endpoints baseados no padrão de scores...\n");
  } else {
    // ============================================
    // PASSO 2: Extrair endpoints de odds do spec
    // ============================================
    console.log("\n🔍 Extraindo endpoints de odds do OpenAPI spec...\n");
    
    const paths = openApiSpec.paths || {};
    const oddsEndpoints: string[] = [];
    
    for (const [path, methods] of Object.entries(paths)) {
      if (path.includes('odds') || path.includes('Odds')) {
        oddsEndpoints.push(path);
        console.log(`✅ Encontrado: ${path}`);
      }
    }
    
    console.log(`\n📊 Total de endpoints de odds: ${oddsEndpoints.length}\n`);
    
    // Mostrar detalhes de cada endpoint
    for (const path of oddsEndpoints.slice(0, 10)) {
      const methods = paths[path];
      console.log(`\n📌 ${path}:`);
      for (const [method, details] of Object.entries(methods as any)) {
        const summary = (details as any).summary || 'Sem descrição';
        console.log(`   ${method.toUpperCase()}: ${summary}`);
      }
    }
  }

  // ============================================
  // PASSO 3: Buscar fixtureId válido
  // ============================================
  console.log("\n📋 Buscando FixtureId válido...\n");
  
  let fixtureId: string | null = null;
  try {
    const fixturesRes = await api.get("/fixtures/snapshot");
    const fixtures = Array.isArray(fixturesRes.data) ? fixturesRes.data : [];
    if (fixtures.length > 0) {
      fixtureId = String(fixtures[0].FixtureId);
      console.log(`✅ FixtureId: ${fixtureId}\n`);
    }
  } catch (err: any) {
    console.log("⚠️ Não foi possível obter FixtureId\n");
  }

  // ============================================
  // PASSO 4: Testar endpoints de odds
  // ============================================
  console.log("🧪 Testando endpoints de odds...\n");
  
  const endpointsToTest = [
    // Baseado no padrão de scores
    `/odds/snapshot/${fixtureId}`,
    `/odds/snapshot`,
    `/odds/stream`,
    `/odds/updates`,
    
    // Variações comuns
    `/v1/odds/snapshot/${fixtureId}`,
    `/odds/${fixtureId}`,
    `/fixtures/${fixtureId}/odds`,
  ];

  // Se temos o spec, adicionar endpoints do spec
  if (openApiSpec) {
    const paths = openApiSpec.paths || {};
    for (const path of Object.keys(paths)) {
      if (path.includes('odds')) {
        // Substituir parâmetros de path
        const testPath = path.replace(/\{[^}]+\}/g, fixtureId || '18143850');
        if (!endpointsToTest.includes(testPath)) {
          endpointsToTest.push(testPath);
        }
      }
    }
  }

  for (const endpoint of endpointsToTest) {
    try {
      const response = await api.get(endpoint);
      
      console.log(`\n✅✅✅ SUCESSO! ✅✅✅`);
      console.log(`Endpoint: ${endpoint}`);
      console.log(`Status: ${response.status}\n`);
      
      const data = response.data;
      let records = [];
      
      if (Array.isArray(data)) {
        records = data;
      } else if (typeof data === 'object' && data !== null) {
        for (const key of Object.keys(data)) {
          if (Array.isArray(data[key]) && data[key].length > 0) {
            records = data[key];
            console.log(`📦 Dados na chave: ${key}`);
            break;
          }
        }
      }
      
      if (records.length > 0) {
        console.log(`📊 ${records.length} registro(s)\n`);
        console.log("🔍 PRIMEIRO REGISTRO:");
        console.log(JSON.stringify(records[0], null, 2));
        console.log("\n🎉 ENDPOINT DE ODDS ENCONTRADO!\n");
        return;
      } else {
        console.log("⚠️ Resposta vazia. Estrutura completa:");
        console.log(JSON.stringify(data, null, 2).substring(0, 1000));
      }
      
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 404) {
        console.log(`❌ 404: ${endpoint}`);
      } else if (status) {
        console.log(`⚠️  ${endpoint} - Status: ${status}`);
        if (err.response?.data) {
          console.log(`   Error: ${JSON.stringify(err.response.data).substring(0, 200)}`);
        }
      }
    }
  }

  console.log("\n❌ Nenhum endpoint de odds respondeu com dados válidos.");
  console.log("\n💡 PRÓXIMO PASSO: Testar SSE stream via EventSource");
}

discoverOddsEndpoints().catch(console.error);