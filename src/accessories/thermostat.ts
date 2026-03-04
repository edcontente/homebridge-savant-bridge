import { PlatformAccessory, CharacteristicValue, Service } from 'homebridge';
import { SavantBridgePlatform, AccessoryConfig } from '../platform';

export class ThermostatAccessory {
  private currentTemp = 22;
  private targetTemp = 22;
  private mode = 0; // 0=OFF 1=HEAT 2=COOL
  private readonly svc: Service;

  // Derived from queryTemp: "prefix.ThermostatCurrentTemperature_address"
  private readonly statePrefix?: string;
  private readonly stateAddr?: string;

  constructor(
    private readonly platform: SavantBridgePlatform,
    accessory: PlatformAccessory,
    private readonly cfg: AccessoryConfig,
  ) {
    const S = platform.Service;
    const C = platform.Characteristic;

    // Extract prefix and address from queryTemp for automatic state discovery
    if (cfg.queryTemp) {
      const match = cfg.queryTemp.match(/^(.+)\.ThermostatCurrentTemperature_(.+)$/);
      if (match) {
        this.statePrefix = match[1];
        this.stateAddr = match[2];
      }
    }

    accessory.getService(S.AccessoryInformation)!
      .setCharacteristic(C.Manufacturer, 'Savant')
      .setCharacteristic(C.Model, 'HVAC')
      .setCharacteristic(C.SerialNumber, cfg.name);

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

    // Read current temperature
    if (this.cfg.queryTemp) {
      try {
        const t = parseFloat(await this.platform.client.readState(this.cfg.queryTemp));
        if (!isNaN(t)) {
          this.currentTemp = t;
          this.svc.updateCharacteristic(C.CurrentTemperature, this.currentTemp);
        }
      } catch { /* keep cache */ }
    }

    // Auto-discover mode and setpoint from Savant boolean states
    if (this.statePrefix && this.stateAddr) {
      const p = this.statePrefix;
      const a = this.stateAddr;

      // Read target temperature (setpoint)
      try {
        const sp = parseFloat(await this.platform.client.readState(`${p}.ThermostatCurrentSetPoint_${a}`));
        if (!isNaN(sp) && sp >= 16 && sp <= 30) {
          this.targetTemp = sp;
          this.svc.updateCharacteristic(C.TargetTemperature, this.targetTemp);
        }
      } catch { /* keep cache */ }

      // Read HVAC mode from boolean states
      try {
        const isCool = await this.platform.client.readState(`${p}.IsCurrentHVACModeCool_${a}`);
        const isHeat = await this.platform.client.readState(`${p}.IsCurrentHVACModeHeat_${a}`);

        if (isCool === '1') {
          this.mode = 2;
        } else if (isHeat === '1') {
          this.mode = 1;
        } else {
          this.mode = 0;
        }
        this.svc.updateCharacteristic(C.CurrentHeatingCoolingState, this.hapMode());
        this.svc.updateCharacteristic(C.TargetHeatingCoolingState, this.hapMode());
      } catch { /* keep cache */ }
    }
  }
}
