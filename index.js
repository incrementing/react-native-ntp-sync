let NTPSync = function () {
  this.client = require("./client");

  this.ntpServers = [
    { server: "0.pool.ntp.org", port: 123 },
    { server: "1.pool.ntp.org", port: 123 },
    { server: "2.pool.ntp.org", port: 123 },
    { server: "3.pool.ntp.org", port: 123 },
  ];

  this.limit = 10;
  this.currentIndex = 0;
  this.tickId = null;
  this.tickRate = 300;
  this.tickRate = this.tickRate * 1000;
  this.historyDetails = {
    currentConsecutiveErrorCount: 0,
    currentServer: this.ntpServers[this.currentIndex],
    deltas: [],
    errors: [],
    isInErrorState: false,
    lastSyncTime: null,
    lastNtpTime: null,
    lastError: null,
    lifetimeErrorCount: 0,
    maxConsecutiveErrorCount: 0,
  };
  this.syncTime();
  this.startTick();
};

/**
 * @private
 */
NTPSync.prototype.computeAndUpdate = function (ntpDate) {
  let tempServerTime = ntpDate.getTime();
  let tempLocalTime = Date.now();
  let dt = tempServerTime - tempLocalTime;
  if (this.historyDetails.deltas.length === this.limit) {
    this.historyDetails.deltas.shift();
  }
  this.historyDetails.deltas.push({
    dt: dt,
    ntp: tempServerTime,
  });
  this.historyDetails.lastSyncTime = tempLocalTime;
  this.historyDetails.lastNtpTime = tempServerTime;
  return dt;
};

/**
 * @private
 */
NTPSync.prototype.getDelta = function (callback) {
  let fetchingServer = Object.assign({}, this.historyDetails.currentServer);
  this.client.getNetworkTime(
    this.historyDetails.currentServer.server,
    this.historyDetails.currentServer.port,
    function (err, date) {
      if (err) {
        this.shiftServer();
        let ex = err;
        if (!ex) {
          ex = new Error("unknown error");
        } else if (!(ex instanceof Error)) {
          if (typeof ex === "string") {
            ex = new Error(ex);
          } else {
            ex = new Error(ex.toString());
          }
        }
        if (callback) {
          callback(ex, fetchingServer);
        }
      } else {
        let delta = this.computeAndUpdate(date);
        if (callback) {
          callback(delta, fetchingServer);
        }
      }
    }.bind(this)
  );
};

NTPSync.prototype.getHistory = function () {
  return JSON.parse(JSON.stringify(this.historyDetails));
};

NTPSync.prototype.getTime = function () {
  let sum = this.historyDetails.deltas.reduce((a, b) => {
    return a + b.dt;
  }, 0);
  let avg = Math.round(sum / this.historyDetails.deltas.length) || 0;
  return Date.now() + avg;
};

NTPSync.prototype.shiftServer = function () {
  if (this.ntpServers.length > 1) {
    this.currentIndex++;
    this.currentIndex %= this.ntpServers.length;
  }
  this.historyDetails.currentServer = this.ntpServers[this.currentIndex];
};

NTPSync.prototype.startTick = function () {
  if (!this.tickId) {
    this.tickId = setInterval(
      function () {
        this.syncTime();
      }.bind(this),
      this.tickRate
    );
  }
};

NTPSync.prototype.syncTime = function () {
  function internalCallback(result, server) {
    var success = false;
    if (typeof result === "number") {
      success = true;
      this.historyDetails.currentConsecutiveErrorCount = 0;
      this.historyDetails.isInErrorState = false;
    } else if (result instanceof Error) {
      // extract Error data
      var ed = {
        name: result.name,
        message: result.message,
        server: server,
        stack: result.stack,
        time: Date.now(),
      };
      this.historyDetails.currentConsecutiveErrorCount++;
      if (this.historyDetails.errors.length === this.limit) {
        this.historyDetails.errors.shift();
      }
      this.historyDetails.errors.push(ed);
      this.historyDetails.isInErrorState = true;
      this.historyDetails.lastError = ed;
      this.historyDetails.lifetimeErrorCount++;
      this.historyDetails.maxConsecutiveErrorCount = Math.max(
        this.historyDetails.maxConsecutiveErrorCount,
        this.historyDetails.currentConsecutiveErrorCount
      );
    }
  }

  this.getDelta(internalCallback.bind(this));
};

module.exports = NTPSync;
