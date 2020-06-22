/**
 * An implementation of Promise for ES3.
 * 
 * @author Yichen Liu
 * @copyright (c) 2020 Yichen Liu
 * @license MIT
 */

if (typeof Promise === "undefined") {

    var Promise = (function () {
        
        function Promise(func) {

            if (!(this instanceof Promise))
                throw new TypeError("Promise constructor must be called with 'new' or on a Promise instance.");
            if (typeof func !== "function")
                throw new TypeError("The argument of Promise constructor must be a function.");


            /**
             * @private
             * @type {any}
             */
            this["[[value]]"] = undefined;

            /**
             * @private
             * @type {"pending" | "fulfilled" | "rejected"}
             */
            this["[[status]]"] = "pending";

            /**
             * @private
             * @type {boolean}
             */
            this["[[fulfilledByPromise]]"] = false;

            /**
             * @private
             * @type {{
             *      onFulfilled: undefined | (any) => any,
             *      onRejected: undefined | (any) => any,
             *      promise: Promise     
             * }[]} 
             */
            this["[[thens]]"] = [];


            // Function.prototype.bind() is not ES3 function
            // It have been polyfill on this["[[resolve]]"] and this["[[reject]]"].
            // See code later.
            func(
                this["[[resolve]]"].bind(this),
                this["[[reject]]"].bind(this)
            );
        }


        /**
         * Resolve the `Promise`.
         * 
         * @private
         * 
         * @param {Promise | any} [result]  The value used to resolve the promise.
         */
        Promise.prototype["[[resolve]]"] = function (result) {
            // https://promisesaplus.com/#promise-states
            //      When a Promise have been resolved or rejected, it cannot be changed anymore.
            // https://promisesaplus.com/#point-49
            //      2.3.2.1. When a Promise x resolved by another Promise y, x must remain pending until y is resolved or rejected.
            if (this["[[status]]"] !== "pending" || this["[[resolvedByPromise]]"])
                return;

            // https://promisesaplus.com/#the-promise-resolution-procedure
            //      2.3.1. If x and y are the same Promise object, throw an exception.
            if (this === result)
                throw new TypeError("Cannot resolve a promise with itself.");

            // + Otherwise
            if (typeof result === "object" || typeof result === "function") {
                try {
                    if (typeof result.then === "function") {
                        result.then(
                            this["[[resolve]]"].bind(this),
                            this["[[resolve]]"].bind(this)
                        );
                        this["[[resolvedByPromise]]"] = true;
                    }
                }
                catch(error) {
                    this["[[reject]]"](error);
                }
            }

            else {
                this["[[status]]"] = "resolved";
                this["[[value]]"] = result;

                var length = this["[[thens]]"].length;
                for(var i = 0; i < length; ++i) {
                    var then = this["[[thens]]"][i];
                    invokeOnFulFilled(then.onFulfilled, result, then.promise);
                }
            }
        }


        /**
         * Reject the `Promise`.
         * 
         * @private
         * 
         * @param {any} reason
         */
        Promise.prototype["[[reject]]"] = function(reason) {

        }

        function invokeOnFulFilled(onFulfilled, result, nextPromise) {
            if (typeof onFulfilled === "function")
                invokeCallbackAsync(onFulfilled, result, nextPromise);
            else
                nextPromise["[[resolve]]"](result);

        }
        
        function invokeCallbackAsync(callback, arg, nextPromise) {
            setTimeout(invokeCallbackSync, 0, callback, arg, nextPromise);
        }

        function invokeCallbackSync(callback, arg, nextPromise) {
            try {
                var returnValue = callback(arg);
                nextPromise["[[resolve]]"](returnValue)
            }
            catch(error) {
                nextPromise["[[reject]]"](error);
            }
        }

        Promise.prototype["[[reject]]"] = function(reason) {
            
        }

        // ES3 has no Function.prototype.bind()
        // Polyfill it on ["[[resolve]]"] and ["[[reject]]"]
        // The arg makes no sence, just make the length of function to be 1.
        if (!Function.prototype.bind) {
            Promise.prototype["[[resolve]]"].bind 
            = Promise.prototype["[[reject]]"].bind 
            = function bind(thisArg) {
                var func = this;
                return function(arg) {
                    func.apply(thisArg, arguments);
                }
            };
        }


        Promise.prototype.then = function (onFulfilled, onRejected) {

        }
    })()
}