import { PlatformAccessory, CharacteristicValue, Service } from 'homebridge';
import { SavantBridgePlatform, AccessoryConfig } from '../platform';

export class ThermostatAccessory {
  private currentTemp = 22;
  private targetTemp = 22;
  private mode = 0; // 0=OFF 1=HEAT 2=COOL
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
      .setCharacteristic(C.Model, 'HVAC')
      .setCharacteristic(C.SerialNumber, cfg.queryState || cfg.name);

    this.svc = accessory.getService(S.Thermostat) || accessory.addService(S.Thermostat);
    this.svc.setCharacteristic(C.Name, cfg.name);

    this.svc.getCharacteristic(C.CurrentHeatingCoolingState)
      .onGet(() => this.hapMode());

    const valid = [C.TargetHeatingCoolingState.OFF];
    if (cfg.cool) {
      valid.push(C.TargetHeatingCoolingState.COOL);
    }
    if (cfg.heat) {
      valid.push(C.TargetHeatingCoolingState.HEAT);
    }

    this.svc.getCharacteristic(C.TargetHeatingCoolingState)
      .setProps({ validValues: valid })
      .onGet(() => this.hapMode())
      .onSet(this.setMode.bind(this));

    this.svc.getCharacteristic(C.CurrentTemperature)
      .onGet(() => this.currentTemp);

    this.svc.getCharacteristic(C.TargetTemperature)
      .setProps({ minValue: 16, maxValue: 30, minStep: 1 })
      .onGet(() => this.targetTemp)
      .onSet(this.setTemp.bind(this));

    this.svc.getCharacteristic(C.TemperatureDisplayUnits)
      .onGet(() => C.TemperatureDisplayUnits.CELSIUS)
      .onSet(() => { /* read-only */ });
  }

  private hapMode(): CharacteristicValue {
    const C = this.platform.Characteristic;
    if (this.mode === 1) {
      return C.CurrentHeatingCoolingState.HEAT;
    }
    if (this.mode === 2) {
      return C.CurrentHeatingCoolingState.COOL;
    }
    return C.CurrentHeatingCoolingState.OFF;
  }

  private async setMode(value: CharacteristicValue) {
    const C = this.platform.Characteristic;
    let cmd: string | undefined;
    if (value === C.TargetHeatingCoolingState.OFF) {
      cmd = this.cfg.off;
    } else if (value === C.TargetHeatingCoolingState.COOL || value === C.TargetHeatingCoolingState.AUTO) {
      cmd = this.cfg.cool;
    } else if (value === C.TargetHeatingCoolingState.HEAT) {
      cmd = this.cfg.heat;
    }
    if (cmd) {
      await this.platform.client.serviceRequest(cmd);
    }
  }

  private async setTemp(value: CharacteristicValue) {
    if (!this.cfg.set) {
      return;
    }
    this.targetTemp = value as number;
    await this.platform.client.serviceRequest(this.cfg.set.replace(/VARTEMP/g, String(this.targetTemp)));
  }

  async poll() {
    const C = this.platform.Characteristic;

    if (this.cfg.queryTemp) {
      try {
        const t = parseFloat(await this.platform.client.readState(this.cfg.queryTemp));
        if (!isNaN(t)) {
          this.currentTemp = t;
          this.targetTemp = Math.min(30, Math.max(16, t));
          this.svc.updateCharacteristic(C.CurrentTemperature, this.currentTemp);
          this.svc.updateCharacteristic(C.TargetTemperature, this.targetTemp);
        }
      } catch { /* keep cache */ }
    }

    if (this.cfg.queryState) {
      try {
        const m = parseInt(await this.platform.client.readState(this.cfg.queryState), 10);
        if (!isNaN(m)) {
          this.mode = m;
          this.svc.updateCharacteristic(C.CurrentHeatingCoolingState, this.hapMode());
          this.svc.updateCharacteristic(C.TargetHeatingCoolingState, this.hapMode());
        }
      } catch { /* keep cache */ }
    }
  }
}
