/**
 * Created by Benson.Liao on 15/12/21.
 */
var fs = require('fs'),
    util = require('util'),
    exec = require('child_process'),
    path = require('path'),
    net  = require('net'),
    log_file = [];
var historyLog = path.dirname(require.main.filename) + "/historyLog";
const levels = ['quiet', 'error', 'warning', 'info', 'debug', 'trace', 'log'];
var debugLevel = 0;
var logger =  function logger(options) {
    /* Variables */
    this.logFile = true;

    this.fileName = "";

    this.maximumFileSize = 20 * 1024 * 1024;

    // this.today = formatDate();
    /* Codes */
    // this.configure(options);

    this.trackBehaviorEnabled = false;
    this.id = '';

};

logger.prototype.configure = function (options) {
    this.fileName = options.fileName;
    this.consoleEnabled = options.consoleEnabled;
    if (typeof options.maximumFileSize == 'number') {
        this.maximumFileSize = options.maximumFileSize;
    }
    this.logFile = options.logFileEnabled;
    this.level = options.level;
    this.remoteEnabled = typeof options.trackBehaviorEnabled !='undefined' ? options.remoteEnabled : false;
    this.dateFormat = options.dateFormat;
    if (typeof options.filePath == 'string') {
        historyLog = options.filePath;
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
    if (typeof options.id !='undefined') {
        this.id = options.id;
    }else {
        this.id = this.fileName;
    }
    if (typeof options.console !='undefined') {
        this.setConsole(options.console);
    }
    if (typeof options.trackBehaviorEnabled !='undefined') {
        this.trackBehaviorEnabled = options.trackBehaviorEnabled;
    }
};

logger.prototype.log = function (d) {
    var level = levels.indexOf(d);
    if (level == -1) level = 0;
    if (debugLevel < level) return;

    var times = this.timestamp(this.dateFormat);
    var str = "";
    if (level == -1)
        str = times + util.format.apply(util, arguments) + '\r\n';// win:\r\n linux:\n mac:\r
    else
    {
        var args = Array.prototype.slice.call(arguments);
        var state = args.shift();
        args[0] = state + " " + args[0] + " ";
        str = times + util.format.apply(util, args) + '\r\n';// win:\r\n linux:\n mac:\r
    }
    
    if (this.logFile) {

        const firstOne = (typeof log_file[this.fileName] === 'undefined');
        if (firstOne) {
            log_file[this.fileName] = {
                num:0,
                file: fs.createWriteStream(historyLog + '/'+ formatDate() + this.fileName + '_' + 0 + '.log',{ flags:'w' })
            };
        }

        const fullSize = log_file[this.fileName].file.bytesWritten > this.maximumFileSize;

        if( fullSize ) {

            var num = log_file[this.fileName].num+1;

            log_file[this.fileName] = {
                num:num,
                file: fs.createWriteStream(historyLog + '/'+ formatDate() + this.fileName + '_' + num + '.log',{ flags:'w' })
            }

        }


        log_file[this.fileName].file.write(str);
    }
    if (this.consoleEnabled)
        process.stdout.write(str);

    if (this.remoteEnabled) {
        this.writeSocket(str);
    }
};

logger.prototype.writeSocket = function (str) {
    if (typeof this.socket != "undefined" && this.socket.isConnected) {
        this.socket.write(str);
    }
};
logger.prototype.remoteDebug = function (port) {
    var self = this;
    var socket = new net.Socket();
    socket.connect(10080, '127.0.0.1');
    socket.on("connect", function() {
        console.log('Connected', self.id);
        socket.write(self.id.toLocaleLowerCase());
        socket.isConnected = true;
    });
    socket.on("error",function (e) {
        socket.isConnected = false;
        setTimeout(function () {
            socket.connect(10080, '127.0.0.1');
        },10000);
    });
    socket.on("disconnect", function () {
        socket.isConnected = false;
    });
    this.socket = socket;
};
logger.prototype.remoteDebugDisabled = function () {
    this.socket.destroy();
    this.socket.removeAllEvent();
    this.socket = undefined;
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
logger.prototype.tracking = function (object) {
    // todo [write] couchbase server
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
    this.remoteDebug();
});

logger.prototype.__defineSetter__("setLogStartCheckout", function (enabled) {

    if (enabled){
        // todo [connect] couchbase server
    }else {
        //todo [disconnect] couchbase server
    }


})

var bootTime = undefined;

function formatDate() {
    if (!bootTime) bootTime = new Date();
    var date = bootTime;
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
 NSLog.configure({logFileEnabled:true, consoleEnabled:true, level:'trace', dateFormat:'[yyyy-MM-dd hh:mm:ss]',fileName:fileName,filePath:__dirname+"/historyLog", maximumFileSize: 1024 * 1024 * 100,
 id:process.argv[2], remoteEnabled: false});

 NSLog.log('trace', 'hello world!');
 */