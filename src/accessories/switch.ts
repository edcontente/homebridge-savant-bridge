import { PlatformAccessory, CharacteristicValue, Service } from 'homebridge';
import { SavantBridgePlatform, AccessoryConfig } from '../platform';

export class SwitchAccessory {
  private on = false;
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
      .setCharacteristic(C.Model, 'Switch')
      .setCharacteristic(C.SerialNumber, cfg.query || cfg.name);

    this.svc = accessory.getService(S.Switch) || accessory.addService(S.Switch);
    this.svc.setCharacteristic(C.Name, cfg.name);

    this.svc.getCharacteristic(C.On)
      .onGet(() => this.on)
      .onSet(this.setOn.bind(this));
  }

  private async setOn(value: CharacteristicValue) {
    const cmd = value ? this.cfg.on : this.cfg.off;
    if (!cmd) {
      return;
    }
    this.on = value as boolean;
    await this.platform.client.serviceRequest(cmd);
  }

  async poll() {
    if (!this.cfg.query) {
      return;
    }
    try {
      const r = await this.platform.client.readState(this.cfg.query);
      const n = parseInt(r, 10);
      this.on = !isNaN(n) ? n > 0 : r === '1';
      this.svc.updateCharacteristic(this.platform.Characteristic.On, this.on);
    } catch { /* keep cache */ }
  }
}
