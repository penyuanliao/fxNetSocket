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

    if (typeof cb == "undefined" && option instanceof Function) {
        cb = option;
        option = undefined;
    }

    var client = new fxSocket(socket);
    this._client = client;

    if (typeof option == "object" && option instanceof Object) {
        if (typeof option["binaryType"] == "string") this.setBinaryType(option["binaryType"]);
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

        client.socket.on('data', function (chunk) {

            var data = chunk;
            var currSize = chunk.length;
            self.mode = mode;
            if (mode === fxStatus.websocket) {
                while (chunk.length > 0) {
                    var obj = client.read(chunk);
                    data = obj.msg;
                    if(obj.opcode == 8)
                    {
                        client.close();
                        return;
                    }
                    chunk = chunk.slice(client.protocol.byteLength, chunk.length);
                    if (currSize == chunk.length) {
                        chunk = chunk.slice(chunk.length, chunk.length);
                    } else {
                        currSize = chunk.length;
                    }
                    self.emit("data", chunk);
                    if (typeof data != "undefined") self.emit('message',data);
                }
                return;
            }else if (mode === fxStatus.flashSocket || mode === fxStatus.socket) {
                data = data.toString('utf8');
            }
            self.emit("data", chunk);
            if (typeof data != "undefined") self.emit('message',data);
        });

    };
    socket.on('close',  function () {
        self.emit('close');
    });
    socket.on('end',    function () {
        self.emit('end');
    });
    socket.on('error',  function (err) {
        self.emit('error',err);
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


module.exports = exports = FxWebSocketClient;