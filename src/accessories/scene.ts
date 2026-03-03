import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SavantBridgePlatform } from '../platform';
import { SavantScene } from '../savant-client';

export class SceneAccessory {
  constructor(
    private readonly platform: SavantBridgePlatform,
    accessory: PlatformAccessory,
    private readonly scene: SavantScene,
  ) {
    const S = platform.Service;
    const C = platform.Characteristic;

    accessory.getService(S.AccessoryInformation)!
      .setCharacteristic(C.Manufacturer, 'Savant')
      .setCharacteristic(C.Model, 'Scene')
      .setCharacteristic(C.SerialNumber, scene.id);

    const svc = accessory.getService(S.Switch) || accessory.addService(S.Switch);
    svc.setCharacteristic(C.Name, scene.name);

    svc.getCharacteristic(C.On)
      .onGet(() => false)
      .onSet(async (v: CharacteristicValue) => {
        if (!v) {
          return;
        }
        await this.platform.client.activateScene(this.scene.id);
        setTimeout(() => svc.updateCharacteristic(C.On, false), 200);
      });
  }
}
