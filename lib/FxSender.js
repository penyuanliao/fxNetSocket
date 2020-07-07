const net           = require("net");
const util          = require("util");
const EventEmitter  = require("events");
const zlib          = require("zlib");
const stream        = require("stream");
const Transform     = stream.Transform;

util.inherits(FxSender, EventEmitter);
function FxSender() {
    EventEmitter.call(this);
    this.INT32_MAX_VALUE =  Math.pow(2,32);
    this.masking_key = Buffer.alloc(4);
    this.wStream = this.setupTransform();
}
FxSender.prototype.setupTransform = function (client) {
    const self = this;
    const tranform = new Transform();
    tranform._transform = function (data, enc, next) {

        var len = 0;
        var buf;
        if (self.compress == "br") {
            buf = self.ws_compress_sync(data);
        } else {
            buf = self.emit_websocket(data);
        }
        // 將輸入進來的資料直接推送出去
        this.push(buf);
        len = buf.byteLength;
        // 完成這筆資料的處理工作
        next();
    }
    // tranform.pipe(this.socket);
    return tranform;
};
FxSender.prototype.pipe = function (socket) {
    if (this.wStream) this.wStream.pipe(socket);
};
FxSender.prototype.createCompress = function () {
    const endpoint = this;
    if (typeof this.inflate == "undefined") {
        this.inflate = zlib.createDeflateRaw({windowBits: zlib.Z_DEFAULT_WINDOWBITS});
        this.inflate.on("data", function (data) {
            data.toString();
        });
    }
    return this.inflate;
};
FxSender.prototype.writeFraming = function (fin, opcode, masked, payload) {
    var len, meta, start, mask, i;

    len = payload.length;
    // fix Buffer Reusable
    if (typeof _meta === 'undefined' || _meta.length < len) {
        // Creates the buffer for meta-data
        meta = Buffer.allocUnsafe(2 + (len < 126 ? 0 : (len < 65536 ? 2 : 8)) + (masked ? 4 : 0));
    }
    // meta = _meta;

    // Sets fin and opcode
    meta[0] = (fin ? 128 : 0) + opcode;

    // Sets the mask and length
    meta[1] = masked ? 128 : 0;
    start = 2;
    if (len < 126) {
        meta[1] += len;
    } else if (len < 65536) {
        meta[1] += 126;
        meta.writeUInt16BE(len, 2);
        start += 2
    } else {
        // Warning: JS doesn't support integers greater than 2^53
        meta[1] += 127;
        meta.writeUInt32BE(Math.floor(len / this.INT32_MAX_VALUE), 2);
        meta.writeUInt32BE(len % this.INT32_MAX_VALUE, 6);
        start += 8;
    }

    // Set the mask-key 4 bytes(client only)
    if (masked) {
        mask = this.masking_key;
        // mask = crypto.randomBytes(4);
        // bufferUtil.mask(payload, mask, payload, start, payload.length);
        for (i = 0; i < 4; i++) {
            meta[start + i] = mask[i] = Math.floor(Math.random() * 256);
        }
        for (i = 0; i < payload.length; i++) {
            payload[i] ^= mask[i % 4];
        }
        start += 4;
    }

    return meta;
};
module.exports = exports = FxSender;