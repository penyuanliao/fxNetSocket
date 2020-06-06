const net           = require("net");
const util          = require("util");
const EventEmitter  = require("events");
const stream        = require("stream");
const Transform     = stream.Transform;
util.inherits(FxRevicer, Transform);
function FxRevicer() {
    Transform.call(this);

}
// write data //
FxRevicer.prototype._transform = function (chunk, encoding, done) {

};
FxRevicer.prototype._flush = function (cb) {

};

module.exports = exports = FxRevicer;