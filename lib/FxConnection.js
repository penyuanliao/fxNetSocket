/**
 * Created by Benson.Liao on 2015/11/20.
 */
"use strict";
var debug = require('debug')('Connect');
debug.log = console.log.bind(console); //file log 需要下這行
var tls = require('tls'), // SSL certificate
    fs = require('fs');
var net = require('net');
var util = require('util');
var events = require('events');
var utility = require('./FxUtility.js');

var fxSocket = require('./FxSocket.js');

var fxStatus = require('./FxEnum.js').fxStatus;
const crypto = require('crypto');
//var clients = []; // 紀錄使用者
// var connections = 0; //記錄使用者數目

util.inherits(FxConnection, events.EventEmitter); // 繼承事件

// todo enum event dispach

/**
 * initialize net.socket
 * @param port
 * @param option
 * @constructor
 **/
function FxConnection(port, option) {

    /* Variables */

    events.EventEmitter.call(this);

    var self = this;
    this.connections = 0;
    this.self = self;
    this.clusters = []; // all child process group
    /* packet Splicing on subpackage */
    this.doSplitPackage = false;
    this._sockDefaults = {"binaryType":"string"};
    /* default ping user event disabled */
    this._userPingEnabled = false;
    if (typeof option === 'undefined') {
        option = {
            'runListen':true,
            'glListener' : true,
            'splitsReceiveLimitCount':100
        };
    };
    if (typeof option.splitsReceiveLimitCount != "number") option.splitsReceiveLimitCount = 100;
    this.clients = [];

    this.glListener = (typeof option.glListener != "undefined" ? option.glListener : true); // 集中監聽事件 message, disconnect

    /* Codes */
    var app = this.app = net.createServer();

    var cb = function () {
        debug('Listening on ' + app.address().port);

        self.emit("Listening", app);

    };

    app.on("error", function (err) {
        self.emit("error", err);
    });
    app.on("close", function (err) {
        self.emit("close", err);
    })

    if (option.runListen)
        this.server = this.app.listen(port, cb);

    this.app.on('connection', function(socket) {
        if (typeof option.baseEvtShow != "undefined") socket.baseEvtShow = option.baseEvtShow;
        var client = new fxSocket(socket);

        self.setSockOptions(client);

        if (self.userPingEnabled) client.pingEnable = true;

        self.connections++;
        // First one, do check connected.
        socket.once('data', function (data) {
            var mode = utility.findOutSocketConnected(client, data, self);
            debug("[Connection] Client through Server for mode " + mode);
            if (mode == fxStatus.socket) {

            }
            if (mode != fxStatus.http)
            {
                client.isConnect = true;
                addUpdateData(mode, client);
                // debug("[INFO] Add client mode:",client.mode);
                self.clients[client.name] = client; //TODO 二維分組namespace物件
            }else if (client.headers["Transfer-Encoding"] == 'chunked' && client.headers["Method"] == "POST") {
                self.httpChunked(socket, client.namespace);
            } else {
                //var http = data.toString('utf8');
                //client.close();
            };
        });

        /**
         * 確定連線後連線資料事件並傳出data事件
         * @param mode 型態(fxStatus)
         * @param client 來源socket
         */
        function addUpdateData(mode, client) {
            var count = 0;
            var chunkBuffer = Buffer.from([]);
            socket.on('data', function (chunk) {
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
                    while (chunk.length > 0 && count < option.splitsReceiveLimitCount) {
                        count++;
                        var obj = client.read(chunk);
                        if (obj.total > chunk.length) {
                            return;
                        }
                        if (typeof obj == "undefined") obj = {opcode:8};
                        data = obj.msg;
                        if(obj.opcode == 8)
                        {
                            self.clientDestroy(client);
                            return; // Event Data Close
                        }
                        chunkBuffer = chunk.slice(client.protocol.total, chunkBuffer.length);
                        chunk = chunkBuffer;
                        if (currSize == chunk.length) {
                            chunk = chunk.slice(chunk.length, chunk.length);
                        } else {
                            currSize = chunk.length;
                        }
                        if (obj.fin === false) {
                            continue;
                        }

                        if (client.compress == "aes-256-cbc") {
                            data = client.decryption(data);
                        }

                        if (client.pingEnable && self.recordPing(client, data) == true) {

                            continue;
                        }
                        if (self.glListener)
                        {
                            if (typeof data != "undefined") self.emit("message", {'client':client,'data':data});
                        }
                        else
                        {
                            if (typeof data != "undefined") client.emit("message", data);
                        }
                    }
                    if (count === option.splitsReceiveLimitCount) {
                        client.emit("error", util.format("Splits the received ByteBufs on limit max count %s.", option.splitsReceiveLimitCount));
                        client.close();
                        chunkBuffer = undefined;
                    }
                    return;

                }else if (mode === fxStatus.flashSocket || mode === fxStatus.socket) {
                    data = data.toString('utf8');
                    // packet Splicing on subpackage
                    if (self.doSplitPackage) {
                        var len = doSubpackage(data, client);
                        chunkBuffer = chunkBuffer.slice(len, chunkBuffer.length);
                        return;
                    } else {
                        chunkBuffer = undefined;
                    }
                } else {
                    chunkBuffer = undefined; //http
                }
                if (client.pingEnable && self.recordPing(client, data) == true) {
                    chunkBuffer = chunkBuffer.slice(data.length, data.length);
                    return;
                }
                if (self.glListener)
                {
                    if (typeof data != "undefined") self.emit("message", {'client':client,'data':data});
                }
                else
                {
                    if (typeof data != "undefined") client.emit("message", data);
                }


            });
            socket.on('close', function () {
                chunkBuffer = undefined;
            })
        };

        function doSubpackage(data, client) {
            var subpackage = data.match(/(\{.+?\})(?={|$)/g);
            var len = 0;
            for (var i = 0; i < subpackage.length; i++) {
                var packet = subpackage[i];
                len += Buffer.byteLength(packet);
                if (self.glListener)
                    self.emit("message", {'client':client,'data':packet});
                else
                    client.emit("message", packet);
            }
            return len;
        }


        socket.on('close',  sockDidClosed);
        socket.on('end',    sockDidEnded);
        socket.on('error',  sockDidErrored);
        client.on("error", function (err) {});
    });

    function sockDidClosed() {

        var socket = this;
        socket.isConnect = false;
        self.connections--;
        var client = self.clients[socket.name];
        delete self.clients[socket.name];

        if (self.glListener)
            self.emit('disconnect', socket.name);
        else
        {
            if (typeof client != "undefined") client.emit('disconnect', socket.name);
        }
        debug('LOG::SOCKET WILL CLOSED : COUNT(%d)', self.connections);
    };

    function sockDidEnded() {
        debug('LOG::SOCKET ENDED');
        var socket = this;
        socket.end();
    };

    function sockDidErrored(e) {
        debug('LOG::SOCKET ERROR:',e);
        var client = self.clients[this.name];
        if (self.glListener) {
            self.emit('error', e);
        } else {
            if (typeof client != "undefined") client.emit('error', e);
        }

    };

};
FxConnection.prototype.clientDestroy = function (client) {

    client.write(JSON.stringify({"NetStatusEvent":"Connect.Closed"}));
    client.close();
    // this.emit('disconnect');
};
FxConnection.prototype.eventDispatch = function (client,evt) {

    if (typeof client !== 'undefined' && client !== null) return;

    // Connect.Success 1
    // Connect.Rejected 2
    // Connect.AppReboot 3
    // Connect.AppShutdown 4
    // Connect.Closed 5
    // Connect.Failed 6

    if (typeof evt === 'number') {
        var e = "";
        if (evt == 1) {
            e = "Success";
        }else if (evt == 2) {
            e = "Rejected";
        }else if (evt == 3) {
            e = "AppReboot";
        }else if (evt == 4) {
            e = "AppShutdown";
        }else if (evt == 5) {
            e = "Closed";
        }else if (evt == 6) {
            e = "Failed";
        }
        client.write(JSON.stringify({"NetStatusEvent":e}));


    }else
    {
        client.write(JSON.stringify(evt));
    }

};
/***
 * only accepts secure connections
 * @param option : {"key":"public key", "cert": "public cert"}
 * @constructor
 */
