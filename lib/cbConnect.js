/**
 * Created by Benson.Liao on 2016/6/7.
 */
const net          = require('net');
const uuid         = require('node-uuid');
const os           = require('os');
const events       = require('events');
const util         = require('util');
const sys          = os.platform();
const couchbase    = require('couchbase');
const viewQuery    = couchbase.ViewQuery;
const NSLog        = require('../index.js').logger.getInstance();
const noSQLs       = ["couchbase://127.0.0.1"];
const noSQLs2      = ["couchbase://127.0.0.1"];
const BUCKET_TABLE = "nodeHistory";

util.inherits(cbConnect, events.EventEmitter); // 繼承事件

function cbConnect(options) {
    NSLog.log('info','init cbConnect');
    events.EventEmitter.call(this);
    this.services = options;
    this.cluster  = undefined;
    this.bucket   = undefined;
    this.cbPort   = 8787;
    this.sockServ = undefined;
    this.init();
}

cbConnect.prototype.init = function () {
    var uri, bucketTable;

    if (typeof this.services == "undefined") {
        uri = noSQLs[parseInt(Math.random() * noSQLs.length)];
        if (process.env.NODE_DEV == "development") uri = noSQLs2[0];
    } else {
        uri = this.services.uri[parseInt(Math.random() * this.services.uri.length)];
    }

    if (typeof this.services == "undefined") {
        bucketTable = BUCKET_TABLE;
    } else {
        bucketTable = this.services.bucket;
    }

    NSLog.log('info', "create open Bucket connection try using %s.", uri);

    this.cluster = new couchbase.Cluster(uri);
    this.bucket  = this.cluster.openBucket(bucketTable);
};
cbConnect.prototype.createServer = function () {
    var self = this;

    var connected = function (socket) {
        NSLog.log('info','client connected to', self.getNOW);
        socket.chunkBuffer = null;
        socket.chunkBufSize = 0;

        socket.on('data',onData);

        socket.on('end', onEnd);

        socket.on('error', onError);

        socket.write('welcome!!! \0 \n');

    };
    var onData = function (data) {

        var socket = this;

        if (!socket.chunkBuffer || socket.chunkBuffer == null || typeof socket.chunkBuffer == 'undefined'){
            // NSLog.log('info','#1 ',socket.chunkBuffer, ((socket.chunkBuffer != null) ? socket.chunkBuffer.length : 0) );
            socket.chunkBuffer = new Buffer(data);
        }else
        {
            if (socket.chunkBuffer.length == 0) {
                socket.chunkBuffer = new Buffer(data);
            }else
            {
                var total = socket.chunkBuffer.length + data.length;
                socket.chunkBuffer = Buffer.concat([socket.chunkBuffer,data], total);
            }
        }
        socket.chunkBufSize += data.length;

        var pos = socket.chunkBuffer.indexOf('\u0000');

        // NSLog.log('info','#3 pos:', pos);

        while (pos != -1) {

            if (pos != 0) {
                data = socket.chunkBuffer.slice(0,pos);
                socket.chunkBufSize -= data.byteLength;
                socket.chunkBuffer = socket.chunkBuffer.slice(data.byteLength, socket.chunkBuffer.length);

                var tmps = String(data).replace(/\0+/g, "");
                if (tmps.length > 0){
                    var jsonObj = JSON.parse(tmps);

                    if (jsonObj.ts && self.timeBiased != -1) {
                        self.timeBiased = Math.abs(new Date().getTime() - Number(jsonObj.ts));
                    };
                    jsonObj.nodeTs = new Date().getTime();
                    jsonObj.nodeTimeBiased = self.timeBiased;


                    self.insert(jsonObj);
                }
            }else {
                socket.chunkBuffer = socket.chunkBuffer.slice(1, socket.chunkBuffer.length);
                socket.chunkBufSize -= 1;
            }

            pos = socket.chunkBuffer.indexOf('\u0000');
        }

        if (pos = 0 && socket.chunkBufSize == 1 || socket.chunkBuffer.length == 0) {
            socket.chunkBufSize = 0;
            socket.chunkBuffer = null;
        }
    };
    var onEnd  = function (err) {
        NSLog.log('info','end close....' + err);
        self.timeBiased = -1;
        socket.end();
    };
    var onError = function (error) {
        NSLog.log('info','code =>'+error.code);
        console.error(error);
    };
    var blockListen = function (err) {
        if (err) throw err;
        NSLog.log('info','server bound port:', self.cbPort);
    };
    var s = net.createServer(connected);

    var srvError = function (err) {
        console.error("net.createServer error :", err);
        if (err.code === 'EADDRINUSE') {
            setTimeout(function () {
                server.close();
                server.listen(self.cbPort, blockListen);
            }, 3000)
        }
    };
    s.on('error', srvError);

    s.listen(self.cbPort, blockListen);
    self.sockServ = s;
    return s;
};

