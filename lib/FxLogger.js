/**
 * Created by Benson.Liao on 15/12/21.
 */
var fs = require('fs'),
    util = require('util'),
    exec = require('child_process'),
    path = require('path'),
    net  = require('net'),
    extend = require('util')._extend,
    log_file = [];
const spawn            = require('child_process').spawn;
var historyLog         = path.dirname(require.main.filename) + "/historyLog";
const levels           = ['quiet', 'error', 'warning', 'info', 'debug', 'trace', 'log'];
var debugLevel         = 0;
const remoteClockTimes = 1000;
const ServerPort       = 10080;
const hostname         = require("os").hostname();

function logger(options) {
    /* Variables */
    this.logFile = true;
    this.folderExists = true;

    this.fileName = undefined;

    this.maximumFileSize  = 20 * 1024 * 1024;
    this.maximumFileCount = (typeof options != "undefined" && typeof options.fileMaxCount == "number") ? options.fileMaxCount : 200;
    this.fileSort = (typeof options != "undefined" && (options.fileSort == "asc" || options.fileSort == "desc")) ? options.fileSort : "none";

    // this.today = formatDate();
    /* Codes */
    // this.configure(options);

    this.trackBehaviorEnabled = false;
    this.trackOptions = {
        db:"couchbase://127.0.0.1",
        bucket:"default"
    }
    this.noSql = undefined;

    this.id = '';
    this.historyStr = "";
    this.remoteTimeout = undefined;

    this.isSetConfigure = false;

};

logger.prototype.configure = function (options) {
    this.isSetConfigure = true;
    if (typeof options.fileName != "undefined") {
        this.fileName = options.fileName;
    }
    if (typeof options.consoleEnabled != "undefined") {
        this.consoleEnabled = options.consoleEnabled;
    }

    if (typeof options.maximumFileSize == 'number') {
        this.maximumFileSize = options.maximumFileSize;
    }
    if (typeof options.logFileEnabled != "undefined") {
        this.logFile = options.logFileEnabled;
    }
    this.level = options.level;
    this.setRemoteEnabled = ((typeof options.remoteEnabled !='undefined') ? options.remoteEnabled : false);
    if (typeof options.dateFormat != "undefined") {
        this.dateFormat = options.dateFormat;
    }
    if (typeof options.remoteHost != 'undefined') {
        this.remoteHost = options.remoteHost;
    } else {
        this.remoteHost = "127.0.0.1";
    }

    if (typeof options.filePath == 'string') {
        this.historyLog = options.filePath;
        if (fs.existsSync instanceof Function && fs.existsSync(this.historyLog) == false) {
            this.folderExists = false;
        }
    } else {
        if (typeof process.pkg != "undefined" && typeof process.pkg.entrypoint != "undefined") {
            if (process.send instanceof Function) {
                this.historyLog = path.join(path.dirname(process.cwd()), path.basename(__dirname));
            } else {
                this.historyLog = path.resolve(process.cwd(), "./log");
            }
        } else {
            this.historyLog = path.resolve(path.dirname(require.main.filename), "./log");
        }
        if (fs.existsSync instanceof Function && fs.existsSync(this.historyLog) == false) {
            fs.mkdirSync(this.historyLog);
        }
    }
    //level pring
    if (typeof options.level == 'string') {
        var indx = levels.indexOf(options.level);
        debugLevel = indx;
        if (indx == -1) debugLevel = 0;
    }
    if (typeof this.fileName =='undefined') {
        this.fileName = path.basename(require.main.filename);
    }
    if (typeof options.fileDate != "undefined") this.fileDate = options.fileDate;
    if (typeof options.id !='undefined') {
        this.id = options.id;
    }else {
        this.id = this.fileName;
    }
    if (typeof options.fileMaxCount != "undefined" && typeof options.fileMaxCount == "number") {
        this.maximumFileCount = Math.max(Math.floor(options.fileMaxCount), 2);
    }
    if (typeof options.fileSort != "undefined" && (options.fileSort == "asc" || options.fileSort == "desc" || options.fileSort == "none")) {
        this.fileSort = options.fileSort;
    }
    if (typeof options.console != 'undefined') {
        this.setConsole(options.console);
    }
    if (typeof options.trackBehaviorEnabled !='undefined') {
        this.trackBehaviorEnabled = options.trackBehaviorEnabled;
        if (typeof options.trackOptions != "undefined") {
            if (typeof options.trackOptions.db != "undefined") this.trackOptions.db = options.trackOptions.db;
            if (typeof options.trackOptions.bucket != "undefined") this.trackOptions.bucket = options.trackOptions.bucket;
        }
        if (this.trackBehaviorEnabled) {
            /*var lcb = ifdef('./cbConnect', './fxNetSocket/lib/cbConnect.js');
            if (typeof lcb != "undefined")
                this.noSQL = new lcb({"uri":[this.trackOptions.db],"bucket":this.trackOptions.bucket});*/
        }

    }
};

