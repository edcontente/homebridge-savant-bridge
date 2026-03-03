#!/usr/bin/env node
// Script to merge SavantBridge platform into existing Homebridge config.json
// Usage: sudo node merge-config.js

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = '/var/lib/homebridge/config.json';
const BACKUP_PATH = '/var/lib/homebridge/config.json.bak';
const SAVANT_PATH = path.join(__dirname, 'savant-platform.json');

// Read existing config
console.log('Reading existing config...');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// Backup
console.log('Creating backup at config.json.bak...');
fs.writeFileSync(BACKUP_PATH, JSON.stringify(config, null, 4));

// Read new SavantBridge platform
console.log('Reading SavantBridge platform config...');
const savantPlatform = JSON.parse(fs.readFileSync(SAVANT_PATH, 'utf8'));

// Remove old SavantHost and any existing SavantBridge entries
config.platforms = config.platforms.filter(p =>
  p.platform !== 'SavantHost' && p.platform !== 'SavantBridge'
);

// Add new SavantBridge platform
config.platforms.push(savantPlatform);

// Write updated config
console.log('Writing updated config...');
fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));

console.log('');
console.log('Done! Config updated successfully.');
console.log(`  - Removed old SavantHost platform (if present)`);
console.log(`  - Added SavantBridge platform with ${savantPlatform.accessories.length} accessories`);
console.log(`  - Backup saved to ${BACKUP_PATH}`);
console.log('');
console.log('Restart Homebridge with: sudo hb-service restart');
