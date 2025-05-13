import { Pool } from 'pg';
import fetch from 'node-fetch';
import { Alchemy, Network } from 'alchemy-sdk';
import axios from 'axios';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Validate environment variables
const requiredEnvVars = [
  'ANALYSIS_DB_USER',
  'ANALYSIS_DB_HOST',
  'ANALYSIS_DB_NAME',
  'ANALYSIS_DB_PASSWORD',
  'ANALYSIS_DB_PORT',
  'ALCHEMY_TOKEN',
  'RPC_URL_CITREA_TESTNET',
  'RPC_URL_STARKNET_SEPOLIA',
  'RPC_URL_MONAD_TESTNET',
  'RPC_URL_HYPERLIQUID_TESTNET',
  'RPC_URL_BITCOIN_TESTNET'
];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Missing environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Pool for garden_interchain_analysis
const analysisPool = new Pool({
  user: process.env.ANALYSIS_DB_USER,
  host: process.env.ANALYSIS_DB_HOST,
  database: process.env.ANALYSIS_DB_NAME,
  password: process.env.ANALYSIS_DB_PASSWORD,
  port: Number(process.env.ANALYSIS_DB_PORT),
});

// Alchemy SDK instances for supported chains
const alchemyInstances = {
  ethereum_sepolia: new Alchemy({ apiKey: process.env.ALCHEMY_TOKEN, network: Network.ETH_SEPOLIA }),
  base_sepolia: new Alchemy({ apiKey: process.env.ALCHEMY_TOKEN, network: Network.BASE_SEPOLIA }),
};

// Citrea provider
const citreaProvider = new ethers.JsonRpcProvider(process.env.RPC_URL_CITREA_TESTNET);

// Supported chains
const supportedChains = [
  'arbitrum_sepolia',
  'base_sepolia',
  'bitcoin_testnet',
  'citrea_testnet',
  'ethereum_sepolia',
  'hyperliquid_testnet',
  'monad_testnet',
  'starknet_sepolia'
];
interface StarkNetRpcResponse {
  jsonrpc: string;
  id: number;
  result?: {
    timestamp: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

interface BlockInfo {
  height: number;
  timestamp: number;
}

interface MonadRpcResponse {
  jsonrpc: string;
  id: number;
  result?: {
    timestamp: string; // Hex string, e.g., "0x67d67075"
  };
  error?: {
    code: number;
    message: string;
  };
}
// Function to format timestamp to 2025-05-03 10:35:12.181+05:30 (IST)
const formatTimestampToIST = (timestampSeconds: number | null): string | null => {
  if (!timestampSeconds) return null;
  const date = new Date(timestampSeconds * 1000);
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);
  const istString = istDate.toISOString().replace('T', ' ').substring(0, 23) + '+05:30';
  return istString;
};

// Function to fetch timestamp for a block number based on the chain
const getTimestampForBlock = async (chain: string, blockNumber: number | null): Promise<number | null> => {
  if (!blockNumber) {
    console.warn(`Block number is null for chain ${chain}. Cannot fetch timestamp.`);
    return null;
  }

  let rpcChain = chain;
  if (['arbitrum_sepolia', 'ethereum_sepolia'].includes(chain)) {
    rpcChain = 'ethereum_sepolia';
  }

  if (['ethereum_sepolia', 'base_sepolia'].includes(rpcChain)) {
    try {
      const alchemy = alchemyInstances[rpcChain as keyof typeof alchemyInstances];
      const block = await alchemy.core.getBlock(Number(blockNumber));
      if (block && block.timestamp) {
        return block.timestamp;
      }
      console.log(`Block ${blockNumber} not found for chain ${rpcChain}`);
      return null;
    } catch (err:any) {
      console.error(`Error fetching block ${blockNumber} for chain ${rpcChain}:`, err.message);
      return null;
    }
  }


  if (rpcChain === 'starknet_sepolia') {
    try {
      const rpcUrl = `${process.env.RPC_URL_STARKNET_SEPOLIA}${process.env.ALCHEMY_TOKEN}`;
      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'starknet_getBlockWithTxs',
        params: [{ block_number: Number(blockNumber) }],
      };
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as StarkNetRpcResponse;
      if (data.error) {
        console.log(`RPC Error: ${data.error.message} (Code: ${data.error.code})`);
        return null;
      }
      if (data.result && data.result.timestamp) {
        return data.result.timestamp;
      }
      console.log(`Block ${blockNumber} not found for chain ${rpcChain}`);
      return null;
    } catch (err: any) {
      console.error(`Error fetching block ${blockNumber} for chain ${rpcChain}:`, err.message);
      return null;
    }
  }

