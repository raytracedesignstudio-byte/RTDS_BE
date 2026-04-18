#!/usr/bin/env node
/**
 * Database Restore Script
 * Restores database from a backup file
 *
 * Usage:
 *   node scripts/restore-db.mjs ./data/backup.db
 */

import fs from "node:fs";
import path from "node:path";

const backupPath = process.argv[2];
const dbPath = process.env.SQLITE_PATH || "./data/raytrace.db";

if (!backupPath) {
  console.error("Usage: node scripts/restore-db.mjs <backup-file>");
  console.error(
    "Example: node scripts/restore-db.mjs ./data/raytrace.db.2026-04-17-120000.backup",
  );
  process.exit(1);
}

// Verify backup exists
if (!fs.existsSync(backupPath)) {
  console.error(`ERROR: Backup file not found: ${backupPath}`);
  process.exit(1);
}

// Safety check: create backup of current DB before restoring
try {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const currentBackup = `${dbPath}.pre-restore-${timestamp}.backup`;
    fs.copyFileSync(dbPath, currentBackup);
    console.log(`ℹ️  Current database backed up to: ${currentBackup}`);
  }

  // Restore from backup
  const backupStats = fs.statSync(backupPath);
  fs.copyFileSync(backupPath, dbPath);
  const dbStats = fs.statSync(dbPath);

  console.log(`✅ Database restored successfully`);
  console.log(`   Source: ${backupPath} (${formatBytes(backupStats.size)})`);
  console.log(`   Target: ${dbPath} (${formatBytes(dbStats.size)})`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log(`\n⚠️  Restart your application to apply changes`);
} catch (error) {
  console.error(
    `❌ Restore failed:`,
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
