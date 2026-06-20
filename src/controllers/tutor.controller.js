const tutorService = require('../services/tutor.service');

exports.searchTutors = async (req, res) => {
  try {
    const tutors = await tutorService.searchTutors(req.query);
    res.status(200).json({ success: true, count: tutors.length, tutors });
  } catch (error) {
    console.error('Search tutors error:', error);
    res.status(500).json({ success: false, message: 'Failed to search tutors', error: error.message });
  }
};

exports.getTutorSuggestions = async (req, res) => {
  try {
    const result = await tutorService.getTutorSuggestions(req.query);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get suggestions', error: error.message });
  }
};

exports.getTutorById = async (req, res) => {
  try {
    const tutor = await tutorService.getTutorById(req.params.id);
    res.status(200).json({ success: true, tutor });
  } catch (error) {
    console.error('Get tutor error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: 'Failed to get tutor', error: error.message });
  }
};
