/**
 * Passo 1 — Autenticação TxLINE (monolítico)
 * Uso: npm run auth
 */
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import axios from "axios";
import bs58 from "bs58";
import dotenv from "dotenv";
import fs from "fs";
import nacl from "tweetnacl";
import path from "path";

dotenv.config();

const NETWORK = (process.env.NETWORK ?? "devnet") as "mainnet" | "devnet";

const CONFIG = {
  mainnet: {
    rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    apiOrigin: "https://txline.txodds.com",
    programId: new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"),
    txlTokenMint: new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"),
  },
  devnet: {
    rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    apiOrigin: "https://txline-dev.txodds.com",
    programId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    txlTokenMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
  },
} as const;

function loadKeypair(): Keypair {
  const raw = (process.env.WALLET_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? "").trim();
  if (!raw) throw new Error("WALLET_PRIVATE_KEY não configurada no .env");
  if (raw.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }
  return Keypair.fromSecretKey(bs58.decode(raw));
}

function parseLeagues(raw: string | undefined): number[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((v) => Number(v.trim()));
}

async function main(): Promise<void> {
  const { rpcUrl, apiOrigin, programId, txlTokenMint } = CONFIG[NETWORK];
  const apiBaseUrl = `${apiOrigin}/api`;
  const keypair = loadKeypair();
  const serviceLevelId = Number(process.env.SERVICE_LEVEL_ID ?? "1");
  const weeks = Number(process.env.DURATION_WEEKS ?? "4");
  const selectedLeagues = parseLeagues(process.env.SELECTED_LEAGUES);

  console.log(`🔐 Autenticação TxLINE (${NETWORK})`);
  console.log(`👛 Wallet: ${keypair.publicKey.toBase58()}`);

  const { data: authData } = await axios.post<{ token: string }>(
    `${apiOrigin}/auth/guest/start`
  );
  const jwt = authData.token;
  console.log("✅ JWT guest obtido");

  const idlPath = path.join(process.cwd(), "src/idl/txoracle.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new anchor.Program(idl as anchor.Idl, provider);
  if (!program.programId.equals(programId)) {
    throw new Error(
      `IDL (${program.programId.toBase58()}) não corresponde à rede ${NETWORK}`
    );
  }

  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    program.programId
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    txlTokenMint,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId
  );
  const userTokenAccount = getAssociatedTokenAddressSync(
    txlTokenMint,
    keypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  console.log("⛓️  Subscrevendo on-chain...");
  const txSig = await program.methods
    .subscribe(serviceLevelId, weeks)
    .accounts({
      user: keypair.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: txlTokenMint,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`✅ Subscribe confirmado: ${txSig}`);

  const message = `${txSig}:${selectedLeagues.join(",")}:${jwt}`;
  const signatureBytes = nacl.sign.detached(
    new TextEncoder().encode(message),
    keypair.secretKey
  );
  const walletSignature = Buffer.from(signatureBytes).toString("base64");

  const { data: activationData } = await axios.post<{ token?: string } | string>(
    `${apiBaseUrl}/token/activate`,
    { txSig, walletSignature, leagues: selectedLeagues },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );

  const apiToken =
    typeof activationData === "string" ? activationData : activationData.token;
  if (!apiToken) throw new Error("Resposta de ativação sem token");

  console.log("\n--- Credenciais TxLINE ---");
  console.log(`TXLINE_JWT=${jwt}`);
  console.log(`TXLINE_API_TOKEN=${apiToken}`);
  console.log("\nCopie os valores acima para o seu .env\n");
}

main().catch((err) => {
  console.error("❌ Falha na autenticação:", err.response?.data ?? err.message ?? err);
  process.exit(1);
});
