/**
 * Created by Benson.Liao on 15/12/21.
 */
var debug = require('debug')('Logger');
debug.log = console.log.bind(console); //file log 需要下這行
var fs = require('fs'),
    util = require('util'),
    exec = require('child_process'),
    path = require('path'),
    log_file = [];
const historyLog = path.dirname(require.main.filename) + "/historyLog";
const levels = ['quiet', 'error', 'warning', 'info', 'debug', 'trace'];
var debugLevel = 0;
var logger =  function logger(options) {
    /* Variables */
    this.logFile = true;

    this.fileName = "";

    this.maximumFileSize = 20 * 1024 * 1024;

    // this.today = formatDate();
    /* Codes */
    // this.configure(options);
};

logger.prototype.configure = function (options) {
    this.fileName = options.fileName;
    this.maximumFileSize = options.maximumFileSize;
    this.logFile = options.logFileEnabled;
    this.level = options.level;
    this.socketDB = options.socketDBEnabled;
    this.dateFormat = options.dateFormat;
    //level pring
    if (typeof options.level == 'string') {
        var indx = levels.indexOf(options.level);
        debugLevel = indx;
        if (indx == -1) debugLevel = 0;
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

    process.stdout.write(str)

    if (this.socketDB) {
        this.writeSocket(str);
    }
};

logger.prototype.writeSocket = function (str) {

}
logger.prototype.timestamp = function (fmt) {
    var time = new Date();

    if (typeof fmt == 'string') {

        var o = {
            "M+": time.getMonth() + 1,
            "d+": time.getDate(),
            "H+": time.getHours(),
            "h+": time.getHours() % 12,
            "m+": time.getMinutes(),
            "s+": time.getSeconds(),
            "S" : time.getMilliseconds()
        }

        if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (time.getFullYear() + "").substr(4 - RegExp.$1.length));
        for (var k in o)
            if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        return fmt;

    }

    var st = "[" + time.getFullYear() + "/" + (time.getMonth() + 1) + "/" + time.getDate() + " " + time.getHours() + ":" + time.getMinutes() + "]:";
    return st;
}


logger.prototype.debug = function (d) {

    console.log(historyLog);

    var time = new Date();
    var st = "[" + time.getFullYear() + "/" + (time.getMonth() + 1) + "/" + time.getDate() + " " + time.getHours() + ":" + time.getMinutes() + "]:";
    console.log(st,util.format(d));
    if (this.logFile == false) return;

    // if (this.today != formatDate())

    if (typeof log_file === 'undefined') log_file = fs.createWriteStream(historyLog + '/'+ formatDate() + this.fileName + '.log',{ flags:'w' });
    process.stdout.write(log_file._writableState.length + "\n");
    log_file.write(st + util.format(d) + '\r\n'); // win:\r\n linux:\n mac:\r
    //
};
/**
 * polling set timer run child process state.
 * @param proc : child_process
 * @param name : link name
 * @param delay : delay
 */
logger.prototype.pollingWithProcess = function(proc, name, delay) {
    var keepWatch = setInterval(function () {
        if (proc.running == false && proc.STATUS >= 2) {
            setTimeout(function () {
                clearInterval(keepWatch);
            },delay*2);
        }
        exec.exec('ps -p ' + proc.pid + ' -o rss,pmem,pcpu,vsize,time',function (err, stdout, stderr) {
            err = err || stderr;
            if (!err) {
                logger.instance.debug('[SYSINFO] ffmpeg'+ name + '\r\n' + stdout.toString());
                logger.instance.debug('[Nodejs]process.memoryUsage: rss=' + process.memoryUsage().rss + ", heapTotal=" + process.memoryUsage().heapTotal + ", heapUsed=" + process.memoryUsage().heapUsed);
            };
        });
        /** 檢查各種狀態 **/
        if (typeof proc != 'undefined' && (proc !== null) && proc !== "") {

            if (parseInt(proc.exitCode) === 255) {
                debug("[Polling-255] ffmpeg " + name + " process to Shutdown. (use kill -15 PID) -proc.exitCode=" + proc.exitCode + " -proc.killed=" + proc.killed + " -proc.signalCode=" + proc.signalCode);
                logger.instance.debug("[Polling] ffmpeg " + name + " process to Shutdown. (use kill -15 PID) -proc.exitCode=" + proc.exitCode + " -proc.killed=" + proc.killed + " -proc.signalCode=" + proc.signalCode);
            }else if (proc.signalCode === "SIGKILL") {
                debug("[Polling-sigkill] ffmpeg " + name + " process to Shutdown. (use kill -9 PID) -proc.exitCode=" + proc.exitCode + " -proc.killed=" + proc.killed + " -proc.signalCode=" + proc.signalCode);
                logger.instance.debug("[Polling-sigkill] ffmpeg " + name + " process to Shutdown. (use kill -9 PID) -proc.exitCode=" + proc.exitCode + " -proc.killed=" + proc.killed + " -proc.signalCode=" + proc.signalCode);
            }
            else if (parseInt(proc.exitCode) === 0) {
                    debug("[Polling-0] ffmpeg " + name + " process to Shutdown. (use kill -9 PID) -proc.exitCode=" + proc.exitCode + " -proc.killed=" + proc.killed + " -proc.signalCode=" + proc.signalCode);
                    logger.instance.debug("[Polling-0] ffmpeg " + name + " process to Shutdown. (use kill -9 PID) -proc.exitCode=" + proc.exitCode + " -proc.killed=" + proc.killed + " -proc.signalCode=" + proc.signalCode);

            }else {
                debug("[Polling-log] ffmpeg " + name + " process to Working." + " -proc.exitCode=" + proc.exitCode + " -proc.killed=" + proc.killed + " -proc.signalCode=" + proc.signalCode);
            }

        }
        else{
            logger.instance.debug("[Polling] ffmpeg " + name + " process is NULL.");
        }


    },delay);
};

function formatDate() {
    var date = new Date();
    return (date.getFullYear() + '_' + (date.getMonth() + 1) + '_' + date.getDate());
};
/** ping once ipAddress confirm network has connection. **/
logger.prototype.reachabilityWithHostName = function (name) {

    var args = name.toString().split(":");

    var nc = exec.exec("nc -vz " + args[0] + " " + args[1], function (err, stdout, stderr) {
       err = err || stderr;

        debug(new Date(),"to ",name,":",stdout.toString().search("succeeded!"));
        logger.instance.debug("reachability:" + stdout);
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
            this.debug(new Date(),">> Total Memory %CPU=" + args[0] + ",%MEM=" + args[1] + ",VSZ=" + args[2] + ",RSS=" + args[3]);
        }
    });
};
/**
 * is Dead or Alive
 * @param pid
 * @param callback
 */
logger.prototype.procState = function (pid, callback) {
    exec.exec("ps -p " + pid + " -o pid | awk '{pid += $1;} END {print pid}'", function (err, stdout, stderr) {
        err = err || stderr;
        if (!err) {
            callback((pid === stdout))
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
module.exports = exports = logger.getInstance();