cbConnect.prototype.insert = function (obj, docName) {
    var self = this;
    var guid = this.getGUID;
    if (typeof docName != "undefined") guid = guid + "-" + docName;
    guid = guid +"-"+ new Date().getTime();
    var block = function (err, result) {
      if (err){
          NSLog.log('info','insert failed id:%s err:', guid, err);
      }
    };
    if (this.bucket.connected)
        this.bucket.insert(guid, obj, block);

};

cbConnect.prototype.queryView = function (ddoc, name, skip, limit, search, byGroup, query_cb) {
    //.range([2017,1,1],[2017,1,31],true);
    var self = this;
    var query = viewQuery.from(ddoc, name);

    if (typeof limit == "number" && limit != null) {
        query = query.limit(limit);
    }else {
        query = query.limit(100);
    }
    if (Array.isArray(search) && search != null) {
        query = query.range.apply(query, search);
    }
    if (typeof skip == "number" && skip != null) {
        query = query.skip(skip);
    }else {
        query = query.skip(0);
    }
    if (typeof byGroup == "boolean" && byGroup != null) {
        query = query.group(byGroup);
    }
    else if (typeof byGroup == "number" && byGroup != null) {
        query = query.group(false).group_level(byGroup);
    }
    else {
        query = query.group(false);
    }
    // console.log(query);
    var bucket = this.bucket;

    if (typeof query_cb != "undefined") {
        bucket.query(query, query_cb);
    } else {
        bucket.query(query, function (err, results) {
            if (!err) {
                self.emit("queryResult", {"event":ddoc + "." + name,"result":results});
            }else {
                self.emit("queryError",err);
            }
        })
    }
};

cbConnect.prototype.__defineGetter__('getGUID', function () {
    return uuid.v4();
});
cbConnect.prototype.__defineGetter__('getNOW', function () {
    var d = new Date();
    return (d.getFullYear() + '/' + d.getMonth() + '/' + d.getDay() + ':' + d.getMinutes());
});

cbConnect.prototype.customByUser = function (event) {
    var len = event["result"].length;
    var groups = {};
    var data = {};
    while (len--) {
        var key = event["result"][len]["key"];
        var result = event["result"][len]["value"];
        var resultKey = Object.keys(result);
        for (var i = 0; i < resultKey.length; i++) {

            var group = groups[resultKey[i]];

            if (typeof group == "undefined") groups[resultKey[i]] = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
            var k = parseInt(key[3]);
            if (typeof groups[resultKey[i]][k] == "undefined") groups[resultKey[i]][k] = 0;
            groups[resultKey[i]][k] = Math.max(groups[resultKey[i]][k],result[resultKey[i]][0]);
            /*
            var date = key[2] + ":" + key[3];

            if (typeof data[date] == "undefined") {
                data[date] = {};
            }
            if (typeof data[date][resultKfey[i]] == "undefined") data[date][resultKey[i]] = 0;
            data[date][resultKey[i]] =  Math.max(data[date][resultKey[i]],result[resultKey[i]][0]);
            */
        }
    }
    return groups;
};

module.exports = exports = cbConnect;
