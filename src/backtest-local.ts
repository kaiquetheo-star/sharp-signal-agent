import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();

async function analyzeOnChainSignals() {
  console.log("📊 Analisando sinais on-chain do Sharp Signal Agent...\n");
  
  const secretKey = process.env.WALLET_PRIVATE_KEY || process.env.PRIVATE_KEY;
  const keypair = bs58.decode(secretKey!);
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  const walletPubkey = new PublicKey(keypair.slice(-32));
  
  // Busca as últimas 100 transações da carteira
  const signatures = await connection.getSignaturesForAddress(walletPubkey, { limit: 100 });
  
  let totalSignals = 0;
  const signalsByFixture = new Map<string, number>();
  const signalsByMarket = new Map<string, number>();
  
  for (const sig of signatures) {
    const tx = await connection.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx) continue;
    
    // Procura por instruções do Memo Program
    for (const ix of tx.transaction.message.compiledInstructions) {
      // Memo Program ID
      if (tx.transaction.message.staticAccountKeys[ix.programIdIndex].toBase58() === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr") {
        const memoData = Buffer.from(ix.data).toString("utf-8");
        try {
          const signal = JSON.parse(memoData);
          if (signal.agent === "SharpSignalAgent") {
            totalSignals++;
            signalsByFixture.set(signal.f, (signalsByFixture.get(signal.f) || 0) + 1);
            signalsByMarket.set(signal.m, (signalsByMarket.get(signal.m) || 0) + 1);
          }
        } catch {}
      }
    }
  }
  
  console.log(`🎯 Total de sinais registrados on-chain: ${totalSignals}\n`);
  console.log("📋 Sinais por Fixture:");
  for (const [fixture, count] of signalsByFixture) {
    console.log(`   ${fixture}: ${count} sinal(is)`);
  }
  
  console.log("\n📊 Sinais por Mercado:");
  for (const [market, count] of signalsByMarket) {
    console.log(`   ${market}: ${count} sinal(is)`);
  }
}

analyzeOnChainSignals().catch(console.error);