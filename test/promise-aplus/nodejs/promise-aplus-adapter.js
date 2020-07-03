/**
 * Define a module as adapter for promise-aplus-tests.
 */


const promises3 = require("../../../Promise.js");

function deferred() {
    let resolve, reject;
    let promise = new promises3.Promise(
        function (_resolve, _reject) {
            resolve = _resolve;
            reject = _reject;
        }
    );

    return {
        resolve: resolve,
        reject: reject,
        promise: promise
    };
}

module.exports = {
    resolved: promises3.Promise.resolve,
    rejected: promises3.Promise.reject,
    deferred: deferred
};