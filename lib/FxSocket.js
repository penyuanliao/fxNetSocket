/**
 * Created by Benson.Liao on 2015/11/20.
 */
var debug = require('debug')('Socket');
debug.log = console.log.bind(console); //file log 需要下這行
var parser = require('./FxParser.js');
var protocol = parser.protocols;
/***
 * Custom net socket connection
 * @param socket : net.socket
 * @constructor
 */
var payload = undefined;
var FxSocket = function(socket, bufferPool)
{
    /* Variables */
    this.socket = socket;
    this.isConnect = false;
    var self = this;
    socket.name = socket.remoteAddress + "\:" + socket.remotePort;
    this.mode = '';

    payload = (typeof bufferPool !== 'undefined') ? bufferPool : new Buffer(1024 * 32);
    socket.on('close', function () {
        self.isConnect = false;
    });
    socket.on('end',    function () {
        self.isConnect = false;
    });
    socket.on('error',  function () {
        self.isConnect = false;
    });
};

var NSLog = function (type, str) {
    var status = "";
    if (type == 1) status = "INFO::";
    if (type == 2) status = "Debug::";

    console.log(status, str);
};


FxSocket.prototype.handeshake = function (chunk) {
    var readHeaders = parser.headers.readHeaders(chunk);
    var resHeaders = parser.headers.writeHandshake(readHeaders);
    this.socket.write(resHeaders);
};

FxSocket.prototype.write = function (data) {
    if (this.mode === 'ws') {
        var buf = emit_websocket(data);
        this.socket.write(buf);
    }else if (this.mode === 'flashsocket') {
        this.socket.write(data);
        this.socket.write('\0');
    }else if (this.mode === 'socket')
    {
        this.socket.write(data);
    }

};

FxSocket.prototype.onData = function (data) {
    var socket = this.socket;
    if (this.mode == 'flashsocket') {
        this.splitWithPieces(data,'\u0000');
    }else if (this.mode == 'socket') {
        this.emit('data', data);
    };

};
FxSocket.prototype.splitWithPieces = function (data, rule, cb) {

    var doCallback = (cb instanceof Function) ? true:false;


    var sock = this.socket;
    var bufsize = sock.chunkBuffer;
    if (!bufsize) {
        sock.chunkBuffer = bufsize = new Buffer(data);
        sock.chunkBufSize = data.length;
    }else {
        Buffer.concat([bufsize,data], bufsize.byteLength + data.byteLength);
        sock.chunkBufSize += data.length;
    };

    var pos = bufsize.indexOf(rule);
    while (pos != -1) {

        if (pos != 0) {
            data = sock.chunkBuffer.slice(0,pos);
            sock.chunkBufSize -= data.byteLength;
            sock.chunkBuffer = sock.chunkBuffer.slice(data.byteLength, sock.chunkBuffer.length);

            this.emit('data', data);

            if (doCallback) cb(data);

        }else {
            sock.chunkBuffer = self.chunkBuffer.slice(1, sock.chunkBuffer.length);
            sock.chunkBufSize -= 1;
        };

        pos = sock.chunkBuffer.indexOf(rule);
    };
    if (pos = 0 && sock.chunkBufSize == 1) {
        sock.chunkBufSize = 0;
    };

};

FxSocket.prototype.read = function (data) {

    if (this.mode === 'flashsocket') return read_flashsocket(data);
    if (this.mode === 'ws') {
        this.protocol = this.read_websocket(data);

        var opcode = this.protocol.opcode;

        NSLog(1,'ws-opcode(read): ' + this.protocol.opcode );

        var obj = {opcode:opcode};

        if (opcode === 1){
            obj.msg = this.protocol['msg']
        }else if (opcode === 2){
            obj.msg = this.protocol['msg'].toString('utf8');
        }else if (opcode === 8){
            // 0x8 denotes a connection close
            obj.msg = "close";
        }
        // opcode 0x01 Text
        // opcode 0x02 ByteArray
        // opcode 0x08 frame client destory ws
        // TODO opcode 0x09 frame Pring control frame
        // TODO opcode 0x0A frame Pong control frame

        return obj;
    }
};

FxSocket.prototype.writeByteArray = function(data) {
    //TODO Writed Array Buffer
};
FxSocket.prototype.readByteArray = function(data) {
    //TODO Readed Array Buffer
};

FxSocket.prototype.close = function () {
    debug('socket destroy :', this.name);
    if (this.mode === 'ws') {
        var buf = emit_websocket('', 8);
        this.socket.write(buf);
    }
    this.socket.destroy();
};

function read_flashsocket(data) {
    var _data = data.toString();
    // Socket 字尾終結符號\0過濾
    var trim = _data.substring(0,_data.replace(/\0/g, '').length );
    var evt = JSON.parse(trim);
    return evt;

};

FxSocket.prototype.read_websocket = function(data) {
    var proto = protocol.readFraming(data);
    return proto;
}

/***
 *
 * @param data
 */

function emit_websocket(data,opcode) {

    if (!opcode) opcode = 1;

    var bfsize = Buffer.byteLength(data);
    if (bfsize > payload.length) {
        debug("bfsize(%d kb) > payload size(%d kb)", bfsize/ 1024, payload.length/ 1024);
        payload = new Buffer(data);
    }else
    {
        payload.write(data,0);
        var dPayLoad = payload.slice(0,bfsize);
        var _buffer = protocol.writeFraming(true,opcode,false,dPayLoad);
        return Buffer.concat([_buffer, dPayLoad], _buffer.length + bfsize);
    }

    //var payload = new Buffer(data);
    var buffer = protocol.writeFraming(true,opcode,false,payload);
    return Buffer.concat([buffer, payload], buffer.length + payload.length);
};

//FxSocket.prototype = {
//    get name() {
//        return this.socket.name;
//    },
//    set name(val) {
//        if (this.socket != null)
//            this.socket.name = val;
//    }
//};

FxSocket.prototype.__defineGetter__("name", function () {
    return this.socket.name;
});
FxSocket.prototype.__defineSetter__("name", function (name) {
    this.socket.name = name;
});

FxSocket.prototype.__defineGetter__("mode", function () {
    return this.socket.mode;
});
FxSocket.prototype.__defineSetter__("mode", function (mode) {
    this.socket.mode = mode;
});

FxSocket.prototype.__defineGetter__("namespace", function () {
    return this.socket.namespace;
});
FxSocket.prototype.__defineSetter__("namespace", function (namespace) {
    this.socket.namespace = namespace;
});
//官方辨識方式
FxSocket.prototype.__defineGetter__("connecting", function () {
   if (this.socket._connecting == true && this.writable == true) {
       return true;
   };
    return false;
});

module.exports = exports = FxSocket;


