/**
 * Created by Benson.Liao on 2015/11/20.
 */
const debug         = require('debug')('Socket');
const parser        = require('./FxParser.js');
const utilities     = require('./FxUtility.js');
const fxNM          = require('./FxNetworkMonitor.js');
const util          = require('util');
const events        = require('events');
const protocol      = parser.protocols;
const iltorb          = ifdef('iltorb');
const brCompress      = iltorb.compress;
const brCompressSync  = iltorb.compressSync;
const stream          = require("stream");
const Transform       = stream.Transform;
const crypto          = require('crypto');
/***
 * Custom net socket connection
 * @param socket : net.socket
 * @constructor
 */

util.inherits(FxSocket, events.EventEmitter); // 繼承事件
/**
 * @description registered : change server to init ws use.
 */
function FxSocket(socket, bufferPool)
{
    /* Variables */
    this.socket            = socket;
    this.finTCP            = false; // four Way Handshake Enabled
    this.isConnect         = false;
    this._heartbeatEnabled = true;
    this.cookies           = 0;
    this.delegate          = undefined;
    this.delegateMethod    = undefined;
    this.payload           = undefined;
    this._binaryType       = 1;
    this.uptime            = new Date().getTime();
    this.downtime          = 0;
    this.compress          = "";
    this.onAccept          = undefined;
    this._pingEnable       = false;
    this.probe_timeout     = undefined;
    this.ping_time         = {time:0};
    this.tmpSource         = Buffer.from([]);
    this.pipeStream        = this.setupTransform();
    this.acceptKey         = undefined;
    this.iv                = undefined;
    this.civ               = Buffer.alloc(16);
    this.monitor           = fxNM.getInstance();
    this.forcedBinary      = false;
    if (typeof this.registered == "undefined") this.registered = false;
    this.baseEvtShow       = true;
    if (typeof socket.baseEvtShow != "undefined") this.baseEvtShow = socket.baseEvtShow;
    var self = this;
    socket.name = socket.remoteAddress + "\:" + socket.remotePort;
    this.mode = '';
    this.payload = (typeof bufferPool !== 'undefined') ? bufferPool : Buffer.alloc(1024 * 32);
    this.compressCodec = {
        "br":false,
        "aes":true,
    }
    this.protocolCodec = {
        "bin":true,
        "op" :true
    };
    this.accessLogs = {
        csBytes:0,
        scBytes:0,
    }
    socket.on('data', function (chunk) {
        self.accessLogs.csBytes += chunk.byteLength;
        self.monitor.incoming(chunk.byteLength);
    });
    socket.on('close', function () {
        self.isConnect = false;
        self.downtime = new Date().getTime();
        if (self.delegate) {
            self.removeListener(client.namespace, client.delegateMethod);
            self.delegate = undefined;
            self.delegateMethod = undefined;
        }
        self.pingEnable = false;
        // self.monitor.eject(self.ip_adrs);
    });
    socket.on('end',    function () {
        self.isConnect = false;
        if (socket.allowHalfOpen == true) {
            socket.end();
        }
        if (!socket.destroyed) {
            socket.destroy();
        }
    });
    socket.on('error',  function (error) {
        self.isConnect = false;
        self.socket.destroy();
    });
    socket.on("timeout", function () {
        self.clearHeartbeat();
        debug('info','FxSocket %s at timeout.', socket.name);
        self.close();
    });

    if (this._heartbeatEnabled){
        this.startupHeartbeat(3 * 60)
    }
    this.on("connect", function () {
        self.ip_adrs = ((typeof self.originAddress == "undefined") ? socket.remoteAddress: self.originAddress) + ":" + socket.remotePort;
        // self.monitor.join(self.ip_adrs, self.accessLogs);
    })

    Object.defineProperties(this, {
        "originAddress": {
            get:function () { return (typeof self.headers != "undefined" && typeof self.headers["X-Forwarded-For"] != "undefined") ? self.headers["X-Forwarded-For"].trim() : undefined; },
            configurable: false,
            enumerable: false
        },
        "authorized": {
            get:function () {
                // user has legal
                return !(self._binaryType == 1 && self.compress == "");
            },
            configurable: false,
            enumerable: false
        },
        "ipAdrs": {
            get: function () {
                if (typeof self.ip_adrs == "undefined") self.ip_adrs = ((typeof self.originAddress == "undefined") ? socket.remoteAddress: self.originAddress);
                return self.ip_adrs;
            },
            configurable: false,
            enumerable: false
        }
    })
};

