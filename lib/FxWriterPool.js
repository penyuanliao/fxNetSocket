const net       = require("net");
const util      = require("util");
const stream    = require("stream");
const Writable  = stream.Writable;
util.inherits(FxWriterPool, Writable);
/**
 * 自訂Writable Stream 元件
 * @param {module:Writable.WritableOptions} options Writable參數
 * @constructor
 */
function FxWriterPool(options) {
    /** @property {Number} bufLen 計算剩餘長度 */
    this.bufLen = 0;
    /** @property {Number} seq 計算傳送總長度 */
    this.seq = 0;
    Writable.call(this, options);
}
/**
 * 將輸入資料送Writable
 * @param chunk
 */
FxWriterPool.prototype._write = function (chunk, encoding, done) {
    if (Buffer.isBuffer(chunk) === false) return;
    this.bufLen += chunk.byteLength;
    this.seq += chunk.byteLength;
    done();
};
/**
 * 讀取Writable資料長度
 * @param {Number} n 長度
 * @return {Buffer|*}
 */
FxWriterPool.prototype.read = function (n) {
    if (n == 0) return Buffer.alloc(0);
    this.bufLen -= n;
    return FxWriterPool.super_.prototype.read.apply(this, arguments);
};
/**
 * 驗證資料長度是否足夠
 * @param {Number} n 長度
 * @return {boolean}
 */
FxWriterPool.prototype.valid = function (n) {
    return this.bufLen >= n;
};
/**
 * 總資料量
 * @return {number}
 */
FxWriterPool.prototype.getSequenceNumber = function () {
    return this.seq;
};
/**
 * 回收物件
 */
FxWriterPool.prototype.release = function () {
    FxWriterPool.super_.prototype.read.apply(this);
    if (this.destroy instanceof Function) {
        this.destroy();
    }
};

FxWriterPool.prototype.end = function () {
    this.release();
    this.emit("close");
};
module.exports = exports = FxWriterPool;