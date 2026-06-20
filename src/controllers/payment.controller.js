const paymentService = require('../services/payment.service');

function handleServiceError(err, res) {
  if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
  console.error(err);
  return res.status(500).json({ message: 'Internal server error' });
}

exports.createPaymentIntent = async (req, res) => {
  try {
    const result = await paymentService.createPaymentIntent(req.user.id, req.body.classId);
    res.json(result);
  } catch (err) {
    console.error('createPaymentIntent error:', err);
    handleServiceError(err, res);
  }
};

exports.confirmPayment = async (req, res) => {
  try {
    const result = await paymentService.confirmPayment(
      req.user.id,
      req.body.paymentIntentId,
      req.body.classId
    );
    res.json(result);
  } catch (err) {
    console.error('confirmPayment error:', err);
    handleServiceError(err, res);
  }
};

exports.getAdminPayments = async (req, res) => {
  try {
    const result = await paymentService.getAdminPayments();
    res.json(result);
  } catch (err) {
    console.error('getAdminPayments error:', err);
    res.status(500).json({ message: 'Failed to fetch payments' });
  }
};

exports.getStudentEnrollments = async (req, res) => {
  try {
    const result = await paymentService.getStudentEnrollments(req.user.id);
    res.json(result);
  } catch (err) {
    console.error('getStudentEnrollments error:', err);
    handleServiceError(err, res);
  }
};

exports.getTutorEarnings = async (req, res) => {
  try {
    const result = await paymentService.getTutorEarnings(req.user.id);
    res.json(result);
  } catch (err) {
    console.error('getTutorEarnings error:', err);
    handleServiceError(err, res);
  }
};

exports.getTutorStudents = async (req, res) => {
  try {
    const result = await paymentService.getTutorStudents(req.user.id);
    res.json(result);
  } catch (err) {
    console.error('getTutorStudents error:', err);
    handleServiceError(err, res);
  }
};

exports.unenrollFromClass = async (req, res) => {
  try {
    const result = await paymentService.unenrollFromClass(req.user.id, req.params.id);
    res.json(result);
  } catch (err) {
    console.error('unenrollFromClass error:', err);
    handleServiceError(err, res);
  }
};
