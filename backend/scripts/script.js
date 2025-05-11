import { Pool } from 'pg';
import fetch from 'node-fetch';
import { Alchemy, Network } from 'alchemy-sdk';
import axios from 'axios';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import cron from 'node-cron'; // Added for cron scheduling

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

// Function to format timestamp to 2025-05-03 10:35:12.181+05:30 (IST)
const formatTimestampToIST = (timestampSeconds) => {
  if (!timestampSeconds) return null;
  const date = new Date(timestampSeconds * 1000);
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);
  const istString = istDate.toISOString().replace('T', ' ').substring(0, 23) + '+05:30';
  return istString;
};

// Function to fetch timestamp for a block number based on the chain
const getTimestampForBlock = async (chain, blockNumber) => {
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
      const alchemy = alchemyInstances[rpcChain];
      const block = await alchemy.core.getBlock(Number(blockNumber));
      if (block && block.timestamp) {
        return block.timestamp;
      }
      console.log(`Block ${blockNumber} not found for chain ${rpcChain}`);
      return null;
    } catch (err) {
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
      const data = await res.json();
      if (data.result && data.result.timestamp) {
        return data.result.timestamp;
      }
      console.log(`Block ${blockNumber} not found for chain ${rpcChain}`);
      return null;
    } catch (err) {
      console.error(`Error fetching block ${blockNumber} for chain ${rpcChain}:`, err.message);
      return null;
    }
  }

  if (rpcChain === 'monad_testnet') {
    try {
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
      const data = await res.json();
      if (data.result && data.result.timestamp) {
        return parseInt(data.result.timestamp, 16);
      }
      console.log(`Block ${blockNumber} not found for chain ${rpcChain}`);
      return null;
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
      console.error(`Error fetching block ${blockNumber} for chain ${rpcChain}:`, err.message);
      return null;
    }
  }

  if (rpcChain === 'bitcoin_testnet') {
    try {
      const baseUrl = process.env.RPC_URL_BITCOIN_TESTNET;
      if (!baseUrl) {
        throw new Error('RPC_URL_BITCOIN_TESTNET is not defined in .env');
      }
      const response = await fetch(`${baseUrl}/${blockNumber}`);
      const data = await response.json();
      const block = data.find(b => b.height === Number(blockNumber));
      if (block && block.timestamp) {
        return block.timestamp;
      }
      console.log(`Block ${blockNumber} not found in the last 15 blocks for chain ${rpcChain}`);
      return null;
    } catch (err) {
      console.error(`Error fetching block ${blockNumber} for chain ${rpcChain}:`, err.message);
      return null;
    }
  }

  console.log(`Chain ${rpcChain} not supported for timestamp fetching`);
  return null;
};

// Function to update timestamps in limited_order_test for specific order IDs
const updateTimestampsForOrders = async (orderIds) => {
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
      FROM limited_order_test
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
    console.log(`Found ${result.rowCount} rows in limited_order_test to update timestamps`);

    let successfulUpdates = 0;
    let failedUpdates = [];

    for (const row of result.rows) {
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

      if (supportedChainsForFetch.includes(source_chain)) {
        if (user_init_block_number && !userInitTimestamp) {
          const timestampSeconds = await getTimestampForBlock(source_chain, user_init_block_number);
          userInitTimestamp = timestampSeconds ? formatTimestampToIST(timestampSeconds) : null;
        }
        if (user_redeem_block_number && !userRedeemTimestamp) {
          const timestampSeconds = await getTimestampForBlock(source_chain, user_redeem_block_number);
          userRedeemTimestamp = timestampSeconds ? formatTimestampToIST(timestampSeconds) : null;
        }
        if (user_refund_block_number && !userRefundTimestamp) {
          const timestampSeconds = await getTimestampForBlock(source_chain, user_refund_block_number);
          userRefundTimestamp = timestampSeconds ? formatTimestampToIST(timestampSeconds) : null;
        }
      } else {
        console.warn(`Source chain ${source_chain} not supported for timestamp fetching for order ${create_order_id}`);
      }

      if (supportedChainsForFetch.includes(destination_chain)) {
        if (cobi_init_block_number && !cobiInitTimestamp) {
          const timestampSeconds = await getTimestampForBlock(destination_chain, cobi_init_block_number);
          cobiInitTimestamp = timestampSeconds ? formatTimestampToIST(timestampSeconds) : null;
        }
        if (cobi_redeem_block_number && !cobiRedeemTimestamp) {
          const timestampSeconds = await getTimestampForBlock(destination_chain, cobi_redeem_block_number);
          cobiRedeemTimestamp = timestampSeconds ? formatTimestampToIST(timestampSeconds) : null;
        }
        if (cobi_refund_block_number && !cobiRefundTimestamp) {
          const timestampSeconds = await getTimestampForBlock(destination_chain, cobi_refund_block_number);
          cobiRefundTimestamp = timestampSeconds ? formatTimestampToIST(timestampSeconds) : null;
        }
      } else {
        console.warn(`Destination chain ${destination_chain} not supported for timestamp fetching for order ${create_order_id}`);
      }

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
          UPDATE limited_order_test
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
    }

    console.log(`Timestamp update completed: ${successfulUpdates} orders updated successfully, ${failedUpdates.length} orders failed.`);
    if (failedUpdates.length > 0) {
      console.log(`Failed orders: ${failedUpdates.join(', ')}`);
    }
  } catch (err) {
    console.error('Error updating timestamps in limited_order_test:', err);
    throw err;
  }
};

