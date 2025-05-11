// update transaction hashes
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Pool for organization database (garden_tnve)
const orgPool = new Pool({
  user: 'garden-interchain-analysis',
  host: '65.109.18.60',
  database: 'garden_tnve',
  password: 'catal0g',
  port: 5454,
});

// Pool for analysis database (garden_interchain_analysis)
const analysisPool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'garden_interchain_analysis',
  password: 'yaswanth',
  port: 5432,
});

// Function to fetch transaction hashes from organization database
async function fetchTransactionHashes() {
  const query = `
    SELECT DISTINCT
        mo.create_order_id,
        mo.source_swap_id,
        mo.destination_swap_id,
        s1.initiate_tx_hash AS source_init_tx_hash,
        s1.redeem_tx_hash AS source_redeem_tx_hash,
        s1.refund_tx_hash AS source_refund_tx_hash,
        s2.initiate_tx_hash AS destination_init_tx_hash,
        s2.redeem_tx_hash AS destination_redeem_tx_hash,
        s2.refund_tx_hash AS destination_refund_tx_hash
    FROM public.create_orders co
    INNER JOIN public.matched_orders mo ON co.create_id = mo.create_order_id
    INNER JOIN public.swaps s1 ON mo.source_swap_id = s1.swap_id
    INNER JOIN public.swaps s2 ON mo.destination_swap_id = s2.swap_id
    WHERE (s1.redeem_tx_hash IS NOT NULL AND s1.redeem_tx_hash != ''
           OR s1.refund_tx_hash IS NOT NULL AND s1.refund_tx_hash != '')
      AND (s2.redeem_tx_hash IS NOT NULL AND s2.redeem_tx_hash != ''
           OR s2.refund_tx_hash IS NOT NULL AND s2.refund_tx_hash != '');
  `;

  try {
    const result = await orgPool.query(query);
    console.log(`Fetched ${result.rowCount} records with transaction hashes from organization database.`);
    return result.rows;
  } catch (err) {
    console.error('Error fetching transaction hashes from organization database:', err);
    throw err;
  }
}

// Function to update transaction hashes in order_insights_duplicate_without_tx_hashes
async function updateTransactionHashes() {
  let successfulUpdates = 0;
  let failedUpdates = [];

  try {
    // Fetch transaction hashes
    const records = await fetchTransactionHashes();

    // Process each record
    for (const record of records) {
      const {
        create_order_id,
        source_swap_id,
        destination_swap_id,
        source_init_tx_hash,
        source_redeem_tx_hash,
        source_refund_tx_hash,
        destination_init_tx_hash,
        destination_redeem_tx_hash,
        destination_refund_tx_hash
      } = record;

      // Update query for order_insights_duplicate_without_tx_hashes
      const updateQuery = `
        UPDATE order_insights_duplicate_without_tx_hashes
        SET 
            user_init_tx_hash = $1,
            user_redeem_tx_hash = $2,
            user_refund_tx_hash = $3,
            cobi_init_tx_hash = $4,
            cobi_redeem_tx_hash = $5,
            cobi_refund_tx_hash = $6
        WHERE create_order_id = $7
          AND source_swap_id = $8
          AND destination_swap_id = $9;
      `;

      try {
        await analysisPool.query(updateQuery, [
          source_init_tx_hash,
          source_redeem_tx_hash,
          source_refund_tx_hash,
          destination_init_tx_hash,
          destination_redeem_tx_hash,
          destination_refund_tx_hash,
          create_order_id,
          source_swap_id,
          destination_swap_id
        ]);
        console.log(`Updated transaction hashes for create_order_id=${create_order_id}, source_swap_id=${source_swap_id}, destination_swap_id=${destination_swap_id}`);
        successfulUpdates++;
      } catch (err) {
        console.error(`Error updating transaction hashes for create_order_id=${create_order_id}:`, err.message);
        failedUpdates.push(create_order_id);
      }
    }

    // Summary
    console.log(`Update completed: ${successfulUpdates} records updated successfully, ${failedUpdates.length} failed.`);
    if (failedUpdates.length > 0) {
      console.log(`Failed create_order_ids: ${failedUpdates.join(', ')}`);
    }
  } catch (err) {
    console.error('Error in updateTransactionHashes:', err);
    throw err;
  }
}

// Main function to run the update
async function main() {
  try {
    await updateTransactionHashes();
  } catch (err) {
    console.error('Error in main:', err);
    process.exit(1);
  } finally {
    // Close database pools
    await orgPool.end();
    await analysisPool.end();
    console.log('Database connections closed.');
  }
}

// Run the script
main().catch(err => {
  console.error('Main error:', err);
  process.exit(1);
});