import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const stagePool = new Pool({
  // user: process.env.STAGE_DB_USER,
  // host: process.env.STAGE_DB_HOST,
  // database: process.env.STAGE_DB_NAME,
  // password: process.env.STAGE_DB_PASSWORD,
  // port: Number(process.env.STAGE_DB_PORT),
});

export const analysisPool = new Pool({
  user: process.env.ANALYSIS_DB_USER,
  host: process.env.ANALYSIS_DB_HOST,
  database: process.env.ANALYSIS_DB_NAME,
  password: process.env.ANALYSIS_DB_PASSWORD,
  port: Number(process.env.ANALYSIS_DB_PORT),
});

// export const supportedChains = [
//   "arbitrum_sepolia",
//   "base_sepolia",
//   "bitcoin_testnet",
//   "citrea_testnet",
//   "ethereum_sepolia",
//   "hyperliquid_testnet",
//   "monad_testnet",
//   "starknet_sepolia",
//   "bera_testnet"
// ];

export const supportedChains = [
  "arbitrum",
  "base",
  "bitcoin",
  "ethereum",
  "hyperliquid",
  "starknet",
  "bera",
];

export const ORDERS_TABLE = "orders_3"
// export const ORDERS_TABLE = "order_insights_final"