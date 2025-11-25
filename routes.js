// ==============================
// routes.js - All Express Routes
// ==============================

const express = require('express');
const router = express.Router();

const {
  authMiddleware,
  adminMiddleware,
  electionOpenMiddleware,
  oneBallotOnlyMiddleware,
  auditLogger,
  JWT_SECRET
} = require('./middleware.js');

const {
  Voter,
  Election,
  AnonymousVote,
  BallotAssignment,
  AuditLog
} = require('./models.js');

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// =====================================================
// AUTH ROUTES
// =====================================================

// POST /auth/login
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Missing credentials' });

  const user = await Voter.findOne({ email });
  if (!user || !(await user.validatePassword(password))) {
    await AuditLog.create({ actor: email, action: 'login_failed' });
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { sub: user._id.toString(), role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '6h' }
  );

  await AuditLog.create({ actor: user.email, actorId: user._id, action: 'login_success' });
  res.json({ token });
});

// =====================================================
// BALLOT ROUTES
// =====================================================

// GET /ballot/get
router.get(
  '/ballot/get',
  authMiddleware,
  electionOpenMiddleware,
  oneBallotOnlyMiddleware,
  auditLogger('ballot_requested'),
  async (req, res) => {
    const election = req.election;
    res.json({
      electionId: election._id,
      name: election.name,
      contests: election.contests
    });
  }
);

// =====================================================
// VOTE ROUTES
// =====================================================

// POST /vote/submit
router.post(
  '/vote/submit',
  authMiddleware,
  electionOpenMiddleware,
  oneBallotOnlyMiddleware,
  async (req, res) => {
    const election = req.election;
    const selections = req.body.selections;

    const receipt = crypto.randomBytes(24).toString('hex');

    // Store anonymous vote
    await AnonymousVote.create({
      electionId: election._id,
      selections,
      receipt
    });

    // Mark this voter as completed
    req.ballotAssignment.votedAt = new Date();
    await req.ballotAssignment.save();

    await AuditLog.create({
      actor: req.user.email,
      actorId: req.user._id,
      action: 'vote_submitted',
      details: { receipt }
    });

    res.json({ message: 'Vote submitted', receipt });
  }
);

// =====================================================
// ADMIN ROUTES
// =====================================================

// POST /admin/election/setup
router.post(
  '/admin/election/setup',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const { name, description, startAt, endAt, contests } = req.body;

    await Election.deleteMany({});
    const election = await Election.create({
      name,
      description,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      contests
    });

    await AuditLog.create({
      actor: req.user.email,
      actorId: req.user._id,
      action: 'election_setup'
    });

    res.status(201).json(election);
  }
);

// POST /admin/election/open
router.post(
  '/admin/election/open',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const election = await Election.findOne();
    election.isOpen = true;
    await election.save();

    await AuditLog.create({
      actor: req.user.email,
      actorId: req.user._id,
      action: 'election_opened'
    });

    res.json({ message: 'Election opened' });
  }
);

// POST /admin/election/close
router.post(
  '/admin/election/close',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const election = await Election.findOne();
    election.isOpen = false;
    await election.save();

    await AuditLog.create({
      actor: req.user.email,
      actorId: req.user._id,
      action: 'election_closed'
    });

    res.json({ message: 'Election closed' });
  }
);

// POST /admin/tally/run
router.post(
  '/admin/tally/run',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const election = await Election.findOne();
    const votes = await AnonymousVote.find({ electionId: election._id }).lean();

    const results = {};

    for (const contest of election.contests) {
      results[contest.id] = {};
      for (const candidate of contest.candidates) {
        results[contest.id][candidate.id] = 0;
      }
    }

    for (const vote of votes) {
      for (const s of vote.selections) {
        if (!results[s.contestId]) continue;
        for (const cid of s.selectedCandidateIds) {
          if (results[s.contestId][cid] !== undefined) results[s.contestId][cid] += 1;
        }
      }
    }

    await AuditLog.create({
      actor: req.user.email,
      actorId: req.user._id,
      action: 'tally_run',
      details: { totalVotes: votes.length }
    });

    res.json({ electionId: election._id, results });
  }
);

// POST /admin/results/publish
router.post(
  '/admin/results/publish',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const election = await Election.findOne();
    election.isPublished = true;
    await election.save();

    await AuditLog.create({
      actor: req.user.email,
      actorId: req.user._id,
      action: 'results_published'
    });

    res.json({ message: 'Results published' });
  }
);

// GET /admin/audit/logs
router.get(
  '/admin/audit/logs',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const logs = await AuditLog.find().sort({ createdAt: -1 });
    res.json(logs);
  }
);

// =====================================================
// PUBLIC RESULTS
// =====================================================

// GET /results/view
router.get('/results/view', async (req, res) => {
  const election = await Election.findOne();
  if (!election.isPublished)
    return res.status(403).json({ message: 'Not published yet' });

  const votes = await AnonymousVote.find({ electionId: election._id });
  const results = {};

  for (const contest of election.contests) {
    results[contest.id] = {};
    for (const candidate of contest.candidates)
      results[contest.id][candidate.id] = 0;
  }

  for (const vote of votes) {
    for (const s of vote.selections) {
      if (!results[s.contestId]) continue;
      for (const cid of s.selectedCandidateIds) {
        if (results[s.contestId][cid] !== undefined)
          results[s.contestId][cid] += 1;
      }
    }
  }

  res.json({
    electionId: election._id,
    results
  });
});

// =====================================================
// EXPORT ROUTER
// =====================================================
module.exports = router;

