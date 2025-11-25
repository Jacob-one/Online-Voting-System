// ==============================
// models.js - All Mongoose Models
// ==============================

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// ==============================
// VOTER MODEL
// ==============================
const VoterSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['voter','admin'], default: 'voter' },
  createdAt: { type: Date, default: Date.now }
});

VoterSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

VoterSchema.methods.validatePassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

const Voter = mongoose.model('Voter', VoterSchema);

// ==============================
// ELECTION MODEL
// ==============================
const CandidateSchema = new mongoose.Schema({
  id: { type: String, required: true }, 
  name: { type: String, required: true },
  description: { type: String }
}, { _id: false });

const ContestSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  candidates: { type: [CandidateSchema], default: [] },
  maxSelections: { type: Number, default: 1 }
}, { _id: false });

const ElectionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  isOpen: { type: Boolean, default: false },
  isPublished: { type: Boolean, default: false },
  contests: { type: [ContestSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

const Election = mongoose.model('Election', ElectionSchema);

// ==============================
// BALLOT ASSIGNMENT MODEL
// ==============================
const BallotAssignmentSchema = new mongoose.Schema({
  voterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voter', required: true, index: true },
  electionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true, index: true },
  issuedAt: { type: Date, default: Date.now },
  votedAt: { type: Date, default: null }
});

BallotAssignmentSchema.index({ voterId: 1, electionId: 1 }, { unique: true });

const BallotAssignment = mongoose.model('BallotAssignment', BallotAssignmentSchema);

// ==============================
// ANONYMOUS VOTE MODEL
// ==============================
const SelectionSchema = new mongoose.Schema({
  contestId: { type: String, required: true },
  selectedCandidateIds: { type: [String], required: true }
}, { _id: false });

const AnonymousVoteSchema = new mongoose.Schema({
  electionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true, index: true },
  selections: { type: [SelectionSchema], required: true },
  submittedAt: { type: Date, default: Date.now },
  receipt: { type: String, required: true, unique: true }
});

const AnonymousVote = mongoose.model('AnonymousVote', AnonymousVoteSchema);

// ==============================
// AUDIT LOG MODEL
// ==============================
const AuditLogSchema = new mongoose.Schema({
  actor: { type: String },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voter', default: null },
  action: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

// ==============================
// EXPORT EVERYTHING
// ==============================
module.exports = {
  Voter,
  Election,
  BallotAssignment,
  AnonymousVote,
  AuditLog
};

