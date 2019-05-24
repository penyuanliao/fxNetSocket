/**
 * Created by Benson.Liao on 16/2/16.
 */
const util = require('util');
const path = require('path');
const cp = require('child_process');
const events = require('events');
const dlog = require('debug');
dlog.log = console.log.bind(console); //file log 需要下這行
const debug = dlog('daemon');
const error = dlog('error');
const NSLog = require('./FxLogger.js').getInstance();
const wait_times = 15000;
const doWait_maximum = 5;
const heart_times = 5000;
const restart = false;
const retry = {"limit":0, "timeout":1000};

/***
 * HEART BEAT Module
 * @param modulePath
 * @constructor
 */
function Fxdaemon(modulePath/*, args, options*/) {
    var options, args;
    // copy github child_process
    if (Array.isArray(arguments[1])) {
        args = arguments[1];
        options = util._extend({}, arguments[2]);
    } else if (arguments[1] && typeof arguments[1] !== 'object') {
        throw new TypeError('Incorrect value of args option');
    } else {
        args = [];
        options = util._extend({}, arguments[1]);
    }
    this.nodeInfo = {"memoryUsage":undefined,"connections": 0};
    this._modulePath = modulePath;
    this._options = options;
    this._args = args;
    this._cpf = null;
    this._cpfpid = 0;
    this._heartbeat = 0;
    this._killed = true;
    this._running = false;
    this._heartbeatEnabled = (typeof options.heartbeatEnabled != "undefined") ? options.heartbeatEnabled : true;
    this._lookoutEnabled = (typeof options.lookoutEnabled != "undefined") ? options.lookoutEnabled : true;
    /* todo Don't disconnect existing clients when a new connection comes in, refuse new connection. */
    this._dontDisconnect = false;
    this._autorelease = false; // not implement
    this.saveFileLog = true;
    this.custMsgCB = undefined;
    this.mxoss = 2048;
    this.name = "";
    this.uptime = undefined;
    this.pkgFile = options.pkgFile ? options.pkgFile : false;

    /* make sure initiallization process send creationComplete */
    this.creationComplete = false;

    this.emitter = new events.EventEmitter();
};

