"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.generateToken = generateToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../utils/database");
const error_middleware_1 = require("./error.middleware");
function authMiddleware(req, _res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return next((0, error_middleware_1.createError)('No token provided', 401, 'UNAUTHORIZED'));
        }
        const token = authHeader.split(' ')[1];
        const secret = process.env.JWT_SECRET || 'dev-secret';
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        // Verify user exists in DB
        const db = (0, database_1.getDb)();
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.userId);
        if (!user)
            return next((0, error_middleware_1.createError)('User not found', 401, 'UNAUTHORIZED'));
        req.userId = decoded.userId;
        next();
    }
    catch {
        next((0, error_middleware_1.createError)('Invalid or expired token', 401, 'INVALID_TOKEN'));
    }
}
function generateToken(userId) {
    const secret = process.env.JWT_SECRET || 'dev-secret';
    return jsonwebtoken_1.default.sign({ userId }, secret, { expiresIn: '7d' });
}
//# sourceMappingURL=auth.middleware.js.map