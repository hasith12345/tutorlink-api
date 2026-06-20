const reviewService = require('../services/review.service');

function handleServiceError(err, res) {
  if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
  console.error(err);
  return res.status(500).json({ message: 'Internal server error' });
}

exports.createReview = async (req, res) => {
  try {
    const review = await reviewService.createReview(req.user.id, req.body);
    res.status(201).json({ review });
  } catch (err) {
    console.error('createReview error:', err);
    handleServiceError(err, res);
  }
};

exports.getTutorReviews = async (req, res) => {
  try {
    const reviews = await reviewService.getTutorReviews(req.params.tutorId);
    res.json({ reviews });
  } catch (err) {
    console.error('getTutorReviews error:', err);
    res.status(500).json({ message: 'Failed to fetch reviews' });
  }
};

exports.getClassReviews = async (req, res) => {
  try {
    const result = await reviewService.getClassReviews(req.params.classId);
    res.json(result);
  } catch (err) {
    console.error('getClassReviews error:', err);
    res.status(500).json({ message: 'Failed to fetch class reviews' });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    await reviewService.deleteReview(req.user.id, req.params.id);
    res.json({ message: 'Review deleted' });
  } catch (err) {
    console.error('deleteReview error:', err);
    handleServiceError(err, res);
  }
};

exports.getMyReview = async (req, res) => {
  try {
    const review = await reviewService.getMyReview(req.user.id, req.params.enrollmentId);
    res.json({ review: review || null });
  } catch (err) {
    console.error('getMyReview error:', err);
    handleServiceError(err, res);
  }
};
