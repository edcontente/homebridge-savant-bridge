# homebridge-savant-bridge

Homebridge plugin for **Savant** home automation systems. Controls lights, switches, thermostats and scenes via Apple HomeKit — no token required.

## Important: Every Savant System is Different

This plugin communicates with the Savant Host via `sclibridge`, a command-line tool native to every Savant system. The commands and state names depend on **your specific hardware** — the controller modules, addresses, zones and services configured by your Savant dealer.

The examples in this README are templates. You **must** discover your own commands and state names using the tools described in the [Discovering Your System](#discovering-your-system) section below.

### Typical architecture

```
┌──────────┐         ┌──────────────┐         ┌────────────┐         ┌──────────────┐
│ Home App │◄──HAP──►│  Homebridge   │──HTTP──►│bridge_logic│──exec──►│  sclibridge  │
│ (iPhone) │         │ (Raspberry Pi)│  :12000 │.rb (Savant) │         │   (native)   │
└──────────┘         └──────┬───────┘         └────────────┘         └──────┬───────┘
                            │  HTTP :3060                                    │
                            └──────────► Savant OpenAPI (scenes)    Savant Host Bus
                                                                     (lighting, HVAC,
                                                                      switches, etc.)
```

The chain is: **Home App → Homebridge → Ruby Bridge → sclibridge → Savant Host Bus → Your Devices**

Each step translates the command for the next layer. The plugin sends HTTP requests to the Ruby bridge, which runs `sclibridge` commands that talk to your physical devices (dimmers, relays, thermostats, etc.) through the Savant Host internal bus.

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

# Verify it's running
curl http://127.0.0.1:12000/userzones
```

### 2. Install the plugin on Homebridge

```bash
cd ~/homebridge-savant-bridge
npm install
npm run build
sudo npm install --prefix /var/lib/homebridge ~/homebridge-savant-bridge
```

Or search for **Savant Bridge** in the Homebridge UI plugin tab.

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

## Discovering Your System

Every Savant installation uses different module names, addresses and zone names. Before configuring accessories, you need to discover what's in **your** system. SSH into your Savant Host and run these commands:

### Step 1: Find your zones

```bash
sclibridge userzones
```

This returns the room/zone names configured by your dealer (e.g., `Living Room`, `Kitchen`, `Master Bedroom`).

### Step 2: Find services for each zone

```bash
sclibridge servicesforzone "Living Room"
```

This lists the services available in that zone (lighting, HVAC, media, etc.) with the component names and addresses you'll need.

### Step 3: Find state names

```bash
# List ALL state names (can be slow on large systems)
sclibridge statenames

# Filter by keyword (recommended)
sclibridge statenames Dimmer
sclibridge statenames Thermostat
sclibridge statenames HVAC
```

State names follow the pattern: `Component.LogicalComponent.StateName_Address`

For example:
- `M4.Lighting_controller.DimmerLevel_100_1` — dimmer level for address 100:1
- `M4.Lighting_controller.ThermostatCurrentTemperature_101:1` — temperature for thermostat 101:1
- `M4.Lighting_controller.IsCurrentHVACModeCool_101:1` — whether HVAC is in Cool mode

Your component names (`M4`, `Lighting_controller`, etc.) will differ depending on your Savant hardware.

### Step 4: Test reading a state

```bash
sclibridge readstate M4.Lighting_controller.DimmerLevel_100_1
# Returns: 75  (meaning 75% brightness)

sclibridge readstate M4.Lighting_controller.ThermostatCurrentTemperature_101:1
# Returns: 23  (meaning 23°C)
```

### Step 5: Test sending a command

```bash
# Turn on a light
sclibridge servicerequest "Living Room" M4 Lighting_controller 1 SVC_ENV_LIGHTING SwitchOn Address1 100 Address2 1

# Set dimmer to 50%
sclibridge servicerequest "Living Room" M4 Lighting_controller 1 SVC_ENV_LIGHTING DimmerSet Address1 100 Address2 1 DimmerLevel 50

# Set HVAC to Cool
sclibridge servicerequest "Living Room" M4 Lighting_controller 1 SVC_ENV_SINGLE_SETPOINT_HVAC SetHVACModeCool ThermostatAddress 101:1
```

The service request format is:
```
sclibridge servicerequest <Zone> <Component> <LogicalComponent> <Variant> <ServiceType> <Command> [ArgName ArgValue ...]
```

In the plugin config, these same arguments are written as comma-separated values.

### Step 6: Use the Ruby bridge to test remotely

Once the bridge is running on port 12000, you can test from your Homebridge machine:

```bash
# Read a state
curl "http://SAVANT_HOST_IP:12000/readstate%20M4.Lighting_controller.DimmerLevel_100_1"

# Send a command
curl "http://SAVANT_HOST_IP:12000/servicerequest%20Living%20Room%20M4%20Lighting_controller%201%20SVC_ENV_LIGHTING%20SwitchOn%20Address1%20100%20Address2%201"

# List zones
curl "http://SAVANT_HOST_IP:12000/userzones"
```

## Accessory Types

### Lightbulb (dimmer)

For dimmable lights. Requires `on`, `off`, `set` (with `VARLEVEL` placeholder), and `query` (state name for dimmer level).

```json
{
  "name": "Ceiling Light",
  "type": "lightbulb",
  "on": "Zone,Component,LogicalComponent,1,SVC_ENV_LIGHTING,DimmerSet,Address1,XXX,Address2,Y,DimmerLevel,100",
  "off": "Zone,Component,LogicalComponent,1,SVC_ENV_LIGHTING,DimmerSet,Address1,XXX,Address2,Y,DimmerLevel,0",
  "set": "Zone,Component,LogicalComponent,1,SVC_ENV_LIGHTING,DimmerSet,Address1,XXX,Address2,Y,DimmerLevel,VARLEVEL",
  "query": "Component.LogicalComponent.DimmerLevel_XXX_Y"
}
```

- Replace `Zone`, `Component`, `LogicalComponent`, `XXX`, `Y` with values from your system.
- `VARLEVEL` is automatically replaced with the brightness value (0–100) when the user adjusts the slider.
- `query` is the state name that returns the current dimmer level (0–100).

### Switch (on/off)

For non-dimmable loads (relays, on/off lights). Same as lightbulb but without `set`.

```json
{
  "name": "Porch Light",
  "type": "switch",
  "on": "Zone,Component,LogicalComponent,1,SVC_ENV_LIGHTING,SwitchOn,Address1,XXX,Address2,Y",
  "off": "Zone,Component,LogicalComponent,1,SVC_ENV_LIGHTING,SwitchOff,Address1,XXX,Address2,Y",
  "query": "Component.LogicalComponent.DimmerLevel_XXX_Y"
}
```

- `query` returns 0 (off) or >0 (on).

### Thermostat (HVAC)

For air conditioning / heating. The plugin automatically discovers the HVAC mode and setpoint states from the `queryTemp` state name.

```json
{
  "name": "AC Living Room",
  "type": "thermostat",
  "off": "Zone,Component,LogicalComponent,1,SVC_ENV_SINGLE_SETPOINT_HVAC,SetHVACModeOff,ThermostatAddress,XXX:N",
  "cool": "Zone,Component,LogicalComponent,1,SVC_ENV_SINGLE_SETPOINT_HVAC,SetHVACModeCool,ThermostatAddress,XXX:N",
  "heat": "Zone,Component,LogicalComponent,1,SVC_ENV_SINGLE_SETPOINT_HVAC,SetHVACModeHeat,ThermostatAddress,XXX:N",
  "set": "Zone,Component,LogicalComponent,1,SVC_ENV_SINGLE_SETPOINT_HVAC,SetSingleSetPointTemperature,ThermostatAddress,XXX:N,SetPointTemperature,VARTEMP",
  "queryTemp": "Component.LogicalComponent.ThermostatCurrentTemperature_XXX:N"
}
```

- Replace `XXX:N` with your thermostat address (e.g., `101:1`).
- `VARTEMP` is replaced with the target temperature (16–30°C) when the user adjusts the slider.
- `queryTemp` is the state name for current temperature. The plugin **automatically derives** the following states from it:
  - `IsCurrentHVACModeCool_XXX:N` — whether HVAC is cooling (0/1)
  - `IsCurrentHVACModeHeat_XXX:N` — whether HVAC is heating (0/1)
  - `ThermostatCurrentSetPoint_XXX:N` — target temperature
- Omit `heat` if your system only supports cooling (common in tropical climates).
- Omit `cool` if your system only supports heating.

### How to find your thermostat addresses

```bash
# Search for thermostat states
sclibridge statenames Thermostat

# You'll see patterns like:
# Component.LogicalComponent.ThermostatCurrentTemperature_101:1
# Component.LogicalComponent.ThermostatCurrentTemperature_101:2
# Component.LogicalComponent.IsCurrentHVACModeCool_101:1
# Component.LogicalComponent.ThermostatCurrentSetPoint_101:1

# Each address (101:1, 101:2, etc.) is a different thermostat/zone
```

## Scenes

Scenes are auto-discovered from the Savant OpenAPI (port 3060) and exposed as momentary switches in HomeKit. Tap a scene switch to activate it — it automatically turns off after 200ms.

Set `"discoverScenes": false` in the config to disable scene discovery.

## How It Works

1. **Startup** — Plugin connects to both ports, discovers zones and scenes
2. **onGet** — Returns cached values instantly (no network calls, no blocking)
3. **Background poll** — Every 30s, queries each accessory state sequentially via the Ruby bridge
4. **onSet** — Sends commands immediately through the serial queue
5. **Bridge** — Ruby TCPServer accepts HTTP GET, runs `sclibridge` subprocess, returns result

The plugin uses a serial command queue (one request at a time) to avoid overwhelming the Savant Host. The Ruby bridge limits concurrent `sclibridge` processes to 3 and caches `readstate` results for 2 seconds.

## Troubleshooting

### Plugin loads but accessories don't respond
- Verify the Ruby bridge is running: `curl http://SAVANT_HOST_IP:12000/userzones`
- Check that your state names are correct: `sclibridge readstate YourStateName`
- Look at the Homebridge log for error messages

### Temperature shows but HVAC mode is always Off
- Run `sclibridge statenames HVAC` to check if your system uses the `IsCurrentHVACModeCool` / `IsCurrentHVACModeHeat` boolean states
- Verify with: `sclibridge readstate Component.LogicalComponent.IsCurrentHVACModeCool_XXX:N`
- The plugin derives mode states from `queryTemp` — make sure `queryTemp` follows the pattern `Prefix.ThermostatCurrentTemperature_Address`

### Lights don't respond to on/off
- Test the command directly: `sclibridge servicerequest Zone Component LogicalComponent 1 SVC_ENV_LIGHTING SwitchOn Address1 XXX Address2 Y`
- Verify the dimmer state: `sclibridge readstate Component.LogicalComponent.DimmerLevel_XXX_Y`

### Scenes not found
- Check the Savant OpenAPI: `curl http://SAVANT_HOST_IP:3060/config/v1/scenes`
- Port 3060 must be accessible from the Homebridge machine

## Credits

- **[benumc](https://github.com/benumc)** — The Ruby HTTP bridge (`bridge_logic.rb`) is based on [SCLI_HTTP](https://github.com/benumc/SCLI_HTTP), and the device command/state formats used in this plugin come from Savant Blueprint profiles created by benumc. His work on bridging `sclibridge` to HTTP and creating reusable profiles for the Savant ecosystem made this integration possible.

## License

MIT
