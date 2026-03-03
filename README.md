# homebridge-savant-bridge

Homebridge plugin for **Savant** home automation systems. Controls lights, switches, thermostats and scenes via Apple HomeKit — no token required.

## Architecture

```
┌──────────┐    HTTP     ┌──────────────┐  subprocess  ┌────────────┐
│Homebridge├────:12000───►│bridge_logic.rb├─────────────►│ sclibridge │
│  (Pi)    │             │ (Savant Host) │              │  (native)  │
└────┬─────┘             └───────────────┘              └────────────┘
     │  HTTP :3060
     └──────────►  Savant OpenAPI (scenes)
```

- **Port 12000** — Ruby HTTP bridge translates HTTP GET → `sclibridge` CLI commands
- **Port 3060** — Savant OpenAPI (read-only, scenes auto-discovery)
- **No authentication** required on either port

## Requirements

- **Savant Host** with `sclibridge` binary (`/usr/local/bin/sclibridge`)
- **Homebridge** v1.8+ on a Raspberry Pi (or similar)
- Ruby installed on the Savant Host (for `bridge_logic.rb`)

## Installation

### 1. Deploy the Ruby bridge on Savant Host

Copy `bridge_logic.rb` to the Savant Host and run it:

```bash
scp bridge_logic.rb user@SAVANT_HOST_IP:~/bridge_logic.rb
ssh user@SAVANT_HOST_IP

# Start the bridge
nohup ruby bridge_logic.rb > /tmp/bridge.log 2>&1 &

# Verify
curl http://127.0.0.1:12000/userzones
```

### 2. Install the plugin on Homebridge

```bash
cd ~/homebridge-savant-bridge
npm install
npm run build
sudo npm install --prefix /var/lib/homebridge ~/homebridge-savant-bridge
```

### 3. Configure

Add to your Homebridge `config.json` (see `config.sample.json` for a full example):

```json
{
  "platform": "SavantBridge",
  "name": "Savant Home",
  "host": "YOUR_SAVANT_HOST_IP",
  "scliPort": 12000,
  "apiPort": 3060,
  "pollingInterval": 30,
  "discoverScenes": true,
  "accessories": []
}
```

### 4. Restart Homebridge

```bash
sudo hb-service restart
```

## Accessory Types

### Lightbulb (dimmer)

```json
{
  "name": "Living Room Ceiling",
  "type": "lightbulb",
  "on": "Zone,Host,Controller,1,SVC_ENV_LIGHTING,DimmerSet,Address1,100,Address2,1,DimmerLevel,100",
  "off": "Zone,Host,Controller,1,SVC_ENV_LIGHTING,DimmerSet,Address1,100,Address2,1,DimmerLevel,0",
  "set": "Zone,Host,Controller,1,SVC_ENV_LIGHTING,DimmerSet,Address1,100,Address2,1,DimmerLevel,VARLEVEL",
  "query": "Host.Controller.DimmerLevel_100_1"
}
```

### Switch (on/off)

```json
{
  "name": "Kitchen Light",
  "type": "switch",
  "on": "Zone,Host,Controller,1,SVC_ENV_LIGHTING,SwitchOn,Address1,100,Address2,2",
  "off": "Zone,Host,Controller,1,SVC_ENV_LIGHTING,SwitchOff,Address1,100,Address2,2",
  "query": "Host.Controller.DimmerLevel_100_2"
}
```

### Thermostat (HVAC)

```json
{
  "name": "AC Living Room",
  "type": "thermostat",
  "off": "Zone,Host,Controller,1,SVC_ENV_SINGLE_SETPOINT_HVAC,SetHVACModeOff,ThermostatAddress,101:1",
  "cool": "Zone,Host,Controller,1,SVC_ENV_SINGLE_SETPOINT_HVAC,SetHVACModeCool,ThermostatAddress,101:1",
  "set": "Zone,Host,Controller,1,SVC_ENV_SINGLE_SETPOINT_HVAC,SetSingleSetPointTemperature,ThermostatAddress,101:1,SetPointTemperature,VARTEMP",
  "queryTemp": "Host.Controller.ThermostatCurrentTemperature_101:1",
  "queryState": "Host.Controller.ThermostatCurrentHVACMode_101:1"
}
```

## Scenes

Scenes are auto-discovered from the Savant OpenAPI (port 3060) and exposed as momentary switches in HomeKit. Set `"discoverScenes": false` to disable.

## Finding Your Commands

Use `sclibridge` on the Savant Host to discover your devices:

```bash
# List zones
sclibridge userzones

# List state names (filter by pattern)
sclibridge statenames Lighting
sclibridge statenames Thermostat

# Read a state
sclibridge readstate Host.Controller.DimmerLevel_100_1

# Test a command
sclibridge servicerequest Zone Host Controller 1 SVC_ENV_LIGHTING SwitchOn Address1 100 Address2 1
```

## How It Works

1. **Startup** — Plugin connects to both ports, discovers zones and scenes
2. **onGet** — Returns cached values instantly (no network calls, no blocking)
3. **Background poll** — Every 30s, queries each accessory state sequentially via the Ruby bridge
4. **onSet** — Sends commands immediately through the serial queue
5. **Bridge** — Ruby TCPServer accepts HTTP GET, runs `sclibridge` subprocess, returns result

## Credits

- **[benumc](https://github.com/benumc)** — The Ruby HTTP bridge (`bridge_logic.rb`) is based on [SCLI_HTTP](https://github.com/benumc/SCLI_HTTP), and the device command/state formats used in this plugin come from Savant Blueprint profiles created by benumc. His work on bridging `sclibridge` to HTTP and creating reusable profiles for the Savant ecosystem made this integration possible.

## License

MIT
