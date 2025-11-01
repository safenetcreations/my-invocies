"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const errorHandler = (err, req, res, next) => {
    let { statusCode = 500, message } = err;
    if (err.message.includes('P2002')) {
        statusCode = 409;
        message = 'Resource already exists';
    }
    else if (err.message.includes('P2025')) {
        statusCode = 404;
        message = 'Resource not found';
    }
    console.error(`Error ${statusCode}: ${message}`, {
        url: req.url,
        method: req.method,
        stack: err.stack,
        timestamp: new Date().toISOString(),
    });
    res.status(statusCode).json({
        error: {
            message: process.env.NODE_ENV === 'production' ?
                (statusCode < 500 ? message : 'Internal server error') :
                message,
            statusCode,
            ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
        },
    });
};
exports.errorHandler = errorHandler;
