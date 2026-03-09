const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_dev_secret";

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
}

function authenticateToken(req, res, next) {

  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token requerido"
    });
  }

  try {

    const decoded = jwt.verify(token, JWT_SECRET);
    req.auth = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      success: false,
      message: "Token inválido"
    });

  }

}

module.exports = {
  authenticateToken
};