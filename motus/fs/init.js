/*
 * Copyright (c) 2020 Thru Technologies
 * All rights reserved
 */

load('api_aws.js');
load('api_azure.js');
load('api_config.js');
load('api_dash.js');
load('api_events.js');
load('api_gcp.js');
load('api_gpio.js');
load('api_mqtt.js');
load('api_shadow.js');
load('api_timer.js');
load('api_sys.js');
load('api_watson.js');

let btn = 5;                                      // Built-in button GPIO
let led = Cfg.get('board.led1.pin');              // Built-in LED GPIO number
let onhi = Cfg.get('board.led1.active_high');     // LED on when high?
let state = {motion: 0, uptime: 0};           // Device state
let online = false;                               // Connected to the cloud?

let setLED = function(on) {
  let level = onhi ? on : !on;
  GPIO.write(led, level);
  print('LED on ->', on);
};

GPIO.set_mode(led, GPIO.MODE_OUTPUT);
setLED(state.motion);

let reportState = function() {
  Shadow.update(0, state);
};

// Update state every second, and report to cloud if online
Timer.set(1000, Timer.REPEAT, function() {
  state.uptime = Sys.uptime();
  state.ram_free = Sys.free_ram();
  print('online:', online, JSON.stringify(state));
  if (online) reportState();
}, null);

// Look for motion every 2 seconds.
Timer.set(2000 /* 2 sec */ , true /* repeat */ , function () {
  // check if state different
  let currentState = GPIO.read(btn);

  if (currentState !== state.motion) {
    let Timestamp = Timer.now();
    let datetime = Timer.fmt("%Y-%m-%d %H:%M:%S", Timestamp);

    state.motion = currentState;
    state.timestamp = datetime;
    
    let message = JSON.stringify(state);
    let sendMQTT = true;
    // AWS is handled as plain MQTT since it allows arbitrary topics.
    if (AWS.isConnected() || (MQTT.isConnected() && sendMQTT)) {
      let topic = 'devices/' + Cfg.get('device.id') + '/events';
      print('== Publishing to ' + topic + ':', message);
      MQTT.pub(topic, message, 0 /* QoS */);
    } else if (sendMQTT) {
      print('== Not connected!');
    }
  }
}, null);

// Set up Shadow handler to synchronise device state with the shadow state
Shadow.addHandler(function(event, obj) {
  if (event === 'UPDATE_DELTA') {
    print('GOT DELTA:', JSON.stringify(obj));
    for (let key in obj) {  // Iterate over all keys in delta
      if (key === 'motion') {   // We know about the 'on' key. Handle it!
        state.motion = obj.on;  // Synchronise the state
        setLED(state.motion);   // according to the delta
      } else if (key === 'reboot') {
        state.reboot = obj.reboot;      // Reboot button clicked: that
        Timer.set(750, 0, function() {  // incremented 'reboot' counter
          Sys.reboot(500);                 // Sync and schedule a reboot
        }, null);
      }
    }
    reportState();  // Report our new state, hopefully clearing delta
  }
});

Event.on(Event.CLOUD_CONNECTED, function() {
  online = true;
  Shadow.update(0, {ram_total: Sys.total_ram()});
}, null);

Event.on(Event.CLOUD_DISCONNECTED, function() {
  online = false;
}, null);
