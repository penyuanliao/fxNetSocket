/**
 * Created by penyuan on 2016/4/14.
 */
var util = require('util');
const utility = require('./FxUtility.js');
const fxSocket = require('./FxSocket.js');
const events = require('events');
const fxStatus = require('./FxEnum.js').fxStatus;
//
// socket
//

util.inherits(FxWebSocketClient, events.EventEmitter); // 繼承事件

function FxWebSocketClient(socket, option, cb) {

    var self = this;
    this.self = self;
    this.splitsReceiveLimitCount = 100;
    if (typeof cb == "undefined" && option instanceof Function) {
        cb = option;
        option = undefined;
    }

    var client = new fxSocket(socket);
    this._client = client;

    if (typeof option == "object" && option instanceof Object) {
        if (typeof option["binaryType"] == "string") this.setBinaryType(option["binaryType"]);
        if (typeof option["splitsReceiveLimitCount"] == "number") this.splitsReceiveLimitCount = option.splitsReceiveLimitCount;
        else this.splitsReceiveLimitCount = 100;
    }

    socket.once('data', function (data) {
        var mode = utility.findOutSocketConnected(client, data, self);
        client.isConnect = true;
        addUpdateData(mode, client);
        if (cb) cb();
    });
    /**
     * 確定連線後連線資料事件並傳出data事件
     * @param mode 型態(fxStatus)
     * @param client 來源socket
     */
    function addUpdateData(mode, client) {
        var count = 0;
        var chunkBuffer = Buffer.from([]);
        self.mode = mode;

        if (typeof option == "object" && typeof option.ejection != "undefined" && option.ejection.indexOf(mode) != -1) {
            self._client.close();
            return;
        }

        client.socket.on('data', function (chunk) {
            if (typeof chunkBuffer == "undefined" || chunkBuffer.length <= 0) {
                chunkBuffer = Buffer.from(chunk);
            } else {
                chunkBuffer = Buffer.concat([chunkBuffer, chunk], chunkBuffer.length + chunk.length);
            }
            chunk = chunkBuffer;
            var data = chunk;
            var currSize = chunk.length;
            if (mode === fxStatus.websocket) {
                count = 0;
                while (chunk.length > 0 && count < self.splitsReceiveLimitCount) {
                    count++;
                    var obj = client.read(chunk);
                    if (obj.total > chunk.length) {
                        return;
                    }
                    if (typeof obj == "undefined") obj = {opcode:8};
                    data = obj.msg;

                    if(obj.opcode == 8)
                    {
                        client.close();
                        return;
                    }

                    chunkBuffer = chunk.slice(client.protocol.total, chunkBuffer.length);
                    chunk = chunkBuffer;

                    if (currSize == chunk.length) {
                        chunk = chunk.slice(chunk.length, chunk.length);
                    } else {
                        currSize = chunk.length;
                    }
                    if (obj.fin === false) {
                        self.emit("error2", "obj.fin === false");
                        continue;
                    }
                    if (client.compress == "aes-256-cbc") {
                        data = client.decryption(data);
                    }
                    self.emit("data", chunk);


                    if (client.pingEnable == true && self.recordPing(client, data) == true) continue;
                    try {
                        if (typeof data != "undefined") self.emit('message',data);
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
            }else if (mode === fxStatus.flashSocket || mode === fxStatus.socket) {
                data = data.toString('utf8');
                chunkBuffer = undefined;
            } else {
                chunkBuffer = undefined;
            }
            self.emit("data", chunk);
            if (client.pingEnable == true && self.recordPing(client, data) == true) return;
            if (typeof data != "undefined") self.emit('message',data);
        });

    };
    socket.on('close',  function () {
        self.emit('close');
        chunkBuffer = undefined;
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
        }
    });
};
FxWebSocketClient.prototype.write = function (data) {

    if (!this._client) return false;
    if (typeof data == 'string') {
        this._client.write(data);
    }else if (typeof data == 'object') {
        this._client.write(JSON.stringify(data));
    }else {
        return false;
    }
    return true;
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
        var json = JSON.parse(data);
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

module.exports = exports = FxWebSocketClient;