FxConnection.prototype.FxTLSConnection = function (option){
    //https server only deff need a certificate file.
    var loadKey = fs.readFileSync('keys/skey.pem');
    var loadcert = fs.readFileSync('keys/scert.pem');
    var options = {
        key : loadKey,
        cert: loadcert
    };

    var self = this.self;

    tls.createServer(options, function (socket) {
        debug('TLS Client connection established.');

        // Set listeners
        socket.on('readable', function () {
            debug('TRACE :: Readable');

        });

        var client = new fxSocket(socket);
        socket.on('data', function (data) {
            debug('::TRACE DATA ON STL CLIENT');
            sockDidData(client, data, self);
        });

    }).listen(8081);

};

/**
 *
 * @param namespace
 * @returns {Array}
 */
FxConnection.prototype.getClients = function (namespace) {
    if (typeof namespace === 'undefined' || namespace == null ) return this.clients;

    // output array
    // TODO 不確定這樣寫法要不要留
    var keys = Object.keys(this.clients);
    var groups = [];
    for (var i = 0 ; i < keys.length; i++) {
        var socket = this.clients[keys[i]];
        if (socket.isConnect == true) {
            if (socket.namespace === namespace)
                groups.push(socket);
        }
    }
    return groups;

};
/**
 * 計算使用者數量
 * @param namespace
 * @returns {*}
 */