logger.prototype.log = function (d) {
    const self = this;
    var level = levels.indexOf(d);
    if (level == -1) level = 0;
    if (debugLevel < level) return;
    if (!this.isSetConfigure) return;
    const path = (typeof this.historyLog == "undefined") ? historyLog : this.historyLog;
    const times = this.timestamp(this.dateFormat);
    var str = "";
    arguments[0] = " [" + arguments[0] + "]";
    if (level == -1)
        str = times + util.format.apply(util, arguments) + '\r\n';// win:\r\n linux:\n mac:\r
    else
    {
        var args = Array.prototype.slice.call(arguments);
        var state = args.shift();
        args[0] = state + " " + args[0] + " ";
        str = times + util.format.apply(util, args) + '\r\n';// win:\r\n linux:\n mac:\r
    }

    if (this.logFile && this.folderExists) {

        const firstOne = (typeof log_file[this.fileName] === 'undefined');
        if (firstOne) {
            log_file[this.fileName] = {
                num:0,
                file: fs.createWriteStream(path + '/'+ formatDate(this.fileDate) + this.fileName + '.log',{ flags:'a' })
            };
            // init default size
            fs.stat(path + '/'+ formatDate(this.fileDate) + this.fileName + '.log', function (err, data) {
                if (!err) {
                    log_file[self.fileName].file.bytesWritten += data.size;
                }
            })
        }

        const fullSize = log_file[this.fileName].file.bytesWritten > this.maximumFileSize;
        if( fullSize && this.doShiftFile != true) {
            if (this.fileSort == "asc") {
                this.shiftFile(path);
            } else if (this.fileSort == "desc") {
                this.shiftFileDesc(path);
            } else {
                var num = log_file[this.fileName].num+1;
                log_file[this.fileName].file.end();

                if (num >= this.maximumFileCount) {
                    num = 0;
                    log_file[this.fileName] = {
                        num:0,
                        file: fs.createWriteStream(path + '/'+ formatDate(this.fileDate) + this.fileName + '_' + num + '.log',{ flags:'w' })
                    }
                } else {
                    log_file[this.fileName] = {
                        num:num,
                        file: fs.createWriteStream(path + '/'+ formatDate(this.fileDate) + this.fileName + '_' + num + '.log',{ flags:'w' })
                    }
                }
            }
        }


        log_file[this.fileName].file.write(str);
    } else if (this.folderExists == false && (typeof log_file[this.fileName] === 'undefined')) {
        log_file[this.fileName] = {num:0, file:null};
        process.stdout.write("Error: ENOENT: no such file or directory, open '" + path + "'\r\n")
    }
    if (this.consoleEnabled)
        process.stdout.write(str);

    if (this.remoteEnabled) {

        this.historyStr += str;
    }
};
logger.prototype.shiftFile = function (path) {
    this.doShiftFile = true;
    var self = this;
    // move file
    var num = log_file[this.fileName].num;
    log_file[self.fileName].num++;

    var oldPath = path + '/'+ formatDate(this.fileDate) + this.fileName + '.log';
    var newPath = path + '/'+ formatDate(this.fileDate) + this.fileName + '_' + (num) + '.log';

    var onRename = function onRename(err, data) {

        if (err) {
            process.stdout.write(JSON.stringify(err));
        }
        var oldFile = log_file[self.fileName].file;
        log_file[self.fileName].file = fs.createWriteStream(path + '/'+ formatDate(self.fileDate) + self.fileName + '.log',{ flags:'w' });
        setTimeout(function () {
            oldFile.end();
        }, 100);

        if (num >= self.maximumFileCount) {
            var delPath = path + '/'+ formatDate(self.fileDate) + self.fileName + '_' + (num - self.maximumFileCount) + '.log';
            fs.unlink(delPath, onUnlink);
        } else {
            self.doShiftFile = false;
        }
    };
    var onUnlink = function onUnlink(err, data) {
        if (err) {
            process.stdout.write(JSON.stringify(err));
        }
        self.doShiftFile = false;
    };
    var onStat = function (err, data) {
        if (!err) {
            fs.unlink(newPath, function (err, data) {
                fs.rename(oldPath, newPath, onRename);
            })
        } else {
            fs.rename(oldPath, newPath, onRename);
        }
    }
    fs.stat(newPath, onStat);
};
logger.prototype.shiftFileDesc = function (path) {
    this.doShiftFile = true;
    var self = this;
    // move file
    var num = log_file[this.fileName].num;
    var oldPath;
    var newPath;
    var j = 0;
    if (num < self.maximumFileCount) {
        log_file[self.fileName].num++;
    }
    var onUnlink = function onUnlink(err, data) {
        if (err) {
            process.stdout.write(JSON.stringify(err));
        }
        self.doShiftFile = false;

    };
    var j = num;
    var onDescrFile = function onDescrFile() {

        if (j == 0) {
            oldPath = path + '/'+ formatDate(self.fileDate) + self.fileName + '.log';
        } else {
            oldPath = path + '/'+ formatDate(self.fileDate) + self.fileName + '_' + j + '.log';
        }
        newPath = path + '/'+ formatDate() + self.fileName + '_' + (j+1) + '.log';
        fs.rename(oldPath, newPath, onRename);
    }

    var onRename = function onRename(err, data) {
        if (err) {
            process.stdout.write(JSON.stringify(err));

            fs.unlink(path + '/'+ formatDate(self.fileDate) + self.fileName + '_' + (j+1) + '.log', function (err, data) {
                onDescrFile();
            })
            return;
        }
        j--;
        if (j < 0) {
            log_file[self.fileName].file.end();
            log_file[self.fileName].file = fs.createWriteStream(path + '/'+ formatDate(self.fileDate) + self.fileName + '.log',{ flags:'w' });
            if (num >= self.maximumFileCount) {
                var delPath = path + '/'+ formatDate(self.fileDate) + self.fileName + '_' + (self.maximumFileCount+1) + '.log';
                fs.unlink(delPath, onUnlink);
            } else {
                self.doShiftFile = false;
            }
        } else {
            onDescrFile();
        }
    };

    onDescrFile();


}

