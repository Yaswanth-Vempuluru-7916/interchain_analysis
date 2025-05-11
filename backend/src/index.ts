import express, { Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Pool for stage_db (source data)
const stagePool = new Pool({
  user: process.env.STAGE_DB_USER,
  host: process.env.STAGE_DB_HOST,
  database: process.env.STAGE_DB_NAME,
  password: process.env.STAGE_DB_PASSWORD,
  port: Number(process.env.STAGE_DB_PORT),
});

// Pool for garden_interchain_analysis (storing results)
const analysisPool = new Pool({
  user: process.env.ANALYSIS_DB_USER,
  host: process.env.ANALYSIS_DB_HOST,
  database: process.env.ANALYSIS_DB_NAME,
  password: process.env.ANALYSIS_DB_PASSWORD,
  port: Number(process.env.ANALYSIS_DB_PORT),
});

// Initialize small_test_table
const initTable = async () => {
  const createTableQuery = `
      CREATE TABLE IF NOT EXISTS final_orders_dup (
        id SERIAL PRIMARY KEY,
        create_order_id TEXT NOT NULL UNIQUE,
        source_swap_id TEXT NOT NULL,
        destination_swap_id TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        source_chain TEXT NOT NULL,
        destination_chain TEXT NOT NULL,
        user_init TIMESTAMP WITH TIME ZONE,
        cobi_init TIMESTAMP WITH TIME ZONE,
        user_redeem TIMESTAMP WITH TIME ZONE,
        cobi_redeem TIMESTAMP WITH TIME ZONE,
        user_refund TIMESTAMP WITH TIME ZONE,
        cobi_refund TIMESTAMP WITH TIME ZONE,
        secret_hash TEXT,
        user_init_block_number BIGINT,
        user_redeem_block_number BIGINT,
        user_refund_block_number BIGINT,
        cobi_init_block_number BIGINT,
        cobi_redeem_block_number BIGINT,
        cobi_refund_block_number BIGINT,
        user_init_tx_hash TEXT,
        user_redeem_tx_hash TEXT,
        user_refund_tx_hash TEXT,
        cobi_init_tx_hash TEXT,
        cobi_redeem_tx_hash TEXT,
        cobi_refund_tx_hash TEXT
    );
    `;
  try {
    await analysisPool.query(createTableQuery);
    console.log(
      "final_orders_dup table ensured with TIMESTAMPTZ columns, secret_hash, block numbers, and chain columns"
    );
  } catch (err) {
    console.error("Failed to ensure final_orders_dup table:", err);
  }
};

// Populate final_orders_dup with new completed orders from stage_db
const populateOrderAnalysis = async () => {
  try {
    // Get the last synced timestamp from final_orders_dup
    //   const lastSyncResult = await analysisPool.query(
    //     "SELECT MAX(created_at) as last_synced FROM final_orders_dup"
    //   );
    //   const lastSynced = lastSyncResult.rows[0].last_synced || "1970-01-01";

    // CHANGE 1: Added s1.initiate_tx_hash and s2.initiate_tx_hash to the SELECT query
    // Reason: These fields are needed for user_init_tx_hash and cobi_init_tx_hash in final_orders_dup
    const query = `
          SELECT DISTINCT
            mo.create_order_id,
            mo.source_swap_id,
            mo.destination_swap_id,
            co.created_at,
            co.source_chain,
            co.destination_chain,
            s1.updated_at AS source_updated_at,
            s1.initiate_tx_hash AS source_init_tx_hash,
            s1.redeem_tx_hash AS source_redeem_tx_hash,
            s1.refund_tx_hash AS source_refund_tx_hash,
            s1.initiate_block_number AS source_init_block_number,
            s1.redeem_block_number AS source_redeem_block_number,
            s1.refund_block_number AS source_refund_block_number,
            s2.updated_at AS destination_updated_at,
            s2.initiate_tx_hash AS destination_init_tx_hash,
            s2.redeem_tx_hash AS destination_redeem_tx_hash,
            s2.refund_tx_hash AS destination_refund_tx_hash,
            s2.initiate_block_number AS destination_init_block_number,
            s2.redeem_block_number AS destination_redeem_block_number,
            s2.refund_block_number AS destination_refund_block_number,
            co.secret_hash
        FROM create_orders co
        INNER JOIN matched_orders mo ON co.create_id = mo.create_order_id
        INNER JOIN swaps s1 ON mo.source_swap_id = s1.swap_id
        INNER JOIN swaps s2 ON mo.destination_swap_id = s2.swap_id
        WHERE (s1.redeem_tx_hash IS NOT NULL AND s1.redeem_tx_hash != '' 
            OR s1.refund_tx_hash IS NOT NULL AND s1.refund_tx_hash != '')
            AND (s2.redeem_tx_hash IS NOT NULL AND s2.redeem_tx_hash != '' 
            OR s2.refund_tx_hash IS NOT NULL AND s2.refund_tx_hash != '')
        `;

    // Set UTC time zone for stage_db query
    await stagePool.query("SET TIME ZONE 'UTC'");

    // Query stage_db for new completed orders
    const result = await stagePool.query(query);
   
    if (result.rowCount === 0) return;


    await analysisPool.query("BEGIN");


    for (const row of result.rows) {
      
      await analysisPool.query(
        `
          INSERT INTO final_orders_dup (
            create_order_id, source_swap_id, destination_swap_id, created_at,
            source_chain, destination_chain,
            user_init, cobi_init, user_redeem, cobi_redeem, user_refund, cobi_refund,
            secret_hash,
            user_init_block_number, user_redeem_block_number, user_refund_block_number,
            cobi_init_block_number, cobi_redeem_block_number, cobi_refund_block_number,
            user_init_tx_hash, user_redeem_tx_hash, user_refund_tx_hash,
            cobi_init_tx_hash, cobi_redeem_tx_hash, cobi_refund_tx_hash
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
                  $20, $21, $22, $23, $24, $25)
          ON CONFLICT (create_order_id) DO NOTHING
        `,
        [
          row.create_order_id,
          row.source_swap_id,
          row.destination_swap_id,
          row.created_at,
          row.source_chain,
          row.destination_chain,
          null, // user_init (to be updated by script)
          null, // cobi_init (to be updated by script)
          null, // user_redeem (to be updated by script)
          null, // cobi_redeem (to be updated by script)
          null, // user_refund (to be updated by script)
          null, // cobi_refund (to be updated by script)
          row.secret_hash,
          row.source_init_block_number,
          row.source_redeem_tx_hash ? row.source_redeem_block_number : null,
          row.source_refund_tx_hash ? row.source_refund_block_number : null,
          row.destination_init_block_number,
          row.destination_redeem_tx_hash ? row.destination_redeem_block_number : null,
          row.destination_refund_tx_hash? row.destination_refund_block_number: null,
          row.source_init_tx_hash ? row.source_init_tx_hash : null, // user_init_tx_hash
          row.source_redeem_tx_hash ? row.source_redeem_tx_hash : null, // user_redeem_tx_hash
          row.source_refund_tx_hash ? row.source_refund_tx_hash : null, // user_refund_tx_hash
          row.destination_init_tx_hash ? row.destination_init_tx_hash : null, // cobi_init_tx_hash
          row.destination_redeem_tx_hash ? row.destination_redeem_tx_hash : null, // cobi_redeem_tx_hash
          row.destination_refund_tx_hash ? row.destination_refund_tx_hash : null, // cobi_refund_tx_hash
        ]
      );
    }

    // Commit the transaction
    await analysisPool.query("COMMIT");
    console.log(
      `Inserted ${result.rowCount} new orders into final_orders_dup`
    );
  } catch (err) {
    await analysisPool.query("ROLLBACK");
    console.error("Error populating final_orders_dup:", err);
  }
};

// Initialize table and populate data
initTable().then(() => populateOrderAnalysis());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});


// fetch the timestamps
// SELECT *
// FROM final_orders_dup
// WHERE (
//     (user_init_block_number IS NOT NULL AND user_init IS NULL) OR
//     (user_redeem_block_number IS NOT NULL AND user_redeem IS NULL) OR
//     (user_refund_block_number IS NOT NULL AND user_refund IS NULL) OR
//     (cobi_init_block_number IS NOT NULL AND cobi_init IS NULL) OR
//     (cobi_redeem_block_number IS NOT NULL AND cobi_redeem IS NULL) OR
//     (cobi_refund_block_number IS NOT NULL AND cobi_refund IS NULL)
// );