Fxdaemon.prototype = {
    constructor:Fxdaemon,
    init: function () {
        NSLog.log("info", 'daemon initialize', this._modulePath, this._args[0]);

        if (this._cpf) return;

        var cp_retry = retry.limit;
        var start = new Date().getTime();

        var context = this;

        context._killed = false;

        (function run() {
            debug('process start %s (%d)', context._modulePath, context._cpfpid);
            if (typeof context._modulePath === 'undefined' || context._modulePath === null || context._modulePath === "") return;

            if (typeof context._options != "object") context._options = {};
            // context._modulePath = path.resolve(process.cwd(), context._modulePath);
            if (context.pkgFile === false) {
                context._cpf = cp.fork(context._modulePath, context._args, context._options);
            } else {
                var cur = context._options.execArgv.concat([context._modulePath]);
                cur = cur.concat(context._args);
                if (typeof context._options.stdio == "undefined") context._options.stdio =  ['pipe', 'pipe', 'pipe', 'ipc'];
                // context._cpf = cp.spawn("node", cur, context._options);
                context._cpf = cp.spawn(context._modulePath, context._args, context._options);
                context._cpf.stdout.on("data", function (data) {
                    if (Boolean(process.env.NODE_DEBUG) == true) console.log("stdout:", data.toString());
                })
                context._cpf.stderr.on("data", function (data) {
                    if (Boolean(process.env.NODE_DEBUG) == true) console.log("stderr:", data.toString());
                })
            }

            context._cpfpid = context._cpf.pid;
            context.uptime = new Date().getTime();
            context._cpf.on('exit', function (code) {
                context.log("info",'[%s | %s] process will exit(%s)', context._modulePath, context._args[0], code);
                context._killed = true;
                context._running = false;
                context.creationComplete = false;

                if (context.pkgFile == true) {
                    context._cpf.stdout.removeAllListeners("data");
                    context._cpf.stderr.removeAllListeners("data");
                }

                if (!restart) return;

                if (cp_retry > 0) {
                    var end = new Date().getTime();
                    if (end - start < retry.timeout){
                        setTimeout(function(){run();},100);
                        cp_retry--;
                    }else {
                        context._cpf = null;
                        context._cpfpid = 0;
                    };

                }else {
                    run();
                };

            });
            // Receive Child Process Send Message //
            context._cpf.on("message", function (message, handle) {
                message = (typeof message === "string") ? JSON.parse(message) : message;

                if (typeof message != "object") return;

                if (message.evt === "processInfo") {
                    context._running = true;
                    context._msgcb ? context._msgcb(message.data):false;
                };
                if (message.evt === "processConf") {
                    context.nodeConf = message.data;
                }
                // todo socket goto other cluster
                if (message.evt === "socket") {
                    // context.emit("message", {evt:message.evt, goto:message.goto, handle:handle});
                    if (context.custMsgCB){
                        context.custMsgCB(message.evt,{evt:message.evt, goto:message.goto, handle:handle});
                    }
                }
                else if (message.evt === "socket_handle") {
                    context.emitter.emit("socket_handle", message, handle);
                    if (context.custMsgCB){
                        context.custMsgCB(message.evt,{evt:message.evt, goto:message.goto, handle:handle});
                    }
                }
                else if (message.evt === "streamData") {
                    // context.emit("streamData", message);
                    if (context.custMsgCB){
                        context.custMsgCB(message.evt,message);
                    }
                }else if (typeof message.action != 'undefined') {
                    context.emitter.emit(message.action, message);
                    if (message.action == "creationComplete") context.creationComplete = true;
                }

            });

        })();
        //啟動心跳檢查機制
        if(context._heartbeatEnabled) context.startHeartbeat();

    },

    startHeartbeat: function () {

        var daemon = this;

        var times = 0;

        function lookoutdaemon() {

            if (daemon._lookoutEnabled == true) {

                var out = setTimeout(function lookoutHandler() {
                    times++;
                    out = 0;
                    console.log("lookout Daemon(%s) try %s %s %s", daemon._modulePath,times ,">", doWait_maximum)
                    if (times > doWait_maximum) {
                        //todo remove and restart

                        times = 0;
                        daemon.stopHeartbeat();
                        daemon.quit();

                        setTimeout(function () {
                            daemon.init();
                            daemon.emitter.emit('status', 'Daemon init [' + daemon.name + ']');
                            NSLog.log("warning", "lookoutdaemon init()", daemon._modulePath);
                        },1000);

                    }
                }, wait_times);
            }

            daemon.getInfo(function (data) {

                try {
                    if (typeof data == 'string') {
                        data = JSON.stringify(data);
                    }
                    this.nodeInfo = data;

                }
                catch (e) {
                }

                if (out != 0) {
                    clearTimeout(out);
                    out = 0;
                };
                times = 0;
            }, times > 0 ? "retry=" + times : "retry=0");

        }
        debug('start lookout daemon.');
        daemon._heartbeat = setInterval(lookoutdaemon, heart_times);

    },
    stopHeartbeat: function () {
        debug('stop lookout daemon.');
        var daemon = this;
        daemon._heartbeat = clearInterval(daemon._heartbeat);
    },
    sendHandle: function (data, handle, cb) {
        if (this._cpf) {

            this._handlecb = cb;

            try {
                this._cpf.send({'evt':'onconnection',data:data}, handle,{silent:false}, cb);
            }
            catch (e) {
                error('send socket handle error.');
            }

        }else{
            error('child process is NULL.');
        };
    },
    send: function (message, handle, options, cb) {

        if (this._dontDisconnect) return;
        if (this._cpf && this._killed == false) {
            try {
                if (this.creationComplete == false) {
                    return;
                }
                this._cpf.send.apply(this._cpf, arguments);
            }
            catch (e) {
                NSLog.log("error","Daemon func send Error:", e);
            }

        }else{
            error('child process is NULL.');
        };
    },
    sendStream: function (data) {
        if (this._cpf) {
            try {
                if (typeof data != 'string') {
                    msg = JSON.stringify(data);
                }
                this._cpf.send({'evt':'streamData','data':data});
            }
            catch (e) {
                debug('sendStream info error.');
            }

        }else {
            error('child process is NULL.');
        };
    },
    getInfo: function (cb, data) {

        if (this._cpf && this._killed == false) {
            this._msgcb = cb;
            try {
                this._cpf.send({'evt':'processInfo','data':data});
            }
            catch (e) {
                debug('send process info error.', this._killed);
            }

        }else  {
            NSLog.log('info','getInfo: Process Is Dead. ')
        };
    }, // getInfo code ended

    quit: function () {
        if (this._cpf) {
            debug('server-initiated unhappy termination.');
            this._killed = true;

            cp.exec("kill -9 " + this._cpfpid);

            this._cpf = null;
            this._cpfpid = 0;
        }else {
            error('child process is null.');
        };

    }, // quit ended
    stop: function () {
        if (this._cpf) {
            var daemon = this;
            var signalCode = daemon._cpf.signalCode;
            daemon._killed = true;
            try {
                if (!signalCode && signalCode == null) daemon._cpf.disconnect();
            } catch (e) {
                NSLog.log("error", e);
            }
            daemon._cpf.kill('SIGQUIT');
            daemon._cpf = null;
            daemon._cpfpid = 0;

            debug("daemon stop.");
        };
    },
    restart: function () {
        NSLog.log("info", "Daemon restart:", this.name);
        var daemon = this;
        if (this._cpf) {
            daemon.stopHeartbeat();
            daemon.stop();
        }
        setTimeout(function () {
            daemon.init();
            daemon.emitter.emit('status', 'Daemon init [' + daemon.name + ']');
            NSLog.log("warning", "restart init()", daemon._modulePath);
        },1000); // import need wait 1 sec
    },
    log: function () {
        if (!this.saveFileLog) return;

        NSLog.log.apply(NSLog,arguments)
    },
    setMakeSureComplete: function (bool) {
        if (typeof bool == "boolean")
            this.creationComplete  = bool;
    },
    isActive: function () {
        var context = this;
        if (typeof context._cpf == "undefined" || context._cpf == null || context._cpf == "") return false;
        if (typeof context._cpf.pid == "undefined" || context._cpf.pid <= 0 ) return false;
        return true;
    }

};

module.exports = exports = Fxdaemon;

/*
 const cfg = require('./../../config.js');
 var opts = cfg.forkOptions;
 var env = process.env;
 env.NODE_CDID = 0;
 console.log(opts.cluster);
 var daemon = new Fxdaemon(opts.cluster,{silent:false}, {env:env});
 daemon.init();
 daemon.sendStream();
 */
