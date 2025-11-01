"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = void 0;
const notFound = (req, res) => {
    res.status(404).json({
        error: {
            message: `Route ${req.originalUrl} not found`,
            statusCode: 404,
        },
    });
};
exports.notFound = notFound;
