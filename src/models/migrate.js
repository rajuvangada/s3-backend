const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const logger = {
  info: (msg) => console.log(`[Migration] [INFO] ${msg}`),
  error: (msg) => console.error(`[Migration] [ERROR] ${msg}`)
};

async function runMigrations() {
  const connectionConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    multipleStatements: true // Essential for running the entire schema.sql file
  };

  logger.info(`Connecting to MySQL server at ${connectionConfig.host}:${process.env.DB_PORT || 3306} to run migrations...`);
  
  let connection;
  try {
    connection = await mysql.createConnection(connectionConfig);

    const schemaPath = path.join(__dirname, 'schema.sql');
    logger.info(`Reading schema SQL from ${schemaPath}`);
    const sql = fs.readFileSync(schemaPath, 'utf8');

    logger.info('Running migration statements...');
    await connection.query(sql);
    logger.info('Database schema and tables initialized/updated successfully.');
  } catch (err) {
    logger.error(`Migration script failed: ${err.message}`);
    logger.error(err.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run immediately if executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
