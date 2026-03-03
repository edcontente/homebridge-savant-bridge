import {
  API, DynamicPlatformPlugin, Logger, PlatformAccessory,
  PlatformConfig, Service, Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SavantClient } from './savant-client';
import { LightbulbAccessory } from './accessories/lightbulb';
import { SwitchAccessory } from './accessories/switch';
import { ThermostatAccessory } from './accessories/thermostat';
import { SceneAccessory } from './accessories/scene';

export interface AccessoryConfig {
  name: string;
  type: 'switch' | 'lightbulb' | 'thermostat';
  on: string;
  off: string;
  query?: string;
  set?: string;
  cool?: string;
  heat?: string;
  queryTemp?: string;
  queryState?: string;
}

interface Pollable { poll(): Promise<void> }

export class SavantBridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  public readonly client: SavantClient;

  private readonly pollable: Pollable[] = [];
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    const host = config.host as string;
    const scliPort = (config.scliPort as number) ?? 12000;
    const apiPort = (config.apiPort as number) ?? 3060;

    this.client = new SavantClient(log, host, scliPort, apiPort);
    this.log.info(`Savant Bridge → ${host} (scli:${scliPort} api:${apiPort})`);

    api.on('didFinishLaunching', () => this.setup());
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  // ── Setup ─────────────────────────────────────────────────────────

  private async setup() {
    const conn = await this.client.testConnection();
    if (!conn.scli && !conn.api) {
      this.log.error('Cannot reach Savant host on either port.');
      return;
    }

    if (conn.scli) {
      const zones = await this.client.listZones();
      if (zones.length) {
        this.log.info(`Zones: ${zones.join(', ')}`);
      }
    }

    // Accessories (lights, switches, ACs)
    const cfgs = (this.config.accessories as AccessoryConfig[]) || [];
    for (const cfg of cfgs) {
      const uuid = this.api.hap.uuid.generate(`savant-${cfg.type}-${cfg.name}`);
      const existing = this.accessories.find(a => a.UUID === uuid);
      const acc = existing || new this.api.platformAccessory(cfg.name, uuid);
      acc.context.config = cfg;
      this.registerHandler(acc, cfg);
      if (!existing) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [acc]);
      }
    }

    // Scenes (auto-discover from port 3060)
    const validUUIDs = new Set(cfgs.map(c => this.api.hap.uuid.generate(`savant-${c.type}-${c.name}`)));

    if ((this.config.discoverScenes as boolean) !== false && conn.api) {
      const scenes = await this.client.getScenes();
      this.log.info(`${scenes.length} scenes found`);
      for (const scene of scenes) {
        const uuid = this.api.hap.uuid.generate(`savant-scene-${scene.id}`);
        validUUIDs.add(uuid);
        const existing = this.accessories.find(a => a.UUID === uuid);
        const acc = existing || new this.api.platformAccessory(scene.name, uuid);
        acc.context.scene = scene;
        new SceneAccessory(this, acc, scene);
        if (!existing) {
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [acc]);
        }
      }
    }

    // Cleanup stale
    const stale = this.accessories.filter(a => !validUUIDs.has(a.UUID));
    if (stale.length) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }

    // Background polling
    if (conn.scli && this.pollable.length) {
      this.log.info(`Polling ${this.pollable.length} accessories every ${this.config.pollingInterval || 30}s`);
      this.timer = setTimeout(() => this.pollLoop(), 5000);
    }

    this.api.on('shutdown', () => { if (this.timer) { clearTimeout(this.timer); } });
  }

  // ── Poll loop ─────────────────────────────────────────────────────

  private async pollLoop() {
    const interval = ((this.config.pollingInterval as number) || 30) * 1000;
    for (const acc of this.pollable) {
      try { await acc.poll(); } catch { /* logged by client */ }
    }
    this.timer = setTimeout(() => this.pollLoop(), interval);
  }

  // ── Factory ───────────────────────────────────────────────────────

  private registerHandler(accessory: PlatformAccessory, cfg: AccessoryConfig) {
    let handler: Pollable;
    switch (cfg.type) {
      case 'lightbulb':
        handler = new LightbulbAccessory(this, accessory, cfg);
        break;
      case 'switch':
        handler = new SwitchAccessory(this, accessory, cfg);
        break;
      case 'thermostat':
        handler = new ThermostatAccessory(this, accessory, cfg);
        break;
      default:
        this.log.warn(`Unknown type: ${cfg.type}`);
        return;
    }
    this.pollable.push(handler);
  }
}
