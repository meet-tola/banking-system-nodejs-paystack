const contextMiddleware = (req, res, next) => {
  req.deviceId = req.headers["x-device-id"] || null;
  
  req.clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  next();
};

module.exports = contextMiddleware;