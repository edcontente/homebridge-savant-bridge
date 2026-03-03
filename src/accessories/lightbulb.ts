import { PlatformAccessory, CharacteristicValue, Service } from 'homebridge';
import { SavantBridgePlatform, AccessoryConfig } from '../platform';

export class LightbulbAccessory {
  private brightness = 0;
  private readonly svc: Service;

  constructor(
    private readonly platform: SavantBridgePlatform,
    accessory: PlatformAccessory,
    private readonly cfg: AccessoryConfig,
  ) {
    const S = platform.Service;
    const C = platform.Characteristic;

    accessory.getService(S.AccessoryInformation)!
      .setCharacteristic(C.Manufacturer, 'Savant')
      .setCharacteristic(C.Model, 'Dimmer')
      .setCharacteristic(C.SerialNumber, cfg.query || cfg.name);

    this.svc = accessory.getService(S.Lightbulb) || accessory.addService(S.Lightbulb);
    this.svc.setCharacteristic(C.Name, cfg.name);

    this.svc.getCharacteristic(C.On)
      .onGet(() => this.brightness > 0)
      .onSet(this.setOn.bind(this));

    if (cfg.set?.includes('VARLEVEL')) {
      this.svc.getCharacteristic(C.Brightness)
        .onGet(() => this.brightness)
        .onSet(this.setBrightness.bind(this));
    }
  }

  private async setOn(value: CharacteristicValue) {
    const cmd = value ? this.cfg.on : this.cfg.off;
    if (!cmd) {
      return;
    }
    this.brightness = value ? 100 : 0;
    await this.platform.client.serviceRequest(cmd);
  }

  private async setBrightness(value: CharacteristicValue) {
    if (!this.cfg.set) {
      return;
    }
    this.brightness = value as number;
    await this.platform.client.serviceRequest(this.cfg.set.replace(/VARLEVEL/g, String(this.brightness)));
  }

  async poll() {
    if (!this.cfg.query) {
      return;
    }
    try {
      const n = parseInt(await this.platform.client.readState(this.cfg.query), 10);
      if (!isNaN(n)) {
        this.brightness = Math.min(100, Math.max(0, n));
        const C = this.platform.Characteristic;
        this.svc.updateCharacteristic(C.On, this.brightness > 0);
        this.svc.updateCharacteristic(C.Brightness, this.brightness);
      }
    } catch { /* keep cache */ }
  }
}
