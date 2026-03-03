import { API } from 'homebridge';
import { PLATFORM_NAME } from './settings';
import { SavantBridgePlatform } from './platform';

export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, SavantBridgePlatform);
};
