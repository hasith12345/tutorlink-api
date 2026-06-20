const tutorApplicationService = require('../services/tutorApplication.service');

function handleServiceError(err, res, next) {
  if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
  next(err);
}

exports.submitTutorApplication = async (req, res, next) => {
  try {
    const result = await tutorApplicationService.submitApplication(req.user.id, req.body);
    console.log('Tutor application submitted for user:', req.user.id);
    res.json({ message: 'Tutor application submitted successfully! You will be notified once reviewed.', ...result });
  } catch (err) {
    console.error('Submit tutor application error:', err);
    handleServiceError(err, res, next);
  }
};

exports.getTutorApplicationStatus = async (req, res, next) => {
  try {
    const result = await tutorApplicationService.getApplicationStatus(req.user.id);
    res.json(result);
  } catch (err) {
    console.error('Get tutor status error:', err);
    handleServiceError(err, res, next);
  }
};

exports.uploadCV = async (req, res, next) => {
  try {
    const result = await tutorApplicationService.uploadCV(req.file);
    res.json({ message: 'CV uploaded successfully', ...result });
  } catch (err) {
    console.error('Upload CV error:', err);
    handleServiceError(err, res, next);
  }
};

exports.createClass = async (req, res, next) => {
  try {
    const newClass = await tutorApplicationService.createClass(req.user.id, req.body);
    console.log('Class created:', newClass.id);
    res.status(201).json({ message: 'Class created successfully', class: newClass });
  } catch (err) {
    console.error('Create class error:', err);
    handleServiceError(err, res, next);
  }
};

exports.getMyClasses = async (req, res, next) => {
  try {
    const classes = await tutorApplicationService.getMyClasses(req.user.id);
    res.json({ classes });
  } catch (err) {
    console.error('Get classes error:', err);
    handleServiceError(err, res, next);
  }
};

exports.updateClass = async (req, res, next) => {
  try {
    const updatedClass = await tutorApplicationService.updateClass(req.user.id, req.params.id, req.body);
    res.json({ message: 'Class updated successfully', class: updatedClass });
  } catch (err) {
    console.error('Update class error:', err);
    handleServiceError(err, res, next);
  }
};

exports.cancelClass = async (req, res, next) => {
  try {
    const cancelled = await tutorApplicationService.cancelClass(req.user.id, req.params.id);
    res.json({ message: 'Class cancelled successfully', class: cancelled });
  } catch (err) {
    console.error('Cancel class error:', err);
    handleServiceError(err, res, next);
  }
};

exports.deleteClass = async (req, res, next) => {
  try {
    await tutorApplicationService.deleteClass(req.user.id, req.params.id);
    res.json({ message: 'Class deleted successfully' });
  } catch (err) {
    console.error('Delete class error:', err);
    handleServiceError(err, res, next);
  }
};

exports.getClassById = async (req, res, next) => {
  try {
    const classData = await tutorApplicationService.getClassById(req.params.id);
    res.json({ class: classData });
  } catch (err) {
    console.error('Get class error:', err);
    handleServiceError(err, res, next);
  }
};

exports.recordTutorHeartbeat = async (req, res, next) => {
  try {
    const updated = await tutorApplicationService.recordHeartbeat(req.user.id);
    res.json({ ok: true, ...updated });
  } catch (err) {
    console.error('Heartbeat error:', err);
    handleServiceError(err, res, next);
  }
};

exports.getPendingApplications = async (req, res, next) => {
  try {
    const applications = await tutorApplicationService.getPendingApplications();
    res.json({ applications });
  } catch (err) {
    console.error('Get pending applications error:', err);
    next(err);
  }
};

exports.getAllApplications = async (req, res, next) => {
  try {
    const applications = await tutorApplicationService.getAllApplications(req.query.status);
    res.json({ applications });
  } catch (err) {
    console.error('Get all applications error:', err);
    next(err);
  }
};

exports.approveApplication = async (req, res, next) => {
  try {
    const tutor = await tutorApplicationService.approveApplication(req.params.id);
    console.log('Tutor application approved:', req.params.id);
    res.json({ message: 'Tutor application approved', tutor });
  } catch (err) {
    console.error('Approve application error:', err);
    handleServiceError(err, res, next);
  }
};

exports.rejectApplication = async (req, res, next) => {
  try {
    const tutor = await tutorApplicationService.rejectApplication(req.params.id);
    console.log('Tutor application rejected and data cleared:', req.params.id);
    res.json({ message: 'Tutor application rejected', tutor });
  } catch (err) {
    console.error('Reject application error:', err);
    handleServiceError(err, res, next);
  }
};

exports.getAllClassesAdmin = async (req, res, next) => {
  try {
    const classes = await tutorApplicationService.getAllClassesAdmin();
    res.json({ classes });
  } catch (err) {
    console.error('Admin get classes error:', err);
    next(err);
  }
};

exports.holdClassAdmin = async (req, res, next) => {
  try {
    const updated = await tutorApplicationService.holdClassAdmin(req.params.id);
    res.json({ message: 'Class put on hold', class: updated });
  } catch (err) {
    console.error('Hold class error:', err);
    handleServiceError(err, res, next);
  }
};

exports.unholdClassAdmin = async (req, res, next) => {
  try {
    const updated = await tutorApplicationService.unholdClassAdmin(req.params.id);
    res.json({ message: 'Class resumed', class: updated });
  } catch (err) {
    console.error('Unhold class error:', err);
    handleServiceError(err, res, next);
  }
};

exports.forceDeleteClassAdmin = async (req, res, next) => {
  try {
    await tutorApplicationService.forceDeleteClassAdmin(req.params.id);
    res.json({ message: 'Class force-deleted successfully' });
  } catch (err) {
    console.error('Force delete class error:', err);
    handleServiceError(err, res, next);
  }
};
