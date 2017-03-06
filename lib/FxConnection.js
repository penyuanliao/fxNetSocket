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
var clients = []; // 紀錄使用者
var connections = 0; //記錄使用者數目

util.inherits(FxConnection, events.EventEmitter); // 繼承事件

// todo enum event dispach

/**
 * initialize net.socket
 * @param port
 * @param option
 * @constructor
 **/
function FxConnection(port, option){

    /* Variables */

    events.EventEmitter.call(this);

    var self = this;
    this.self = self;
    this.clusters = []; // all child process group
    /* packet Splicing on subpackage */
    this.doSplitPackage = false;
    this._sockDefaults = {"binaryType":"string"};

    if (typeof option === 'undefined') {
        option = {
            'runListen':true,
            'glListener' : true
        };
    };

    this.glListener = (typeof option.glListener != "undefined" ? option.glListener : true); // 集中監聽事件 message, disconnect

    /* Codes */
    var app = this.app = net.createServer();

    var cb = function () {
        debug('Listening on ' + app.address().port);

        self.emit("Listening", app);

    };
    if (option.runListen)
        this.server = this.app.listen(port, cb);

    this.app.on('connection', function(socket) {

        var client = new fxSocket(socket);

        self.setSockOptions(client);

        connections++;
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
                clients[client.name] = client; //TODO 二維分組namespace物件
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

            socket.on('data', function (chunk) {

                var data = chunk;

                if (mode === fxStatus.websocket) {
                    var obj = client.read(chunk);
                    if (typeof obj == "undefined") obj = {opcode};
                    data = obj.msg;
                    if(obj.opcode == 8)
                    {
                        self.clientDestroy(client);
                        return; // Event Data Close
                    }
                }else if (mode === fxStatus.flashSocket || mode === fxStatus.socket) {
                    data = data.toString('utf8');
                    // packet Splicing on subpackage
                    if (self.doSplitPackage) {
                        doSubpackage(data, client);
                        return;
                    }
                }
                if (self.glListener)
                    self.emit("message", {'client':client,'data':data});
                else
                    client.emit("message", data);


            });

        };

        function doSubpackage(data, client) {
            var subpackage = data.match(/(\{.+?\})(?={|$)/g);

            for (var i = 0; i < subpackage.length; i++) {
                var packet = subpackage[i];
                if (self.glListener)
                    self.emit("message", {'client':client,'data':packet});
                else
                    client.emit("message", packet);
            }
            return;
        }


        socket.on('close',  sockDidClosed);
        socket.on('end',    sockDidEnded);
        socket.on('error',  sockDidErrored);

    });

    function sockDidClosed() {

        var socket = this;
        socket.isConnect = false;
        connections--;
        var client = clients[socket.name];
        delete clients[socket.name];

        if (self.glListener)
            self.emit('disconnect', socket.name);
        else
            client.emit('disconnect', socket.name);
        debug('LOG::SOCKET WILL CLOSED : COUNT(%d)', connections);
    };

    function sockDidEnded() {
        debug('LOG::SOCKET ENDED');
        var socket = this;
        socket.end();
    };

    function sockDidErrored(e) {
        debug('LOG::SOCKET ERROR:',e);

        if (self.glListener)
            self.emit('error', e);
        // else
            // client.emit('error', e);

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
    if (typeof namespace === 'undefined' || namespace == null ) return clients;

    // output array
    // TODO 不確定這樣寫法要不要留
    var keys = Object.keys(clients);
    var groups = [];
    for (var i = 0 ; i < keys.length; i++) {
        var socket = clients[keys[i]];
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
    if (clients === null) return 0;
    // if (typeof namespace === 'undefined' || namespace == null ) return Object.keys(clients).length;
    // var keys = Object.keys(clients);

    // return this.getClients(namespace).length;

    return connections;

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