FxConnection.prototype.getConnections = function (namespace) {
    if (this.clients === null) return 0;
    // if (typeof namespace === 'undefined' || namespace == null ) return Object.keys(clients).length;
    // var keys = Object.keys(clients);

    // return this.getClients(namespace).length;

    return this.connections;

};
FxConnection.prototype.setMD5= function (text) {
    return crypto.createHash('md5').update(text).digest('hex');
};

FxConnection.prototype.httpChunked = function (socket, namespace) {
    var self = this;
    socket.on('data', function (chunk) {
        self.emit('data', chunk, namespace);
    })
};
FxConnection.prototype.setSockOptions = function (client) {
    client.binaryType = this._sockDefaults["binaryType"];

    if (this._sockDefaults["ContentEncode"] != "" && typeof this._sockDefaults["ContentEncode"] != "undefined") {
        client.setCompression = this._sockDefaults["ContentEncode"];
    }

}
FxConnection.prototype.recordPing = function (client, data) {

    if (typeof data == "undefined" || data == null) return false;
    
    if (data.indexOf('"ping":') != -1) {
        var json = JSON.parse(data);
        if (typeof json.ping != "number" && typeof json.rtt != "number") return false;
        var ping = client.probeResult(json);

        if (this.glListener)
        {
            if (typeof data != "undefined") this.emit("ping", {client:client, ping:ping});
        }
        else
        {
            if (typeof data != "undefined") client.emit("ping", ping);
        }

        return true;
    }
    return false;
}
/**
 * {Boolean} bool
 */
FxConnection.prototype.__defineSetter__("userPingEnabled", function (bool) {
    if (typeof bool == "boolean") {
        this._userPingEnabled = bool;
    }
});
FxConnection.prototype.__defineGetter__("userPingEnabled", function () {
    return this._userPingEnabled;
});


FxConnection.prototype.__defineSetter__("setBinaryType", function (mode) {
    if (mode == "string") {
        this._sockDefaults["binaryType"] = "string";
    } else if (mode.toLowerCase() == "arraybuffer")  {
        this._sockDefaults["binaryType"] = "arraybuffer";
    }
});
FxConnection.prototype.__defineSetter__("setContentEncode", function (mode) {
    if (mode == "br") {
        this._sockDefaults["ContentEncode"] = "br";
    } else {
        this._sockDefaults["ContentEncode"] = "";
    }
});

module.exports = exports = FxConnection;

// unit test //

//var s = new FxConnection(8080);
//s.FxTLSConnection(null);
//s.on('connection', function (client) {
//    debug('clients:',client.name);
//    debug(s.clientsCount());
//});
//s.on('message', function (evt) {
//    debug("TRACE",evt.client.name, evt.data);
//});
//s.on('disconnect', function (socket) {
//    debug('disconnect_fxconnect_client.')
//});