FxSocket.prototype.startupHeartbeat = function (sec) {
    this.cookies = sec ;
    this.socket.setTimeout(sec * 1000);
};
FxSocket.prototype.clearHeartbeat = function () {
    this.cookies = 0;
    this.socket.setTimeout(0);
}
FxSocket.prototype.handeshake = function (chunk) {
    var readHeaders = parser.headers.readHeaders(chunk);
    var customize   = {};
    var accept;
    var len;
    if (this.compress != "") {
        customize["content-encoding"] = this.compress;
    }
    if (typeof readHeaders["sec-websocket-protocol"] != "undefined") {
        var subProtols = readHeaders["sec-websocket-protocol"].split(",");

        if (typeof onAccept == "function") {
            accept = onAccept(subProtols);
            if (typeof accept == "string") subProtols = accept;
        }

        readHeaders["sec-websocket-protocol"] = this.checkSubProtol(subProtols);
    }
    var resHeaders = parser.headers.writeHandshake(readHeaders, customize);
    if (this.socket.writable && !this.socket.destroyed && this.registered != true) {
        this.socket.write(resHeaders);
        len = Buffer.byteLength(resHeaders);
        this.accessLogs.scBytes += len;
        this.monitor.outgoing(len);
    }

    this.wsProtocol = readHeaders['sec-websocket-protocol'];
};

FxSocket.prototype.write = function (data, enc) {
    var len = 0;
    if (this.mode === 'ws') {
        var buf;
        if (this.compress == "br") {
            buf = this.ws_compress_sync(data);
        } else if (this.compress == "aes-256-cbc" && enc != false) {
            this.iv = crypto.randomBytes(8).toString("hex");
            buf = this.emit_websocket(this.encryption(data));
        } else {
            buf = this.emit_websocket(data, 1, true);
        }
        this.socket.write(buf);
        len = buf.byteLength;
    }else if (this.mode === 'flashsocket') {
        this.socket.write(data);
        this.socket.write('\0');
        len = data.byteLength + 1;
    }else if (this.mode === 'socket')
    {
        if (typeof this.delimiter == "string") {
            this.socket.write(data + this.delimiter);
            len = Buffer.isBuffer(data) ? data.byteLength : Buffer.byteLength(data);
            len += this.delimiterLen;
        } else {
            this.socket.write(data);
            len = Buffer.isBuffer(data) ? data.byteLength : Buffer.byteLength(data);
        }
    }
    this.cookies = 0;
    this.accessLogs.scBytes += len;
    this.monitor.outgoing(len);
};
FxSocket.prototype.setupTransform = function () {
    var self = this;
    var tranform = new Transform();

    tranform._transform = function (data, enc, next) {

        var len = 0;
        if (self.mode === 'ws') {
            var buf;
            if (self.compress == "br") {
                buf = self.ws_compress_sync(data);
            } else {
                buf = self.emit_websocket(data);
            }
            // 將輸入進來的資料直接推送出去
            this.push(buf);
            len = buf.byteLength;
        }else if (this.mode === 'flashsocket') {
            buf = Buffer.concat([data, Buffer.from("\u0000")])
            this.push(buf);
            len = data.byteLength + 4;
        }else if (this.mode === 'socket')
        {
            this.push(data);
            len = data.byteLength;
        }
        self.cookies = 0;
        self.accessLogs.scBytes += len;
        self.monitor.outgoing(len);
        // 完成這筆資料的處理工作
        next();
    }
    tranform.pipe(this.socket);

    return tranform;
}
FxSocket.prototype.pipe = function (dest, pipeOpts) {

    this.pipeStream.pipe(dest, pipeOpts);
};

