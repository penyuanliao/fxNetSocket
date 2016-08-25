/**
 * Created by Benson.Liao on 2016/8/19.
 */
const fs     = require('fs');
const path   = require('path');
const events = require('events');
const util   = require('util');
const os     = require('os');


util.inherits(Fxnconf, events.EventEmitter);

function Fxnconf(file, cb) {

    events.EventEmitter.call(this);
    
    this._isReady = false;

    if (typeof arguments[0] == 'string') {
        this.loadFiles(arguments[0], cb);
    }else if (typeof arguments[0] == 'undefined' && os.platform() == "linux" ) {

        var env = process.env.NODE_ENV;
        var fileName = 'info';
        var type     = '.json';
        if (typeof env == 'undefined') {
            env = "";
        }
        this.loadFiles('/home/Newflash/configuration/' + fileName + '-' + env + type);
    }

};
Fxnconf.prototype.loadFiles = function (file, cb) {
    var self = this;
    self._isReady = false;
    if (!self._verifyfile(file)) return;

    var conf;

    try {
        var data = fs.readFileSync(file, 'utf8');
        conf = JSON.parse(data.toString());
        self.conf = conf;
        if (cb) cb(conf);
        self._isReady = true;
        self.emit('ready', self.conf);
    }
    catch (e) {
        console.log('FxConf load file error:', e);
    }

}
Fxnconf.prototype._verifyfile = function (file) {
    if (typeof file == 'undefined') {
        console.log('The above file name is invalid.');
        return false;
    }

    return true;
}

Fxnconf.prototype.__defineGetter__("isReady", function () {
    return this._isReady;
})


module.exports = exports = Fxnconf;

