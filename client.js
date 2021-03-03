import BackgroundTimer from "react-native-background-timer";
import { Buffer } from "buffer";
import dgram from "react-native-udp";

setTimeout = (fn, ms = 0) => {
  const numberMs = Number(ms);
  if (isNaN(numberMs)) return BackgroundTimer.setTimeout(fn, 0);
  return BackgroundTimer.setTimeout(fn, numberMs);
};
clearTimeout = (fn, ms = 0) => {
  const numberMs = Number(ms);
  if (isNaN(numberMs)) return BackgroundTimer.clearTimeout(fn, 0);
  return BackgroundTimer.clearTimeout(fn, numberMs);
};

/**
 * Gets the current time from the parsed NTP Server.
 * @param {String} server IP/Hostname of the NTP server
 * @param {Number} port Port of the NTP server
 */
export const getNetworkTime = (server, port, callback) => {
  let client = dgram.createSocket({
    type: "udp4",
    debug: false,
  });
  //client.bind(0);

  let data = Buffer.alloc(48);
  data[0] = 0x1b;
  for (let i = 1; i < 48; i++) {
    data[i] = 0;
  }

  let timeout = setTimeout(() => {
    client.close();
    callback("timed out waiting for response", null);
  }, 10000);

  let error = false;

  client.on("error", err => {
    if (error) {
      return;
    }

    callback(err, null);
    error = true;
    clearTimeout(timeout);
  });

  client.once("message", msg => {
    clearTimeout(timeout);
    client.close();

    let offsetTransmitTime = 40,
      intpart = 0,
      fractpart = 0;

    for (var i = 0; i <= 3; i++) {
      intpart = 256 * intpart + msg[offsetTransmitTime + i];
    }

    for (i = 4; i <= 7; i++) {
      fractpart = 256 * fractpart + msg[offsetTransmitTime + i];
    }

    let milliseconds = intpart * 1000 + (fractpart * 1000) / 0x100000000;

    let date = new Date("Jan 01 1900 GMT");
    date.setUTCMilliseconds(date.getUTCMilliseconds() + milliseconds);

    callback(null, date);
  });

  client.once("listening", () => {
    client.send(data, 0, data.length, port, server, err => {
      if (err) {
        if (error) {
          return;
        }
        clearTimeout(timeout);
        callback(err, null);
        error = true;
        client.close();
        return;
      }
  
    });
  });
  client.bind(0);

};
