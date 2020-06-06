const net       = require("net");
const util      = require("util");
const stream    = require("stream");
const Readable  = stream.Readable;
util.inherits(FxReaderPool, Readable);
function FxReaderPool(options) {

    this.bufLen = 0;
    this.seq = 0;

    Readable.call(this, options);
}
FxReaderPool.prototype._read = function (n) {
    // redundant? see update below
};
FxReaderPool.prototype.stoped = function () {
    // this.push(null);
};
FxReaderPool.prototype.push = function (chunk) {
    if (Buffer.isBuffer(chunk) === false) return;
    this.bufLen += chunk.byteLength;
    this.seq += chunk.byteLength;
    FxReaderPool.super_.prototype.push.apply(this, arguments);
    // console.log("push",this._readableState.buffer);
};
FxReaderPool.prototype.read = function (n) {
    if (n == 0) return;
    this.bufLen -= n;
    return FxReaderPool.super_.prototype.read.apply(this, arguments);
};
FxReaderPool.prototype.valid = function (n) {
    return this.bufLen >= n;
};
FxReaderPool.prototype.getSequenceNumber = function () {
    return this.seq;
};
FxReaderPool.prototype.release = function () {
    FxReaderPool.super_.prototype.read.apply(this);
    if (this.destroy instanceof Function) {
        this.destroy();
    }
};
FxReaderPool.prototype.write = function (chunk) {
    if (!Buffer.isBuffer(chunk)) return;
    this.push(chunk);
};
FxReaderPool.prototype.end = function () {
    this.release();
    this.emit("close");
};
module.exports = exports = FxReaderPool;