logger.prototype.writeSocket = function (str) {
    if (typeof this.socket != "undefined" && this.socket.isConnected) {
        if (str.length == 0) return;
        this.socket.write(str);
    }
};
logger.prototype.remoteDebug = function () {
    var self = this;
    var socket = new net.Socket();
    if (typeof this.socket != "undefined") this.remoteDebugDisabled();
    socket.connect(ServerPort, this.remoteHost);
    socket.on("connect", function() {
        // console.log('Connected', self.id);

        socket.write(JSON.stringify({id:String(process.pid).toLocaleLowerCase(), domain: hostname, source:true}));
        socket.isConnected = true;
    });
    socket.on("error",function (e) {
        socket.isConnected = false;
        socket.destroy();
    });
    socket.on("close", function () {
        socket.isConnected = false;
        setTimeout(function () {
            socket.connect(ServerPort, self.remoteHost);
        },10000);
    });

    this.socket = socket;

    this.clockSendMesage(remoteClockTimes);

};
logger.prototype.clockSendMesage = function (sec) {
    var self = this;
    this.remoteTimeout = setTimeout(function () {

        self.writeSocket(self.historyStr);
        self.historyStr = "";
        self.clockSendMesage(sec);
    },sec)
}
logger.prototype.remoteDebugDisabled = function () {
    if (typeof this.socket != "undefined") {

        this.socket.destroy();
        this.socket.removeAllListeners();
        this.socket = undefined;

    }
    clearTimeout(this.remoteTimeout);
    this.historyStr = "";
}

logger.prototype.timestamp = function (fmt) {
    var time = new Date();

    if (typeof fmt == 'string') {

        var o = {
            "M+": time.getMonth() + 1,
            "d+": time.getDate(),
            "H+": time.getHours(),
            "h+": time.getHours(),
            "m+": time.getMinutes(),
            "s+": time.getSeconds(),
            "S" : time.getMilliseconds()
        };

        if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (time.getFullYear() + "").substr(4 - RegExp.$1.length));
        for (var k in o)
            if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        return fmt;

    }

    var st = "[" + time.getFullYear() + "/" + (time.getMonth() + 1) + "/" + time.getDate() + " " + time.getHours() + ":" + time.getMinutes() + "]:";
    return st;
}


