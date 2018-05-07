/**
 * Created by Benson.Liao on 15/12/22.
 */
//var logger = require('./FxLogger.js');
var debug = require('debug')('utility');
debug.log = console.log.bind(console); //file log 需要下這行
var parser = require('./FxParser.js').headers;
var fxStatus = require('./FxEnum.js').fxStatus;

function FxUtility() {

    /* Variables */
    this.js_auto_gc;
    this.js_auto_gc_enabled = false;

    /* Codes */
};
/**
 * action auto gc()
 */
FxUtility.prototype.autoReleaseGC = function () {
    this.js_auto_gc = setInterval(function() {
        gc && gc();

    },10000);
    this.js_auto_gc_enabled = true;
};
/**
 * action auto gc() stop
 * */
FxUtility.prototype.shutDownAutoGC = function () {

    clearInterval(this.js_auto_gc);
    this.js_auto_gc = null;
    this.js_auto_gc_enabled = false;
};
FxUtility.prototype.findOutSocketConnected = function (client, chunk, self) {
    //var socket = this;
    var request_headers = parser.onReadTCPParser(chunk);
    var unicodeNull = request_headers.unicodeNull;
    var swfPolicy = request_headers.swfPolicy;
    var iswebsocket = request_headers.iswebsocket;
    var general = request_headers.general;
    client.hsSource = chunk;
    client.wsProtocol = request_headers["sec-websocket-protocol"];
    client.headers = {"Transfer-Encoding": request_headers["transfer-encoding"]};
    if (typeof general!= "undefined") client.headers["Method"] = general[2];

    debug('LOG::Data received: %s length:%d',chunk.toString('utf8'), chunk.byteLength);
    if ((chunk.byteLength == 0 || client.mode == fxStatus.socket || !request_headers) && !swfPolicy) {
        client.mode = fxStatus.socket;
        client.namespace = chunk.toString('utf8');
        self.emit('connection', client);
        return fxStatus.socket;
    }
    if (unicodeNull != null && swfPolicy && client.mode != 'ws') {
        debug('[SOCKET_NET_CONNECTED]:');
        client.mode = fxStatus.flashSocket;
        self.emit('connection', client);
        if (typeof self != undefined && self != null) self.emit('message', client.read(request_headers));

    }else if (iswebsocket) {
        debug('[WEBSOCKET_CONNECTED]');

        client.mode = 'ws';

        if (typeof general[0] != "undefined") client.namespace = general[1]; // GET stream namespace

        client.handeshake(chunk);
        // -- WELCOME TO BENSON WEBSOCKET SOCKET SERVER -- //
        if (client.registered != true && client.baseEvtShow === true) {
            client.write(JSON.stringify({"NetStatusEvent": "NetConnect.Success", "detail": "連線成功！"}));
        }

        if (typeof self != undefined && self != null) self.emit('connection', client); //

        return fxStatus.websocket;
    }
    else if (client.mode === fxStatus.websocket)
    {
        debug('[WEBSOCKET_ROGER]');
        // check is a websocket framing

        var str = client.read(chunk);
        var opcode = client.protocol.opcode;

        debug("PROTOCOL::", opcode);
    }else
    {
        debug('[OTHER CONNECTED]');

        if (request_headers.general.length != 0 && iswebsocket == false)
        {
            client.mode = fxStatus.http;

            if (typeof self != undefined && self != null) self.emit("httpUpgrade", request_headers, client, request_headers.lines);

            return fxStatus.http;
        }
    }

};
FxUtility.prototype.parseUrl = function (url) {
    var args;
    args = url.match(/([\w\/][^?]+)|(\?|\&)(([^=]+)\=([^&]+))/g);
    return args;
}
FxUtility.prototype.trimAny = function (str) {
    return str.replace(/\s+/g, "");
}
FxUtility.prototype.error_exception = {
    "CON_VERIFIED":     {"code": 0x200, "message":"Client verify path was successful."},
    "UV_ERR_CON":       {"code": 0x300, "message":"onconnection Error on Exception accept."},
    "UV_ERR_RS":        {"code": 0x301, "message":"call readStart() function can't be invoked."},
    "UV_EOF":           {"code": 0x302, "message":"UV_EOF: unexpected end of file."},
    "UV_EADDRINUSE":    {"code": 0x303, "message":"UV_EADDRINUSE: address already in use."},
    "FL_POLICY":        {"code": 0x350, "message":"When the incoming message contains the string '<policy-file-request/>\/0'"},
    "CON_MOD_HTTP":     {"code": 0x351, "message":"Connect MODE has HTTP."},
    "CON_MOD_NOT_FOUND":{"code": 0x351, "message":"Connect MODE not found."},
    "CON_TIMEOUT":      {"code": 0x352, "message":"Connect time up - Wait 5 sec."},
    "CON_LB_TIMEOUT":   {"code": 0x353, "message":"Connect Times up in wait get Load Balance response 5 sec."},
    "PROC_NOT_FOUND":   {"code": 0x354, "message":"Cluster process resource not found."},
    "CON_DONT_CONNECT":   {"code": 0x355, "message":"Cluster process socket don't Connected."},
    "CON_LOCK_CONNECT":   {"code": 0x356, "message":"The service will not allow it to connect"}
}
FxUtility.prototype.repo_history = {
}
FxUtility.prototype.errorException = function (name) {
    return this.error_exception[name];
};


/***
 * aysnc foreach ARRAY.asyncEach(func(item, resume),func())
 * @param iterator
 * @param complete
 */
Array.prototype.asyncEach = function(iterator, complete) {
    var list    = this,
        n       = list.length,
        i       = -1,
        calls   = 0,
        looping = false;

    var iterate = function() {
        calls -= 1;
        i += 1;
        if (i === n) return;
        iterator(list[i], resume);
        if (typeof complete !== 'undefined' && complete !== null && n-1 === i) { complete(); } else { //resume();
        }
    };

    var loop = function() {
        if (looping) return;
        looping = true;
        while (calls > 0) iterate();
        looping = false;
    };

    var resume = function() {
        calls += 1;
        if (typeof setTimeout === 'undefined') loop();
        else setTimeout(iterate, 1);
    };
    resume();
};



module.exports = exports = new FxUtility();