FxSocket.prototype.onData = function (data) {
    var socket = this.socket;
    if (this.mode == 'flashsocket') {
        this.splitWithPieces(data,'\u0000');
    }else if (this.mode == 'socket') {
        this.emit('data', data);
    };
    this.cookies = 0;
};
FxSocket.prototype.splitWithPieces = function (data, rule, cb) {

    var doCallback = (cb instanceof Function) ? true:false;


    var sock = this.socket;
    var bufsize = sock.chunkBuffer;
    if (!bufsize) {
        sock.chunkBuffer = bufsize = Buffer.from(data);
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
        if (typeof this.protocol != "undefined" && this.protocol != false && this.protocol.total > this.protocol.byteLength) {
            return this.protocol;
        } else if (typeof this.protocol == "undefined" || typeof this.protocol.opcode == "undefined") {
            return {opcode:8,msg:""};
        }

        var opcode = this.protocol.opcode;
        debug('log','FxSocket ws-opcode(read): ' + this.protocol.opcode );

        var obj = {opcode:opcode, fin:this.protocol.fin};

        this.tmpSource = Buffer.concat([this.tmpSource, this.protocol['msg']], this.tmpSource.length + this.protocol['msg'].length);

        if (this.protocol.fin == true) {
            this.protocol['msg'] = (this.forcedBinary == false) ? this.tmpSource.toString() : this.tmpSource;
            this.protocol['binary'] = this.tmpSource;
            this.tmpSource = Buffer.from([]);
        } else {
            return obj;
        }

        if (opcode === 1 || opcode === 0) {
            obj.msg = this.protocol['msg']
        }else if (opcode === 2) {
            obj.msg = this.protocol['msg']; //Binary Frame

            // obj.msg = parser.protocols.Utf8ArrayToStr(Buffer.from(this.protocol.msg));
            // console.log('Binary Frame:',obj.msg);
        }else if (opcode === 8){
            // 0x8 denotes a connection close
            obj.msg = "close";
        }else if (opcode === 10){
            console.log('opcode == ', opcode);
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
    debug('trace','FxSocket socket destroy :', this.name);
    if (this.mode === 'ws' && this.connecting) {
        try {
            var closeEvt = this.emit_websocket(JSON.stringify({"NetStatusEvent":"NetConnection.Connect.Closed"}),1);
            this.socket.write(closeEvt);
            var buf = this.emit_websocket('', 8);
            this.socket.write(buf);

        }
        catch (e) {
        }
    }
    if (this.finTCP) {
        this.socket.end();
        setTimeout(function (self) { self.checkFinishTCP(); }, 100, this);
    } else {
        this.socket.destroy();
    }

};

FxSocket.prototype.checkFinishTCP = function () {
    console.log('this.socket', this.socket.destroyed);
    if (typeof this.socket != "undefined" && !this.socket.destroyed) {
        this.socket.destroy();
    }
}

function read_flashsocket(data) {
    var _data = data.toString();
    // Socket 字尾終結符號\0過濾
    var trim = _data.substring(0,_data.replace(/\0/g, '').length );
    var evt;
    try {
        evt = JSON.parse(trim);
    } catch (e) {
        evt = {};
    }
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

FxSocket.prototype.emit_websocket = function(data, opcode, fin) {
    if (typeof fin == "undefined") fin = true;
    if (!opcode) opcode = 1;
    if (this._binaryType > 1 && opcode < 8) opcode = 2;
    var isBuf = Buffer.isBuffer(data);
    var payload = this.payload;
    var bfsize;
    if (isBuf){
        bfsize = data.byteLength;
    }else {
        bfsize = Buffer.byteLength(data);
    }

    if (bfsize > payload.length) {
        debug('trace',"FxSocket bfsize(%d kb) > payload size(%d kb)", bfsize/ 1024, payload.length/ 1024);
        payload = Buffer.from(data);
    }else
    {
        if (isBuf){
            payload = data;
        }else {
            payload.write(data,0);
        }
        var dPayLoad = payload.slice(0,bfsize);
        var _buffer = protocol.writeFraming(fin,opcode,false,dPayLoad);
        return Buffer.concat([_buffer, dPayLoad], _buffer.length + bfsize);
    }

    //var payload = Buffer.from(data);
    var buffer = protocol.writeFraming(fin,opcode,false,payload);
    return Buffer.concat([buffer, payload], buffer.length + payload.length);
};
FxSocket.prototype.getClientStatus = function () {
    var self = this;

    return {
        "name":self.socket.name,
        "namesspace":self.socket.namespace,
        "mode":self.socket.mode,
        "uptime":self.uptime,
        "downtime":self.downtime,
        "csBytes":self.accessLogs.csBytes,
        "scBytes":self.accessLogs.scBytes
    };

};

FxSocket.prototype.emit_websocket_src = function(data, opcode) {

    if (!opcode) opcode = 1;
    if (this._binaryType > 1 && opcode < 8) opcode = 2;
    var isBuf = Buffer.isBuffer(data);
    var payload = this.payload;
    var bfsize;
    if (isBuf){
        bfsize = data.byteLength;
    }else {
        bfsize = Buffer.byteLength(data);
    }

    if (bfsize > payload.length) {
        debug('trace',"FxSocket bfsize(%d kb) > payload size(%d kb)", bfsize/ 1024, payload.length/ 1024);
        payload = Buffer.from(data);
    }else
    {
        if (isBuf){
            payload = data;
        }else {
            payload.write(data,0);
        }
        var dPayLoad = payload.slice(0,bfsize);
        return {payload:dPayLoad,opcode: opcode};
    }
    return {payload:payload,opcode: opcode};
};
FxSocket.prototype.ws_compress_async = function (data, opcode, callback) {
    var src = this.emit_websocket_src(data, opcode);
    brCompress(src.payload, function (error, output) {
        var header = protocol.writeFraming(true,src.opcode,false, output);
        var buf = Buffer.concat([header, output], header.length + output.length);

        if (typeof callback != "undefined") callback(buf);
    });
};
FxSocket.prototype.ws_compress_sync = function (data, opcode) {
    var src = this.emit_websocket_src(data, opcode);
    try {
        var output = brCompressSync(src.payload);
        var header = protocol.writeFraming(true,src.opcode,false, output);
        return Buffer.concat([header, output], header.length + output.length);
    }catch (e) {
        console.error(e);
    }
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
    namespace = namespace.replace(/\/\w+\//i,'/');
    var args = utilities.parseUrl(namespace); //url arguments
    if (args) namespace = args[0];
    this.socket.namespace = namespace;
    if (args && typeof args != "undefined" && args.length > 1) {
        this.socket.query = args.splice(1,args.length);
    }
});
//官方辨識方式
FxSocket.prototype.__defineGetter__("connecting", function () {
   if (this.socket && this.socket.writable && !this.socket.destroyed) {
       return true;
   };
    return false;
});
FxSocket.prototype.__defineSetter__("registered", function (bool) {
    if (typeof bool == "boolean")
        this.socket.registered = bool;
    else
        this.socket.registered = false;
});
FxSocket.prototype.__defineGetter__("registered", function () {
    if (typeof this.socket.registered == "undefined")
        return false;
    else
        return this.socket.registered;
});


FxSocket.prototype.__defineSetter__("heartbeatEnabled", function (bool) {
    if (typeof bool == 'boolean') {
        this._heartbeatEnabled = bool;
        if (bool){
            this.startupHeartbeat(180);
        }else {
            this.clearHeartbeat();
        }
    }

});
FxSocket.prototype.__defineGetter__("heartbeatEnabled", function () {
    return this._heartbeatEnabled;
});
FxSocket.prototype.__defineSetter__("binaryType", function (binarytype) {
    if (binarytype == "arraybuffer") {
        this._binaryType = 2;
    } else if (binarytype == "blob") {
        this._binaryType = 3;
    }
    else {
        this._binaryType = 1;
    }
});
FxSocket.prototype.__defineGetter__("pingEnable", function () {
    return this._pingEnable;
    
});
FxSocket.prototype.__defineSetter__("pingEnable", function (bool) {
    if (typeof bool == "boolean") {
        this._pingEnable = bool;
    } else {
        this._pingEnable = false;
    }

    if (this._pingEnable == false) {
        clearTimeout(this.probe_timeout);
        this.probe_timeout = null;
    } else {
        this.probe();
    }

});
FxSocket.prototype.probe = function () {
    var self = this;
    this.probe_timeout = setTimeout(function () {
        var start = new Date().getTime();
        if (self.connecting) {
            self.write(util.format('{"ping":%s,"rtt":%s}',
                start,
                self.ping_time.time));
            self.probe();
        }

    }, 5000);
};
FxSocket.prototype.probeResult = function (obj) {
    if (typeof obj == "object") {
        this.ping_time.time = new Date().getTime() - obj.ping;
    }
    return this.ping_time;
}

FxSocket.prototype.__defineSetter__("setCompression", function (name) {
    if (name == "br" && typeof brCompress != "undefined") {
        this.compress   = "br";//brotli
        this.binaryType = "arraybuffer";
    } else if (name == "aes") {
        this.compress   = "aes-256-cbc";
        // this.binaryType = "arraybuffer";
        this.acceptKey  = crypto.randomBytes(16).toString("hex");
    } else {
        this.compress   = "";
        this.binaryType = "";
    }
});
FxSocket.prototype.setProtocolCodec = function (key,bool) {
    this.protocolCodec[key] = bool;
};
//video.bin.br
FxSocket.prototype.checkSubProtol = function (subProtols) {
    var agreeProtol;
    var group, name, proto, iCompress;
    for (var i = 0; i < subProtols.length; i++) {
        if (subProtols[i] == "finWay") {
            this.finTCP = true;
            continue;
        }
        if (this.compressCodec[subProtols[i]]) {
            agreeProtol = subProtols[i];
            this.setCompression = subProtols[i];
            break;
        } else if (this.protocolCodec[subProtols[i]]) {
            agreeProtol = subProtols[i];
            if (agreeProtol == "bin") this.binaryType = "arraybuffer";
            if (agreeProtol == "op") this.binaryType = "";
            else this.binaryType = agreeProtol;
            break;
        } else {
            group = subProtols[i].split(".");
            name  = (typeof group[0] != "undefined") ? group[0]:undefined;
            proto  = (typeof group[1] != "undefined") ? group[1]:undefined;
            iCompress  = (typeof group[2] != "undefined") ? group[2]:undefined;
            if (this.protocolCodec[proto]){
                if (proto == "bin") this.binaryType = "arraybuffer";
                else if (agreeProtol == "op") this.binaryType = "";
                else this.binaryType = agreeProtol;
            }
            if (this.compressCodec[iCompress]) this.setCompression = iCompress;
                agreeProtol = subProtols[i];
            break;
        }

    }
    return agreeProtol;
}

FxSocket.prototype.setArrayBuffer = function (data) {

    if (!data.buffer) {
        return Buffer.from(data);
    }else {
        return Buffer.from(data.buffer).slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
}
FxSocket.prototype.encryption = function (data) {
    var algorithm = this.compress;
    var hex = this.acceptKey;
    var iv = this.iv;
    var cipher = crypto.createCipheriv(algorithm, hex, Buffer.from(iv, "utf8"));
    var clearEncoding = 'utf8';
    var cipherEncoding = 'hex';
    var cipherChunks = [];
    cipher.setAutoPadding = true;
    cipherChunks.push(cipher.update(data, clearEncoding, cipherEncoding));
    cipherChunks.push(cipher.final(cipherEncoding));
    return iv + "$" + cipherChunks.join('');
};
FxSocket.prototype.decryption = function (data) {
    if (typeof data == "undefined") return;
    var sp = data.split("$");
    var hex = this.acceptKey;
    if (sp.length != 2) return;

    var ivStr = String(sp[0]);
    const civ = this.civ;
    const algorithm = this.compress;
    const clearEncoding = 'utf8';
    const cipherEncoding = 'hex';
    if (ivStr.length > 16) ivStr = ivStr.substr(0, 16);
    civ.write(ivStr, 0, "utf8");
    cipherChunks = [];
    var decipher = crypto.createDecipheriv(algorithm, hex, civ);
    cipherChunks.push(decipher.update(sp[1], cipherEncoding, clearEncoding));
    cipherChunks.push(decipher.final(clearEncoding));
    return cipherChunks.join('');
};
FxSocket.prototype.release = function () {
    this.socket.removeAllListeners();
    this.removeAllListeners();


    this.socket = undefined;
    this.civ = undefined;
    this.acceptKey = {};
}
function ifdef(a, b) {
    var req;
    try {
        req = require(a);
    } catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND') {
            throw e;
        }
        req = {}
    }
    return req;
}
module.exports = exports = FxSocket;


