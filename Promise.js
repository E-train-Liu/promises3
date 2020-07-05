/**
 * An implementation of Promise for ES3.
 * 
 * @author Yichen Liu
 * @copyright (c) 2020 Yichen Liu
 * @license MIT
 */

(function (definations) {

    // CommonJS
    if (typeof module === "object" && module !== null)
        module.exports = definations;
    // AMD and CMD
    else if (typeof define === "function" && (define.amd || define.cmd))
        define(function () {
            return definations;
        });
    // Simply Polyfill
    else {
        if (typeof Promise === "undefined")
            Promise = definations.Promise;
        if (typeof AggregateError === "undefined")
            AggregateError = definations.AggregateError;
    }

})((function () {

    /* Constructor */

    /**
     * Construct a `Promise` object.
     * 
     * @param {(
     *      resolvePromise: (value?: any) => void,
     *      rejectPromise: (reason?: any) => void
     * ) => void} executor 
     */
    function Promise(executor) {

        if (!(this instanceof Promise))
            throw new TypeError("Promise constructor must be called with 'new' or on a Promise instance.");
        if (typeof executor !== "function")
            throw new TypeError("The argument of Promise constructor must be a function.");


        /** @private @type {any} */
        this["[[value]]"] = undefined;

        /** @private @type {"pending" | "fulfilled" | "rejected"} */
        this["[[status]]"] = "pending";

        /** 
         * @private
         * @type {{
         *      onFulfilled: any | (value: any) => any,
         *      onRejected: any | (reason: any) => any,
         *      returnedPromise: Promise     
         * }[]} 
         */
        this["[[thens]]"] = [];

        /** @private @type {boolean} */
        this["[[handled]]"] = false;

        // Optimization for internally used `emptyExecutor`
        if (executor === emptyExecutor)
            return;

        operatePromiseByExecutor(this, executor);
    }


    if (typeof AggregateError !== "function") {

        /**
         * @type {boolean}
         */
        var definePropertyUsable;
        try {
            Object.defineProperty(new Error(), "test", {
                get: function () { return [] },
                configurable: true,
                enumerable: false,
                writable: true
            });
            definePropertyUsable = true;
        }
        catch (error) {
            definePropertyUsable = false;
        }

        /**
         * A bundle of multiple `Error`.
         * 
         * An experimental class,
         * see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError.
         * 
         * @class
         * 
         * @param {Interable} errors  An a interable of errors.
         * @param {string} [message=""]  The message describing the error. Be `""` on default.
         */
        function AggregateError(errors, message) {
            Error.call(this, message);

            var errorArray = iterableToArray(errors);

            if (definePropertyUsable)
                Object.defineProperty(this, "[[errors]]", {
                    value: errorArray,
                    configurable: false,
                    enumerable: false,
                    writable: false
                });
            else {
                this.errors = errorArray;
            }
        }
        AggregateError.prototype = new Error();
        AggregateError.prototype.constructor = AggregateError;

        if (definePropertyUsable) {
            Object.defineProperty(AggregateError.prototype, "errors", {
                get: function () {
                    return this["[[errors]]"].slice();
                },
                configurable: true,
                enumerable: false,
                writable: true
            });
        }
    }








    /* Member Functions */

    /**
     * Chain the current `Promise`. Define the callback to
     * be invoked when the current `Promise` is fulfilled or rejected.
     * 
     * @param {(value: any) => void} onFulfilled 
     * @param {(reason: any) => void} onRejected 
     */
    Promise.prototype.then = function (onFulfilled, onRejected) {
        this["[[handled]]"] = true;
        var returnedPromise = new Promise(emptyExecutor);

        switch (this["[[status]]"]) {
            case "fulfilled":
                invokeOnFulFilledCallbackAsync(onFulfilled, this["[[value]]"], returnedPromise);
                break;
            case "rejected":
                invokeOnRejectedCallbackAsync(onRejected, this["[[value]]"], returnedPromise);
                break;
            case "pending":
            default:
                this["[[thens]]"].push({
                    onFulfilled: onFulfilled,
                    onRejected: onRejected,
                    returnedPromise: returnedPromise
                });
                break;
        }

        return returnedPromise;
    }

    /**
     * Define callback to be invoked when the current `Promise` is rejected.
     * 
     * @param {(reason: any) => void} onRejected 
     */
    Promise.prototype.catch = function (onRejected) {
        return this.then(undefined, onRejected);
    }

    /**
     * Define callback to be invoked when the current `Promise` is
     * either fulfilled or rejected.
     * 
     * @param {(value: any) => void} onFinally 
     */
    Promise.prototype.finally = function (onFinally) {
        return this.then(onFinally, onFinally);
    }

    if (typeof Symbol === "function" && Symbol.toStringTag)
        Promise.prototype[Symbol.toStringTag] = "Promise";








    /* Static Functions */

    /**
     * Take an iterable consist of `Promise`, `Thenable` or value.
     * Return a single `Promise`.
     * 
     * The returned `Promise` will be fulfilled when all inputs are fulfilled 
     * and will be rejected if any of the input is rejected.
     * 
     * @param {Iterable} promises 
     * @returns {Promise}
     */
    Promise.all = function (promises) {
        var promiseArray = iterableToArray(promises);
        return new Promise(
            curry(allExecutor, promiseArray)
        );
    }

    /**
     * Take an iterable consist of `Promise`, `Thenable` or value.
     * Return a single `Promise`.
     * 
     * The returned `Promise` will be fulfilled when all inputs are
     * either fulfilled or rejected. 
     * 
     * @param {Iterable} promises
     * @returns {Promise}
     */
    Promise.allSettled = function (promises) {
        var promiseArray = iterableToArray(promises);
        return new Promise(
            curry(allSettledExecutor, promiseArray)
        );
    }

    /**
     * Take an iterable consist of `Promise`, `Thenable` or value.
     * Return a single `Promise`.
     * 
     * The returned `Promise` will be fulfilled when any of the input is fulfilled 
     * and will be rejected if all of the inputs are rejected.
     * 
     * @param {Iterable} promises
     * @returns {Promise}
     */
    Promise.any = function (promises) {
        var promiseArray = iterableToArray(promises);
        return new Promise(
            curry(anyExecutor, promiseArray)
        );
    }

    /**
     * Take an iterable consist of `Promise`, `Thenable` or value.
     * Return a single `Promise`.
     * 
     * The returned `Promise` will be fulfilled when any of the input is first fulfilled 
     * and will be rejected if any of the input is first rejected.
     * 
     * @param {Iterable} promises
     * @returns {Promise}
     */
    Promise.race = function (promise) {
        var promiseArray = iterableToArray(promises);
        return new Promises(
            curry(raceExecutor, promiseArray)
        )
    }

    /**
     * Return a `Promise` rejected by `reason`.
     * 
     * @param {any} reason
     * @return {Promise} 
     */
    Promise.reject = function (reason) {
        return new Promise(function(resolve, reject) {
            reject(reason);
        });
    }

    /**
     * Return a `Promise` resolved by `value`.
     * 
     * @param {any} value
     * @return {Promise} 
     */
    Promise.resolve = function (value) {
        return new Promise(function(resolve, reject) {
            resolve(value);
        });
    }








    /* Helper Functions For Member Functions */

    /**
     * Resolve a promise anyway without checking that if it have not been resolved by 
     * a Thenable or another Promise.
     * 
     * Algorithm and standard: https://promisesaplus.com/#the-promise-resolution-procedure
     * 
     * @param {Promise} promise  The promise to be resolve.
     * @param {any | Thenable} value  The value used to resolve the promise.
     */
    function resolve(promise, value) {

        // https://promisesaplus.com/#point-48
        //      A Promise cannot be resolved with itself. 
        if (promise === value) {
            reject(promise, new TypeError("Cannot resolve a promise with itself."));
            return;
        }

        // https://promisesaplus.com/#point-49
        //      If `value` is a `Promise`, the current `promise` will be 
        //      fulfilled or rejected following `value`
        if (value instanceof Promise) {
            value.then(
                curry(resolve, promise),
                curry(reject, promise)
            );
            return;
        }

        // https://promisesaplus.com/#point-54
        //      For Thenable.
        var then = null;
        try {
            if ((typeof value === "object" || typeof value === "function") 
                && value !== null
                && typeof (then = value.then) === "function"
            )
                operatePromiseByExecutor(promise, bind(then, value));
            // https://promisesaplus.com/#point-63
            // https://promisesaplus.com/#point-64
            //      If `value` is not a object or a non-thenable object,
            //      fulfill the `promise` with it as value. 
            else
                fulfill(promise, value);
        }
        catch (error) {
            // https://promisesaplus.com/#point-55
            //      If retriving `value.then` cause an `exception`, reject `promise` with `exception`
            reject(promise, error);
        }
    }

    /**
     * Fulfill a pending promise without checking that if the 
     * promise is pending and if it have been resolve by Thenable.
     * 
     * @param {Promise} promise 
     * @param {any} value 
     */
    function fulfill(promise, value) {
        // Only pending `Promise` can be fulfilled.
        if (promise["[[status]]"] !== "pending")
            return;

        promise["[[value]]"] = value;
        promise["[[status]]"] = "fulfilled";
        invokeFunctionAsync(invokeOnFulFilledCallbacks, promise);
    }

    /**
     * Invoke all onFulfilled callbacks added to a `Promise` added by then().
     * 
     * Do nothing when no callbacks are added
     * 
     * @param {Promise} promise
     */
    function invokeOnFulFilledCallbacks(promise) {
        var value = promise["[[value]]"];
        var thens = promise["[[thens]]"];
        var thenCount = thens.length;
        for(var i = 0; i < thenCount; ++i) {
            var then = thens[i];
            invokeOnFulFilledCallbackAsync(then.onFulfilled, value, then.returnedPromise);
        }
    }

    /**
     * Invoke `onFulfilled` callback added by `then()` asynchronously
     * when it is a function. 
     * 
     * Resolve or reject the `returnedPromise` returned by then() according to
     * the `onFulfilled`. 
     * + If `onFulfilled` runs well, resolve the `returnedPromise` with the return value of `onFulfilled`.
     * + If `onFulfilled` is not a function, resolve the `returnedPromise` with the value of current promise.
     * + If `onFulfilled` throws an exception, reject `returnedPromise` with the exception
     * 
     * @param {any | (value: any) => any} onFulfilled 
     * @param {any} value 
     * @param {Promise} returnedPromise
     */
    function invokeOnFulFilledCallbackAsync(onFulfilled, value, returnedPromise) {
        if (typeof onFulfilled === "function")
            // https://promisesaplus.com/#point-34
            //      The `onFulfilled` and `onRejected` callbacks must be called async.
            invokeFunctionAsync(
                invokeThenCallback, onFulfilled, value, returnedPromise
            );
        // https://promisesaplus.com/#point-43
        //      If `onFulfilled` is not a function. Resolve the next promise with
        //      the value of this promise.
        else
            resolve(returnedPromise, value);
    }


    /**
     * Reject the `promise` with given `reason`.
     * 
     * @param {Promise} promise 
     * @param {any} reason 
     */
    function reject(promise, reason) {

        // A promise can only be resolved when pending.
        if (promise["[[status]]"] !== "pending")
            return;

        promise["[[value]]"] = reason;
        promise["[[status]]"] = "rejected";
        invokeFunctionAsync(invokeOnRejectedCallbacks, promise);
    }

    /**
     * Invoke all onFulfilled callbacks added to a `Promise` added by then().
     * 
     * When then() is not called, then no callbacks are added. Throw the value of
     * the current promise as an error.
     * 
     * @param {Promise} promise
     * 
     * @throws {any} Throws the value of `promise` when its `then()` not called.
     */
    function invokeOnRejectedCallbacks(promise) {
        var reason = promise["[[value]]"];
        var thens = promise["[[thens]]"];
        var thenCount = thens.length;
        
        if(!promise["[[handled]]"])
            reportUnhandledRejection(reason);

        for(var i = 0; i < thenCount; ++i) {
            var then = thens[i];
            invokeOnRejectedCallbackAsync(then.onRejected, reason, then.returnedPromise);
        }
    }

    /**
     * Invoke `onRejected` callback added by `then()` asynchronously
     * when it is a function. 
     * 
     * Resolve or reject the `returnedPromise` returned by then() according to
     * the `onRejected`. 
     * + If `onRejected` runs well, resolve the `returnedPromise` with the return value of `onRejected`.
     * + If `onRejected` is not a function, reject the `returnedPromise` with the value of current promise.
     * + If `onRejected` throws an exception, reject `returnedPromise` with the exception
     * 
     * @param {any | (value: any) => any} onFulfilled 
     * @param {any} reason 
     * @param {Promise} returnedPromise
     */
    function invokeOnRejectedCallbackAsync(onRejected, reason, returnedPromise) {
        if (typeof onRejected === "function")
            // https://promisesaplus.com/#point-34
            //      The `onFulfilled` and `onRejected` callbacks must be called async.
            invokeFunctionAsync(
                invokeThenCallback, onRejected, reason, returnedPromise
            );
        // https://promisesaplus.com/#point-44
        //      If `onRejected` is not a function. Reject the next promise with
        //      the value of this promise.
        else
            reject(returnedPromise, reason);
    }


    /**
     * Invoke the `onFulfilled` or `onRejected` callback added by `then()`.
     * 
     * It will resolve or reject the next `Promise` returned by `then()` according
     * to the running result of the callback.
     * 
     * @param {(value: any) => void} callback 
     * @param {any} value 
     * @param {Promise} returnedPromise 
     */
    function invokeThenCallback(callback, value, returnedPromise) {
        try {
            // https://promisesaplus.com/#point-41
            //      When `onFulfilled` or `onRejected` return a value, resolve
            //      the `Promise` returned by `then()` with the return value.
            var callbackReturnValue = callback(value);
            resolve(returnedPromise, callbackReturnValue)
        }
        catch (error) {
            // https://promisesaplus.com/#point-42
            //      When `onFulfilled` or `onRejected` throws an exception, 
            //      reject the next `Promise`.
            reject(returnedPromise, error);
        }
    }

    /**
     * Run an executor. Let the function `executor` to decide wthether resolve or
     * reject the promise.
     * 
     * 2 functions, `resolvePromise()` and `rejectPromise()` will be pass to the `executor`.
     * If they are called multiple times, only the first call will be valid.
     * 
     * If the executor throws `error`, `promise` will be rejected with `error`. The `error`
     * won't be thrown out of the `operatePromiseByExecutor()` function.
     * 
     * @param {Promise} promise 
     * @param {(
     *      resolvePromise: (value?: any) => void,
     *      rejectPromise: (reason?: any) => void
     * ) => void} executor 
     */
    function operatePromiseByExecutor(promise, executor) {
        var called = false;
        function resolvePromise(value) {
            if (!called) {
                called = true;
                resolve(promise, value);
            }
        }
        function rejectPromise(reason) {
            if (!called) {
                called = true;
                reject(promise, reason);
            }
        }

        try {
            executor(resolvePromise, rejectPromise);
        }
        catch (error) {
            rejectPromise(error);
        }
    }

    /**
     * Report a Promise was rejected but not handled.
     * Print warning on console.
     * 
     * @function
     * @type {(reason: any) => void}
     * 
     * @param {any} reason
     */
    function reportUnhandledRejection(reason) {
        if (typeof console !== "undefined" && console !== null && console.warn)
            console.warn("Unhandled Promise rejection: ", reason);
    }








    /* Helper Functions for Static Functions */

    /**
     * To watch an array of `Promise`s, add the same fulfill and reject
     * callback by `then()` on them.
     * 
     * If an element in the array with value `v` is not a promise, it will be seen as
     * an promise being fulfilled with `v`.   
     * 
     * @param {any[]} promises 
     * @param {(index: number, value: any) => void} [onFulfilledAt]
     * @param {(index: number, reason: any) => void} [onRejectedAt]
     */
    function watchPromises(promises, onFulfilledAt, onRejectedAt) {
        var promiseCount = promises.length;

        for (var i = 0; i < promiseCount; ++i) {
            var promise = promises[i];
            try {
                if (promise != null && typeof promise.then === "function")
                    promise.then(
                        curry(onFulfilledAt, i),
                        curry(onRejectedAt, i)
                    );
                else
                    onFulfilledAt(i, promise);
            }
            catch (error) {
                onRejectedAt(i, error);
            }
        }
    }

    /**
     * The executor to create the promise returned by `Promise.all()`.
     * 
     * @param {any[]} promises 
     * @param {(value: any[]) => void} resolvePromise
     * @param {(reason: any) => void} rejectPromise 
     */
    function allExecutor(promises, resolvePromise, rejectPromise) {
        var unfulfilledCount = promises.length;
        var values = new Array(promises.length);
        var rejected = false;

        if (unfulfilledCount === 0) {
            resolvePromise(values);
            return;
        }

        function onFulfilledAt(index, value) {
            values[index] = value;
            if (--unfulfilledCount <= 0)
                // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all#Fulfillment
                //      If all promises are fulfilled, the promise returned by `Promise.all()` should be fullfilled async.
                invokeFunctionAsync(resolvePromise, values);
        }
        function onRejectedAt(index, reason) {
            if (!rejected) {
                rejected = true;
                invokeFunctionAsync(rejectPromise, reason);
            }
        }
        watchPromises(onFulfilledAt, onRejectedAt);
    }

    /**
     * The executor to create the promise returned by `Promise.allSettled()`.
     * 
     * @param {any[]} promises 
     * @param {(value: any[]) => void} resolvePromise
     */
    function allSettledExecutor(promises, resolvePromise, rejectPromise) {
        var pendingCount = promises.length;
        var values = new Array(promises.length);

        if (pendingCount === 0) {
            resolvePromise(values)
            return;
        }

        function onSettledAt(index, value) {
            values[index] = value;
            if (--pendingCount <= 0)
                // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled#Return_value
                invokeFunctionAsync(resolvePromise, values);
        }
        watchPromises(promises, onSettledAt, onSettledAt);
    }

    /**
     * The executor to create the promise returned by `Promise.any()`.
     * 
     * @param {Promise} promises 
     * @param {(value: any) => void} onOneFulfilled 
     * @param {(reason: AggregateError) => void} onAllRejected 
     */
    function anyExecutor(promises, onOneFulfilled, onAllRejected) {
        var unrejectedCount = promises.length;
        var reasons = new Array(promises.length);
        var fulfilled = false;

        if (unrejectedCount === 0) {
            onAllRejected(new AggregateError(reasons));
            return;
        }

        function onFulfilledAt(index, value) {
            if (!fulfilled) {
                fulfilled = true;
                invokeFunctionAsync(onOneFulfilled, value);
            }
        }
        function onRejectedAt(index, reason) {
            reasons[index] = reason;
            if (--unrejectedCount <= 0)
                invokeFunctionAsync(onAllRejected, new AggregateError(reasons));
        }
        watchPromises(onFulfilledAt, onRejectedAt);
    }

    /**
     * The executor to create the promise returned by `Promise.race()`.
     * 
     * @param {Promise} promises 
     * @param {(value: any) => void} onOneFulfilled 
     * @param {(reason: AggregateError) => void} onAllRejected 
     */
    function raceExecutor(promises, resolvePromise, rejectPromise) {
        var settled = false;

        function onSettledAt(index, value) {
            if (!settled) {
                settled = true;
                invokeFunctionAsync(resolvePromise, value);
            }
        }
        watchPromises(promises, onSettledAt, onSettledAt);
    }

    /**
     * A executor function for `Promise` which do nothing.
     * 
     * By using this excutor, you can create a `Promise` which keeps pending.
     * 
     * @param {(value: any) => void} resolve 
     * @param {(reason: any) => void} reject 
     */
    function emptyExecutor(resolve, reject) { }








    /* Common Helper Functions */

    /**
     * Call a function asynchronizely.
     * It will be run only when the task stack of JS engine is empty.
     * 
     * For performance, see https://promisesaplus.com/#point-67
     * 
     * @function
     * @type {(
     *      func: (...args: any) => void,
     *      ...args: any
     * ) => void}
     * @param {(...args: any) => void} func
     * @param {...any} args
     */
    var invokeFunctionAsync;

    // NodeJS process.nextTick
    //      See method of checking whether the `process` is NodeJS's used in q
    //      at https://github.com/kriskowal/q/blob/master/q.js#L184
    if (typeof process === "object" 
        && process.toString() === "[object process]" 
        && typeof process.nextTick === "function"
    )
        invokeFunctionAsync = process.nextTick;
    // Some browsers: `setImmediate()`
    else if (typeof setImmediate === "function")
        invokeFunctionAsync = function (func) {
            setImmediate.apply(this, arguments);
        }
    // Otherwise, implement by `setTimeout()`
    else {
        invokeFunctionAsync = function (func) {
            // Optimization for function with 0, 1 and 3 argument(s) 
            // since we only use these 3 conditions. 
            switch (arguments.length) {
                case 4:
                    setTimeout(func, 0, arguments[1], arguments[2], arguments[3]);
                    break;
                case 2:
                    setTimeout(func, 0, arguments[1]);
                    break
                case 1:
                    setTimeout(func, 0);
                    break;
                case 0:
                    throw new TypeError("No function passed as parameter");
                default:
                    var argCount = arguments.length;
                    var argArray = new Array(argCount + 1);
                    for (var i = 1; i < argCount; ++i)
                        argArray[i + 1] = arguments[i];
                    argArray[0] = func;
                    argArray[1] = 0;
                    setTimeout.apply(undefined, argArray);
            }
        }
    }


    /**
     * Curry a function which takes 2 parameter and fix its first argument.
     * Return the function which only need the 2nd argument. 
     * 
     * The number of arguments is fixed for performance reason.
     * 
     * For currying, see https://en.wikipedia.org/wiki/Currying and https://javascript.info/currying-partials.
     * 
     * @param {(arg1: T1, arg2: T2) => T0} func  A function which requires 2 arguments.
     * @param {T1} arg1  The first argument to be passed to `func`.
     * @returns {(arg2: T2) => T0}  A new function will takes 1 argument. 
     *                              Calling it with `arg2` is equivalent to calling `func` with `(arg1, arg2)`
     */
    function curryBinary(func, arg1) {
        return function (arg2) {
            return func(arg1, arg2);
        }
    }

    /**
     * Curry a function which takes 3 parameter and fix its first argument.
     * Return the function which only need the 2 later arguments
     * 
     * The number of arguments is fixed for performance reason.
     * 
     * @param {(arg1: T1, arg2: T2, arg3: T3) => T0} func  A function which requires3 arguments.
     * @param {T1} arg1  The first argument to be passed to `func`.
     * @returns {(arg2: T2, arg3: T3) => T0}  A new function will takes 1 argument. 
     *                                        Calling it with `arg2` is equivalent to calling `func` with `(arg1, arg2)`
     */
    function curryTenary(func, arg1) {
        return function (arg2, arg3) {
            return func(arg1, arg2, arg3);
        }
    }

    /**
     * Fixes the first parameter of a function.
     * 
     * Takes a function `func` which have several arguments `arg1`, `arg2`, ...  
     * Returns a curried function `curriedFunc`. Calling `curriedFunc(arg1, arg2, ...)` 
     * is equivalent to calling `func(arg0, arg1, arg2, ...)`.
     * 
     * Currying is a concept in funcational programming. For currying, 
     * see https://en.wikipedia.org/wiki/Currying and https://javascript.info/currying-partials.
     * 
     * @param {Function} func 
     * @param {any} arg1
     * @returns {Function}
     */
    function curry(func, arg0) {
        return function() {
            // Optimization when called with 0-2 arguments
            // Because we currently only use these cases.
            switch(arguments.length) {
                case 2:
                    return func(arg0, arguments[0], arguments[1]);
                case 1:
                    return func(arg0, arguments[0]);
                case 0:
                    return func(arg0);
                default:
                    var argArray = prependArguments(arg0, arguments);
                    func.apply(this, argArray);
            }
        }
    }

    /**
     * 
     * @param {any} arg0
     * @param {IArguments | any[]} argArray 
     * @returns {any[]} 
     */
    function prependArguments(arg0, argArray) {
        var argCount = argArray.length;
        var newArgArray = new Array(argCount + 1);
        
        newArgArray[0] = arg0;
        for (var i = 0; i < argCount; ++i)
            newArgArray[i + 1] = argArray[i];
        
        return newArgArray;
    }

    /**
     * An incomplete polyfill of `Function.prototype.bind()`.
     * 
     * For performance reason, specifying fixed arguments is not allowed.
     * 
     * @function
     * @type {(
     *      func: Function,
     *      thisArg: any,
     * ) => Function}
     */
    var bind;
    if (Function.prototype.bind) {
        bind = function bind(func, thisArg) {
            return func.bind(thisArg);
        }
    }
    else {
        bind = function bind(func, thisArg) {
            return function () {
                func.apply(thisArg, arguments);
            }
        }
    }

    /**
     * Convert an iterable object to an array.
     * 
     * See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols.
     * 
     * @function
     * @type {(iterable: Interable) => Array}
     * 
     * @throws {TypeError}  when the argument is not iterable.
     */
    var iterableToArray;

    // ES6 with Array.from
    if (Array.from) {
        iterableToArray = Array.from;
    }
    // Incomplete ES6. Iterable exists but Array.from is not implemented.
    else if (typeof Symbol === "function" && Symbol.iterator) {
        iterableToArray = function (iterable) {
            if (iterable == null)
                throw TypeError("The argument should be iterable instead of null or undefined.");

            // Check that if `iterable` is Iterable.
            // Excepting Array, string or arguments because slice is quicker for them.
            if (typeof iterable[Symbol.iterator] === "function"
                // Optimization for Array, string and arguments 
                && !(iterable instanceof Array
                    || (typeof Array.isArray === "function" && Array.isArray(iterable))
                    || typeof iterable === "string" || iterable instanceof String
                    || typeof iterable.constructor === arguments.constructor
                )
            ) {
                var result = [];
                var iterator = iterable[Symbol]();
                var iteratorReturn;
                while (!((iteratorReturn = iterator).done))
                    result.push(iteratorReturn.value);

                return result;
            }
            else {
                return Array.prototype.slice.apply(iterable);
            }
        }
    }
    // Before ES6, no `Iterable`.
    else {
        iterableToArray = function (iterable) {
            return Array.prototype.slice.apply(iterable);
        }
    }








    /* Export */

    return {
        Promise: Promise,
        AggregateError: AggregateError
    };

})());