#!/usr/bin/env node
/**
 * Database Backup Script
 * Creates timestamped backups of the SQLite database
 *
 * Usage:
 *   node scripts/backup-db.mjs                    // Create backup with timestamp
 *   node scripts/backup-db.mjs ./data/backup.db   // Create backup at specific path
 */

import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.SQLITE_PATH || "./data/raytrace.db";
const dbDir = path.dirname(dbPath);
const dbName = path.basename(dbPath);

// Get backup path from CLI arg or generate timestamped name
let backupPath = process.argv[2];
if (!backupPath) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .split("T")[0];
  const time = new Date().toLocaleTimeString().replace(/:/g, "");
  backupPath = path.join(dbDir, `${dbName}.${timestamp}-${time}.backup`);
}

// Ensure backup directory exists
const backupDir = path.dirname(backupPath);
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Copy database file
try {
  if (!fs.existsSync(dbPath)) {
    console.error(`ERROR: Database file not found: ${dbPath}`);
    process.exit(1);
  }

  const stats = fs.statSync(dbPath);
  fs.copyFileSync(dbPath, backupPath);

  const backupStats = fs.statSync(backupPath);

  console.log(`✅ Database backed up successfully`);
  console.log(`   Source: ${dbPath} (${formatBytes(stats.size)})`);
  console.log(`   Backup: ${backupPath} (${formatBytes(backupStats.size)})`);
  console.log(`   Time: ${new Date().toISOString()}`);
} catch (error) {
  console.error(
    `❌ Backup failed:`,
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
