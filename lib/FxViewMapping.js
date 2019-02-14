const os = require("os");
function FxViewMapping() {

}
FxViewMapping.table = function (name) {
    var item = {
        "hk-ht5fmsvideo-01.rd3.prod": "10.1",
        "hk-ht5fmsvideo-02.rd3.prod": "10.2",
        "hk-ht5fmsvideo-03.rd3.prod": "10.3",
        "hk-ht5fmsvideo-04.rd3.prod": "10.4",
        "hk-ht5fmsvideo-05.rd3.prod": "10.5",
        "hk-ht5fmsvideo-06.rd3.prod": "10.6",
        "hk-ht5fmsvideo-07.rd3.prod": "10.7",
        "hk-ht5fmsvideo-08.rd3.prod": "10.8",
        "hk-ht5fmsvideo-09.rd3.prod": "10.9",
        "hk-ht5fmsvideo-10.rd3.prod": "10.10",
        "hk-ht5fmsvideo-11.rd3.prod": "10.11",
        "tpe-h5fmsvideo-1.rd3.prod": "11.1",
        "tpe-h5fmsvideo-2.rd3.prod": "11.2",
        "tpe-h5fmsvideo-3.rd3.prod": "11.3",
        "tpe-h5fmsvideo-4.rd3.prod": "11.4",
        "tpe-h5fmsvideo-5.rd3.prod": "11.5",
        "tpe-h5fmsvideo-6.rd3.prod": "11.6",
        "tpe-h5fmsvideo-7.rd3.prod": "11.7",
        "tpe-h5fmsvideo-8.rd3.prod": "11.8",
        "tpe-h5fmsvideo-9.rd3.prod": "11.9",
        "tpe-h5fmsvideo-10.rd3.prod": "11.10",
        "tpe-h5fmsvideo-11.rd3.prod": "11.11",
    };
    return item[name];
}
FxViewMapping.hostname = function () {
    var name = os.hostname();
    var fmt;
    name = name.replace(/.rd3.prod/gi, "");
    if (name.indexOf("nodejs") != -1) {
        fmt = name.replace(/nodejs/gi, "12.");
    } else
    {
        fmt = name.replace(/hk-ht5fmsvideo-/gi, "10.");
        if (fmt === name) {
            fmt = name.replace(/tpe-h5fmsvideo-/gi, "11.");
        }
        if (fmt === name) {
            fmt = name.replace(/\D+/gi, "15.");
        }
    }
    return fmt;
}

module.exports = exports = FxViewMapping;