  if (rpcChain === 'monad_testnet') {
    try {
      if (isNaN(Number(blockNumber))) {
        console.error(`Invalid block number: ${blockNumber}`);
        return null;
      }
      const rpcUrl = `${process.env.RPC_URL_MONAD_TESTNET}${process.env.ALCHEMY_TOKEN}`;
      const hexBlockNumber = '0x' + Number(blockNumber).toString(16);
      const payload = {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: [hexBlockNumber, false],
        id: 1,
      };
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error(`HTTP Error: ${res.status} ${res.statusText}`);
        return null;
      }
      const data = (await res.json()) as MonadRpcResponse; // Type cast to fix 'unknown'
      if (data.error) {
        console.log(`RPC Error: ${data.error.message} (Code: ${data.error.code})`);
        return null;
      }
      if (data.result && data.result.timestamp) {
        return parseInt(data.result.timestamp, 16); // Convert hex to integer
      }
      console.log(`Block ${blockNumber} not found for chain ${rpcChain}`);
      return null;
    } catch (err: any) { // Type err as Error to fix 'any'
      console.error(`Error fetching block ${blockNumber} for chain ${rpcChain}:`, err.message);
      return null;
    }
  }

  if (rpcChain === 'hyperliquid_testnet') {
    try {
      const rpcUrl = process.env.RPC_URL_HYPERLIQUID_TESTNET;
      if (!rpcUrl) {
        throw new Error('RPC_URL_HYPERLIQUID_TESTNET is not defined in .env');
      }
      const params = [`0x${Number(blockNumber).toString(16)}`, false];
      const response = await axios.post(rpcUrl, {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: params,
        id: 1,
      });
      const block = response.data.result;
      if (block && block.timestamp) {
        return parseInt(block.timestamp, 16);
      }
      console.log(`Block ${blockNumber} not found for chain ${rpcChain}`);
      return null;
    } catch (err:any) {
      console.error(`Error fetching block ${blockNumber} for chain ${rpcChain}:`, err.message);
      return null;
    }
  }

  if (rpcChain === 'citrea_testnet') {
    try {
      const block = await citreaProvider.getBlock(Number(blockNumber));
      if (block && block.timestamp) {
        return block.timestamp;
      }
      console.log(`Block ${blockNumber} not found for chain ${rpcChain}`);
      return null;
    } catch (err:any) {
      console.error(`Error fetching block ${blockNumber} for chain ${rpcChain}:`, err.message);
      return null;
    }
  }

  // Define only the properties you actually use

  
  if (rpcChain === 'bitcoin_testnet') {
    try {
      const baseUrl = process.env.RPC_URL_BITCOIN_TESTNET;
      if (!baseUrl) {
        throw new Error('RPC_URL_BITCOIN_TESTNET is not defined in .env');
      }
  
      const response = await fetch(`${baseUrl}/${blockNumber}`);
      // Tell TypeScript "this will be an array of BlockInfo"
      const data = (await response.json()) as BlockInfo[];
  
      // Now `.find` and `.timestamp` are fully typed
      const block = data.find(b => b.height === Number(blockNumber));
      if (block?.timestamp) {
        return block.timestamp;
      }
  
      console.log(
        `Block ${blockNumber} not found in the last 15 blocks for chain ${rpcChain}`
      );
      return null;
    } catch (err) {
      console.error(
        `Error fetching block ${blockNumber} for chain ${rpcChain}:`,
        (err as Error).message
      );
      return null;
    }
  }
  

  console.log(`Chain ${rpcChain} not supported for timestamp fetching`);
  return null;
};

