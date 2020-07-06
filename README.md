<p style="text-align:center;">
    <img src="img/promises3-icon.svg" alt="PromisEs3" title="PromisEs3" style="height:20em;"/>
</p> 

# PromisEs3



## Introduction

PromisEs3 is a implementation of [Promise/A+](https://promisesaplus.com/) for ES3. Its single-file and dependence-free features are designed for maximum compatibility, which is important when buiding/packing/moduling tools are not available or old browsers (like IE6) need to be considered. 

<a href="https://promisesaplus.com/">
    <img src="https://promisesaplus.com/assets/logo-small.png" alt="Promises/A+ logo" title="Promises/A+ 1.0 compliant" align="right" />
</a>

This `Promise` implemented by this project have passed the [Promise/A+ test](https://github.com/promises-aplus/promises-tests).



Although the basic part are written in pure ES3 syntax and functions, it can make use of some ES3+ or non-standard function to obtain additional performance.

## Usage

### Include by `<script>` Tag

You can

+ Directly include the [Promise.js](Promise.js) file (relatively large-sized).

+ Include the compressed file [promises3.min.js](). Can be downloaded from [Release](Release).

When included by `<script>` tag, it will act as an polyfill, which means that create the `Promise` class in the global scope when it dosen't exist.

### As Module

When PromisEs3 are imported as a module, it directly exports the the `Promise` class.

Can be used as:

+ As Node.js (+ CommonJS) + npm module

    1. Download by npm as [promises3]() package.
    2. Include as module `promises3` (`require("promises3")`).

+ AMD module.

+ CMD module.

## Known Issue

+ As most of the Promise implementation, the `Promise.prototype.toString` are directly inherited from `Object.prototype.toString` and not have been overwritten. Only when `Symbol.toStringTag` is available, the result of `promise.toString()` and `Object.prototype.toString.call(promise)` is guaranteed to be `"[object Promise]"`.

+ When the iterable protocol is not available, `Promise.all`, `Promise.allSettled` an other static functions takes `ArrayLike` as `Iterable`.

+ On the branch [with-any](), a static function `Promise.any` is implemented. An Exception class called `AggregateError` which is needed by `Promise.any` is also implemented and exported. However, they cannot be fully polyfilled under ES5. As these 2 features are still in working draft and not be included in any main-stream browsers, using it is strongly deprecated.

## Notice

+ Some properties of the `Promise` object has keys embraced by `"[[]]"`. These properties should be seen as private properties and should not be modified externally.

+ In some ES3 browsers, if a object member's key is a JavaScript keyword, accessing it by operator `.` is not allowed. You can use `promise["catch"]` and `promise["finally"]` instead of `promise.catch` and `promise.finally`. Some tools, like [babel/plugin-transform-member-expression-literals](https://babeljs.io/docs/en/babel-plugin-transform-member-expression-literals) may help you covert these codes automatically.

## License and Copyright

MIT Licence. See [LICENSE.md](LICENSE.md).

Copyright (c) 2020 Yichen Liu.