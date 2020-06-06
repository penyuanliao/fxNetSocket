const net           = require("net");
const util          = require("util");
const EventEmitter  = require("events");
const FxReaderPool  = require("./FxReaderPool.js");
const zlib = require("zlib");
util.inherits(FxRevicer, EventEmitter);

const TAILER = Buffer.from([0x00, 0x00, 0xff, 0xff]);

function FxRevicer(mode, client) {

    EventEmitter.call(this);

    this.mode = mode;
    this.client = client;
    this.first = true;
    this.compressed = false;
    this.protocol = undefined;
    this.reader = new FxReaderPool();
    const self = this;
    this.reader.on("readable", this.polling.bind(this, this.onHandle.bind(this)));
    this.reader.on("close", function () {});
    const stream = zlib.createInflateRaw({windowBits: zlib.Z_DEFAULT_WINDOWBITS})

    //this.pipe(stream);
}
FxRevicer.prototype.createDecompress = function () {
    const endpoint = this;
    if (typeof this.stream == "undefined") {
        this.stream = zlib.createInflateRaw({windowBits: zlib.Z_DEFAULT_WINDOWBITS});
        this.stream.on("data", function (data) {
            endpoint.emit("message", data);
        });
    }
    return this.stream;
};
FxRevicer.prototype.onHandle = function (proto) {

    if (proto.compressed) {
        const stream = this.createDecompress();
        stream.write(proto.payload);
        stream.write(TAILER);
        stream.flush(zlib.Z_SYNC_FLUSH, function () {

            console.log('flush', proto.opcode);
            if (proto.opcode == 8) stream.close();
        });
    } else {
        this.emit("message", proto.msg);
    }
};
FxRevicer.prototype.polling = function (cb) {
    var loop = true;
    var res;
    while (loop) {
        res = this.parser(cb);
        if (res != true) {
            if (typeof res == "string") console.log('error: ', res);
            loop = false;
        }
    }
}
FxRevicer.prototype.push = function (chunk) {
    this.reader.push(chunk);
};
FxRevicer.prototype.parser = function (cb) {

    if (this.reader.valid(2) == false) return false;
    var protocol;
    var buf;
    if (typeof this.protocol == "undefined") {
        protocol = this.protocol = this.basicHeader();
        if (protocol.opcode < 0x00 || protocol.opcode > 0x0F) {
            // Invalid opcode
            return Error("Invalid opcode:" + protocol.opcode);
        }
        if (protocol.opcode >= 8 && !protocol.fin) {
            // Control frames must not be fragmented
            return Error("Control frames must not be fragmented");
        }
        if (!protocol.fin) return false;

    } else {
        protocol = this.protocol;
    }
    buf = this.reader.read(1);
    const part = buf.readUInt8(0);
    const hasMask = part >> 7; // mask, payload len info
    var payload_length = part % 128; //  if 0-125, that is the payload length

    protocol.start = hasMask ? 6 : 2;

    // Get the actual payload length // 1-7bit = 127
    if (payload_length === 126) {
        const ext1Buf = this.reader.read(2)
        payload_length = ext1Buf.readUInt16BE(0); // a 16-bit unsigned integer
        protocol.start += 2; // If 126, the following 2 bytes interpreted as a 16-bit unsigned integer;

    } else if (payload_length == 127) {
        const ext2Buf = this.reader.read(8);
        // Warning: JS can only store up to 2^53 in its number format
        payload_length = ext2Buf.readUInt32BE(0) * this.INT32_MAX_VALUE + ext2Buf.readUInt32BE(4);
        protocol.start += 8; // If 127, the following 8 bytes interpreted as a 64-bit unsigned integer;
    }
    protocol.payload_length = payload_length;

    protocol.total = protocol.start + payload_length;

    // console.log("payload_length: ", this.reader.bufLen);

    if (hasMask) {
        // if mask start is masking-key,but be init set start 6 so need -4
        // frame-masking-key : 4( %x00-FF )
        protocol.mask = this.reader.read(4);
    }
    // Extract the payload
    protocol.payload = this.reader.read(payload_length);

    if (hasMask) {
        // by c decode

        for (i = 0; i < protocol.payload.length; i++) {
            // j = i MOD 4 //
            // transformed-octet-i = original-octet-i XOR masking-key-octet-j //
            protocol.payload[i] ^= protocol.mask[i % 4];　// [RFC-6455 Page-32] XOR
        }
        //bufferUtil.unmask(protocol.payload, protocol.mask)
    }

    if (protocol.opcode == 2)
        protocol.msg = protocol.payload;
    else
        protocol.msg = protocol.payload;
    this.protocol = undefined;
    if (cb) cb(protocol);
    return true;
}
FxRevicer.prototype.basicHeader = function () {
    const buf  = this.reader.read(1)
    const part = buf.readUInt8(0);
    const fin  = (part & 0x80) == 0x80;
    const rsv1 = (part & 0x40) == 0x40;
    const rsv2 = (part & 0x20) == 0x20;
    const rsv3 = (part & 0x10) == 0x10;
    const opcode = part & 0x0F;
    if (this.first && rsv1 == true) {
        this.compressed = true;
        this.first = false;
    }
    console.log(part, fin, rsv1, (rsv2 != false || rsv3 != false), "compressed", this.compressed);

    return {
        fin:  fin,
        rsv1: rsv1,
        rsv2: rsv2,
        rsv3: rsv3,
        opcode: opcode,
        compressed: this.compressed
    }
};

module.exports = exports = FxRevicer;