// Function to update timestamps in orders_ts_null_dup1 for specific order IDs
export const updateTimestampsForOrders = async (orderIds: string[]): Promise<void> => {
  if (!orderIds || orderIds.length === 0) {
    console.log('No order IDs provided for timestamp update');
    return;
  }

  try {
    const query = `
      SELECT id, source_chain, destination_chain,
             user_init, cobi_init,
             user_redeem, cobi_redeem,
             user_refund, cobi_refund,
             user_init_block_number, cobi_init_block_number,
             user_redeem_block_number, user_refund_block_number,
             cobi_redeem_block_number, cobi_refund_block_number,
             create_order_id
      FROM orders_ts_null_dup1
      WHERE create_order_id = ANY($1)
        AND (
          (user_init_block_number IS NOT NULL AND user_init IS NULL) OR
          (user_redeem_block_number IS NOT NULL AND user_redeem IS NULL) OR
          (user_refund_block_number IS NOT NULL AND user_refund IS NULL) OR
          (cobi_init_block_number IS NOT NULL AND cobi_init IS NULL) OR
          (cobi_redeem_block_number IS NOT NULL AND cobi_redeem IS NULL) OR
          (cobi_refund_block_number IS NOT NULL AND cobi_refund IS NULL)
        )
    `;
    const result = await analysisPool.query(query, [orderIds]);
    console.log(`Found ${result.rowCount} rows in orders_ts_null_dup1 to update timestamps`);

    let successfulUpdates = 0;
    let failedUpdates: string[] = [];

    // Process orders in chunks to avoid overwhelming the API
    const chunkSize = 50; // Adjust based on API rate limits
    for (let i = 0; i < result.rows.length; i += chunkSize) {
      const chunk = result.rows.slice(i, i + chunkSize);
      const updatePromises = chunk.map(async (row: any) => {
        const { 
          id, source_chain, destination_chain,
          user_init, cobi_init,
          user_redeem, cobi_redeem,
          user_refund, cobi_refund,
          user_init_block_number, cobi_init_block_number,
          user_redeem_block_number, user_refund_block_number,
          cobi_redeem_block_number, cobi_refund_block_number,
          create_order_id
        } = row;

        let userInitTimestamp = user_init;
        let cobiInitTimestamp = cobi_init;
        let userRedeemTimestamp = user_redeem;
        let userRefundTimestamp = user_refund;
        let cobiRedeemTimestamp = cobi_redeem;
        let cobiRefundTimestamp = cobi_refund;

        const supportedChainsForFetch = [
          'ethereum_sepolia',
          'base_sepolia',
          'starknet_sepolia',
          'monad_testnet',
          'hyperliquid_testnet',
          'citrea_testnet',
          'bitcoin_testnet',
          'arbitrum_sepolia'
        ];

        const timestampPromises: Promise<void>[] = [];

        if (supportedChainsForFetch.includes(source_chain)) {
          if (user_init_block_number && !userInitTimestamp) {
            timestampPromises.push(
              getTimestampForBlock(source_chain, user_init_block_number).then(ts => {
                userInitTimestamp = ts ? formatTimestampToIST(ts) : null;
              })
            );
          }
          if (user_redeem_block_number && !userRedeemTimestamp) {
            timestampPromises.push(
              getTimestampForBlock(source_chain, user_redeem_block_number).then(ts => {
                userRedeemTimestamp = ts ? formatTimestampToIST(ts) : null;
              })
            );
          }
          if (user_refund_block_number && !userRefundTimestamp) {
            timestampPromises.push(
              getTimestampForBlock(source_chain, user_refund_block_number).then(ts => {
                userRefundTimestamp = ts ? formatTimestampToIST(ts) : null;
              })
            );
          }
        } else {
          console.warn(`Source chain ${source_chain} not supported for timestamp fetching for order ${create_order_id}`);
        }

        if (supportedChainsForFetch.includes(destination_chain)) {
          if (cobi_init_block_number && !cobiInitTimestamp) {
            timestampPromises.push(
              getTimestampForBlock(destination_chain, cobi_init_block_number).then(ts => {
                cobiInitTimestamp = ts ? formatTimestampToIST(ts) : null;
              })
            );
          }
          if (cobi_redeem_block_number && !cobiRedeemTimestamp) {
            timestampPromises.push(
              getTimestampForBlock(destination_chain, cobi_redeem_block_number).then(ts => {
                cobiRedeemTimestamp = ts ? formatTimestampToIST(ts) : null;
              })
            );
          }
          if (cobi_refund_block_number && !cobiRefundTimestamp) {
            timestampPromises.push(
              getTimestampForBlock(destination_chain, cobi_refund_block_number).then(ts => {
                cobiRefundTimestamp = ts ? formatTimestampToIST(ts) : null;
              })
            );
          }
        } else {
          console.warn(`Destination chain ${destination_chain} not supported for timestamp fetching for order ${create_order_id}`);
        }

        // Wait for all timestamp fetches for this order to complete
        await Promise.all(timestampPromises);

        const hasChanges = (
          (user_init_block_number && !user_init && userInitTimestamp) ||
          (cobi_init_block_number && !cobi_init && cobiInitTimestamp) ||
          (user_redeem_block_number && !user_redeem && userRedeemTimestamp) ||
          (user_refund_block_number && !user_refund && userRefundTimestamp) ||
          (cobi_redeem_block_number && !cobi_redeem && cobiRedeemTimestamp) ||
          (cobi_refund_block_number && !cobi_refund && cobiRefundTimestamp)
        );

        if (hasChanges) {
          const updateQuery = `
            UPDATE orders_ts_null_dup1
            SET user_init = $1::timestamp with time zone,
                cobi_init = $2::timestamp with time zone,
                user_redeem = $3::timestamp with time zone,
                user_refund = $4::timestamp with time zone,
                cobi_redeem = $5::timestamp with time zone,
                cobi_refund = $6::timestamp with time zone
            WHERE id = $7
          `;
          await analysisPool.query(updateQuery, [
            userInitTimestamp,
            cobiInitTimestamp,
            userRedeemTimestamp,
            userRefundTimestamp,
            cobiRedeemTimestamp,
            cobiRefundTimestamp,
            id,
          ]);
          console.log(`Updated timestamps for order ${create_order_id} (id=${id}): user_init=${userInitTimestamp}, cobi_init=${cobiInitTimestamp}, user_redeem=${userRedeemTimestamp}, user_refund=${userRefundTimestamp}, cobi_redeem=${cobiRedeemTimestamp}, cobi_refund=${cobiRefundTimestamp}`);
          successfulUpdates++;
        } else {
          console.warn(`No timestamps updated for order ${create_order_id} (id=${id}): all timestamps are either already set or could not be fetched.`);
          failedUpdates.push(create_order_id);
        }
      });

      // Process the chunk concurrently
      await Promise.all(updatePromises);
    }

    console.log(`Timestamp update completed: ${successfulUpdates} orders updated successfully, ${failedUpdates.length} orders failed.`);
    if (failedUpdates.length > 0) {
      console.log(`Failed orders: ${failedUpdates.join(', ')}`);
    }
  } catch (err) {
    console.error('Error updating timestamps in orders_ts_null_dup1:', err);
    throw err;
  }
};