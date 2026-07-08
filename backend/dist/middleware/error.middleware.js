"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.createError = createError;
const logger_1 = require("../utils/logger");
function errorHandler(err, _req, res, _next) {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    logger_1.logger.error(`[${statusCode}] ${message}`, { stack: err.stack, code: err.code });
    res.status(statusCode).json({
        success: false,
        error: {
            code: err.code || 'INTERNAL_ERROR',
            message,
        },
    });
}
function createError(message, statusCode = 500, code) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.code = code;
    return err;
}
//# sourceMappingURL=error.middleware.js.map