logger.prototype.debug = function (d) {

};
logger.prototype.tracking = function (key,object) {
    // todo [write] couchbase server

    if (this.trackBehaviorEnabled == false) return;
    if (typeof this.noSQL == "undefined") {
        this.log("error", "Load module cbConnect is undefined");
        return;
    }
    this.noSQL.insert(object, key);
}

logger.prototype.setConsole = function (console) {
    var self = this;
    process.stdout.write("setConsole\n");
    console.log = function (data) {
        process.stdout.write(arguments[0]);
        var args;
        if (levels.indexOf(arguments[0]) == -1) {
            args = Array.prototype.slice.call(arguments);
            args.unshift("log");
            self.log.apply(self, [args]);
        }else
        {
            self.log.apply(self, arguments);
        }

    };

};

logger.prototype.__defineSetter__("setLevel", function (lvStr) {
    var lv = levels.indexOf(lvStr);
    if (lv == -1)
        debugLevel = 0;
    else
        debugLevel = lv;
});
logger.prototype.__defineSetter__("setRemoteEnabled", function (enabled) {
    this.remoteEnabled = enabled;
    if (enabled){
        this.remoteDebug();
    }else {
        this.remoteDebugDisabled();
    }
});

logger.prototype.__defineSetter__("setLogStartCheckout", function (enabled) {

    if (enabled){
        // todo [connect] couchbase server
    }else {
        //todo [disconnect] couchbase server
    }


})

var bootTime = undefined;

function formatDate(show) {
    if (show == true) return "";
    if (!bootTime) bootTime = new Date();
    var date = bootTime;
    //return (date.getFullYear() + '_' + (date.getMonth() + 1) + '_' + date.getDate() + "-" + date.getHours() + "" + date.getMinutes());
    return (date.getFullYear() + '_' + (date.getMonth() + 1) + '_' + date.getDate());
};
/** ping once ipAddress confirm network has connection. **/
logger.prototype.reachabilityWithHostName = function (name) {
    var args = name.toString().split(":");
    var nc = exec.exec("nc -vz " + args[0] + " " + args[1], function (err, stdout, stderr) {
        err = err || stderr;
        this.debug.log('info',"reachability:" + stdout);
    });
};
/**
 * 統計pid記憶體使用量
 * @param PIDs
 */
logger.prototype.logTotalMemoryUsage = function (PIDs) {
    exec.exec("ps -p " + PIDs + " -o pcpu,pmem,vsz,rss | awk '{pcpu += $1; pmem += $2; vsz += $3; rss += $4;} END { print pcpu, pmem, vsz, rss }'", function (err, stdout, stderr) {
        err = err || stderr;
        if (!err) {
            var args = stdout.toString().split(" ");
            this.debug.log(new Date(),">> Total Memory %CPU=" + args[0] + ",%MEM=" + args[1] + ",VSZ=" + args[2] + ",RSS=" + args[3]);
        }
    });
};
logger.prototype.appendDiglog = function (str, file) {
    const ls = spawn('sh', ["-c","echo " + str + " >> " + file]);
}

logger.levels = extend({}, levels);

function ifdef(a, b) {
    var req;
    try {
        req = require(a);
    } catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND') {
            throw e;
        }
        req = undefined;
    }
    return req;
}
/* ************************************************************************
                    SINGLETON CLASS DEFINITION
 ************************************************************************ */

logger.instance = null;

/**
 * Singleton getInstance definition
 * @return singleton class
 */
logger.getInstance = function () {
    if(this.instance === null) {
        this.instance = new logger();
    }
    return this.instance;
};
module.exports = exports = logger;
/*
const NSLog = require('fxNetSocket').logger.getInstance();
NSLog.configure({
    // File for record
    logFileEnabled:true,
    // console log
    consoleEnabled:true,
    // quiet, error, warning, info, debug, trace, log
    level:'debug',
    // log date format
    dateFormat:'[yyyy-MM-dd hh:mm:ss]',
    // retmoteSrv console log
    remoteEnabled:false,
    // save a file path
    filePath:"./log",
    // save file named
    fileName:'Broker-1',
    // reusable log file maximum
    fileMaxCount: 3,
    // file sort: desc, asc, none
    fileSort: "none",
    // one file size
    maximumFileSize: 1024 * 10});
NSLog.log('trace', 'hello world!');
*/