// Main function for one-off run
async function main() {
  try {
    const orderIdsQuery = `
      SELECT create_order_id
      FROM limited_order_test
      WHERE (
        (user_init_block_number IS NOT NULL AND user_init IS NULL) OR
        (user_redeem_block_number IS NOT NULL AND user_redeem IS NULL) OR
        (user_refund_block_number IS NOT NULL AND user_refund IS NULL) OR
        (cobi_init_block_number IS NOT NULL AND cobi_init IS NULL) OR
        (cobi_redeem_block_number IS NOT NULL AND cobi_redeem IS NULL) OR
        (cobi_refund_block_number IS NOT NULL AND cobi_refund IS NULL)
      )
    `;
    const orderIdsResult = await analysisPool.query(orderIdsQuery);
    const orderIds = orderIdsResult.rows.map(row => row.create_order_id);

    if (orderIds.length === 0) {
      console.log('No orders found with missing timestamps.');
      return;
    }

    console.log(`Updating timestamps for ${orderIds.length} orders:`, orderIds);
    await updateTimestampsForOrders(orderIds);
  } catch (err) {
    console.error('Error running timestamp updater:', err);
    process.exit(1); // Exit with error code on failure
  } finally {
    await analysisPool.end();
    console.log('Database connection closed.');
  }
}

// Cron job for periodic execution (runs every hour)
cron.schedule('0 * * * *', async () => {
  console.log('Running timestamp update cron job at', new Date().toISOString());
  try {
    const orderIdsQuery = `
      SELECT create_order_id
      FROM limited_order_test
      WHERE (
        (user_init_block_number IS NOT NULL AND user_init IS NULL) OR
        (user_redeem_block_number IS NOT NULL AND user_redeem IS NULL) OR
        (user_refund_block_number IS NOT NULL AND user_refund IS NULL) OR
        (cobi_init_block_number IS NOT NULL AND cobi_init IS NULL) OR
        (cobi_redeem_block_number IS NOT NULL AND cobi_redeem IS NULL) OR
        (cobi_refund_block_number IS NOT NULL AND cobi_refund IS NULL)
      )
    `;
    const orderIdsResult = await analysisPool.query(orderIdsQuery);
    const orderIds = orderIdsResult.rows.map(row => row.create_order_id);

    if (orderIds.length === 0) {
      console.log('No orders found with missing timestamps.');
      return;
    }

    console.log(`Cron: Updating timestamps for ${orderIds.length} orders:`, orderIds);
    await updateTimestampsForOrders(orderIds);
  } catch (err) {
    console.error('Cron: Error running timestamp updater:', err);
  }
  // Do not close analysisPool here to keep it open for subsequent cron runs
});

// Run main immediately for one-off execution
main().catch(err => {
  console.error('Main error:', err);
  process.exit(1);
});