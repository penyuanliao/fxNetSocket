"use strict";
/**
 * Created by penyuan on 2016/4/14.
 * @version 2.0.0
 */
var util = require('util');
const utility = require('./FxUtility.js');
const fxSocket = require('./FxSocket.js');
const events = require('events');
const fxStatus = require('./FxEnum.js').fxStatus;
util.inherits(FxWebSocketClient, events.EventEmitter); // 繼承事件
/**
 *
 * @param {module:net.Socket} socket
 * @param {Object} option 設定參數
 * @param {function} cb 回傳連線成功事件
 * @constructor
 */
function FxWebSocketClient(socket, option, cb) {

    const self = this;
    this.nPingPong = false;
    this.splitsReceiveLimitCount = 100;
    if (typeof cb == "undefined" && option instanceof Function) {
        cb = option;
        option = undefined;
    }

    const client = new fxSocket(socket, self);
    this._client = client;

    if (typeof option == "object" && option instanceof Object) {
        if (typeof option["binaryType"] == "string") this.setBinaryType(option["binaryType"]);
        if (typeof option.binary == "boolean") this.setForcedBinary(option.binary);
        if (typeof option.baseEvtShow == "boolean") client.baseEvtShow = option.baseEvtShow;
        if (typeof option["splitsReceiveLimitCount"] == "number") this.splitsReceiveLimitCount = option.splitsReceiveLimitCount;
        else this.splitsReceiveLimitCount = 50;
        if (typeof option.nativePingPong == "boolean") this.nPingPong = option.nativePingPong;
        if (typeof option.zlibDeflatedEnabled == "boolean") {
            client.zlibDeflatedEnabled = option.zlibDeflatedEnabled;
        }
    }

    socket.once('data', function (data) {
        var mode = utility.findOutSocketConnected(client, data, self);
        client.isConnect = true;
        addUpdateData(mode, client);
        client.emit("connect");
        if (self.nPingPong) client.write('', 9);
        if (cb) cb();
    });
    /**
     * 確定連線後連線資料事件並傳出data事件
     * @param mode 型態(fxStatus)
     * @param client 來源socket
     */
    function addUpdateData(mode, client) {
        self.mode = mode;
        if (typeof option == "object" && typeof option.ejection != "undefined" && option.ejection.indexOf(mode) != -1) {
            self._client.close();
            return;
        }

        client.socket.on('data', function (chunk) {
            if (mode !== fxStatus.websocket || client.zlibDeflatedEnabled == false) {
                socket.on('data', function (data) {
                    getData(data, mode);
                });
            } else {
                socket.pipe(client.revicer.reader);
                client.sender.pipe(socket);
            }
        });

    };
    let count = 0;
    let chunkBuffer = Buffer.from([]);
    let first = false;
    function getData(chunk, mode) {
        if (typeof chunkBuffer == "undefined" || chunkBuffer.length <= 0) {
            chunkBuffer = Buffer.from(chunk);
        } else {
            chunkBuffer = Buffer.concat([chunkBuffer, chunk], chunkBuffer.length + chunk.length);
        }
        let data;
        var currSize = chunkBuffer.length;
        if (mode === fxStatus.websocket) {
            count = 0;
            while (chunkBuffer.length > 0 && count < self.splitsReceiveLimitCount) {
                count++;
                var obj = client.read(chunkBuffer);
                if (obj.total > chunkBuffer.length) {
                    return;
                }
                if (typeof obj == "undefined") obj = {opcode:8};
                data = obj.msg;
                if(obj.opcode == 8)
                {
                    client.close();
                    return;
                }

                chunkBuffer = chunkBuffer.slice(client.protocol.total, chunkBuffer.length);

                if (currSize == chunkBuffer.length) {
                    chunkBuffer = chunkBuffer.slice(chunkBuffer.length, chunkBuffer.length);
                } else {
                    currSize = chunkBuffer.length;
                }
                if (obj.fin === false) {
                    self.emit("error2", "obj.fin === false");
                    continue;
                }
                if (client.encryption == "aes-256-cbc") {
                    data = client.decryption(data);
                }
                if (client.pingEnable == true && self.recordPing(client, data) == true) continue;
                self.emit("data", obj.binary);
                try {
                    if (typeof data != "undefined") self.emit('message', data);
                } catch (e) {
                    var d = "";
                    if (data == "[object Uint8Array]") {
                        client.close();
                    } else {
                        self.emit("error2", "FxWebSocketClient::LEN(" + data.length + String(data) + ")," + "\n" + e.toString());
                    }
                }
            }
            if (count === self.splitsReceiveLimitCount) {
                self.emit("error", util.format("Splits the received ByteBufs on limit max count %s.", self.splitsReceiveLimitCount));
                client.close();
                chunkBuffer = undefined;
            }
            return;
        } else if (mode === fxStatus.flashSocket) {
            self.emit("data", chunk);
            var offset = chunkBuffer.indexOf("\0");
            while (offset != -1) {
                data = chunkBuffer.slice(0, offset);
                chunkBuffer = chunkBuffer.slice(offset+1, chunkBuffer.length);
                offset = chunkBuffer.indexOf("\0");
                if (client.pingEnable == true && self.recordPing(client, data) == true) continue;

                if (typeof data != "undefined") self.emit('message', data.toString());
                data = undefined;
            }
            return;

        } else if (mode === fxStatus.socket) {
            data = chunkBuffer.toString('utf8');
            chunkBuffer = undefined;
        } else {
            chunkBuffer = undefined;
        }
        self.emit("data", chunk);
        if (client.pingEnable == true && self.recordPing(client, data) == true) return;
        if (typeof data != "undefined") self.emit('message',data);
    }
    socket.on('close',  function () {
        self.emit('close');
    });
    socket.on('end',    function () {
        self.emit('end');
    });
    socket.on('error',  function (err) {
        self.emit('error',err);
    });
    self.on("error", function (err) {});
    Object.defineProperties(this, {
        "originAddress": {
            get:function () { return client.originAddress; },
            configurable: false,
            enumerable: false
        },
        "headers": {
            get:function () { return client.headers; },
            configurable: false,
            enumerable: false
        },
        "authorized": {
            get: function () {
                return client.authorized;
            },
            configurable: false,
            enumerable: false
        },
        "fourWayHandshake": {
            set:function (val) {
                if (typeof val != "boolean") return;
                client.finTCP = val;
            },
            get: function () {
                return client.finTCP;
            },
            configurable: false,
            enumerable: false
        },
        "setForcedBinary": {
            set: function (value) {
                if (typeof value == "boolean") {
                    client.forcedBinary = value;
                }
            },
            get: function () {
                return client.forcedBinary;
            },
            configurable: false,
            enumerable: false
        }
    });
};
FxWebSocketClient.prototype.write = function (data) {

    if (!this._client) return false;
    if (typeof data == 'string') {
        return this._client.write(data);
    } else if (typeof data == 'object') {
        return this._client.write(JSON.stringify(data));
    }
    return false;
};
FxWebSocketClient.prototype.read = function (chunk) {
    var obj = this._client.read(chunk);
    return obj;
};
FxWebSocketClient.prototype.destroy = function () {
    this._client.close();
};
FxWebSocketClient.prototype.setBinaryType = function (type) {
    this._client.binaryType = type;
}
FxWebSocketClient.prototype.recordPing = function (client, data) {

    if (typeof data == "undefined" || data == null) return false;

    if (data.indexOf('"ping":') != -1) {
        var json;
        if (data.indexOf('"rtt":') != -1 && data.indexOf(',') == -1) return true;
        json = JSON.parse(data);
        if (typeof json.ping != "number" && typeof json.rtt != "number") return false;
        var ping = client.probeResult(json);
        if (typeof data != "undefined") this.emit("ping", {ping:ping});
        return true;
    }
    return false;
}
FxWebSocketClient.prototype.__defineSetter__("pingEnable", function (bool) {
    this._client.pingEnable = bool;
});
FxWebSocketClient.prototype.__defineGetter__("pingEnable", function () {
    return this._client.pingEnable;
});
const FxWS = require("./FxWebSocket.js")
FxWebSocketClient.createWebSocket = function (url) {
    return FxWS = new FxWS(url);
};

module.exports = exports = FxWebSocketClient;
