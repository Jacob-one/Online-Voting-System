// ==============================
// middleware.js - All Middleware
// ==============================

const jwt = require('jsonwebtoken');
const Voter = require('./models.js').Voter;
const Election = require('./models.js').Election;
const BallotAssignment = require('./models.js').BallotAssignment;
const AuditLog = require('./models.js').AuditLog;

// ==============================
// JWT SECRET
// ==============================
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET';

// ==============================
// AUTH MIDDLEWARE
// ==============================
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: 'No Authorization header' });

  const token = header.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Invalid token header' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await Voter.findById(payload.sub).select('-passwordHash');
    if (!user) return res.status(401).json({ message: 'User not found' });

    req.user = user;
    next();
  } catch (err) {
    await AuditLog.create({ action: 'auth_failed', details: { err: err.message } });
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// ==============================
// ADMIN ONLY
// ==============================
function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin only' });
  next();
}

// ==============================
// ELECTION OPEN CHECK
// ==============================
async function electionOpenMiddleware(req, res, next) {
  const election = await Election.findOne();
  if (!election) return res.status(500).json({ message: 'No election configured' });

  const now = new Date();
  if (!election.isOpen || now < election.startAt || now > election.endAt) {
    return res.status(403).json({ message: 'Election not open' });
  }

  req.election = election;
  next();
}

// ==============================
// ONE PERSON ONE BALLOT
// ==============================
async function oneBallotOnlyMiddleware(req, res, next) {
  const voterId = req.user._id;
  const electionId = req.election._id;

  let record = await BallotAssignment.findOne({ voterId, electionId });
  if (!record) {
    record = await BallotAssignment.create({ voterId, electionId, issuedAt: new Date() });
  }
  if (record.votedAt) return res.status(403).json({ message: 'Already voted' });

  req.ballotAssignment = record;
  next();
}

// ==============================
// AUDIT LOGGER
// ==============================
function auditLogger(actionName) {
  return async function (req, res, next) {
    await AuditLog.create({
      actor: req.user ? req.user.email : 'anonymous',
      actorId: req.user ? req.user._id : null,
      action: actionName,
      details: { path: req.path, method: req.method }
    });

    next();
  };
}

// ==============================
// EXPORT ALL
// ==============================
module.exports = {
  JWT_SECRET,
  authMiddleware,
  adminMiddleware,
  electionOpenMiddleware,
  oneBallotOnlyMiddleware,
  auditLogger
};

